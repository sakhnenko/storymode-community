import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { USD_PER_CREDIT } from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";

    // LIST users
    if (action === "list") {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
        perPage: 1000,
      });
      if (error) throw error;

      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, avatar_url");

      const profileMap = new Map(
        (profiles || []).map((p: any) => [p.user_id, p])
      );

      // Fetch plans
      const { data: plans } = await supabaseAdmin
        .from("user_plans")
        .select("user_id, plan");

      const planMap = new Map(
        (plans || []).map((p: any) => [p.user_id, p.plan])
      );

      const enrichedUsers = users.map((u: any) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        display_name: profileMap.get(u.id)?.display_name || null,
        avatar_url: profileMap.get(u.id)?.avatar_url || null,
        plan: planMap.get(u.id) || "draft",
      }));

      return new Response(JSON.stringify({ users: enrichedUsers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE user
    if (action === "delete") {
      const body = await req.json();
      const targetUserId = body.userId;

      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "userId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (targetUserId === userId) {
        return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // INVITE user by email
    if (action === "invite") {
      const body = await req.json();
      const email = body.email?.trim()?.toLowerCase();
      const plan = body.plan;

      if (!email) {
        return new Response(JSON.stringify({ error: "email required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Carry over the name they gave when joining the waitlist
      const { data: wl } = await supabaseAdmin
        .from("waitlist")
        .select("name")
        .eq("email", email)
        .maybeSingle();
      const wlName = typeof wl?.name === "string" ? wl.name.trim().slice(0, 200) : "";

      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        wlName ? { data: { name: wlName, full_name: wlName, display_name: wlName } } : undefined,
      );
      if (error) throw error;

      // If plan specified, set it; default plan draft is set by handle_new_user trigger
      if (plan && ["draft", "manuscript", "studio"].includes(plan) && data?.user?.id) {
        await supabaseAdmin
          .from("user_plans")
          .upsert({ user_id: data.user.id, plan }, { onConflict: "user_id" });
      }

      // Mark waitlist entry as invited if present
      await supabaseAdmin
        .from("waitlist")
        .update({ status: "invited", invited_at: new Date().toISOString(), invited_plan: plan || "draft" })
        .eq("email", email);

      return new Response(JSON.stringify({ success: true, user: { id: data.user.id, email: data.user.email } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RESEND invite to a user who has not signed in yet
    if (action === "reinvite") {
      const body = await req.json();
      const targetUserId = body.userId;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "userId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: target, error: getErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
      if (getErr || !target?.user?.email) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const email = target.user.email;
      const meta = target.user.user_metadata || {};
      const name =
        typeof meta.display_name === "string"
          ? meta.display_name
          : typeof meta.full_name === "string"
            ? meta.full_name
            : "";

      const origin = req.headers.get("origin") || "";
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );

      // Users who never signed in: send a fresh invite link.
      // Users who already signed in (forgot password / lost access):
      // send a recovery email so they can set a new password.
      if (!target.user.last_sign_in_at) {
        const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          email,
          name ? { data: { name, full_name: name, display_name: name } } : undefined,
        );
        if (inviteErr) {
          // Already-confirmed accounts can't be re-invited; fall back to a
          // password-setup email, which lands on the same set-password screen.
          const { error: recoveryErr } = await anonClient.auth.resetPasswordForEmail(
            email,
            origin ? { redirectTo: `${origin}/set-password` } : undefined,
          );
          if (recoveryErr) throw inviteErr;
        }
      } else {
        const { error: recoveryErr } = await anonClient.auth.resetPasswordForEmail(
          email,
          origin ? { redirectTo: `${origin}/set-password` } : undefined,
        );
        if (recoveryErr) throw recoveryErr;
      }

      return new Response(JSON.stringify({ success: true, email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }



    // LIST waitlist
    if (action === "waitlist-list") {
      const { data, error } = await supabaseAdmin
        .from("waitlist")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ entries: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE waitlist entry
    if (action === "waitlist-delete") {
      const body = await req.json();
      const id = body.id;
      if (!id) {
        return new Response(JSON.stringify({ error: "id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabaseAdmin.from("waitlist").delete().eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPDATE PLAN
    if (action === "update-plan") {
      const body = await req.json();
      const targetUserId = body.userId;
      const newPlan = body.plan;

      if (!targetUserId || !newPlan) {
        return new Response(JSON.stringify({ error: "userId and plan required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!["draft", "manuscript", "studio"].includes(newPlan)) {
        return new Response(JSON.stringify({ error: "Invalid plan" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert in case the user doesn't have a plan row yet
      const { error } = await supabaseAdmin
        .from("user_plans")
        .upsert({ user_id: targetUserId, plan: newPlan }, { onConflict: "user_id" });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, plan: newPlan }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // USER STATS
    if (action === "user-stats") {
      const body = await req.json().catch(() => ({}));
      const target = body.userId as string;
      const range = (body.range as string) || "month";
      if (!target) {
        return new Response(JSON.stringify({ error: "userId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const days = range === "week" ? 7 : range === "year" ? 365 : 30;
      const since = new Date(Date.now() - days * 86400_000);
      const sinceIso = since.toISOString();

      const words = (s: string | null) =>
        !s ? 0 : (s.replace(/[#*_>`~-]/g, " ").match(/\S+/g)?.length ?? 0);

      const [projectsRes, gridsRes, notepadsRes, chaptersRes, draftsRes, mapsRes, ledger, credits, plans] =
        await Promise.all([
          supabaseAdmin.from("projects").select("id, title, created_at, is_starter, is_template").eq("user_id", target),
          supabaseAdmin.from("notebook_grids").select("id, created_at, project_id").eq("user_id", target),
          supabaseAdmin.from("notepads").select("id, created_at, updated_at, content, grid_id").eq("user_id", target),
          supabaseAdmin.from("story_chapters").select("id, created_at, updated_at, content, project_id").eq("user_id", target),
          supabaseAdmin.from("story_chapter_drafts").select("id, created_at, chapter_id").eq("user_id", target),
          supabaseAdmin.from("map_canvas").select("id, created_at, placed_notebooks, project_id").eq("user_id", target),
          supabaseAdmin.from("credit_ledger").select("*").eq("user_id", target).gte("created_at", sinceIso),
          supabaseAdmin.from("user_credits").select("*").eq("user_id", target).maybeSingle(),
          supabaseAdmin.from("user_plans").select("plan").eq("user_id", target).maybeSingle(),
        ]);

      // Seeded example content (the starter project cloned from the template)
      // is not something the user made, so it must not count toward totals.
      const seededProjectIds = new Set(
        (projectsRes.data || [])
          .filter((p: any) => p.is_starter || p.is_template || /^example:\s/i.test(p.title || ""))
          .map((p: any) => p.id)
      );
      const projects = { data: (projectsRes.data || []).filter((p: any) => !seededProjectIds.has(p.id)) };
      const grids = { data: (gridsRes.data || []).filter((g: any) => !seededProjectIds.has(g.project_id)) };
      const seededGridIds = new Set(
        (gridsRes.data || []).filter((g: any) => seededProjectIds.has(g.project_id)).map((g: any) => g.id)
      );
      const notepads = { data: (notepadsRes.data || []).filter((n: any) => !seededGridIds.has(n.grid_id)) };
      const chapters = { data: (chaptersRes.data || []).filter((c: any) => !seededProjectIds.has(c.project_id)) };
      const seededChapterIds = new Set(
        (chaptersRes.data || []).filter((c: any) => seededProjectIds.has(c.project_id)).map((c: any) => c.id)
      );
      const drafts = { data: (draftsRes.data || []).filter((d: any) => !seededChapterIds.has(d.chapter_id)) };
      const maps = { data: (mapsRes.data || []).filter((m: any) => !seededProjectIds.has(m.project_id)) };

      const inRange = (rows: any[] | null) =>
        (rows || []).filter((r) => new Date(r.created_at) >= since).length;

      const notepadRows = notepads.data || [];
      const chapterRows = chapters.data || [];
      const totalWords =
        notepadRows.reduce((a, n) => a + words(n.content), 0) +
        chapterRows.reduce((a, c) => a + words(c.content), 0);
      const recentWords =
        notepadRows.filter((n) => new Date(n.updated_at) >= since).reduce((a, n) => a + words(n.content), 0) +
        chapterRows.filter((c) => new Date(c.updated_at) >= since).reduce((a, c) => a + words(c.content), 0);

      const countStickers = (rows: any[]) =>
        rows.reduce((a, m) => {
          const arr = Array.isArray(m.placed_notebooks) ? m.placed_notebooks : [];
          return a + arr.filter((p: any) => p?._type === "sticker" || p?.url).length;
        }, 0);

      // Cost model (raw provider spend, no markup)
      const PRICES: Record<string, { in: number; out: number }> = {
        "google/gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
        "google/gemini-2.5-flash": { in: 0.30, out: 2.50 },
        "google/gemini-3-flash-preview": { in: 0.50, out: 3.00 },
        "google/gemini-3.6-flash": { in: 0.50, out: 3.00 },
        "openai/gpt-5": { in: 1.25, out: 10.00 },
        "openai/gpt-5-mini": { in: 0.25, out: 2.00 },
        "gpt-5": { in: 1.25, out: 10.00 },
        "gpt-5-mini": { in: 0.25, out: 2.00 },
      };
      const IMAGE_USD = 0.04;
      // Credits are billed at a 4x markup over raw model spend, so a charge
      // with no recorded usage metadata (older ledger rows) can be estimated
      // back to raw cost from the credits it consumed.

      const ledgerRows = ledger.data || [];
      const byFeature: Record<string, any> = {};
      let inputTokens = 0, outputTokens = 0, images = 0, creditsSpent = 0, rawCostUsd = 0;
      let estimatedCalls = 0;
      let creditsPurchased = 0, creditsGranted = 0, creditsRefunded = 0;

      for (const row of ledgerRows) {
        const m = row.metadata || {};
        if (row.kind === "spend") {
          const inTok = Number(m.input_tokens || 0);
          const outTok = Number(m.output_tokens || 0);
          const img = Number(m.images || 0);
          const p = PRICES[m.model] ?? { in: 0.50, out: 3.00 };
          const spent = Math.abs(row.delta);
          const measured = (inTok / 1e6) * p.in + (outTok / 1e6) * p.out + img * IMAGE_USD;
          const hasUsage = inTok > 0 || outTok > 0 || img > 0;
          const cost = hasUsage ? measured : spent * USD_PER_CREDIT;
          if (!hasUsage) estimatedCalls++;
          inputTokens += inTok; outputTokens += outTok; images += img;
          creditsSpent += spent; rawCostUsd += cost;
          const key = row.reason || "other";
          byFeature[key] ||= { feature: key, calls: 0, credits: 0, inputTokens: 0, outputTokens: 0, images: 0, costUsd: 0 };
          byFeature[key].calls++;
          byFeature[key].credits += spent;
          byFeature[key].inputTokens += inTok;
          byFeature[key].outputTokens += outTok;
          byFeature[key].images += img;
          byFeature[key].costUsd += cost;
        } else if (row.kind === "purchase") {
          creditsPurchased += row.delta;
        } else if (row.kind === "grant") {
          creditsGranted += row.delta;
        } else if (row.kind === "refund") {
          creditsRefunded += row.delta;
        }
      }

      // Revenue: only counted when the user actually pays us. An admin-granted
      // plan (invite, comp, testing) has no Stripe subscription, so it earns $0.
      const plan = plans.data?.plan || "draft";
      const MONTHLY: Record<string, number> = { draft: 0, manuscript: 5, studio: 20 };

      let paying = false;
      try {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey && (MONTHLY[plan] || 0) > 0) {
          const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(target);
          const email = targetUser?.user?.email;
          if (email) {
            const Stripe = (await import("https://esm.sh/stripe@18.5.0")).default;
            const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
            const customers = await stripe.customers.list({ email, limit: 1 });
            if (customers.data.length > 0) {
              const subs = await stripe.subscriptions.list({
                customer: customers.data[0].id,
                status: "active",
                limit: 5,
              });
              paying = subs.data.length > 0;
            }
          }
        }
      } catch (_e) {
        paying = false;
      }

      const subscriptionUsd = paying ? (MONTHLY[plan] || 0) * (days / 30) : 0;
      const packUsd = (c: number) => (c >= 5000 ? 40 : c >= 2000 ? 18 : c >= 500 ? 5 : c * 0.01);
      const purchaseUsd = ledgerRows
        .filter((r) => r.kind === "purchase")
        .reduce((a, r) => a + packUsd(r.delta), 0);
      const revenueUsd = subscriptionUsd + purchaseUsd;

      return new Response(JSON.stringify({
        range,
        since: sinceIso,
        plan,
        content: {
          totalWords,
          recentWords,
          projects: (projects.data || []).length,
          projectsInRange: inRange(projects.data),
          folios: (grids.data || []).length,
          foliosInRange: inRange(grids.data),
          notes: notepadRows.length,
          notesInRange: inRange(notepadRows),
          chapters: chapterRows.length,
          chaptersInRange: inRange(chapterRows),
          drafts: (drafts.data || []).length,
          maps: (maps.data || []).length,
          mapsInRange: inRange(maps.data),
          stickers: countStickers(maps.data || []),
        },
        ai: {
          calls: ledgerRows.filter((r) => r.kind === "spend").length,
          creditsSpent,
          inputTokens,
          outputTokens,
          images,
          estimatedCalls,
          byFeature: Object.values(byFeature).sort((a: any, b: any) => b.credits - a.credits),
        },
        credits: {
          included: credits.data?.credits_included ?? 0,
          used: credits.data?.credits_used ?? 0,
          purchased: credits.data?.credits_purchased ?? 0,
          remaining: credits.data
            ? (credits.data.credits_included - credits.data.credits_used) + credits.data.credits_purchased
            : 0,
          purchasedInRange: creditsPurchased,
          grantedInRange: creditsGranted,
          refundedInRange: creditsRefunded,
        },
        money: {
          revenueUsd,
          subscriptionUsd,
          purchaseUsd,
          costUsd: rawCostUsd,
          marginUsd: revenueUsd - rawCostUsd,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

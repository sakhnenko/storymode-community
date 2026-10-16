import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the per-project AI output language (default 'en').
 * Pass this to AI edge function bodies as `aiLanguage`.
 */
export function useAiLanguage(projectId: string | null | undefined): string {
  const [resolved, setResolved] = useState<{ projectId: string | null; language: string }>({
    projectId: null,
    language: "en",
  });
  useEffect(() => {
    if (!projectId) {
      setResolved({ projectId: null, language: "en" });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("projects" as any)
        .select("ai_language")
        .eq("id", projectId)
        .maybeSingle();
      if (cancelled) return;
      const v = (data as any)?.ai_language;
      setResolved({
        projectId,
        language: typeof v === "string" && v ? v : "en",
      });
    })();
    return () => { cancelled = true; };
  }, [projectId]);
  // Never expose the previous project's language while the next project's
  // setting is loading. The server independently resolves the canonical value.
  return resolved.projectId === projectId ? resolved.language : "en";
}
#!/usr/bin/env node
// StoryMode setup wizard: `npm run setup`. Walks through everything a new
// install needs, step by step, checking each answer as it goes: Supabase
// (project, database, server functions), OpenRouter (the AI key) and Vercel
// (the web app). Needs only Node.js 18+; the Supabase and Vercel CLIs run
// through npx. Progress (never secrets) is kept in .storymode-setup.json, so
// running it again picks up where it stopped.
//
// Secrets can also come from the environment: SUPABASE_ACCESS_TOKEN,
// SUPABASE_DB_PASSWORD, OPENROUTER_API_KEY.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateFile = path.join(root, ".storymode-setup.json");
const SUPABASE_API = "https://api.supabase.com/v1";

/* ───────────────────────────── terminal UI ───────────────────────────── */

const esc = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
const bold = esc(1), dim = esc(2), red = esc(31), green = esc(32), yellow = esc(33), cyan = esc(36), magenta = esc(35);
const out = (s = "") => process.stdout.write(`${s}\n`);
const visible = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

/** Splits a line that's too wide at spaces, keeping its indent (colours restart per piece). */
function wrap(line, width) {
  if (visible(line).length <= width) return [line];
  const plain = visible(line);
  const indent = plain.match(/^(\s*(?:\d+\.\s)?)/)[1].replace(/\S/g, " ");
  const pieces = [];
  let rest = plain;
  while (rest.length > width) {
    const cut = rest.lastIndexOf(" ", width);
    pieces.push(rest.slice(0, cut > indent.length ? cut : width));
    rest = indent + rest.slice(cut > indent.length ? cut + 1 : width).trimStart();
  }
  return [...pieces, rest];
}

function box(lines, { width = 64, color = dim } = {}) {
  out(color(`╭${"─".repeat(width - 2)}╮`));
  for (const line of lines.flatMap((l) => wrap(l, width - 4))) {
    const pad = Math.max(0, width - 4 - visible(line).length);
    out(`${color("│")} ${line}${" ".repeat(pad)} ${color("│")}`);
  }
  out(color(`╰${"─".repeat(width - 2)}╯`));
}

const BANNER = [
  "  ___ _                   __  __         _     ",
  " / __| |_ ___ _ _ _  _   |  \\/  |___  __| |___ ",
  " \\__ \\  _/ _ \\ '_| || |  | |\\/| / _ \\/ _` / -_)",
  " |___/\\__\\___/_|  \\_, |  |_|  |_\\___/\\__,_\\___|",
  "                  |__/                          ",
];

const STEPS = [
  ["check", "Check your computer"],
  ["supabase", "Supabase: your project"],
  ["openrouter", "OpenRouter: your AI key"],
  ["database", "Set up the database"],
  ["functions", "Deploy the server functions"],
  ["secrets", "Save your AI key on Supabase"],
  ["vercel", "Deploy the web app"],
  ["site", "Point sign-in at your site"],
  ["email", "Who can sign up"],
];

function checklist(state, current) {
  const lines = STEPS.map(([key, label], i) => {
    const mark = state.done?.[key] ? green("✓") : key === current ? cyan("›") : dim("○");
    const text = key === current ? bold(label) : state.done?.[key] ? label : dim(label);
    return `${mark} ${dim(`${i + 1}.`)} ${text}`;
  });
  box(lines);
}

function header(state, current) {
  console.clear();
  out(magenta(BANNER.join("\n")));
  out(dim("  Self-hosted setup · about 10 minutes\n"));
  checklist(state, current);
  out();
}

/**
 * Puts the terminal in key-by-key mode for menus and secrets, and makes sure
 * it really is: a command run along the way (the Supabase or Vercel CLI) can
 * switch the terminal back to line mode behind Node's back, which made arrow
 * keys print as ^[[A instead of moving the selection.
 */
function rawMode(on) {
  process.stdin.setRawMode(on);
  if (!on || process.platform === "win32") return;
  const probe = spawnSync("stty", ["-a"], { stdio: ["inherit", "pipe", "ignore"], encoding: "utf8" });
  if (probe.status === 0 && /(^|\s)icanon(\s|$)/.test(probe.stdout)) {
    spawnSync("stty", ["-icanon", "-echo", "min", "1"], { stdio: ["inherit", "ignore", "ignore"] });
  }
}

/** A line of text answered with Enter. */
function ask(question, { hidden = false, fallback = "" } = {}) {
  if (hidden) return askSecret(question);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.on("SIGINT", () => { rl.close(); quit(); });
    rl.question(`${cyan("?")} ${question}${fallback ? dim(` (${fallback})`) : ""} `, (answer) => {
      rl.close();
      // Pasted text can arrive wrapped in bracketed-paste markers.
      const clean = answer.replace(/\x1b\[[0-9;?]*[A-Za-z~]/g, "").replace(/\[20[01]~/g, "").trim();
      resolve(clean || fallback);
    });
  });
}

/** A secret, read key by key: only dots are ever printed. Pasting works. */
function askSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(`${cyan("?")} ${question} `);
    let value = "";
    rawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (data) => {
      // Terminals with bracketed paste on wrap pasted text in ESC[200~ … ESC[201~;
      // drop those and any other terminal codes so only the pasted text counts.
      const chunk = String(data).replace(/\x1b\[[0-9;?]*[A-Za-z~]/g, "");
      for (const ch of chunk) {
        if (ch === "\u0003") { cleanup(); quit(); }
        if (ch === "\r" || ch === "\n") { cleanup(); process.stdout.write("\n"); resolve(value.trim()); return; }
        if (ch === "\u007f" || ch === "\b") {
          if (value) { value = value.slice(0, -1); process.stdout.write("\b \b"); }
        } else if (ch >= " ") {
          value += ch;
          process.stdout.write("•");
        }
      }
    };
    const cleanup = () => {
      process.stdin.off("data", onData);
      rawMode(false);
      process.stdin.pause();
    };
    process.stdin.on("data", onData);
  });
}

/** Pick one of `options` with the arrow keys (or its number) and Enter. */
function choose(question, options) {
  return new Promise((resolve) => {
    let index = 0;
    const render = (first) => {
      if (!first) process.stdout.write(`\x1b[${options.length}A`);
      for (const [i, option] of options.entries()) {
        process.stdout.write(`\x1b[2K${i === index ? cyan(`❯ ${option.label}`) : `  ${option.label}`}${option.hint ? dim(`  ${option.hint}`) : ""}\n`);
      }
    };
    out(`${cyan("?")} ${question} ${dim(`(↑/↓ or 1–${options.length}, then Enter)`)}`);
    render(true);
    readline.emitKeypressEvents(process.stdin);
    rawMode(true);
    process.stdin.resume();
    const onKey = (_str, key) => {
      if (key.ctrl && key.name === "c") { cleanup(); quit(); }
      if (key.name === "up") index = (index + options.length - 1) % options.length;
      else if (key.name === "down") index = (index + 1) % options.length;
      else if (/^[1-9]$/.test(key.sequence ?? "") && Number(key.sequence) <= options.length) index = Number(key.sequence) - 1;
      // "enter" is a line-mode Enter (\n), should the terminal still be in it.
      else if (key.name === "return" || key.name === "enter") { cleanup(); resolve(options[index].value); return; }
      render(false);
    };
    const cleanup = () => {
      process.stdin.off("keypress", onKey);
      rawMode(false);
      process.stdin.pause();
    };
    process.stdin.on("keypress", onKey);
  });
}

const confirm = async (question) => (await choose(question, [{ label: "Yes", value: true }, { label: "No", value: false }]));

/**
 * Runs a command with a spinner; its output goes to a log shown only on failure.
 * With `clear`, the spinner line just disappears when it's done, for checks
 * whose result the caller reports itself.
 */
function task(label, command, cmdArgs, { env = {}, input, clear = false } = {}) {
  return new Promise((resolve) => {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame = 0;
    const started = Date.now();
    const tick = setInterval(() => {
      const seconds = Math.round((Date.now() - started) / 1000);
      process.stdout.write(`\r\x1b[2K${cyan(frames[frame++ % frames.length])} ${label} ${dim(`${seconds}s`)}`);
    }, 100);
    const child = spawn(command, cmdArgs, { cwd: root, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let log = "", stdout = "";
    child.stdout.on("data", (d) => { log += d; stdout += d; });
    child.stderr.on("data", (d) => { log += d; });
    if (input) child.stdin.write(input);
    child.stdin.end();
    child.on("close", (code) => {
      clearInterval(tick);
      process.stdout.write(clear ? "\r\x1b[2K" : `\r\x1b[2K${code === 0 ? green("✓") : red("✗")} ${label}\n`);
      resolve({ ok: code === 0, log, stdout });
    });
  });
}

function showLog(log) {
  const lines = log.trim().split("\n").filter(Boolean).slice(-12);
  if (lines.length) box(lines.map((l) => dim(l.slice(0, 58))), { color: red });
}

function openUrl(url) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawnSync(opener, [url], { stdio: "ignore", shell: process.platform === "win32" });
}

async function guide(lines, url) {
  box(lines.map((l) => l.replace(/\{(.+?)\}/g, (_m, s) => cyan(s))), { color: dim });
  if (url && await confirm(`Open ${url.replace("https://", "")} in your browser?`)) openUrl(url);
}

function quit() {
  out(`\n${dim("Setup paused. Run")} ${bold("npm run setup")} ${dim("to continue where you left off.")}`);
  process.exit(130);
}

const fail = (message) => out(`${red("✗")} ${message}`);
const note = (message) => out(`${dim("·")} ${dim(message)}`);

/* ───────────────────────────── state ───────────────────────────── */

const loadState = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return { done: {} }; } };
const saveState = (state) => fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
const markDone = (state, key) => { state.done = { ...state.done, [key]: true }; saveState(state); };

/* ───────────────────────────── services ───────────────────────────── */

async function supabaseApi(token, pathname, init = {}) {
  const resp = await fetch(`${SUPABASE_API}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const text = await resp.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: resp.ok, status: resp.status, body };
}

const npx = (pkg, cliArgs) => ["npx", ["-y", pkg, ...cliArgs]];

/* ───────────────────────────── steps ───────────────────────────── */

async function checkComputer() {
  let good = true;
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor >= 18) out(`${green("✓")} Node.js ${process.versions.node}`);
  else { fail(`Node.js ${process.versions.node}: version 18 or newer is needed (nodejs.org)`); good = false; }

  const npxCheck = spawnSync("npx", ["--version"], { encoding: "utf8" });
  if (npxCheck.status === 0) out(`${green("✓")} npx ${npxCheck.stdout.trim()}`);
  else { fail("npx isn't available: it comes with Node.js (nodejs.org)"); good = false; }

  const gitCheck = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (gitCheck.status === 0) out(`${green("✓")} ${gitCheck.stdout.trim()}`);
  else note("git isn't installed: fine for setup, but you'll want it to pull updates later");

  for (const [name, url] of [["Supabase", "https://api.supabase.com/v1/health"], ["OpenRouter", "https://openrouter.ai/api/v1/models?limit=1"]]) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(10_000) });
      out(`${green("✓")} Can reach ${name}`);
    } catch {
      fail(`Can't reach ${name}: check your internet connection`);
      good = false;
    }
  }
  if (!fs.existsSync(path.join(root, "supabase", "migrations"))) {
    fail("Run this from the StoryMode folder (the one with supabase/migrations)");
    good = false;
  }
  return good;
}

/**
 * The Supabase project, its access token and database password. Resuming
 * (`again`) only asks for what's missing for the project already chosen.
 */
async function supabaseStep(state, secrets, { again = false, needPassword = true } = {}) {
  if (!again) await guide([
    bold("Supabase runs your database, sign-in and server functions."),
    "",
    "1. Sign up at {supabase.com}, then create a project at {database.new}.",
    "   No organization yet? Supabase asks for one first: Free is fine.",
    "2. Choose a name, a region near you, and a {database password}.",
    "   Keep the password: you'll need it in a moment.",
    "3. Create an {access token} (we'll open that page next): pick your",
    "   organization, {7 days}, and the {Full access} preset. Only setup",
    "   and updates use it; you can revoke it afterwards.",
  ], "https://database.new");

  // The access token: checked by listing the projects it can see.
  let projects;
  for (;;) {
    if (!secrets.token) {
      out();
      if (await confirm("Open the access tokens page?")) openUrl("https://supabase.com/dashboard/account/tokens");
      secrets.token = await ask("Paste your Supabase access token:", { hidden: true });
    }
    const resp = await supabaseApi(secrets.token, "/projects");
    if (resp.ok && Array.isArray(resp.body)) { projects = resp.body; out(`${green("✓")} Access token works`); break; }
    fail(!/^sbp_[A-Za-z0-9_]+$/.test(secrets.token)
      ? "That doesn't look like an access token: they start with sbp_ and have no spaces."
      : resp.status === 401
        ? "Supabase didn't accept that token. It may have expired or been revoked: create a new one."
        : `Supabase answered ${resp.status}`);
    secrets.token = "";
  }

  // The project: picked from the list, waiting for a new one to finish starting.
  for (;;) {
    if (again && state.ref && projects.some((p) => p.id === state.ref)) break;
    if (!projects.length) {
      note("No projects yet. Create one at database.new, then come back here.");
      await ask("Press Enter when it's created");
      projects = (await supabaseApi(secrets.token, "/projects")).body ?? [];
      continue;
    }
    const ref = await choose("Which project is for StoryMode?", [
        ...projects.map((p) => ({ label: p.name, value: p.id, hint: `${p.region} · ${p.id}` })),
        { label: "Refresh the list", value: "" },
      ]);
    if (!ref) { projects = (await supabaseApi(secrets.token, "/projects")).body ?? []; continue; }
    state.ref = ref;
    saveState(state);
    break;
  }
  for (let waited = 0; ; waited += 5) {
    const project = (await supabaseApi(secrets.token, `/projects/${state.ref}`)).body;
    if (project?.status === "ACTIVE_HEALTHY") { out(`${green("✓")} Project ${bold(project.name)} is ready`); break; }
    process.stdout.write(`\r\x1b[2K${cyan("⠿")} Waiting for the project to finish starting ${dim(`(${project?.status ?? "…"}, ${waited}s)`)}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  process.stdout.write("\r\x1b[2K");

  // The database password: checked by linking the project.
  for (;;) {
    if (!needPassword) break;
    if (!secrets.dbPassword) secrets.dbPassword = await ask("Database password (the one you set for the project):", { hidden: true });
    const [cmd, cmdArgs] = npx("supabase@latest", ["link", "--project-ref", state.ref]);
    const link = await task("Connecting to your database", cmd, cmdArgs, {
      env: { SUPABASE_ACCESS_TOKEN: secrets.token, SUPABASE_DB_PASSWORD: secrets.dbPassword },
    });
    if (link.ok) break;
    if (/password|authentication/i.test(link.log)) {
      fail("That password didn't work. You can reset it under Project Settings → Database.");
    } else {
      showLog(link.log);
    }
    secrets.dbPassword = "";
    if (!await confirm("Try again?")) quit();
  }
}

async function openRouterStep(state, secrets, { again = false } = {}) {
  if (!again) await guide([
    bold("OpenRouter gives StoryMode one key for every AI model it uses."),
    "",
    "1. Sign up at {openrouter.ai}.",
    "2. Add a few dollars of credit ({Settings → Credits}). Even to use",
    "   your own OpenAI / Anthropic / Google key ({Settings → Integrations}),",
    "   OpenRouter needs one credit purchase: its free plan has no own keys.",
    "3. Create a key under {Settings → Keys}. It starts with sk-or-.",
  ], "https://openrouter.ai/settings/keys");

  for (;;) {
    if (!secrets.openRouterKey) secrets.openRouterKey = await ask("Paste your OpenRouter key:", { hidden: true });
    if (!secrets.openRouterKey.startsWith("sk-or-")) {
      fail("OpenRouter keys start with sk-or-");
      secrets.openRouterKey = "";
      continue;
    }
    const resp = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${secrets.openRouterKey}` } });
    const info = (await resp.json().catch(() => null))?.data;
    if (!resp.ok || !info) {
      fail("OpenRouter didn't accept that key");
      secrets.openRouterKey = "";
      continue;
    }
    out(`${green("✓")} OpenRouter key works${info.label ? dim(` (${info.label})`) : ""}`);
    if (info.is_free_tier) {
      note("This account has no credit yet, so StoryMode's AI won't work. Buy a little");
      note("at openrouter.ai/settings/credits: OpenRouter's free plan can't use your own");
      note("provider keys either, so that's needed even if you've added one.");
      if (!await confirm("Continue anyway?")) { secrets.openRouterKey = ""; continue; }
    }
    state.openRouterChecked = true;
    saveState(state);
    return;
  }
}

async function databaseStep(state, secrets) {
  for (;;) {
    const [cmd, cmdArgs] = npx("supabase@latest", ["db", "push", "--include-all", "--yes"]);
    const push = await task("Creating the database tables (about a minute)", cmd, cmdArgs, {
      env: { SUPABASE_ACCESS_TOKEN: secrets.token, SUPABASE_DB_PASSWORD: secrets.dbPassword },
    });
    if (push.ok) return;
    showLog(push.log);
    if (!await confirm("Try again?")) quit();
  }
}

async function functionsStep(state, secrets) {
  for (;;) {
    const [cmd, cmdArgs] = npx("supabase@latest", ["functions", "deploy", "--use-api", "--project-ref", state.ref]);
    const deploy = await task("Deploying the server functions", cmd, cmdArgs, { env: { SUPABASE_ACCESS_TOKEN: secrets.token } });
    if (deploy.ok) return;
    showLog(deploy.log);
    if (!await confirm("Try again?")) quit();
  }
}

async function secretsStep(state, secrets) {
  const resp = await supabaseApi(secrets.token, `/projects/${state.ref}/secrets`, {
    method: "POST",
    body: JSON.stringify([{ name: "OPENROUTER_API_KEY", value: secrets.openRouterKey }]),
  });
  if (!resp.ok) throw new Error(`Supabase didn't save the secret (${resp.status})`);
  out(`${green("✓")} OpenRouter key saved as a Supabase secret`);
}

/** The project's public (publishable or anon) key, which the web app uses. */
async function publicKey(state, secrets) {
  const resp = await supabaseApi(secrets.token, `/projects/${state.ref}/api-keys`);
  const keys = Array.isArray(resp.body) ? resp.body : [];
  return keys.find((k) => k.type === "publishable" || String(k.api_key).startsWith("sb_publishable_"))?.api_key
    ?? keys.find((k) => k.name === "anon")?.api_key ?? null;
}

/**
 * The Vercel project to deploy to. Linking a name that's taken would take over
 * that project, replacing its settings and its live site, so an existing
 * project is only used without asking when it's this install's own: linked in
 * this folder, or chosen in an earlier run.
 */
async function vercelProject(state, vercel) {
  try {
    const linked = JSON.parse(fs.readFileSync(path.join(root, ".vercel", "project.json"), "utf8"));
    if (linked?.projectName) return linked.projectName;
  } catch { /* not linked here yet */ }

  let name = state.vercelProject ?? "storymode";
  for (;;) {
    const found = await task(`Looking for a Vercel project called ${name}`, ...vercel(["project", "inspect", name]), { clear: true });
    if (!found.ok) {
      if (!/project_not_found/.test(found.log)) { showLog(found.log); throw new Error("Couldn't check your Vercel projects"); }
      out(`${green("✓")} A new Vercel project, ${bold(name)}, will be created`);
      break;
    }
    if (name === state.vercelProject) break;
    const where = found.log.match(/Found Project (\S+)/)?.[1] ?? name;
    const pick = await choose(`You already have a Vercel project called ${where}. Deploy StoryMode there?`, [
      { label: "No, create a new project", value: "new" },
      { label: `Yes, use ${name}`, value: "use", hint: "replaces its settings and its live site" },
    ]);
    if (pick === "use") break;
    for (;;) {
      const next = (await ask("Name for the new project:", { fallback: `storymode-${Math.random().toString(36).slice(2, 6)}` })).trim().toLowerCase();
      if (/^[a-z0-9][a-z0-9-]{0,99}$/.test(next) && !next.includes("---")) { name = next; break; }
      fail("Use lowercase letters, numbers and dashes, starting with a letter or number");
    }
  }
  state.vercelProject = name;
  saveState(state);
  return name;
}

async function vercelStep(state, secrets) {
  const url = `https://${state.ref}.supabase.co`;
  const key = await publicKey(state, secrets);
  if (!key) throw new Error("Couldn't read the project's public key (Project Settings → API Keys)");
  fs.writeFileSync(path.join(root, ".env"), `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\n`);
  note("Wrote .env, for running StoryMode on this computer");

  const how = await choose("How do you want to deploy the web app?", [
    { label: "Deploy it for me with the Vercel CLI", value: "cli", hint: "recommended · signs in through your browser" },
    { label: "I'll deploy it myself", value: "manual", hint: "Vercel, Netlify, any static host" },
  ]);
  state.deploy = how;
  saveState(state);

  if (how === "manual") {
    box([
      bold("Deploy the web app with these two environment variables:"),
      "",
      `${cyan("VITE_SUPABASE_URL")}              ${url}`,
      `${cyan("VITE_SUPABASE_PUBLISHABLE_KEY")}  ${key.slice(0, 22)}…`,
      "",
      dim("(the full key is in .env; both values are safe to share)"),
      dim("Build: npx vite build · Output: dist · single-page app"),
    ]);
    for (;;) {
      const site = (await ask("When it's live, paste your site's address:")).replace(/\/+$/, "");
      if (/^https?:\/\/\S+$/.test(site)) { state.site = site; saveState(state); return; }
      fail("Use the full address, e.g. https://storymode-you.vercel.app");
    }
  }

  const vercel = (cliArgs) => npx("vercel@latest", cliArgs);
  // The first run of npx downloads the Vercel CLI, which takes a while: show it.
  const who = await task("Checking your Vercel sign-in", ...vercel(["whoami"]), { clear: true });
  if (!who.ok) {
    note("Signing in to Vercel (it opens your browser)…");
    const login = spawnSync(...vercel(["login"]), { cwd: root, stdio: "inherit" });
    if (login.status !== 0) throw new Error("Vercel sign-in didn't finish");
  } else {
    out(`${green("✓")} Signed in to Vercel as ${bold(who.stdout.trim().split("\n").pop().trim())}`);
  }

  const project = await vercelProject(state, vercel);
  const [lcmd, largs] = vercel(["link", "--yes", "--project", project]);
  const link = await task("Creating the Vercel project", lcmd, largs);
  if (!link.ok) { showLog(link.log); throw new Error("Couldn't create the Vercel project"); }
  for (const [name, value] of [["VITE_SUPABASE_URL", url], ["VITE_SUPABASE_PUBLISHABLE_KEY", key]]) {
    spawnSync(...vercel(["env", "rm", name, "production", "--yes"]), { cwd: root, stdio: "ignore" });
    const [ecmd, eargs] = vercel(["env", "add", name, "production"]);
    const add = await task(`Setting ${name}`, ecmd, eargs, { input: value });
    if (!add.ok) { showLog(add.log); throw new Error(`Couldn't set ${name} on Vercel`); }
  }
  const [dcmd, dargs] = vercel(["deploy", "--prod", "--yes"]);
  const deploy = await task("Building and deploying (about two minutes)", dcmd, dargs);
  if (!deploy.ok) { showLog(deploy.log); throw new Error("The Vercel deploy failed"); }

  // The stable production address (project.vercel.app), not the one-off deployment URL.
  const deployUrl = deploy.log.match(/https:\/\/[^\s]+\.vercel\.app/g)?.pop();
  const inspect = deployUrl ? await task("Finding your site's address", ...vercel(["inspect", deployUrl]), { clear: true }) : null;
  const aliases = (inspect?.log ?? "").match(/https:\/\/[a-z0-9-]+\.vercel\.app/g) ?? [];
  state.site = aliases.sort((a, b) => a.length - b.length)[0] ?? deployUrl;
  if (!state.site) state.site = (await ask("Paste your site's address from the Vercel dashboard:")).replace(/\/+$/, "");
  saveState(state);
  out(`${green("✓")} Live at ${bold(state.site)}`);
}

async function siteStep(state, secrets) {
  const resp = await supabaseApi(secrets.token, `/projects/${state.ref}/config/auth`, {
    method: "PATCH",
    body: JSON.stringify({ site_url: state.site, uri_allow_list: `${state.site}/**` }),
  });
  if (!resp.ok) throw new Error(`Supabase didn't accept the site address (${resp.status})`);
  await supabaseApi(secrets.token, `/projects/${state.ref}/secrets`, {
    method: "POST",
    body: JSON.stringify([{ name: "SITE_URL", value: state.site }]),
  });
  out(`${green("✓")} Sign-in emails now link to ${state.site}`);
}

/**
 * Sign-up and password emails through Resend. Supabase's built-in sender only
 * reaches your own Supabase team, so other writers need this to sign up.
 */
/** Turns Supabase's confirmation emails on or off for new accounts. */
async function setAutoconfirm(state, secrets, on) {
  const resp = await supabaseApi(secrets.token, `/projects/${state.ref}/config/auth`, {
    method: "PATCH",
    body: JSON.stringify({ mailer_autoconfirm: on }),
  });
  if (!resp.ok) throw new Error(`Supabase didn't accept the sign-up settings (${resp.status})`);
}

/**
 * Who can create an account, and so how sign-up email works. Everyone with an
 * account can use AI on the owner's OpenRouter credit, so sign-ups start
 * closed: only the first account (the admin) and the addresses the admin adds
 * in Admin → Sign-ups can join, until the admin opens them.
 */
async function emailStep(state, secrets) {
  await guide([
    bold("Who will use this StoryMode?"),
    "",
    "Everyone with an account can use AI on your OpenRouter credit, so",
    "sign-ups start {closed}: only you, and the people you add later in",
    "{Admin → Sign-ups}. That also decides whether you need email:",
    "Supabase's built-in email only reaches your own Supabase address.",
  ]);
  const who = await choose("Who will use it?", [
    { label: "Just me", value: "me", hint: "no email setup" },
    { label: "Me and a few people I add", value: "invited", hint: "no email; accounts work right away" },
    { label: "Anyone I open sign-ups to", value: "anyone", hint: "connects Resend for emails" },
  ]);
  state.access = who;

  if (who === "me") {
    await setAutoconfirm(state, secrets, false);
    state.email = "supabase";
    saveState(state);
    out(`${green("✓")} Sign up with the email you use for ${bold("supabase.com")}: its confirmation email reaches you.`);
    return;
  }
  if (who === "invited") {
    await setAutoconfirm(state, secrets, true);
    state.email = "none";
    saveState(state);
    out(`${green("✓")} New accounts work right away, without a confirmation email.`);
    note("After you sign up, add each person's address in Admin → Sign-ups.");
    note("Without email, nobody can reset a forgotten password: choose this step's");
    note("third option later (npm run setup → Start over) if you need that.");
    return;
  }

  await guide([
    bold("Email lets other writers sign up and reset their passwords."),
    "",
    "We'll connect {Resend}:",
    "1. Sign up at {resend.com} (free for 3,000 emails a month).",
    "2. To email anyone, add and verify a {domain} you own (Domains).",
    "   Without one, Resend only delivers to your own address.",
    "3. Create an {API key} (we'll open that page next).",
  ]);
  await setAutoconfirm(state, secrets, false);

  let key, domains = null;
  for (;;) {
    if (await confirm("Open Resend's API keys page?")) openUrl("https://resend.com/api-keys");
    key = await ask("Paste your Resend API key:", { hidden: true });
    const resp = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
    const body = await resp.json().catch(() => null);
    if (resp.ok) { domains = (body?.data ?? []).filter((d) => d.status === "verified").map((d) => d.name); break; }
    // A sending-only key can't list domains, but it works for sending.
    if (body?.name === "restricted_api_key") break;
    fail(body?.message ? `Resend: ${body.message}` : "Resend didn't accept that key (keys start with re_)");
  }
  out(`${green("✓")} Resend key works`);

  // Resend only sends from domains verified in it (or its own resend.dev); a
  // personal address like you@gmail.com can never be verified, and every
  // sign-up email from it fails.
  let sender;
  if (domains?.length) {
    const domain = domains.length === 1 ? domains[0] : await choose("Send from which domain?", domains.map((d) => ({ label: d, value: d })));
    sender = `${await ask("Sender name before the @", { fallback: "storymode" })}@${domain}`;
  } else {
    if (domains) note("No verified domain yet: until you add one, emails only reach the address your Resend account uses.");
    const personal = /@(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|pm|gmx|mail|zoho|yandex)\.[a-z.]+$/i;
    for (;;) {
      sender = await ask("Send from which address?", { fallback: "onboarding@resend.dev" });
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(sender)) { fail("That isn't an email address"); continue; }
      if (personal.test(sender)) {
        fail("Resend can't send from a personal address like that: only from a domain you've verified in Resend.");
        note("Use onboarding@resend.dev for now, or verify your own domain at resend.com/domains.");
        continue;
      }
      if (domains && !sender.endsWith("@resend.dev")) {
        fail(`${sender.split("@")[1]} isn't verified in Resend yet, so emails from it would fail.`);
        continue;
      }
      break;
    }
  }

  const resp = await supabaseApi(secrets.token, `/projects/${state.ref}/config/auth`, {
    method: "PATCH",
    body: JSON.stringify({
      smtp_host: "smtp.resend.com",
      smtp_port: "465",
      smtp_user: "resend",
      smtp_pass: key,
      smtp_admin_email: sender,
      smtp_sender_name: "StoryMode",
      // Supabase's default of a couple an hour is for its built-in sender.
      rate_limit_email_sent: 30,
    }),
  });
  if (!resp.ok) throw new Error(`Supabase didn't accept the email settings (${resp.status})`);
  state.email = sender;
  saveState(state);
  out(`${green("✓")} Sign-up emails now come from ${bold(sender)}`);
  note("Sign-ups stay closed until you open them in Admin → Sign-ups.");
}

/**
 * Brings a finished install up to date: the latest version from GitHub, any new
 * database changes, the server functions and the web app. Safe to repeat.
 */
async function update(state, secrets, { pulled = false } = {}) {
  header(state, null);
  if (!pulled && fs.existsSync(path.join(root, ".git"))) {
    const before = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
    const pull = await task("Getting the latest version", "git", ["pull", "--ff-only"]);
    if (!pull.ok) {
      showLog(pull.log);
      throw new Error("Couldn't get the latest version. If you changed files here, run git status");
    }
    const changed = spawnSync("git", ["diff", "--name-only", before, "HEAD"], { cwd: root, encoding: "utf8" }).stdout;
    if (!changed.trim()) note("Already the latest version; updating Supabase and the site anyway.");
    // This wizard may itself have changed: run the new version for the rest.
    if (changed.split("\n").includes("scripts/setup.mjs")) {
      const rest = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--update-pulled"], { cwd: root, stdio: "inherit" });
      process.exit(rest.status ?? 1);
    }
  }

  note("Supabase needs your access token and database password again (they're never saved).");
  await supabaseStep(state, secrets, { again: true, needPassword: true });
  await databaseStep(state, secrets);
  await functionsStep(state, secrets);

  const cli = state.deploy === "cli" || (!state.deploy && fs.existsSync(path.join(root, ".vercel", "project.json")));
  if (cli) {
    for (;;) {
      const deploy = await task("Deploying the web app (about two minutes)", ...npx("vercel@latest", ["deploy", "--prod", "--yes"]));
      if (deploy.ok) break;
      showLog(deploy.log);
      if (!await confirm("Try again?")) quit();
    }
  }

  header(state, null);
  box([
    green(bold("StoryMode is up to date.")),
    "",
    cli
      ? `Your site, ${cyan(state.site ?? "")}, has the new version.`
      : "Redeploy your site from your host to get the new version.",
  ], { color: green });
}

/* ───────────────────────────── main ───────────────────────────── */

async function main() {
  if (!process.stdin.isTTY) {
    out("Run `npm run setup` in a terminal: it asks you questions as it goes.");
    process.exit(1);
  }
  const state = loadState();
  const secrets = {
    token: process.env.SUPABASE_ACCESS_TOKEN ?? "",
    dbPassword: process.env.SUPABASE_DB_PASSWORD ?? "",
    openRouterKey: process.env.OPENROUTER_API_KEY ?? "",
  };

  if (process.argv.includes("--update-pulled")) return update(state, secrets, { pulled: true });

  if (Object.keys(state.done ?? {}).length) {
    header(state, null);
    const finished = STEPS.every(([key]) => state.done?.[key]);
    const again = await choose("You've run setup before. What now?", [
      ...(finished
        ? [{ label: "Update to the latest version", value: "update", hint: "code, database, functions and site" }]
        : [{ label: "Continue where I left off", value: "continue" }]),
      { label: "Start over", value: "restart", hint: "re-checks everything; safe to repeat" },
    ]);
    if (again === "update") return update(state, secrets);
    if (again === "restart") { state.done = {}; saveState(state); }
  }

  const run = {
    check: async () => { if (!await checkComputer()) throw new Error("Fix the items above, then run setup again"); },
    supabase: () => supabaseStep(state, secrets),
    openrouter: () => openRouterStep(state, secrets),
    database: () => databaseStep(state, secrets),
    functions: () => functionsStep(state, secrets),
    secrets: () => secretsStep(state, secrets),
    vercel: () => vercelStep(state, secrets),
    site: () => siteStep(state, secrets),
    email: () => emailStep(state, secrets),
  };
  // Later steps need the Supabase token and link even when the Supabase step is already done.
  const needsSupabase = ["database", "functions", "secrets", "vercel", "site", "email"];

  for (const [key] of STEPS) {
    if (state.done?.[key]) continue;
    header(state, key);
    // Resuming: secrets aren't saved, so ask again for the ones this step needs.
    if (needsSupabase.includes(key) && (!secrets.token || (key === "database" && !secrets.dbPassword))) {
      note("Picking up where you left off: Supabase needs your access token again.");
      await supabaseStep(state, secrets, { again: true, needPassword: key === "database" });
    }
    if (key === "secrets" && !secrets.openRouterKey) {
      note("Picking up where you left off: StoryMode needs your OpenRouter key again.");
      await openRouterStep(state, secrets, { again: true });
    }
    try {
      await run[key]();
    } catch (err) {
      out();
      fail(err instanceof Error ? err.message : String(err));
      quit();
    }
    markDone(state, key);
    await new Promise((r) => setTimeout(r, 700));
  }

  header(state, null);
  box([
    green(bold("StoryMode is ready.")),
    "",
    `Open ${cyan(state.site ?? "your site")} and sign up.`,
    `${bold("The first account becomes the admin.")}`,
    "",
    dim("Admin → AI models: pick Google, OpenAI or Claude per tier."),
    ...(state.access === "me" || state.email === "supabase"
      ? [dim("Sign up with the email you use for supabase.com.")]
      : state.access === "invited"
        ? [dim("Then add the people you invite in Admin → Sign-ups.")]
        : state.email && !["skipped", "none"].includes(state.email)
          ? [dim(`Sign-up emails come from ${state.email}.`), dim("Open sign-ups in Admin → Sign-ups when you're ready.")]
          : [dim("Sign-ups are closed to others: see Admin → Sign-ups.")]),
  ], { color: green });
  if (state.site && await confirm("Open your site now?")) openUrl(state.site);
}

process.on("SIGINT", quit);
main().catch((err) => { fail(err instanceof Error ? err.message : String(err)); process.exit(1); });

/**
 * The community edition is a self-hosted install unless SELF_HOSTED=false:
 * no plans, credits or payments, so AI calls are signed-in only, not metered,
 * and plan limits don't apply.
 */
export function selfHosted(): boolean {
  const env = (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno?.env;
  return (env?.get("SELF_HOSTED") || "").trim().toLowerCase() !== "false";
}

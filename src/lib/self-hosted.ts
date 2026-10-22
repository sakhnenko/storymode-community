/**
 * The community edition is a self-hosted install unless VITE_SELF_HOSTED=false:
 * no plans, credits or payments, signing up is open, and the app opens
 * straight to the writer's projects rather than a marketing homepage.
 */
export const SELF_HOSTED = import.meta.env.VITE_SELF_HOSTED !== "false";

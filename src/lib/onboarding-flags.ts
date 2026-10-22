/**
 * Onboarding "don't show again" flags.
 *
 * These must be scoped per account: a brand new user signing in on a browser
 * where someone else already dismissed the onboarding must still see it.
 */
export function onboardingFlagKey(base: string, userId: string | undefined | null) {
  return userId ? `${base}.${userId}` : null;
}

export function readOnboardingFlag(base: string, userId: string | undefined | null) {
  const key = onboardingFlagKey(base, userId);
  if (!key) return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeOnboardingFlag(base: string, userId: string | undefined | null) {
  const key = onboardingFlagKey(base, userId);
  if (!key) return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

export function clearOnboardingFlag(base: string, userId: string | undefined | null) {
  const key = onboardingFlagKey(base, userId);
  try {
    if (key) localStorage.removeItem(key);
    // Also drop any legacy unscoped flag.
    localStorage.removeItem(base);
  } catch {
    /* ignore */
  }
}

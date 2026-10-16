/**
 * Reading what a Supabase edge function said when it failed. The client
 * wraps a non-2xx reply in an error whose `context` is the Response, so the
 * function's own JSON (`{ error, ... }`) has to be read from there.
 */
interface FunctionErrorLike {
  message?: string;
  context?: { clone?: () => { json?: () => Promise<unknown> } };
}

/** The JSON the function replied with, or null if there was none. */
export async function functionErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  try {
    const body = await (error as FunctionErrorLike | null)?.context?.clone?.()?.json?.();
    return body && typeof body === 'object' ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** The function's own error message, else the client's, else `fallback`. */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const body = await functionErrorBody(error);
  if (body?.error) return String(body.error);
  return (error as FunctionErrorLike | null)?.message || fallback;
}

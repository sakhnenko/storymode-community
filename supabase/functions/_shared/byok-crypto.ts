// AES-GCM encryption for user-supplied API keys.
// Uses SHA-256(BYOK_ENCRYPTION_KEY) as the 256-bit key.

async function subtleKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("BYOK_ENCRYPTION_KEY");
  if (!raw) throw new Error("BYOK_ENCRYPTION_KEY is not configured");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptSecret(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await subtleKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  return { ciphertext: b64(new Uint8Array(buf)), iv: b64(iv) };
}

export async function decryptSecret(ciphertextB64: string, ivB64: string): Promise<string> {
  const key = await subtleKey();
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(ivB64) },
    key,
    unb64(ciphertextB64),
  );
  return new TextDecoder().decode(buf);
}
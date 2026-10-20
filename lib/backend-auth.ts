import "server-only";
import { GoogleAuth, type IdTokenClient } from "google-auth-library";

const auth = new GoogleAuth();
let cached: { audience: string; client: Promise<IdTokenClient> } | undefined;

export function cloudRunAudience(base: string): string {
  const url = new URL(base);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".run.app") ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "Cloud Run backend must use its canonical HTTPS service origin",
    );
  return url.origin;
}

export async function backendRequestHeaders(
  base: string,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": process.env.BACKEND_API_KEY || "",
  };
  if (!process.env.K_SERVICE) return headers;
  if (!headers["X-API-Key"])
    throw new Error("Backend authentication unavailable");
  const audience = cloudRunAudience(base);
  if (!cached || cached.audience !== audience)
    cached = { audience, client: auth.getIdTokenClient(audience) };
  const current = cached;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // The SDK caches tokens and refreshes them before expiration. ADC uses the
    // attached Cloud Run service identity; no key file or browser token is needed.
    const credential = await Promise.race([
      current.client.then(async (client) =>
        (await client.getRequestHeaders()).get("authorization"),
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Identity timeout")), 5000);
      }),
    ]);
    if (!credential?.startsWith("Bearer ") || credential.length <= 7)
      throw new Error("Identity unavailable");
    headers["X-Serverless-Authorization"] = credential;
    return headers;
  } catch {
    if (cached === current) cached = undefined;
    // Do not expose SDK errors, metadata details, or token values.
    throw new Error("Backend authentication unavailable");
  } finally {
    clearTimeout(timer);
  }
}

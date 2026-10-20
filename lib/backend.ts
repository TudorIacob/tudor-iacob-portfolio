import "server-only";

// Bindings exist at request time, not during builds. Never capture this at import.
export function backendBaseUrl(): string | undefined {
  if (process.env.K_SERVICE)
    return process.env.BACKEND_URL?.trim() || undefined;
  const binding = process.env.TAI_BACKEND_URL?.trim();
  if (binding) return binding;
  // A missing deployment binding must not silently select demo mode or localhost.
  if (process.env.VERCEL === "1") return undefined;
  return process.env.BACKEND_URL?.trim() || undefined;
}

export function backendChatUrl(base: string): URL {
  return new URL("chat", base.endsWith("/") ? base : `${base}/`);
}

import "server-only";
export function trustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (
    !origin ||
    origin === new URL(request.url).origin ||
    origin === process.env.SITE_URL
  );
}
export async function readJson(
  request: Request,
  max = 16000,
): Promise<unknown> {
  if (!request.body) throw new Error("Empty request");
  const reader = request.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 10000);
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      bytes += value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw new Error("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (!completed || timedOut) throw new Error("Incomplete request");
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(data));
}

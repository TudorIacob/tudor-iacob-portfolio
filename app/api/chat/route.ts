import { demoAnswer } from "@/lib/demo";
import { backendBaseUrl, backendChatUrl } from "@/lib/backend";
import { backendRequestHeaders } from "@/lib/backend-auth";
import { readJson, trustedOrigin } from "@/lib/server";
import { chatRateLimit } from "@/lib/chat-rate-limit";
import { parseChatRequest, type ChatRequest } from "@/lib/chat-request";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!trustedOrigin(request))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: ChatRequest;
  try {
    body = parseChatRequest(await readJson(request));
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const result = await chatRateLimit(request);
    if (!result.allowed)
      return Response.json(
        {
          error:
            result.reason === "day"
              ? "You've reached today's T AI message limit. Please try again later."
              : "You've reached the temporary T AI message limit. Please try again shortly.",
          code:
            result.reason === "day" ? "TAI_DAILY_LIMIT" : "TAI_MINUTE_LIMIT",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfter),
            "Cache-Control": "no-store",
          },
        },
      );
  } catch {
    if (process.env.K_SERVICE) {
      console.warn("[tai] distributed_rate_limit_unavailable");
      return Response.json({ error: "T AI unavailable" }, { status: 503 });
    }
    // Availability fallback: FastAPI authentication and its safety limiter remain active.
    console.warn(
      "[tai] distributed_rate_limit_unavailable; using backend safety limit",
    );
  }
  const backendUrl = backendBaseUrl();
  if (backendUrl) {
    try {
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(55000),
      ]);
      const headers = await backendRequestHeaders(backendUrl);
      signal.throwIfAborted();
      const upstream = await fetch(backendChatUrl(backendUrl), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (!upstream.ok) {
        const retry = upstream.headers.get("Retry-After");
        // Allow only a numeric delay; never relay arbitrary upstream headers.
        const retryAfter =
          retry && /^\d{1,6}$/.test(retry) && Number(retry) > 0 ? retry : "60";
        return Response.json(
          { error: "T AI unavailable" },
          {
            status: upstream.status === 429 ? 429 : 503,
            headers: {
              "Cache-Control": "no-store",
              ...(upstream.status === 429 ? { "Retry-After": retryAfter } : {}),
            },
          },
        );
      }
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    } catch {
      return Response.json({ error: "T AI unavailable" }, { status: 503 });
    }
  }
  if (process.env.VERCEL === "1" || process.env.K_SERVICE)
    return Response.json({ error: "T AI unavailable" }, { status: 503 });
  const { text, sources } = demoAnswer(body.message);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "sources", sources }) + "\n"),
      );
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "token", text }) + "\n"),
      );
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "done", mode: "demo" }) + "\n"),
      );
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}

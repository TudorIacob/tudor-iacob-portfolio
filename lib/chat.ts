export interface Source {
  id: string;
  title: string;
  url: string;
}
export interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  retrieved?: boolean;
  suggestions?: string[];
  contact?: boolean;
  projectContext?: boolean;
  language?: "en" | "ro";
}
export function retrievedSources(message: Message): Source[] {
  if (message.role !== "assistant" || message.retrieved !== true) return [];
  return (message.sources ?? []).filter(
    (source) =>
      source.id.trim() &&
      source.title.trim() &&
      (source.url === "" ||
        /^\/(?:#[a-z][a-z0-9-]*|projects\/[a-z0-9-]+)$/.test(source.url)),
  );
}
export type ChatEvent =
  | { type: "token"; text: string }
  | { type: "sources"; sources: Source[]; retrieved?: boolean }
  | {
      type: "done";
      mode: "live" | "demo";
      suggestions?: string[];
      contact?: boolean;
      projectContext?: boolean;
      language?: "en" | "ro";
    }
  | { type: "error"; message?: string };
function parseEvent(value: unknown): ChatEvent {
  if (!value || typeof value !== "object" || !("type" in value))
    throw new Error("Unexpected response from T AI.");
  if (
    value.type === "token" &&
    "text" in value &&
    typeof value.text === "string"
  )
    return { type: "token", text: value.text };
  if (value.type === "sources") {
    if (
      !("sources" in value) ||
      !Array.isArray(value.sources) ||
      value.sources.length > 10
    )
      throw new Error("Invalid sources from T AI.");
    const sources: Source[] = [];
    for (const item of value.sources as unknown[]) {
      if (
        !item ||
        typeof item !== "object" ||
        !("id" in item) ||
        typeof item.id !== "string" ||
        !("title" in item) ||
        typeof item.title !== "string" ||
        !("url" in item) ||
        typeof item.url !== "string" ||
        (item.url !== "" &&
          !/^\/(?:#[a-z][a-z0-9-]*|projects\/[a-z0-9-]+)$/.test(item.url))
      )
        throw new Error("Invalid sources from T AI.");
      sources.push({ id: item.id, title: item.title, url: item.url });
    }
    if ("retrieved" in value && typeof value.retrieved !== "boolean")
      throw new Error("Invalid retrieval status from T AI.");
    return {
      type: "sources",
      sources,
      retrieved: "retrieved" in value && value.retrieved === true,
    };
  }
  if (
    value.type === "done" &&
    "mode" in value &&
    (value.mode === "live" || value.mode === "demo")
  ) {
    if (
      ("contact" in value && typeof value.contact !== "boolean") ||
      ("projectContext" in value &&
        typeof value.projectContext !== "boolean") ||
      ("language" in value &&
        value.language !== "en" &&
        value.language !== "ro")
    )
      throw new Error("Invalid response actions from T AI.");
    const actions = {
      contact: "contact" in value && value.contact === true,
      projectContext:
        "projectContext" in value && value.projectContext === true,
      language:
        "language" in value ? (value.language as "en" | "ro") : undefined,
    };
    if ("suggestions" in value) {
      if (
        !Array.isArray(value.suggestions) ||
        value.suggestions.length > 4 ||
        value.suggestions.some(
          (s) => typeof s !== "string" || !s.trim() || s.length > 200,
        )
      )
        throw new Error("Invalid suggestions from T AI.");
      return {
        type: "done",
        mode: value.mode,
        suggestions: value.suggestions as string[],
        ...actions,
      };
    }
    return { type: "done", mode: value.mode, ...actions };
  }
  if (value.type === "error")
    return {
      type: "error",
      message:
        "message" in value && typeof value.message === "string"
          ? value.message
          : undefined,
    };
  throw new Error("Invalid response from T AI.");
}

export async function streamChat(
  messages: Message[],
  signal: AbortSignal,
  receive: (event: ChatEvent) => void,
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: messages.at(-1)?.content,
      history: messages
        .slice(-7, -1)
        .map(({ role, content }) => ({ role, content: content.slice(-1200) })),
    }),
    signal,
  });
  if (response.status === 429) {
    let code: unknown;
    try {
      code = (await response.json())?.code;
    } catch {
      /* Safe fallback for non-JSON errors. */
    }
    throw new Error(
      code === "TAI_DAILY_LIMIT"
        ? "You've reached today's T AI message limit. Please try again later."
        : code === "TAI_MINUTE_LIMIT"
          ? "You've reached the temporary T AI message limit. Please try again shortly."
          : "Too many requests. Please wait a minute and try again.",
    );
  }
  if (!response.ok)
    throw new Error(
      "T AI is unavailable right now. Please try again or contact Tudor directly.",
    );
  if (!response.body)
    throw new Error("The response stream could not be opened.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 128000)
        throw new Error("T AI returned an oversized response.");
      buffer += decoder.decode(part.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        if (done) throw new Error("Unexpected data after completion.");
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch {
          throw new Error(
            "T AI returned an invalid response. Please try again.",
          );
        }
        const event = parseEvent(value);
        if (event.type === "error")
          throw new Error(
            typeof event.message === "string"
              ? event.message
              : "The answer was interrupted. Please try again.",
          );
        if (event.type === "done") done = true;
        receive(event);
      }
    }
    if (!done || buffer.trim())
      throw new Error("The answer was interrupted. Please try again.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

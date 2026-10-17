export interface ChatRequest {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseChatRequest(value: unknown): ChatRequest {
  if (
    !isRecord(value) ||
    typeof value.message !== "string" ||
    !value.message.trim() ||
    value.message.length > 2000
  )
    throw new Error("Invalid question");
  const history: ChatRequest["history"] = [];
  if (value.history !== undefined) {
    if (!Array.isArray(value.history) || value.history.length > 6)
      throw new Error("Invalid history");
    for (const item of value.history) {
      if (
        !isRecord(item) ||
        (item.role !== "user" && item.role !== "assistant") ||
        typeof item.content !== "string" ||
        !item.content.trim() ||
        item.content.length > 6000
      )
        throw new Error("Invalid history");
      history.push({ role: item.role, content: item.content });
    }
  }
  return { message: value.message.trim(), history };
}

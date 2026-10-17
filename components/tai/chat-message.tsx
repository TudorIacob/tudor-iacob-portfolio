import { ArrowUpRight, Copy, Check } from "lucide-react";
import { retrievedSources, type Message } from "@/lib/chat";
import { track } from "@/lib/analytics";
import { memo, useRef, useState, useEffect } from "react";
import { AssistantMarkdown } from "./assistant-markdown";
import { ProjectReference } from "./project-reference";

export const ChatMessage = memo(function ChatMessage({
  message,
  pending,
  contact,
  onSuggestion,
  question,
}: {
  message: Message;
  pending?: boolean;
  contact?: boolean;
  onSuggestion?: (question: string) => void;
  question: string;
}) {
  const sources = retrievedSources(message);
  const [copyState, setCopyState] = useState("");
  const prose = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        prose.current?.innerText ?? message.content,
      );
      setCopyState("Copied");
    } catch {
      setCopyState("Copy unavailable. Select the text to copy.");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyState(""), 2500);
  }
  return (
    <article
      className={`message ${message.role}`}
      aria-label={
        message.role === "assistant" ? "T AI response" : "Your message"
      }
    >
      {message.role === "assistant" && (
        <span className="message-avatar" aria-hidden="true">
          T.
        </span>
      )}
      <div className="message-bubble">
        {message.role === "assistant" && (
          <span className="message-name">T AI</span>
        )}
        <div ref={prose}>
          {message.role === "assistant" ? (
            message.content ? (
              <AssistantMarkdown content={message.content} />
            ) : (
              <p className="chat-thinking">Thinking…</p>
            )
          ) : (
            <p className="user-prose">{message.content}</p>
          )}
        </div>
        {!!sources.length && (
          <details className="chat-sources">
            <summary>
              Sources <span>{sources.length}</span>
            </summary>
            <ul>
              {sources.map((s) => (
                <li key={s.id}>
                  {s.url ? (
                    <a href={s.url} onClick={() => track("source_clicked")}>
                      {s.title}
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </a>
                  ) : (
                    <span>{s.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        {!pending &&
          message.projectContext &&
          message.retrieved &&
          !!sources.length && (
            <ProjectReference sources={sources} question={question} />
          )}
        {!pending && contact && (
          <a href="#contact" className="chat-context-contact">
            {message.language === "ro"
              ? "Discută proiectul cu Tudor"
              : "Discuss your project with Tudor"}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        )}
        {!pending && message.role === "assistant" && !!message.content && (
          <div className="message-actions">
            <button
              type="button"
              onClick={() => void copy()}
              aria-label="Copy response"
              title="Copy response"
            >
              {copyState === "Copied" ? (
                <Check size={14} />
              ) : (
                <Copy size={14} />
              )}
              <span>{copyState === "Copied" ? "Copied" : "Copy"}</span>
            </button>
            <span role="status">{copyState !== "Copied" && copyState}</span>
          </div>
        )}
        {onSuggestion && !!message.suggestions?.length && (
          <div
            className="suggestions message-suggestions"
            aria-label="Suggested questions"
          >
            {message.suggestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => onSuggestion(question)}
              >
                {question}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
});

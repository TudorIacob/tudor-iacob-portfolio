"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  RotateCcw,
  Bot,
  Folder,
  Brain,
  Settings,
  Briefcase,
  ChevronRight,
} from "lucide-react";
import { streamChat, type Message } from "@/lib/chat";
import { track } from "@/lib/analytics";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
const promptIcons = [Folder, Brain, Settings, Briefcase];
export function TAIChat({
  live,
  suggestions,
}: {
  live: boolean;
  suggestions: string[];
}) {
  const [mode, setMode] = useState(live ? "configured" : "demo");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followResponse = useRef(true);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (transcript.current && followResponse.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages]);
  async function send(question = input) {
    if (!question.trim() || controller.current) return;
    followResponse.current = true;
    const next: Message[] = [
      ...messages,
      { role: "user", content: question.trim() },
    ];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setError("");
    setBusy(true);
    document.getElementById("question")?.focus({ preventScroll: true });
    track(messages.length ? "question_submitted" : "conversation_started");
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 65000);
    try {
      await streamChat(next, abort.signal, (event) => {
        if (controller.current !== abort) return;
        if (event.type === "done" && event.mode) setMode(event.mode);
        setMessages((current) => {
          const copy = [...current];
          const last = { ...copy[copy.length - 1] };
          if (event.type === "token") last.content += event.text;
          if (event.type === "sources") {
            last.sources = event.sources;
            last.retrieved = event.retrieved;
          }
          if (event.type === "done") {
            last.suggestions = event.suggestions;
            last.contact = event.contact;
            last.projectContext = event.projectContext;
            last.language = event.language;
          }
          copy[copy.length - 1] = last;
          return copy;
        });
      });
      track("response_generated");
    } catch (e) {
      if (controller.current === abort) {
        setMessages((current) =>
          current.map((message, index) =>
            index === current.length - 1 && !message.content
              ? { ...message, content: "This answer could not be completed." }
              : message,
          ),
        );
        setError(
          abort.signal.aborted
            ? "The response timed out. Please try again."
            : e instanceof Error
              ? e.message
              : "Something went wrong. Please try again.",
        );
      }
    } finally {
      clearTimeout(timer);
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="chat-shell" onFocusCapture={() => track("tai_opened")}>
      <div className="chat-toolbar">
        <div>
          <span className="tai-bot-icon" aria-hidden="true">
            <Bot size={26} strokeWidth={1.6} />
          </span>
          <div className="tai-chat-identity">
            <strong>T.AI</strong>
            <span>AI Portfolio Assistant</span>
          </div>
        </div>
        <div>
          <span
            className="mode-badge"
            tabIndex={0}
            title={
              mode === "demo"
                ? "Curated portfolio excerpts without a language model."
                : "Uses retrieval-augmented generation to provide answers grounded in portfolio information. This describes the architecture, not connection health."
            }
          >
            {mode === "demo" ? "Portfolio preview" : "Powered by RAG"}
          </span>
          <button
            className="icon-button"
            aria-label="Reset conversation"
            title="Reset conversation"
            onClick={() => {
              controller.current?.abort();
              controller.current = null;
              setBusy(false);
              setMessages([]);
              setError("");
              followResponse.current = true;
              setAwayFromLatest(false);
            }}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <div
        className={`chat-body${messages.length ? "" : " chat-body-welcome"}`}
        ref={transcript}
        onScroll={(event) => {
          const log = event.currentTarget;
          followResponse.current =
            log.scrollHeight - log.scrollTop - log.clientHeight < 64;
          setAwayFromLatest(!followResponse.current);
        }}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-busy={busy}
        tabIndex={0}
      >
        {messages.length ? (
          messages.map((m, i) => (
            <ChatMessage
              key={i}
              message={m}
              question={i > 0 ? messages[i - 1].content : ""}
              pending={busy && i === messages.length - 1}
              contact={
                m.contact &&
                !messages.slice(0, i).some((previous) => previous.contact)
              }
              onSuggestion={
                !busy && i === messages.length - 1 && m.role === "assistant"
                  ? (question) => {
                      track("suggested_question_clicked");
                      void send(question);
                    }
                  : undefined
              }
            />
          ))
        ) : (
          <div className="chat-empty">
            <div className="tai-welcome">
              <span className="tai-welcome-mark" aria-hidden="true">
                T.
              </span>
              <div>
                <h3>Hi! I&apos;m T AI, Tudor&apos;s portfolio assistant.</h3>
                <p>
                  I can help you explore his projects, technical skills, and
                  services. What would you like to know?
                </p>
              </div>
            </div>
            <p className="tai-suggestions-label">SUGGESTED QUESTIONS</p>
            <div className="suggestions">
              {suggestions.map((q, index) => {
                const Icon = promptIcons[index % promptIcons.length];
                return (
                  <button
                    key={q}
                    disabled={busy}
                    onClick={() => {
                      track("suggested_question_clicked");
                      void send(q);
                    }}
                  >
                    <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
                    <span>
                      {[
                        "Explore AI projects",
                        "What are Tudor’s AI skills?",
                        "Professional experience",
                        "Discuss an AI project",
                      ][index] ?? q}
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {awayFromLatest && (
        <button
          type="button"
          className="chat-latest"
          onClick={() => {
            followResponse.current = true;
            setAwayFromLatest(false);
            if (transcript.current)
              transcript.current.scrollTop = transcript.current.scrollHeight;
          }}
        >
          <ArrowDown size={14} aria-hidden="true" /> Scroll to latest
        </button>
      )}
      {error && (
        <div className="chat-error" role="alert">
          {error}
        </div>
      )}
      <span className="sr-only" role="status">
        {busy ? "T AI is preparing a response." : ""}
      </span>
      <div className="chat-bottom">
        <ChatInput
          input={input}
          setInput={setInput}
          busy={busy}
          send={() => void send()}
        />
        <p>
          {mode !== "demo"
            ? "Answers use public portfolio sources. AI can make mistakes."
            : "Preview mode · curated portfolio excerpts, without an LLM."}{" "}
          Conversations stay in this tab.{" "}
          {mode !== "demo" && "Messages are sent to the AI provider."}
        </p>
      </div>
    </div>
  );
}

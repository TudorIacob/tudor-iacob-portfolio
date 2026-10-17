import { ArrowUp, LoaderCircle, MessageCircle } from "lucide-react";
import { useRef, useLayoutEffect } from "react";
export function ChatInput({
  input,
  setInput,
  busy,
  send,
}: {
  input: string;
  setInput: (s: string) => void;
  busy: boolean;
  send: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (field.current) {
      field.current.style.height = "auto";
      field.current.style.height =
        Math.min(field.current.scrollHeight, 144) + "px";
    }
  }, [input]);
  return (
    <form
      className="chat-input"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label className="sr-only" htmlFor="question">
        Ask T AI a question
      </label>
      <MessageCircle className="chat-input-icon" size={21} aria-hidden="true" />
      <textarea
        ref={field}
        rows={1}
        id="question"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask about projects, AI solutions, or experience…"
        maxLength={2000}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (!busy) send();
          }
        }}
        autoComplete="off"
      />
      <button
        className="send-button"
        disabled={busy || !input.trim()}
        aria-label="Send question"
      >
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <ArrowUp size={19} />
        )}
      </button>
    </form>
  );
}

import Markdown from "react-markdown";
import { safeChatUrl } from "@/lib/chat-links";

export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="assistant-markdown">
      <Markdown
        skipHtml
        allowedElements={[
          "p",
          "a",
          "strong",
          "em",
          "ul",
          "ol",
          "li",
          "blockquote",
          "pre",
          "code",
          "br",
          "hr",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
        ]}
        urlTransform={(url) => safeChatUrl(url) ?? ""}
        components={{
          a: ({ href, children }) => {
            const safe = href && safeChatUrl(href);
            if (!safe) return <span>{children}</span>;
            const external = safe.startsWith("https:");
            return (
              <a
                href={safe}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
          h1: ({ children }) => <h4>{children}</h4>,
          h2: ({ children }) => <h4>{children}</h4>,
          h3: ({ children }) => <h4>{children}</h4>,
          pre: ({ children }) => (
            <pre tabIndex={0} aria-label="Code block">
              {children}
            </pre>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

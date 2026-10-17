import { ArrowUpRight } from "lucide-react";
import { projects } from "@/data/portfolio";
import type { Source } from "@/lib/chat";

export function ProjectReference({
  sources,
  question,
}: {
  sources: Source[];
  question: string;
}) {
  // Resolve names from the public catalog and visitor input, never generated prose.
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const query = normalize(question);
  const requested = projects.find((p) =>
    [p.slug.replaceAll("-", " "), normalize(p.title).replace(/^ai /, "")].some(
      (name) =>
        name.length > 3 && (" " + query + " ").includes(" " + name + " "),
    ),
  );
  const project =
    requested ??
    sources
      .map((s) =>
        projects.find(
          (p) => s.id === p.slug && s.url === "/projects/" + p.slug,
        ),
      )
      .find(Boolean);
  if (!project) return null;
  return (
    <aside className="chat-project" aria-label="Portfolio project">
      <span className="chat-project-label">
        FROM THE PORTFOLIO · {project.category}
      </span>
      <a href={"/projects/" + project.slug}>
        <strong>{project.title}</strong>
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
      <p>{project.description}</p>
      <span className="chat-project-stack">
        {project.technologies.join(" · ")}
      </span>
    </aside>
  );
}

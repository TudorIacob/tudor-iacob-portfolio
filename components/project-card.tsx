import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { Project } from "@/data/portfolio";

export function ProjectCard({
  project,
  index,
}: {
  project: Project;
  index: number;
}) {
  const flagship = project.slug === "t-ai";
  return (
    <article
      className={`project-card${flagship ? " project-flagship" : ""}`}
      id={project.slug}
    >
      {project.image && (
        <Link
          className="project-art"
          href={`/projects/${project.slug}`}
          aria-label={`Explore ${project.title}`}
        >
          <Image
            src={project.image}
            alt={project.title}
            fill
            sizes="(max-width: 800px) 100vw, 50vw"
          />
        </Link>
      )}
      <div className="project-content">
        <div className="project-index">
          <span className="mono">0{index + 1}</span>
          <span className="eyebrow">
            {flagship ? "INTERACTIVE PORTFOLIO PROJECT" : project.category}
          </span>
        </div>
        <h3>
          <Link href={`/projects/${project.slug}`}>{project.title}</Link>
        </h3>
        <p>{project.longDescription}</p>
        <div className="tags">
          {project.technologies.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="project-links">
          {flagship && (
            <a href="#tai" className="button small">
              Ask T AI <ArrowUpRight size={15} />
            </a>
          )}
          <Link href={`/projects/${project.slug}`} className="text-link">
            Explore project <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
      {flagship && (
        <ul className="project-highlights">
          {project.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

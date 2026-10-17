import { notFound } from "next/navigation";
import Link from "next/link";
import { projects } from "@/data/portfolio";
import type { Metadata } from "next";
export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = projects.find((p) => p.slug === slug);
  if (!p) notFound();
  return {
    title: p?.title,
    description: p?.description,
    alternates: { canonical: `/projects/${slug}` },
    openGraph: {
      title: p.title,
      description: p.longDescription,
      url: `/projects/${slug}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: p.title,
      description: p.longDescription,
    },
  };
}
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = projects.find((p) => p.slug === slug);
  if (!p) notFound();
  return (
    <main id="main" className="container project-page">
      <Link href="/#projects" className="text-link">
        ← All projects
      </Link>
      <p className="eyebrow">{p.category}</p>
      <h1>{p.title}</h1>
      <p className="lead">{p.description}</p>
      <div className="tags">
        {p.technologies.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <section>
        <h2>Project overview</h2>
        <p>{p.longDescription}</p>
        <h3>Focus areas</h3>
        <ul>
          {p.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        {p.githubUrl && (
          <a href={p.githubUrl} className="button secondary">
            Source code ↗
          </a>
        )}
        {p.liveUrl && (
          <a href={p.liveUrl} className="button">
            Explore live ↗
          </a>
        )}
        {p.caseStudyUrl && <a href={p.caseStudyUrl}>Read case study ↗</a>}
        {!p.githubUrl && (
          <p className="muted">
            Public source code has not been linked for this project.
          </p>
        )}
      </section>
      <Link href="/#contact" className="button">
        Discuss a similar project ↗
      </Link>
    </main>
  );
}

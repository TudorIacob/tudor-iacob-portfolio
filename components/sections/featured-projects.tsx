import { ArrowUpRight } from "lucide-react";
import { portfolio, projects } from "@/data/portfolio";
import { ProjectCard } from "@/components/project-card";
import { Label } from "@/components/section-label";

export function FeaturedProjects() {
  return (
    <section id="projects" className="section container">
      <Label number="03">SELECTED WORK</Label>
      <div className="section-heading">
        <div>
          <h2>Selected projects.</h2>
          <p>From business research to document analysis. Start with T AI.</p>
        </div>
        <a href={portfolio.profile.github} className="text-link">
          Find me on GitHub <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="project-grid">
        {projects
          .filter((p) => p.featured)
          .sort((a, b) => Number(b.slug === "t-ai") - Number(a.slug === "t-ai"))
          .map((p, i) => (
            <ProjectCard key={p.slug} project={p} index={i} />
          ))}
      </div>
    </section>
  );
}

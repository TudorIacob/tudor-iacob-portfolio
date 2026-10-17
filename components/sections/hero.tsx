import {
  ArrowUpRight,
  Github,
  Linkedin,
  MapPin,
  Sparkles,
} from "lucide-react";
import { portfolio } from "@/data/portfolio";

export function Hero() {
  return (
    <section
      id="top"
      className="hero container"
      itemScope
      itemType="https://schema.org/Person"
    >
      <div className="hero-content">
        <div className="hero-kicker">AI ENGINEERING / PYTHON</div>
        <p className="hero-name" itemProp="name">
          {portfolio.profile.name}
        </p>
        <h1>
          AI engineering.
          <br />
          <span>Practical by design.</span>
        </h1>
        <p className="hero-description">
          I build LLM applications, RAG systems, AI agents, and automation with
          Python. Explore the projects or ask T AI about the work.
        </p>
        <div className="hero-buttons">
          <a className="button" href="#tai">
            <Sparkles size={17} /> Ask T AI
          </a>
          <a className="button secondary" href="#projects">
            View Projects <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="hero-meta">
          <span>
            <MapPin size={14} /> Based in {portfolio.profile.location}
          </span>
          <a href={portfolio.profile.github}>
            <Github size={15} /> GitHub <ArrowUpRight size={12} />
          </a>
          <a href={portfolio.profile.linkedin}>
            <Linkedin size={15} /> LinkedIn <ArrowUpRight size={12} />
          </a>
        </div>
      </div>
      <div className="hero-bottom">
        <span>PYTHON · LLMs · RAG · AUTOMATION</span>
        <a href="#contact">
          Let&apos;s Work Together <ArrowUpRight size={14} />
        </a>
      </div>
    </section>
  );
}

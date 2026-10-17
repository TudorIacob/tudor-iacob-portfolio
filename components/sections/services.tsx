import {
  ArrowUpRight,
  Sparkles,
  Bot,
  CircuitBoard,
  GraduationCap,
} from "lucide-react";
import { portfolio } from "@/data/portfolio";
import { Label } from "@/components/section-label";
const serviceIcons = [Sparkles, Bot, CircuitBoard, GraduationCap];

export function Services() {
  return (
    <section id="services" className="section services-section">
      <div className="container">
        <Label number="05">WORKING TOGETHER</Label>
        <div className="section-heading">
          <div>
            <h2>AI services for your business.</h2>
            <p>
              Scope the problem, connect your data, and build a useful workflow.
            </p>
          </div>
          <a href="#contact" className="text-link">
            Discuss your project <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="services-grid">
          {portfolio.services.map((s, i) => {
            const Icon = serviceIcons[i % serviceIcons.length];
            return (
              <article className="service-card" key={s.title}>
                <Icon size={26} strokeWidth={1.4} />
                <span className="service-number">0{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
                <small>{s.areas}</small>
                <a
                  href="#contact"
                  aria-label={`Discuss ${s.title}`}
                  className="text-link"
                >
                  Let&apos;s talk <ArrowUpRight size={15} />
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

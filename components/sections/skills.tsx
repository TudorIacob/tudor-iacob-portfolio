import { portfolio } from "@/data/portfolio";
import { Label } from "@/components/section-label";

export function Skills() {
  return (
    <section id="skills" className="section container">
      <Label number="04">TOOLS OF THE TRADE</Label>
      <div className="section-heading">
        <div>
          <h2>A practical engineering stack.</h2>
          <p>The technologies I work with and build around.</p>
        </div>
      </div>
      <div className="skills-grid">
        {portfolio.skills.map((group, i) => (
          <article key={group.title} className="skill-group">
            <span className="mono muted">0{i + 1} /</span>
            <h3>{group.title}</h3>
            <ul className="skill-list">
              {group.items.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

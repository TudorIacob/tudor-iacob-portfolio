import { portfolio } from "@/data/portfolio";
import { Label } from "@/components/section-label";

export function About() {
  return (
    <section id="about" className="section container">
      <Label number="01">THE ENGINEER BEHIND THE WORK</Label>
      <div className="about-layout">
        <h2>
          Business perspective.
          <br />
          <span>Engineering mindset.</span>
        </h2>
        <div>
          <p className="lead">{portfolio.profile.about}</p>
          <p>{portfolio.profile.background}</p>
          <div className="experience">
            {portfolio.experience.map((item) => (
              <div key={item.title}>
                <span>{item.label}</span>
                <h3>{item.title}</h3>
                {item.organization && <p>{item.organization}</p>}
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

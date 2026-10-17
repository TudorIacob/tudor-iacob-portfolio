import { portfolio } from "@/data/portfolio";
import { Certification } from "@/components/certification";
import { Label } from "@/components/section-label";

export function Credentials() {
  return (
    <section id="certifications" className="section container">
      <Label number="06">CONTINUOUS LEARNING</Label>
      <div className="section-heading">
        <div>
          <h2>Foundations & credentials.</h2>
          <p>
            Engineering education, Python development, and machine learning.
          </p>
        </div>
      </div>
      <div className="credentials-grid">
        {portfolio.certifications.map((c) => (
          <Certification key={c.name} item={c} />
        ))}
      </div>
    </section>
  );
}

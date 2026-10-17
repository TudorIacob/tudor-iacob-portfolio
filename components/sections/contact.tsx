import { ArrowUpRight, Mail } from "lucide-react";
import { portfolio } from "@/data/portfolio";
import { ContactForm } from "@/components/contact-form";
import { Label } from "@/components/section-label";

export function Contact() {
  return (
    <section id="contact" className="section container contact-section">
      <Label number="06">START A CONVERSATION</Label>
      <div className="contact-layout">
        <div>
          <h2>
            Have a project
            <br />
            <span>in mind?</span>
          </h2>
          <p>
            Have an idea, a technical challenge, or a project in mind?
            Let&apos;s explore how we can build something valuable together.
          </p>
          <a className="email-link" href={`mailto:${portfolio.profile.email}`}>
            <Mail size={19} />
            {portfolio.profile.email}
            <ArrowUpRight size={17} />
          </a>
          <div className="contact-socials">
            <a href={portfolio.profile.linkedin}>
              LinkedIn <ArrowUpRight size={14} />
            </a>
            <a href={portfolio.profile.github}>
              GitHub <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
        <ContactForm />
      </div>
    </section>
  );
}

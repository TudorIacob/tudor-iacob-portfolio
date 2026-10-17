import { portfolio } from "@/data/portfolio";
export function demoAnswer(question: string) {
  const q = question.toLowerCase();
  let text =
    "I don't have enough information in this portfolio preview to answer that reliably. Ask about Tudor's projects, technologies, background, or services.";
  let sources: { id: string; title: string; url: string }[] = [];
  if (/project|built|rag|agent/.test(q)) {
    text = portfolio.projects
      .map((p) => `${p.title}: ${p.longDescription}`)
      .join("\n\n");
    sources = portfolio.projects.map((p) => ({
      id: p.slug,
      title: p.title,
      url: `/projects/${p.slug}`,
    }));
  } else if (/skill|technolog|python|stack/.test(q)) {
    text = portfolio.skills
      .map((s) => `${s.title}: ${s.items.join(", ")}.`)
      .join("\n\n");
    sources = [{ id: "skills", title: "Technical skills", url: "/#skills" }];
  } else if (/service|consult|automat|business|training|integrat/.test(q)) {
    text =
      portfolio.services
        .map((s) => `${s.title}: ${s.description}`)
        .join("\n\n") +
      "\n\nFeasibility depends on your requirements and existing systems. Contact Tudor to discuss your project.";
    sources = [{ id: "services", title: "AI services", url: "/#services" }];
  } else if (/experience|background|tudor|about/.test(q)) {
    text = portfolio.profile.about + "\n\n" + portfolio.profile.background;
    sources = [{ id: "about", title: "About Tudor", url: "/#about" }];
  }
  return { text, sources };
}

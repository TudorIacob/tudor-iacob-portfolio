import Image from "next/image";
import {
  Braces,
  Database,
  FileText,
  Layers,
  MessageSquare,
  Network,
  Zap,
} from "lucide-react";
import { TAIChat } from "@/components/tai/tai-chat";
import "@/components/tai/tai-design.css";

const steps = [
  {
    title: "Retrieve",
    icon: Database,
    text: "Find relevant portfolio content using embeddings and vector search.",
  },
  {
    title: "Generate",
    icon: FileText,
    text: "Use an LLM to form an answer from the retrieved context.",
  },
  {
    title: "Respond",
    icon: MessageSquare,
    text: "Stream the answer with source references you can inspect.",
  },
];
const stack = [
  { label: "Python", icon: Braces },
  { label: "FastAPI", icon: Zap },
  { label: "LLMs", icon: Network },
  { label: "RAG", icon: Layers },
  { label: "Embeddings", icon: Network },
  { label: "pgvector", icon: Database },
];

export function TAISection() {
  return (
    <section
      id="tai"
      className="section tai-section"
      aria-labelledby="tai-heading"
    >
      <div className="tai-ambient" aria-hidden="true" />
      <div className="container tai-stage">
        <header className="tai-heading">
          <p className="tai-kicker">YOUR AI PORTFOLIO GUIDE</p>
          <h2 id="tai-heading" aria-label="T AI">
            <span className="tai-monogram">
              <Image
                src="/brand/tai-monogram.png"
                alt=""
                width={1254}
                height={1254}
                sizes="483px"
              />
            </span>
          </h2>
          <p>
            Explore my projects, skills, and experience through conversation
            <br className="tai-desktop-break" /> or{" "}
            <a href="#contact">let&apos;s discuss a project.</a>
          </p>
        </header>
        <TAIChat
          live={!!process.env.BACKEND_URL}
          suggestions={[
            "What projects has Tudor built?",
            "What are Tudor's AI skills?",
            "What is Tudor's professional experience?",
            "Let's discuss an AI automation project.",
          ]}
        />
        <div className="tai-about">
          <div className="tai-detail-label">
            <span>ABOUT T AI</span>
            <span>01</span>
          </div>
          <div className="tai-about-grid">
            <h3>
              An AI assistant built
              <br />
              to showcase <em>real work.</em>
            </h3>
            <p>
              T AI is a retrieval-augmented application I built to answer
              questions about my projects, skills, experience, and services. It
              uses public portfolio content as its source of facts, with
              references you can follow. Ask about the work or explore an idea
              for your own project.
            </p>
          </div>
        </div>
        <div className="tai-how">
          <div className="tai-detail-label">
            <span>UNDER THE HOOD</span>
            <span>02</span>
          </div>
          <p className="tai-architecture-note">
            Portfolio questions move through embeddings, Supabase / pgvector
            retrieval, relevant context and a language model, then stream back
            with sources. Greetings and unrelated questions take a shorter
            route. Next.js connects this interface to the Python / FastAPI
            backend.
          </p>
          <ol className="tai-steps">
            {steps.map(({ title, icon: Icon, text }, index) => (
              <li key={title}>
                <span className="tai-step-number">0{index + 1}</span>
                <Icon size={30} strokeWidth={1.4} aria-hidden="true" />
                <div>
                  <h4>{title}</h4>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="tai-detail-label">TECHNOLOGY STACK</p>
          <ul className="tai-stack">
            {stack.map(({ label, icon: Icon }) => (
              <li key={label}>
                <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

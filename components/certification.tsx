import { Award, ArrowUpRight } from "lucide-react";
import type { Certification as Credential } from "@/data/portfolio";
export function Certification({ item }: { item: Credential }) {
  return (
    <article className="credential">
      <Award size={24} />
      <div>
        <h3>{item.name}</h3>
        <p>
          {item.issuer}
          {item.year ? ` · ${item.year}` : ""}
        </p>
        {item.credentialUrl ? (
          <a href={item.credentialUrl} className="text-link">
            View credential <ArrowUpRight size={14} />
          </a>
        ) : (
          <small>{item.status}</small>
        )}
      </div>
    </article>
  );
}

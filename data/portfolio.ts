import content from "./portfolio.json";
export interface Project {
  title: string;
  slug: string;
  description: string;
  longDescription: string;
  technologies: string[];
  category: string;
  featured: boolean;
  image: string | null;
  githubUrl: string | null;
  liveUrl: string | null;
  caseStudyUrl: string | null;
  highlights: string[];
}
export interface Certification {
  name: string;
  issuer: string;
  year: string | null;
  credentialUrl: string | null;
  image: string | null;
  status: string;
}
export const portfolio = content;
export const projects: Project[] = content.projects;
export const anchor = (label: string) =>
  label === "T AI" ? "tai" : label.toLowerCase();

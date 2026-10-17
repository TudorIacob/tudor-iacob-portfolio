import Link from "next/link";
import type { Metadata } from "next";
import { Navigation } from "@/components/navigation";
import { Monogram } from "@/components/monogram";
import { portfolio, anchor } from "@/data/portfolio";
import "./globals.css";
import { siteUrl, indexable } from "@/lib/site";
const title = "Tudor Iacob | AI Engineer & Python Developer";
const description =
  "AI Engineer and Python Developer building intelligent applications, AI automation systems, AI agents, RAG solutions, and LLM-powered software.";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s | Tudor Iacob" },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/",
    siteName: "Tudor Iacob",
  },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: indexable, follow: indexable },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Navigation
          links={portfolio.navigation.map((label) => ({
            label,
            anchor: anchor(label),
          }))}
          github={portfolio.profile.github}
          linkedin={portfolio.profile.linkedin}
        />
        {children}
        <footer className="container footer">
          <div>
            <Link
              className="wordmark"
              href="/#top"
              aria-label="Tudor Iacob home"
            >
              <Monogram />
            </Link>
            <p>{portfolio.profile.role}</p>
          </div>
          <div>
            <a href={portfolio.profile.github}>GitHub ↗</a>
            <a href={portfolio.profile.linkedin}>LinkedIn ↗</a>
          </div>
          <p>
            © {new Date().getFullYear()} Tudor Iacob
            <br />
            Built with Next.js & TypeScript
          </p>
        </footer>
      </body>
    </html>
  );
}

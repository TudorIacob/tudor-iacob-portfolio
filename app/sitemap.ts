import type { MetadataRoute } from "next";
import { projects } from "@/data/portfolio";
import { siteUrl } from "@/lib/site";
export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl;
  return [
    { url: base, priority: 1 },
    ...projects.map((p) => ({
      url: `${base}/projects/${p.slug}`,
      priority: 0.8,
    })),
  ];
}

import type { MetadataRoute } from "next";
import { siteUrl, indexable } from "@/lib/site";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: indexable
      ? { userAgent: "*", allow: "/", disallow: "/api/" }
      : { userAgent: "*", disallow: "/" },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

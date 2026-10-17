import "server-only";

const url = new URL(process.env.SITE_URL || "http://localhost:3000");
if (
  !["http:", "https:"].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash
)
  throw new Error(
    "SITE_URL must be an HTTP(S) origin without credentials or a path.",
  );
export const siteUrl = url.origin;
export const indexable =
  url.protocol === "https:" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

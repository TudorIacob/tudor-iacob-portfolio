export function safeChatUrl(value: string): string | undefined {
  if (!value || /[\u0000-\u0020\\]/.test(value)) return undefined;
  if (
    /^\/(?:#[a-z][a-z0-9-]*|projects\/[a-z0-9-]+)$/.test(value) ||
    /^#[a-z][a-z0-9-]*$/.test(value)
  )
    return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.href;
    if (
      url.protocol === "mailto:" &&
      /^[^?@]+@[^?@]+$/.test(url.pathname) &&
      !url.search
    )
      return value;
  } catch {
    /* Invalid destinations remain plain text. */
  }
  return undefined;
}

// Single-origin layout (ADR-005): the whole product lives on one host
// (takeapik.com) — marketing, album login, /a/:slug albums, and the
// super-admin portal. Album isolation is enforced by the session, not by the
// hostname. Reads process.env directly so it is safe in the Edge middleware.

function rootDomain(): string {
  return (process.env.ROOT_DOMAIN ?? "localhost:3000").trim().toLowerCase();
}

function scheme(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").startsWith("https") ? "https" : "http";
}

/** Absolute URL on the single application host. */
export function appUrl(path = ""): string {
  return `${scheme()}://${rootDomain()}${path}`;
}

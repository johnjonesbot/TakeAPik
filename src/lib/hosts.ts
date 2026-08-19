// Host helpers for the two-surface layout (ADR-004):
//   - main domain (takeapik.com): marketing + super-admin only
//   - albums subdomain (albums.takeapik.com): all album login and /a/:slug pages
// Reads process.env directly so it is safe in the Edge middleware (no zod).

function rootDomain(): string {
  return (process.env.ROOT_DOMAIN ?? "localhost:3000").trim().toLowerCase();
}

function scheme(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").startsWith("https") ? "https" : "http";
}

export function mainHost(): string {
  return rootDomain();
}

export function albumsHost(): string {
  return `albums.${rootDomain()}`;
}

export function albumsUrl(path = ""): string {
  return `${scheme()}://${albumsHost()}${path}`;
}

export function mainUrl(path = ""): string {
  return `${scheme()}://${mainHost()}${path}`;
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

export function isAlbumsHost(host: string): boolean {
  return normalizeHost(host) === albumsHost();
}

export function isMainHost(host: string): boolean {
  const h = normalizeHost(host);
  return h === mainHost() || h === `www.${mainHost()}`;
}

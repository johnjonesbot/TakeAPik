"use client";

import { usePathname } from "next/navigation";

const MEMBER_LINKS = [
  { path: "", label: "Album" },
  { path: "/upload", label: "Upload" },
  { path: "/my-uploads", label: "My uploads" }
] as const;

async function logout(): Promise<void> {
  await fetch("/api/v1/auth/logout", { method: "POST" });
  window.location.assign("/");
}

interface TenantNavProps {
  albumName: string;
  /** The album slug; links are built under /a/:slug. */
  slug: string;
  /**
   * Adds the Settings link. Purely cosmetic: every admin page and API route
   * re-verifies the session's role and tenant server-side, so hiding or
   * forging this link changes nothing about what a session can actually do.
   */
  isAdmin: boolean;
}

export function TenantNav({ albumName, slug, isAdmin }: TenantNavProps) {
  const pathname = usePathname();
  const base = `/a/${slug}`;
  const links = [
    ...MEMBER_LINKS.map((link) => ({ href: `${base}${link.path}`, label: link.label })),
    ...(isAdmin ? [{ href: `${base}/admin`, label: "Settings" }] : [])
  ];

  return (
    <nav className="tenant-nav" aria-label="Album navigation">
      <span className="tenant-nav-name">{albumName}</span>
      <div className="tenant-nav-links">
        {links.map((link) => (
          <a key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>
            {link.label}
          </a>
        ))}
      </div>
      <button type="button" className="tenant-nav-logout" onClick={() => void logout()}>
        Sign out
      </button>
    </nav>
  );
}

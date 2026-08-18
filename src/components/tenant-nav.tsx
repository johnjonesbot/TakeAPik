"use client";

import { usePathname } from "next/navigation";

const MEMBER_LINKS = [
  { href: "/", label: "Album" },
  { href: "/upload", label: "Upload" },
  { href: "/my-uploads", label: "My uploads" }
] as const;

async function logout(): Promise<void> {
  await fetch("/api/v1/auth/logout", { method: "POST" });
  window.location.assign("/");
}

interface TenantNavProps {
  albumName: string;
  /**
   * Adds the Settings link. Purely cosmetic: every admin page and API route
   * re-verifies the session's role server-side, so hiding or forging this
   * link changes nothing about what a session can actually do.
   */
  isAdmin: boolean;
}

export function TenantNav({ albumName, isAdmin }: TenantNavProps) {
  const pathname = usePathname();
  const links = isAdmin ? [...MEMBER_LINKS, { href: "/admin", label: "Settings" } as const] : MEMBER_LINKS;

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

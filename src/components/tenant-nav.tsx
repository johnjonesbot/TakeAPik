"use client";

import { usePathname } from "next/navigation";

const FRIEND_LINKS = [
  { href: "/", label: "Album" },
  { href: "/upload", label: "Upload" },
  { href: "/my-uploads", label: "My uploads" }
] as const;

const ADMIN_LINKS = [
  { href: "/", label: "Album" },
  { href: "/admin", label: "Settings" }
] as const;

async function logout(): Promise<void> {
  await fetch("/api/v1/auth/logout", { method: "POST" });
  window.location.assign("/");
}

export function TenantNav({ albumName, surface }: { albumName: string; surface: "friend" | "admin" }) {
  const pathname = usePathname();
  const links = surface === "admin" ? ADMIN_LINKS : FRIEND_LINKS;

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

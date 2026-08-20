"use client";

import { useState } from "react";

const LINKS = [
  { href: "/super-admin", label: "Accounts", key: "accounts" },
  { href: "/super-admin/account", label: "Account", key: "account" }
] as const;

async function logout(): Promise<void> {
  await fetch("/api/v1/auth/logout", { method: "POST" });
  window.location.assign("/super-admin");
}

export function PlatformNav({ current }: { current: "accounts" | "account" }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className={`tenant-nav${open ? " is-open" : ""}`} aria-label="Platform navigation">
      <span className="tenant-nav-name">Platform</span>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "✕" : "☰"}
      </button>
      <div className="tenant-nav-menu">
        <div className="tenant-nav-links">
          {LINKS.map((link) => (
            <a key={link.key} href={link.href} aria-current={current === link.key ? "page" : undefined}>
              {link.label}
            </a>
          ))}
        </div>
        <button type="button" className="tenant-nav-logout" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
    </nav>
  );
}

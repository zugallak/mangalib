"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/library", label: "Library", icon: LibraryIcon },
  { href: "/scan", label: "Scan", icon: ScanIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  // The login screen is a standalone auth page — no app navigation.
  if (pathname === "/login") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-screen-sm items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-1 py-3 text-xs"
              style={{ color: active ? "var(--accent)" : "var(--muted)" }}
            >
              <Icon />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="3" width="5" height="18" rx="1" />
      <rect x="11" y="3" width="5" height="18" rx="1" />
      <path d="m18 5 3 15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app", label: "Home" },
  { href: "/app/library", label: "Library" },
  { href: "/app/timeline", label: "His Story" },
  { href: "/app/albums", label: "Albums" },
  { href: "/app/birthday/5", label: "5th Birthday" },
  { href: "/app/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-midnight text-ivory">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/app" className="font-display text-xl tracking-wide whitespace-nowrap">
          Dear Swritsinh
        </Link>
        <nav aria-label="Main" className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(i.href) ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-sm transition ${
                active(i.href) ? "bg-white/10 text-gold" : "text-slate-light hover:text-ivory"
              }`}
            >
              {i.label}
            </Link>
          ))}
        </nav>
        <Link href="/app/upload" className="btn btn-gold hidden !min-h-9 !px-4 text-sm sm:inline-flex">
          Add memories
        </Link>
      </div>
    </header>
  );
}

export function MobileAddButton() {
  const path = usePathname();
  if (path.startsWith("/app/upload")) return null;
  return (
    <Link
      href="/app/upload"
      aria-label="Add memories"
      className="btn btn-gold fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 shadow-lg shadow-black/20 sm:hidden"
    >
      + Add memories
    </Link>
  );
}

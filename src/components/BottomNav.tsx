"use client";
import { Compass, Flame, MessageCircle, Ticket, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Feed", icon: Flame },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: User },
] as const;

/** Bottom tab bar on mobile, left rail on desktop. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:inset-y-0 md:right-auto md:w-56 md:border-r md:border-t-0 md:pb-0"
    >
      <div className="hidden px-6 pb-4 pt-7 md:block">
        <span className="font-display text-3xl font-extrabold tracking-tight">
          {BRAND.appName}
          <span className="text-pink">.</span>
        </span>
      </div>
      <ul className="mx-auto flex max-w-lg justify-between px-2 md:mx-0 md:flex-col md:gap-1 md:px-3">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-[11px] font-medium transition md:flex-row md:gap-3 md:px-4 md:py-3 md:text-sm",
                  active ? "text-foreground md:bg-surface-2" : "text-muted hover:text-foreground",
                )}
              >
                <Icon className={cn("size-5.5", active && "text-pink")} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

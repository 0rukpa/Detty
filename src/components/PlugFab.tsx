import { Plus } from "lucide-react";
import Link from "next/link";
import { getCurrentProfile } from "@/features/auth/session";

/** Floating "+" for Plugs to create an event (spec Section 12). Renders nothing for everyone else. */
export async function PlugFab() {
  const profile = await getCurrentProfile();
  if (!profile?.isPlug) return null;
  return (
    <Link
      href="/plug/events/new"
      aria-label="Create event"
      className="fixed bottom-24 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-purple to-pink shadow-lg shadow-pink/30 transition hover:scale-105 md:bottom-8 md:right-8"
    >
      <Plus className="size-7" strokeWidth={2.5} />
    </Link>
  );
}

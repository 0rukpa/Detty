import { ChevronRight, LogOut, MapPin, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/EmptyState";
import { GbeduAmount } from "@/components/GbeduAmount";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { signOut } from "@/features/auth/actions";
import { requireProfile } from "@/features/auth/session";
import { InviteActions } from "@/features/events/components/EventAdmin";
import { eventDateFmt, HostBadge } from "@/features/events/components/EventCard";
import { listInvites } from "@/features/events/queries";
import { VENDOR_LABELS } from "@/features/events/validation";
import { becomePlug } from "@/features/profiles/actions";
import { APP_CONFIG } from "@/config/app";
import { ageOn, isMinor } from "@/features/profiles/validation";

export const metadata: Metadata = { title: "Profile" };

async function ProfileCard() {
  const profile = await requireProfile();
  const invites = await listInvites(profile.id);
  const canBePlug = ageOn(profile.dob) >= APP_CONFIG.PLUG_MIN_AGE;
  const initials = profile.displayName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex items-center gap-4">
          {/* Avatar head crop replaces this in Phase 6 */}
          <span className="flex size-18 items-center justify-center rounded-full bg-gradient-to-br from-purple to-pink font-display text-2xl font-extrabold">
            {initials}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl font-extrabold">{profile.displayName}</h2>
            <p className="flex flex-wrap items-center gap-2 text-muted">
              @{profile.handle} {profile.isPlug ? <HostBadge host={profile} /> : null}
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <MapPin className="size-3.5" /> {profile.homeCity}, {profile.homeState}
            </p>
          </div>
        </div>
        {profile.bio ? <p className="mt-4 text-sm">{profile.bio}</p> : null}
        {profile.vibeTags.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {profile.vibeTags.map((t) => (
              <li key={t} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium">
                {t}
              </li>
            ))}
          </ul>
        ) : null}
        {isMinor(profile.dob) ? (
          <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-xs text-muted">
            Your profile is private and DMs are friends-only because you are under 18.
          </p>
        ) : null}
      </section>

      {invites.length > 0 ? (
        <section className="rounded-card border border-pink/40 bg-surface p-5">
          <h2 className="font-display text-lg font-extrabold">Requests for you</h2>
          <ul className="mt-3 space-y-3">
            {invites.map((i) => (
              <li key={i.eventId} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/e/${i.slug}`} className="block truncate font-semibold underline">
                    {i.title}
                  </Link>
                  <p className="text-sm text-muted">
                    @{i.hostHandle} ·{" "}
                    {i.role === "vendor"
                      ? `Confirm you're booked as ${VENDOR_LABELS[i.vendorType as keyof typeof VENDOR_LABELS] ?? "a vendor"}?`
                      : `Join as ${i.role === "co_host" ? "co-host" : "promoter"}?`}{" "}
                    · {eventDateFmt.format(i.startsAt)}
                  </p>
                </div>
                <InviteActions eventId={i.eventId} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {profile.isPlug ? (
        <Link href="/plug" className="flex items-center justify-between rounded-card border border-border bg-surface p-5 hover:bg-surface-2">
          <span>
            <span className="block font-display text-lg font-extrabold">{BRAND.organiser.singular} Dashboard</span>
            <span className="text-sm text-muted">Create and manage your events.</span>
          </span>
          <ChevronRight className="size-5 text-muted" />
        </Link>
      ) : canBePlug ? (
        <form action={becomePlug} className="rounded-card border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Zap className="size-5 text-lime" /> Throwing a party?
          </h2>
          <p className="mt-1 text-sm text-muted">
            Upgrade this same account to a {BRAND.organiser.singular}. You keep your feed, tickets and chats, and get
            organiser tools on top.
          </p>
          <Button type="submit" variant="lime" className="mt-4">
            Become a {BRAND.organiser.singular}
          </Button>
        </form>
      ) : null}

      <section className="flex items-center justify-between rounded-card border border-border bg-surface p-5">
        <div>
          <p className="text-sm text-muted">{BRAND.currency.name} balance</p>
          <GbeduAmount value={0} className="mt-1 text-2xl" />
        </div>
        <Button variant="outline" size="sm" disabled title="Gbedu packs arrive in Phase 6">
          Top up
        </Button>
      </section>

      <form action={signOut}>
        <Button type="submit" variant="ghost" className="w-full">
          <LogOut className="size-4" /> Log out
        </Button>
      </form>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" />
      <Suspense fallback={<div className="skeleton h-72 rounded-card" />}>
        <ProfileCard />
      </Suspense>
    </>
  );
}

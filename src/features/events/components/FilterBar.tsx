"use client";
import { BadgeCheck, LocateFixed, Moon, SlidersHorizontal, Sun, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Input, Label, Select } from "@/components/ui/input";
import { CATEGORY_LABELS, EVENT_CATEGORIES, VIBE_TAGS } from "@/config/app";
import { BRAND } from "@/config/brand";
import { STATE_NAMES } from "@/config/nigeria";
import { cn } from "@/lib/utils";
import { GEO_COOKIE } from "../geo";


const chip = (on: boolean) =>
  cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition",
    on ? "border-pink bg-pink/15 text-foreground" : "border-border bg-surface text-muted hover:text-foreground",
  );

const PRICE_OPTIONS = [5000, 10000, 20000, 50000];

/**
 * Discovery filters. State lives in the URL (?when=weekend&cat=rave...), so the
 * server renders the filtered feed and links are shareable.
 */
export function FilterBar({ showNearMe = true, hasGeo = false }: { showNearMe?: boolean; hasGeo?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const get = (k: string) => params.get(k) ?? "";
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const toggle = (k: string, v: string) => update({ [k]: get(k) === v ? null : v });
  const setWhen = (v: string) => update({ when: get("when") === v ? null : v, from: null, to: null });

  const activeCount = ["state", "when", "from", "to", "cat", "tod", "vibe", "max", "free", "cert", "saved"].filter(
    (k) => params.has(k),
  ).length;

  const locateMe = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) return setGeoError("Your browser does not support location.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Rounded to ~1km and kept in a cookie (not the URL) so it is never shared in a link.
        const value = `${pos.coords.latitude.toFixed(2)},${pos.coords.longitude.toFixed(2)}`;
        document.cookie = `${GEO_COOKIE}=${value}; path=/; max-age=86400; samesite=lax`;
        update({ state: null });
        router.refresh();
      },
      () => setGeoError("Location is off, so we are using your home city."),
      { maximumAge: 600_000, timeout: 8000 },
    );
  };

  return (
    <div className={cn("mb-5 space-y-3", pending && "opacity-70")} aria-busy={pending}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {showNearMe ? (
          <button type="button" onClick={locateMe} className={chip(hasGeo && !params.has("state"))}>
            <LocateFixed className="size-4" /> Near me
          </button>
        ) : null}
        <button type="button" onClick={() => toggle("tod", "day")} aria-pressed={get("tod") === "day"} className={chip(get("tod") === "day")}>
          <Sun className="size-4" /> Day
        </button>
        <button type="button" onClick={() => toggle("tod", "night")} aria-pressed={get("tod") === "night"} className={chip(get("tod") === "night")}>
          <Moon className="size-4" /> Night
        </button>
        <button type="button" onClick={() => setWhen("tonight")} aria-pressed={get("when") === "tonight"} className={chip(get("when") === "tonight")}>
          Tonight
        </button>
        <button type="button" onClick={() => setWhen("weekend")} aria-pressed={get("when") === "weekend"} className={chip(get("when") === "weekend")}>
          This weekend
        </button>
        <button
          type="button"
          onClick={() => setWhen("detty_december")}
          aria-pressed={get("when") === "detty_december"}
          className={chip(get("when") === "detty_december")}
        >
          Detty December
        </button>
        <button type="button" onClick={() => toggle("free", "1")} aria-pressed={get("free") === "1"} className={chip(get("free") === "1")}>
          Free
        </button>
        <button type="button" onClick={() => toggle("cert", "1")} aria-pressed={get("cert") === "1"} className={chip(get("cert") === "1")}>
          <BadgeCheck className="size-4" /> {BRAND.certifiedOrganiser}s
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={chip(open)}>
          <SlidersHorizontal className="size-4" /> More
        </button>
        {activeCount > 0 ? (
          <button type="button" onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))} className={chip(false)}>
            <X className="size-4" /> Clear ({activeCount})
          </button>
        ) : null}
      </div>

      {geoError ? <p className="text-sm text-amber">{geoError}</p> : null}

      {open ? (
        <div className="grid grid-cols-2 gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="f-state">State</Label>
            <Select id="f-state" value={get("state")} onChange={(e) => update({ state: e.target.value })}>
              <option value="">Anywhere</option>
              {STATE_NAMES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="f-cat">Category</Label>
            <Select id="f-cat" value={get("cat")} onChange={(e) => update({ cat: e.target.value })}>
              <option value="">All</option>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="f-vibe">Vibe</Label>
            <Select id="f-vibe" value={get("vibe")} onChange={(e) => update({ vibe: e.target.value })}>
              <option value="">Any</option>
              {VIBE_TAGS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="f-max">Price up to</Label>
            <Select id="f-max" value={get("max")} onChange={(e) => update({ max: e.target.value, free: null })}>
              <option value="">Any price</option>
              {PRICE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  ₦{p.toLocaleString("en-NG")}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="f-from">From</Label>
            <Input id="f-from" type="date" value={get("from")} onChange={(e) => update({ from: e.target.value, when: null })} />
          </div>
          <div>
            <Label htmlFor="f-to">To</Label>
            <Input id="f-to" type="date" value={get("to")} min={get("from") || undefined} onChange={(e) => update({ to: e.target.value, when: null })} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

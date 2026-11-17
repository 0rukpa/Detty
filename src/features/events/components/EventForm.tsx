"use client";
import { LocateFixed, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { CATEGORY_LABELS, EVENT_CATEGORIES, VIBE_TAGS } from "@/config/app";
import { BRAND } from "@/config/brand";
import { getState, NIGERIAN_STATES } from "@/config/nigeria";
import { submitKeepingValues } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { createEvent, updateEvent, type FormState } from "../actions";
import { loadEventDraft, saveEventDraft } from "../draft";
import { defaultAgeMin, suggestTimeOfDay } from "../rules";
import { lagosLocalToDate, LINK_PLATFORMS, type LinkPlatform } from "../validation";

export type TierDraft = {
  id?: string;
  name: string;
  priceNaira: string;
  quantity: string;
  perUserLimit: string;
  sold?: number;
};
export type LinkDraft = { platform: LinkPlatform; url: string };

export type EventFormValues = {
  id?: string;
  title: string;
  description: string;
  category: string;
  theme: string;
  themeTags: string;
  vibeTags: string[];
  ageMin: number;
  timeOfDay: "day" | "night";
  startsAt: string;
  endsAt: string;
  doorsAt: string;
  venueName: string;
  address: string;
  hideAddress: boolean;
  state: string;
  city: string;
  lat: number;
  lng: number;
  links: LinkDraft[];
  tiers: TierDraft[];
};

const textarea =
  "w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-foreground placeholder:text-muted/70 focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/40";

const TIER_PRESETS = ["Early Bird", "Regular", "VIP", "Table for 6"];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-card border border-border bg-surface/50 p-4">
      <legend className="px-1 font-display text-lg font-extrabold">{title}</legend>
      {hint ? <p className="-mt-2 text-sm text-muted">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

/** Create / edit form. `canEditTiers` is false for co-hosts: ticket tiers are money and stay with the Lead Plug. */
export function EventForm({
  initial: saved,
  canEditTiers = true,
  draftKey,
  onDiscardDraft,
}: {
  initial: EventFormValues;
  canEditTiers?: boolean;
  /**
   * When set, the form autosaves to this browser as you type and restores on return.
   * Only pass it from a client-only render (see NewEventForm): it reads localStorage up front.
   */
  draftKey?: string;
  onDiscardDraft?: () => void;
}) {
  // Restore an autosaved draft once, before the first render.
  const [{ values: initial, restored }] = useState(() => loadEventDraft(saved, draftKey));
  const formRef = useRef<HTMLFormElement>(null);
  const editing = Boolean(initial.id);
  const [state, action, pending] = useActionState<FormState, FormData>(editing ? updateEvent : createEvent, {});
  const errors = state.fieldErrors ?? {};

  const [stateName, setStateName] = useState(initial.state);
  const [coords, setCoords] = useState({ lat: initial.lat, lng: initial.lng });
  const [timeOfDay, setTimeOfDay] = useState(initial.timeOfDay);
  const [ageMin, setAgeMin] = useState(initial.ageMin);
  const [touched, setTouched] = useState({ tod: editing, age: editing });
  const [vibes, setVibes] = useState(initial.vibeTags);
  const [tiers, setTiers] = useState<TierDraft[]>(initial.tiers);
  const [links, setLinks] = useState<LinkDraft[]>(initial.links);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const cities = getState(stateName)?.cities ?? [];

  // Autosave: on every keystroke (form onChange) and whenever a list or toggle changes.
  const autosave = useCallback(() => {
    if (draftKey && formRef.current) saveEventDraft(draftKey, new FormData(formRef.current));
  }, [draftKey]);
  useEffect(autosave, [autosave, tiers, links, vibes, coords, timeOfDay, ageMin, stateName]);

  const onStartChange = (value: string) => {
    if (!value) return;
    const tod = touched.tod ? timeOfDay : suggestTimeOfDay(lagosLocalToDate(value));
    if (!touched.tod) setTimeOfDay(tod);
    if (!touched.age) setAgeMin(defaultAgeMin(tod));
  };

  const pickState = (name: string) => {
    setStateName(name);
    const s = getState(name);
    if (s) setCoords({ lat: s.lat, lng: s.lng });
  };

  const pinHere = () => {
    setGeoMsg(null);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setCoords({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) });
        setGeoMsg("Pinned to where you are now.");
      },
      () => setGeoMsg("Could not get your location. Type the coordinates instead."),
    );
  };

  const patchTier = (i: number, patch: Partial<TierDraft>) =>
    setTiers((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const patchLink = (i: number, patch: Partial<LinkDraft>) =>
    setLinks((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const unusedPlatform = (Object.keys(LINK_PLATFORMS) as LinkPlatform[]).find((p) => !links.some((l) => l.platform === p));

  return (
    <form ref={formRef} action={action} onSubmit={submitKeepingValues(action)} onChange={autosave} className="space-y-5">
      {restored ? (
        <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-lime/15 p-3 text-sm font-semibold text-lime">
          We restored your unfinished draft.
          {onDiscardDraft ? (
            <button type="button" onClick={onDiscardDraft} className="inline-flex items-center gap-1.5 rounded-full bg-background/60 px-3 py-1.5 text-foreground hover:bg-background">
              <RotateCcw className="size-4" /> Start fresh
            </button>
          ) : null}
        </p>
      ) : null}
      {initial.id ? <input type="hidden" name="eventId" value={initial.id} /> : null}
      <input type="hidden" name="tiers" value={JSON.stringify(tiers)} />
      <input type="hidden" name="links" value={JSON.stringify(links.filter((l) => l.url.trim()))} />

      <Section title="The basics">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={initial.title} required maxLength={80} placeholder="White Noise: All-White Rave" />
          <FieldError message={errors.title} />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <textarea id="description" name="description" defaultValue={initial.description} rows={5} maxLength={3000} className={textarea} placeholder="What should people expect?" />
          <p className="mt-1 text-xs text-muted">Never put bank details or phone numbers here. All payments go through {BRAND.appName}.</p>
          <FieldError message={errors.description} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="category">Category</Label>
            <Select id="category" name="category" defaultValue={initial.category}>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ageMin">Age limit</Label>
            <Select
              id="ageMin"
              name="ageMin"
              value={ageMin}
              onChange={(e) => {
                setAgeMin(Number(e.target.value));
                setTouched((t) => ({ ...t, age: true }));
              }}
            >
              <option value={0}>All ages</option>
              <option value={16}>16+</option>
              <option value={18}>18+</option>
              <option value={21}>21+</option>
            </Select>
            <FieldError message={errors.ageMin} />
          </div>
        </div>
      </Section>

      <Section title="When">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="startsAt">Starts</Label>
            <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={initial.startsAt} required onChange={(e) => onStartChange(e.target.value)} />
            <FieldError message={errors.startsAt} />
          </div>
          <div>
            <Label htmlFor="endsAt">Ends</Label>
            <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={initial.endsAt} required />
            <FieldError message={errors.endsAt} />
          </div>
          <div>
            <Label htmlFor="doorsAt">Doors open (optional)</Label>
            <Input id="doorsAt" name="doorsAt" type="datetime-local" defaultValue={initial.doorsAt} />
            <FieldError message={errors.doorsAt} />
          </div>
        </div>
        <p className="text-xs text-muted">Times are in Lagos time (WAT).</p>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted">Time of day</span>
          <div className="grid max-w-xs grid-cols-2 rounded-full bg-surface p-1">
            {(["day", "night"] as const).map((v) => (
              <label key={v} className={cn("flex h-9 cursor-pointer items-center justify-center rounded-full text-sm font-semibold capitalize", timeOfDay === v ? "bg-surface-2 text-foreground" : "text-muted")}>
                <input
                  type="radio"
                  name="timeOfDay"
                  value={v}
                  checked={timeOfDay === v}
                  onChange={() => {
                    setTimeOfDay(v);
                    setTouched((t) => ({ ...t, tod: true }));
                    if (!touched.age) setAgeMin(defaultAgeMin(v));
                  }}
                  className="sr-only"
                />
                {v}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Where">
        <div>
          <Label htmlFor="venueName">Venue name</Label>
          <Input id="venueName" name="venueName" defaultValue={initial.venueName} required maxLength={80} placeholder="The Warehouse, Lekki" />
          <FieldError message={errors.venueName} />
        </div>
        <div>
          <Label htmlFor="address">Address</Label>
          <Input id="address" name="address" defaultValue={initial.address} maxLength={200} placeholder="Admiralty Way, Lekki Phase 1" />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="hideAddress" defaultChecked={initial.hideAddress} className="size-5 accent-pink" />
          Hide the exact address until someone buys a ticket
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="state">State</Label>
            <Select id="state" name="state" value={stateName} onChange={(e) => pickState(e.target.value)}>
              {NIGERIAN_STATES.map((s) => (
                <option key={s.code}>{s.name}</option>
              ))}
            </Select>
            <FieldError message={errors.state} />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Select id="city" name="city" key={stateName} defaultValue={cities.includes(initial.city) ? initial.city : cities[0]}>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <FieldError message={errors.city} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
          <div>
            <Label htmlFor="lat">Map pin: latitude</Label>
            <Input id="lat" name="lat" type="number" step="any" required value={coords.lat} onChange={(e) => setCoords((c) => ({ ...c, lat: Number(e.target.value) }))} />
          </div>
          <div>
            <Label htmlFor="lng">Longitude</Label>
            <Input id="lng" name="lng" type="number" step="any" required value={coords.lng} onChange={(e) => setCoords((c) => ({ ...c, lng: Number(e.target.value) }))} />
          </div>
          <Button type="button" variant="outline" onClick={pinHere} title="Use my current location" className="h-12">
            <LocateFixed className="size-4" /> I am here
          </Button>
        </div>
        <FieldError message={errors.lat ?? errors.lng} />
        {geoMsg ? <p className="text-sm text-muted">{geoMsg}</p> : null}
      </Section>

      <Section title="Theme and vibe" hint={`The dress code powers ${BRAND.aiStylist}'s outfit suggestions.`}>
        <div>
          <Label htmlFor="theme">Theme / dress code</Label>
          <Input id="theme" name="theme" defaultValue={initial.theme} maxLength={120} placeholder="All white everything" />
        </div>
        <div>
          <Label htmlFor="themeTags">Style tags (comma separated)</Label>
          <Input id="themeTags" name="themeTags" defaultValue={initial.themeTags} placeholder="all-white, rave, neon" />
        </div>
        <div className="flex flex-wrap gap-2">
          {VIBE_TAGS.map((tag) => {
            const on = vibes.includes(tag);
            return (
              <label key={tag} className={cn("cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium", on ? "border-pink bg-pink/15" : "border-border text-muted")}>
                <input type="checkbox" name="vibeTags" value={tag} checked={on} onChange={() => setVibes((p) => (on ? p.filter((t) => t !== tag) : [...p, tag].slice(0, 6)))} className="sr-only" />
                {tag}
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Ticket tiers" hint={canEditTiers ? "Set the price to 0 for a free tier. Prices lock once a tier has sales." : "Only the Lead Plug can change ticket tiers."}>
        {tiers.map((t, i) => (
          <div key={t.id ?? `new-${i}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-border p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-1">
                <Label htmlFor={`tier-name-${i}`}>Name</Label>
                <Input id={`tier-name-${i}`} value={t.name} disabled={!canEditTiers} list="tier-presets" onChange={(e) => patchTier(i, { name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`tier-price-${i}`}>Price (₦)</Label>
                <Input id={`tier-price-${i}`} type="number" min={0} step={1} value={t.priceNaira} disabled={!canEditTiers || (t.sold ?? 0) > 0} onChange={(e) => patchTier(i, { priceNaira: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`tier-qty-${i}`}>Quantity</Label>
                <Input id={`tier-qty-${i}`} type="number" min={Math.max(1, t.sold ?? 0)} value={t.quantity} disabled={!canEditTiers} onChange={(e) => patchTier(i, { quantity: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`tier-limit-${i}`}>Max per person</Label>
                <Input id={`tier-limit-${i}`} type="number" min={1} max={50} value={t.perUserLimit} disabled={!canEditTiers} onChange={(e) => patchTier(i, { perUserLimit: e.target.value })} />
              </div>
            </div>
            <button
              type="button"
              aria-label={`Remove ${t.name || "tier"}`}
              disabled={!canEditTiers || (t.sold ?? 0) > 0}
              onClick={() => setTiers((p) => p.filter((_, j) => j !== i))}
              className="self-end rounded-full p-3 text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-30"
            >
              <Trash2 className="size-5" />
            </button>
            {(t.sold ?? 0) > 0 ? <p className="col-span-2 text-xs text-muted">{t.sold} sold</p> : null}
          </div>
        ))}
        <datalist id="tier-presets">
          {TIER_PRESETS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {canEditTiers ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={tiers.length >= 12}
            onClick={() => setTiers((p) => [...p, { name: TIER_PRESETS[p.length] ?? "", priceNaira: "", quantity: "100", perUserLimit: "6" }])}
          >
            <Plus className="size-4" /> Add tier
          </Button>
        ) : null}
        <FieldError message={errors.tiers} />
      </Section>

      <Section title="Social links (optional)">
        {links.map((l, i) => (
          <div key={i} className="grid grid-cols-[8.5rem_1fr_auto] gap-2">
            <Select aria-label="Platform" value={l.platform} onChange={(e) => patchLink(i, { platform: e.target.value as LinkPlatform })}>
              {(Object.keys(LINK_PLATFORMS) as LinkPlatform[]).map((p) => (
                <option key={p} value={p} disabled={p !== l.platform && links.some((x) => x.platform === p)}>
                  {LINK_PLATFORMS[p].label}
                </option>
              ))}
            </Select>
            <Input aria-label={`${LINK_PLATFORMS[l.platform].label} link`} type="url" value={l.url} placeholder={`https://${LINK_PLATFORMS[l.platform].hosts[0]}/yourpage`} onChange={(e) => patchLink(i, { url: e.target.value })} />
            <button type="button" aria-label="Remove link" onClick={() => setLinks((p) => p.filter((_, j) => j !== i))} className="rounded-full p-3 text-muted hover:bg-surface-2 hover:text-danger">
              <Trash2 className="size-5" />
            </button>
          </div>
        ))}
        {unusedPlatform ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setLinks((p) => [...p, { platform: unusedPlatform, url: "" }])}>
            <Plus className="size-4" /> Add link
          </Button>
        ) : null}
        <FieldError message={errors.links} />
      </Section>

      <div className="sticky bottom-20 z-10 rounded-card border border-border bg-background/95 p-3 backdrop-blur md:bottom-4">
        <FieldError message={state.error ?? (Object.keys(errors).length > 0 ? "Fix the highlighted fields above." : undefined)} />
        {state.ok ? <p role="status" className="mb-2 text-sm font-semibold text-lime">{state.ok}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Save draft and add flyers"}
        </Button>
        {draftKey ? <p className="mt-2 text-center text-xs text-muted">Your progress is saved on this device as you type.</p> : null}
      </div>
    </form>
  );
}

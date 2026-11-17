"use client";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { VIBE_TAGS } from "@/config/app";
import { NIGERIAN_STATES } from "@/config/nigeria";
import { submitKeepingValues } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { checkHandle, completeOnboarding, type OnboardingState } from "../actions";

const initial: OnboardingState = {};

export function OnboardingForm() {
  const [state, action, pending] = useActionState(completeOnboarding, initial);
  const [handle, setHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [stateName, setStateName] = useState("Lagos");
  const [tags, setTags] = useState<string[]>([]);
  const cities = NIGERIAN_STATES.find((s) => s.name === stateName)?.cities ?? [];
  const errors = state.fieldErrors ?? {};

  // Debounced live handle availability check.
  useEffect(() => {
    if (handle.length < 3) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const result = await checkHandle(handle);
      if (!cancelled) setHandleStatus(result);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [handle]);

  const liveStatus = handle.length >= 3 ? handleStatus : null;

  return (
    <form action={action} onSubmit={submitKeepingValues(action)} className="space-y-5">
      <div>
        <Label htmlFor="handle">Handle</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">@</span>
          <Input
            id="handle"
            name="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value.replace(/[^A-Za-z0-9_.]/g, ""))}
            required
            minLength={3}
            maxLength={20}
            autoCapitalize="none"
            autoComplete="username"
            placeholder="yourname"
            className="pl-9"
          />
        </div>
        {errors.handle ? (
          <FieldError message={errors.handle} />
        ) : liveStatus ? (
          <p className={cn("mt-1.5 text-sm", liveStatus.ok ? "text-lime" : "text-danger")}>{liveStatus.message}</p>
        ) : (
          <p className="mt-1.5 text-sm text-muted">3–20 characters: letters, numbers, underscores and dots.</p>
        )}
      </div>

      <div>
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" name="displayName" required maxLength={40} autoComplete="name" placeholder="Tolu A." />
        <FieldError message={errors.displayName} />
      </div>

      <div>
        <Label htmlFor="dob">Date of birth</Label>
        <Input id="dob" name="dob" type="date" required autoComplete="bday" />
        <FieldError message={errors.dob} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="homeState">Home state</Label>
          <Select id="homeState" name="homeState" value={stateName} onChange={(e) => setStateName(e.target.value)}>
            {NIGERIAN_STATES.map((s) => (
              <option key={s.code} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
          <FieldError message={errors.homeState} />
        </div>
        <div>
          <Label htmlFor="homeCity">City</Label>
          <Select id="homeCity" name="homeCity" key={stateName}>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <FieldError message={errors.homeCity} />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Your vibe (pick a few)</legend>
        <div className="flex flex-wrap gap-2">
          {VIBE_TAGS.map((tag) => {
            const on = tags.includes(tag);
            return (
              <label
                key={tag}
                className={cn(
                  "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition has-focus-visible:ring-2 has-focus-visible:ring-lime",
                  on ? "border-pink bg-pink/15 text-foreground" : "border-border text-muted hover:text-foreground",
                )}
              >
                <input
                  type="checkbox"
                  name="vibeTags"
                  value={tag}
                  checked={on}
                  onChange={() => setTags((prev) => (on ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 8)))}
                  className="sr-only"
                />
                {tag}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="bio">Bio (optional)</Label>
        <Input id="bio" name="bio" maxLength={160} placeholder="Outside every weekend." />
      </div>

      <FieldError message={state.error} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Setting you up…" : "Enter Detty"}
      </Button>
    </form>
  );
}

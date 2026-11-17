"use client";
import { Eye, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { markStoriesSeen } from "../actions";

export type Story = {
  id: string;
  url: string;
  isVideo: boolean;
  caption: string | null;
  createdAt: string;
  seenCount?: number;
};

const IMAGE_MS = 5000;

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`;
}

/**
 * Instagram-style stories: a ring that opens a full-screen viewer with progress
 * bars. Tap the right side to advance, the left to go back. Images last 5s,
 * videos play to the end.
 */
export function StoryRing({
  stories,
  label,
  initial,
  signedIn,
  showSeenCount = false,
  autoOpen = false,
}: {
  stories: Story[];
  label: string;
  initial: string;
  signedIn: boolean;
  showSeenCount?: boolean;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen && stories.length > 0);
  const has = stories.length > 0;

  return (
    <>
      <button
        type="button"
        disabled={!has}
        onClick={() => setOpen(true)}
        aria-label={has ? `View stories from ${label}` : `${label} has no stories`}
        className={cn(
          "flex size-14 shrink-0 items-center justify-center rounded-full p-[3px]",
          has ? "bg-gradient-to-tr from-orange via-pink to-purple" : "bg-border",
        )}
      >
        <span className="flex size-full items-center justify-center rounded-full border-2 border-background bg-surface-2 font-display text-lg font-extrabold uppercase">
          {initial}
        </span>
      </button>
      {open ? (
        <Viewer
          stories={stories}
          label={label}
          signedIn={signedIn}
          showSeenCount={showSeenCount}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function Viewer({
  stories,
  label,
  signedIn,
  showSeenCount,
  onClose,
}: {
  stories: Story[];
  label: string;
  signedIn: boolean;
  showSeenCount: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const story = stories[index];
  const seen = useRef(new Set<string>());

  const next = useCallback(() => {
    if (index >= stories.length - 1) onClose();
    else setIndex(index + 1);
  }, [index, stories.length, onClose]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Images advance on a timer; videos advance from onEnded.
  useEffect(() => {
    if (story.isVideo) return;
    const t = setTimeout(next, IMAGE_MS);
    return () => clearTimeout(t);
  }, [story, next]);

  useEffect(() => {
    if (!signedIn || seen.current.has(story.id)) return;
    seen.current.add(story.id);
    void markStoriesSeen([story.id]);
  }, [story.id, signedIn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [next, prev, onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Stories from ${label}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="relative h-full w-full max-w-md overflow-hidden bg-black sm:h-[92vh] sm:rounded-card">
        {story.isVideo ? (
          <video key={story.id} src={story.url} autoPlay playsInline onEnded={next} className="size-full object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- story media is served from Storage
          <img key={story.id} src={story.url} alt={story.caption ?? `Story from ${label}`} className="size-full object-contain" />
        )}

        {/* tap zones */}
        <button type="button" aria-label="Previous story" onClick={prev} className="absolute inset-y-0 left-0 w-1/3" />
        <button type="button" aria-label="Next story" onClick={next} className="absolute inset-y-0 right-0 w-2/3" />

        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3 pb-8">
          <div className="flex gap-1">
            {stories.map((s, i) => (
              <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
                <span
                  key={i === index ? `${s.id}-active` : s.id}
                  className={cn("block h-full bg-white", i < index && "w-full", i > index && "w-0")}
                  style={
                    i === index
                      ? { animation: `story-progress ${story.isVideo ? 15000 : IMAGE_MS}ms linear forwards` }
                      : undefined
                  }
                />
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {label} <span className="font-normal text-white/70">· {ago(story.createdAt)}</span>
            </p>
            <button type="button" onClick={onClose} aria-label="Close stories" className="pointer-events-auto rounded-full p-1.5 hover:bg-white/15">
              <X className="size-5" />
            </button>
          </div>
        </div>

        {story.caption || showSeenCount ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-12">
            {story.caption ? <p className="text-center text-base font-medium">{story.caption}</p> : null}
            {showSeenCount ? (
              <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-white/80">
                <Eye className="size-4" /> Seen by {story.seenCount ?? 0}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <style>{`@keyframes story-progress { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  );
}

"use client";
import { Heart, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toggleSaveEvent } from "../actions";

const round =
  "inline-flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75";

export function SaveButton({
  eventId,
  saved,
  signedIn,
  className,
}: {
  eventId: string;
  saved: boolean;
  signedIn: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(saved);
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? "Remove from saved" : "Save event"}
      onClick={(e) => {
        e.preventDefault();
        if (!signedIn) return router.push("/login");
        startTransition(async () => {
          setOptimistic(!value);
          const result = await toggleSaveEvent(eventId);
          setValue(result.saved);
        });
      }}
      className={cn(round, className)}
    >
      <Heart className={cn("size-5", optimistic && "fill-pink text-pink")} />
    </button>
  );
}

/** Shares the OFFICIAL Detty link only (spec 5.3 / 6.7), never a third-party URL. */
export function ShareButton({ url, title, className }: { url: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Share event"
      onClick={async () => {
        if (navigator.share) {
          await navigator.share({ title, url }).catch(() => undefined);
          return;
        }
        await navigator.clipboard.writeText(url).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className={cn(round, "relative", className)}
    >
      <Share2 className="size-5" />
      {copied ? (
        <span role="status" className="absolute -bottom-8 right-0 whitespace-nowrap rounded-full bg-lime px-2.5 py-1 text-xs font-bold text-black">
          Link copied
        </span>
      ) : null}
    </button>
  );
}

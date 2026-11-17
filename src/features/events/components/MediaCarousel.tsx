"use client";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type Slide = { id: string; kind: "image" | "video"; url: string; poster?: string | null; alt: string };

/** Swipeable flyers and promo videos (CSS scroll-snap, so it works without JS too). */
export function MediaCarousel({ slides, fallbackClass }: { slides: Slide[]; fallbackClass: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (slides.length === 0) {
    return <div className={cn("aspect-[4/5] rounded-card bg-gradient-to-br sm:aspect-[16/11]", fallbackClass)} />;
  }

  return (
    <div className="relative overflow-hidden rounded-card border border-border bg-black">
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        aria-roledescription="carousel"
      >
        {slides.map((s, i) => (
          <div key={s.id} className="flex aspect-[4/5] w-full shrink-0 snap-center items-center justify-center" aria-label={`${i + 1} of ${slides.length}`}>
            {s.kind === "video" ? (
              <video src={s.url} poster={s.poster ?? undefined} controls muted playsInline preload="metadata" aria-label={s.alt} className="size-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- watermarked flyers are served as-is from Storage
              <img src={s.url} alt={s.alt} loading={i === 0 ? "eager" : "lazy"} className="size-full object-contain" />
            )}
          </div>
        ))}
      </div>
      {slides.length > 1 ? (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              onClick={() => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: "smooth" })}
              className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-white" : "w-1.5 bg-white/50")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

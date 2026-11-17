import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/** The Gbedu coin: an animated iridescent disc. Motion stops under prefers-reduced-motion (globals.css). */
export function GbeduCoin({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      className={cn(
        "rainbow-bg animate-rainbow inline-flex shrink-0 items-center justify-center rounded-full font-display font-extrabold text-black/80 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.55)]",
        className,
      )}
    >
      G
    </span>
  );
}

/** Any Gbedu amount in the UI goes through this component so it always gets the rainbow treatment. */
export function GbeduAmount({
  value,
  showCode = true,
  className,
}: {
  value: number;
  showCode?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 align-middle font-bold", className)}
      aria-label={`${value.toLocaleString("en-NG")} ${BRAND.currency.name}`}
    >
      <GbeduCoin />
      <span aria-hidden className="rainbow-bg rainbow-text animate-rainbow tabular-nums">
        {value.toLocaleString("en-NG")}
        {showCode ? ` ${BRAND.currency.code}` : ""}
      </span>
    </span>
  );
}

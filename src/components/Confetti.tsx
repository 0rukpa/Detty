"use client";
import confetti from "canvas-confetti";
import { useEffect } from "react";

/** One celebratory burst (ticket purchase). Skipped entirely under prefers-reduced-motion. */
export function Confetti() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#8b3dff", "#ff2e93", "#c6ff3d", "#ff7a1a", "#ffffff"];
    const fire = (particleCount: number, opts: confetti.Options) =>
      confetti({ particleCount, colors, origin: { y: 0.7 }, disableForReducedMotion: true, ...opts });
    fire(90, { spread: 70, startVelocity: 45 });
    const t1 = setTimeout(() => fire(60, { spread: 110, decay: 0.92, scalar: 0.9 }), 220);
    const t2 = setTimeout(() => fire(40, { spread: 140, startVelocity: 30, scalar: 1.2 }), 480);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return null;
}

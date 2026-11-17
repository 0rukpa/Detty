import { BRAND } from "@/config/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-purple/25 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 right-0 size-[420px] rounded-full bg-pink/20 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <p className="font-display text-5xl font-extrabold tracking-tight">
          {BRAND.appName}
          <span className="text-pink">.</span>
        </p>
        <p className="mb-8 mt-2 text-muted">{BRAND.tagline}</p>
        {children}
      </div>
    </main>
  );
}

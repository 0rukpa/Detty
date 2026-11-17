import { Suspense } from "react";
import { BottomNav } from "@/components/BottomNav";
import { PlugFab } from "@/components/PlugFab";

/** Signed-in app shell: bottom tab bar on mobile, left rail on desktop. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-6 md:pb-10 md:pl-60 md:pr-6 lg:max-w-4xl">
        {children}
      </main>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
      <Suspense fallback={null}>
        <PlugFab />
      </Suspense>
    </>
  );
}

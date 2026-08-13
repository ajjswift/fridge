import { BottomNav } from "@/components/bottom-nav";
import { DesktopNav } from "@/components/desktop-nav";
import { PushRegistrar } from "@/components/push-registrar";
import { requireUser } from "@/lib/auth";

/**
 * Every screen in this group is behind the session check. Server actions do
 * their own check too — this one is about not rendering a page you can't use.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[16.5rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]">
      <DesktopNav />
      <main className="min-w-0 pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto min-h-dvh w-full max-w-[100rem]">{children}</div>
      </main>
      <BottomNav />
      <PushRegistrar />
    </div>
  );
}

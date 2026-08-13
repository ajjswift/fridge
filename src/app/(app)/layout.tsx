import { BottomNav } from "@/components/bottom-nav";
import { PushRegistrar } from "@/components/push-registrar";
import { requireUser } from "@/lib/auth";

/**
 * Every screen in this group is behind the session check. Server actions do
 * their own check too — this one is about not rendering a page you can't use.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return (
    // Centred column so the phone layout stays honest on a desktop screen.
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background shadow-[0_0_80px_-30px_rgba(0,0,0,0.25)]">
      <main className="flex-1 pb-[calc(5.75rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav />
      <PushRegistrar />
    </div>
  );
}

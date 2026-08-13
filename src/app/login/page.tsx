import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { currentUser } from "@/lib/auth";
import { getSetting } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await currentUser()) redirect("/");

  const params = await searchParams;
  const raw = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background px-6">
      <div className="safe-top" />
      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-3xl bg-primary text-3xl shadow-lg shadow-primary/25">
            🥗
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {await getSetting("household_name", "Our kitchen")}
          </h1>
          <p className="mt-1 text-muted-foreground">Sign in to see what&apos;s in.</p>
        </div>

        <LoginForm next={next} />
      </div>
      <div className="safe-bottom" />
    </div>
  );
}

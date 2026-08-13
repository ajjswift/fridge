"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[recime] route render failed", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-background px-6 text-foreground">
      <div className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="mb-4 text-4xl" aria-hidden>⚠️</div>
        <h1 className="text-xl font-semibold tracking-tight">Recime couldn&apos;t open that screen</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This is usually temporary. Check your connection, then try again.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <a
            href="/api/health"
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
          >
            Check service
          </a>
        </div>
        {error.digest && (
          <p className="mt-5 break-all text-xs text-muted-foreground">
            Support code: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { loadSampleData } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";

export function SampleDataButton({
  children,
  variant = "ghost",
}: {
  children: React.ReactNode;
  variant?: "ghost" | "outline";
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <Button
      variant={variant}
      size="lg"
      className="h-12 rounded-xl text-base"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await loadSampleData();
          if (result.ok) {
            toast.success(`Added ${result.data.added} example items`);
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {pending ? <Spinner /> : children}
    </Button>
  );
}

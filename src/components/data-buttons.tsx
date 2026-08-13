"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { clearAllStock, loadSampleData } from "@/lib/actions";

export function DataButtons() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="lg"
        className="h-12 rounded-xl text-base"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await loadSampleData();
            if (!result.ok) { toast.error(result.error); return; }
            toast.success(`Added ${result.data.added} example items`);
            router.refresh();
          })
        }
      >
        {pending ? <Spinner /> : <Sparkles className="size-4.5" aria-hidden />}
        Add example groceries
      </Button>

      <Button
        variant="ghost"
        size="lg"
        className="h-12 rounded-xl text-base text-danger-foreground"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4.5" aria-hidden />
        Empty the kitchen
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty everything out?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every item from every place, and clears the history.
              Your places and saved item settings stay. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                startTransition(async () => {
                  const result = await clearAllStock();
                  if (!result.ok) { toast.error(result.error); return; }
                  toast.success("Kitchen emptied");
                  router.refresh();
                })
              }
            >
              Empty it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

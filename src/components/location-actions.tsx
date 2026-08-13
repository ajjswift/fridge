"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, PackagePlus, Trash2 } from "lucide-react";
import { DeleteLocationDialog } from "@/components/delete-location-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LocationActions({
  location,
  stockCount,
}: {
  location: { id: number; name: string };
  stockCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const empty = stockCount === 0;

  return (
    <div className="hidden md:block">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="More options">
            <MoreHorizontal className="size-5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/add?location=${location.id}`}>
              <PackagePlus className="size-4" aria-hidden />
              Add something
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!empty}
            onSelect={() => setConfirming(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            {empty ? "Remove place" : "Empty it to remove"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteLocationDialog
        location={location}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={() => router.replace("/locations")}
      />
    </div>
  );
}

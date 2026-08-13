"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { foodEmoji } from "@/lib/food-emoji";
import { ringFor } from "@/components/freshness";
import type { DateType, ExpiryStatus } from "@/lib/types";

const SIZES = {
  sm: "size-10 text-lg rounded-xl",
  md: "size-12 text-xl rounded-2xl",
  lg: "size-16 text-3xl rounded-2xl",
  xl: "size-24 text-5xl rounded-3xl",
};

export function ProductThumb({
  name,
  brand,
  imageUrl,
  status,
  dateType = "best_before",
  size = "md",
  className,
}: {
  name: string;
  brand?: string | null;
  imageUrl?: string | null;
  status?: ExpiryStatus;
  dateType?: DateType;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  // Product photos come from a third party and the app is often used offline,
  // so a missing image has to degrade to the emoji rather than a grey hole.
  const [imageBroken, setImageBroken] = useState(false);

  const trimmed = name.trim();
  const emoji = trimmed ? foodEmoji(trimmed, brand) : null;
  const ring = status ? ringFor(status, dateType) : "ring-border";
  const showImage = Boolean(imageUrl) && !imageBroken;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden ring-2",
        // Packshots are nearly always cut out on white, so give them a white
        // tile and show the whole thing rather than a cropped blank corner.
        showImage ? "bg-white p-1" : "bg-secondary",
        SIZES[size],
        ring,
        className,
      )}
      aria-hidden
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl!}
          alt=""
          className="size-full object-contain"
          loading="lazy"
          onError={() => setImageBroken(true)}
        />
      ) : emoji ? (
        <span className="leading-none">{emoji}</span>
      ) : trimmed ? (
        <span className="text-sm font-semibold uppercase text-muted-foreground">
          {trimmed.slice(0, 2)}
        </span>
      ) : (
        // Nothing typed yet — a neutral box beats two stray letters.
        <span className="leading-none opacity-45">📦</span>
      )}
    </div>
  );
}

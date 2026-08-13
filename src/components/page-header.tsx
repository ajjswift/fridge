import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: React.ReactNode;
  /** Renders the title small and inline, for detail pages. */
  compact?: boolean;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  backHref,
  action,
  compact,
  className,
}: Props) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur-xl",
        className,
      )}
    >
      <div className="safe-top" />
      <div className="flex items-start gap-3 px-4 pb-3 pt-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Go back"
            className="tap-scale -ml-2 mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              "truncate font-semibold tracking-tight",
              compact ? "text-lg" : "text-[1.6rem] leading-tight",
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0 pt-0.5">{action}</div>}
      </div>
    </header>
  );
}

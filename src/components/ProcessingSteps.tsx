import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProcessingSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ul className="space-y-3">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border",
                done && "border-success bg-success text-success-foreground",
                active && "border-primary text-primary",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? (
                <Check className="size-4" />
              ) : active ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <span className="text-xs">{i + 1}</span>
              )}
            </span>
            <span className={cn("text-sm", done || active ? "text-foreground" : "text-muted-foreground")}>
              {step}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

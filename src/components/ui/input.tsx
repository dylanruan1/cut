import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // text-base on mobile, text-sm from sm up. iOS Safari force-zooms the
          // page whenever you focus an input under 16px and never zooms back
          // out, so tapping the phone field on the booking page threw the
          // layout sideways for every iPhone customer. 16px stops that.
          // Desktop is unchanged.
          "flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-base sm:text-sm shadow-soft transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };

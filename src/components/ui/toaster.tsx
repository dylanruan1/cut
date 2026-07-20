"use client";

import { useToast, toast } from "@/hooks/use-toast";

export { useToast, toast };

export function Toaster() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map(({ id, title, description, variant }) => (
        <div
          key={id}
          className={`rounded-2xl border p-4 shadow-glass animate-fade-in ${
            variant === "destructive"
              ? "border-destructive bg-destructive text-destructive-foreground"
              : "bg-background"
          }`}
        >
          {title && <p className="text-sm font-semibold">{title}</p>}
          {description && <p className="text-sm opacity-90">{description}</p>}
        </div>
      ))}
    </div>
  );
}

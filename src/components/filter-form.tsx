"use client";

import { createContext, useContext, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PendingContext = createContext(false);

/**
 * Drop-in replacement for <form method="GET">: submission still produces the
 * exact same query-string navigation (the target page is still a server
 * component driven by searchParams — nothing is fetched client-side here),
 * it just goes through the router instead of a raw browser form post, so
 * FilterSubmitButton below has a real pending signal to show. A plain native
 * GET form gives no such hook — the browser just navigates away with no
 * observable "pending" window for React to report.
 */
export function FilterForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(e.currentTarget).entries()) {
      if (typeof value === "string" && value) params.set(key, value);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${action}?${qs}` : action);
    });
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <PendingContext.Provider value={isPending}>{children}</PendingContext.Provider>
    </form>
  );
}

export function FilterSubmitButton({ children = "Filter" }: { children?: ReactNode }) {
  const isPending = useContext(PendingContext);
  return (
    <Button type="submit" variant="outline" disabled={isPending}>
      {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
      {isPending ? "Filtering…" : children}
    </Button>
  );
}

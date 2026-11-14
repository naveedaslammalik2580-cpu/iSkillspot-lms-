"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto mt-12 max-w-md p-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-red-100 text-red-700">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This page couldn&apos;t load. Try again, or go back to the dashboard.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="outline" asChild>
          <Link href="/admin/dashboard">Back to dashboard</Link>
        </Button>
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </Card>
  );
}

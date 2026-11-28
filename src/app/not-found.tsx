import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Card className="mx-auto mt-12 max-w-md p-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FileQuestion className="h-5 w-5" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This page doesn&apos;t exist, or it may have been moved.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button asChild>
          <Link href="/">Go to my dashboard</Link>
        </Button>
      </div>
    </Card>
  );
}

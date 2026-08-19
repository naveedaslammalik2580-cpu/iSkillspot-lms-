"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

/** Small client island so the receipt page itself can stay a server component. */
export function PrintReceiptButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer className="h-4 w-4" /> Print receipt
    </Button>
  );
}

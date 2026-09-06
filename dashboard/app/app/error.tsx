"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-sm space-y-4 p-8 text-center">
        <AlertTriangle
          className="mx-auto h-8 w-8 text-[var(--color-danger)]"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="text-body font-medium text-[var(--color-text-primary)]">
            Something went wrong
          </p>
          <p className="text-caption">
            This page hit an unexpected error. Try again, or come back later.
          </p>
        </div>
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/lib/toast";

export function InteractivePrimitives() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={() => setDialogOpen(true)}>
        Open dialog
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            variant: "default",
            title: "Settings saved",
            description: "Risk threshold updated.",
          })
        }
      >
        Trigger default toast
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            variant: "success",
            title: "Key rotated",
            description: "All active sessions were revoked.",
          })
        }
      >
        Trigger success toast
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            variant: "danger",
            title: "Login failed",
            description: "Check your credentials and try again.",
          })
        }
      >
        Trigger danger toast
      </Button>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Revoke API key?"
        description="This immediately invalidates every active user session for this tenant. This can't be undone."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setDialogOpen(false);
              toast({ variant: "success", title: "Key rotated" });
            }}
          >
            Revoke key
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

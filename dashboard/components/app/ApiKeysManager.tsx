"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SecretReveal } from "@/components/ui/SecretReveal";
import { rotateApiKeys, ApiError, type RotateKeysResult } from "@/lib/api";
import { useToast } from "@/lib/toast";

export function ApiKeysManager() {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [result, setResult] = useState<RotateKeysResult | null>(null);

  const handleRotate = async () => {
    setRotating(true);
    try {
      const data = await rotateApiKeys();
      setResult(data);
      setConfirmOpen(false);
    } catch (err) {
      toast({
        variant: "danger",
        title: "Couldn't rotate keys",
        description:
          err instanceof ApiError
            ? err.message
            : "Check your connection and try again.",
      });
    } finally {
      setRotating(false);
    }
  };

  if (result) {
    return (
      <Card className="p-6">
        <SecretReveal
          warning="This secret key will not be shown again. Store it in your server-side environment configuration now — not in source control."
          acknowledgeLabel="Done"
          fields={[
            { label: "Public key", value: result.publicKey },
            { label: "Secret key", value: result.secretKey },
          ]}
          onAcknowledge={() => {
            setResult(null);
            toast({ variant: "success", title: "Keys rotated" });
          }}
        />
      </Card>
    );
  }

  return (
    <>
      <Card className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <KeyRound
            className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-text-secondary)]"
            aria-hidden="true"
          />
          <div>
            <p className="text-body font-medium text-[var(--color-text-primary)]">
              API keys
            </p>
            <p className="text-caption mt-1 max-w-md">
              Your public and secret key are only ever shown once — right after
              your account was verified, or immediately after a rotation.
              There&apos;s no way to retrieve them again after that; rotate to
              get a new pair if yours is lost or compromised.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
          Rotate keys
        </Button>
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Rotate API keys?"
        description="This immediately invalidates every active end-user session for this tenant — every user of your app will need to log in again. Your dashboard session is not affected."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => setConfirmOpen(false)}
            disabled={rotating}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={handleRotate} disabled={rotating}>
            {rotating ? "Rotating…" : "Rotate keys"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

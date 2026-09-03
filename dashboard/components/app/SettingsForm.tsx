"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { RiskThresholdSlider } from "@/components/app/RiskThresholdSlider";
import { updateTenantSettings, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";

export interface SettingsFormProps {
  initialRiskThreshold: number;
  initialFailOpen: boolean;
}

export function SettingsForm({
  initialRiskThreshold,
  initialFailOpen,
}: SettingsFormProps) {
  const { toast } = useToast();
  const [riskThreshold, setRiskThreshold] = useState(initialRiskThreshold);
  const [failOpen, setFailOpen] = useState(initialFailOpen);
  const [saving, setSaving] = useState(false);

  const dirty =
    riskThreshold !== initialRiskThreshold || failOpen !== initialFailOpen;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTenantSettings({ riskThreshold, failOpen });
      toast({ variant: "success", title: "Settings saved" });
    } catch (err) {
      toast({
        variant: "danger",
        title: "Couldn't save settings",
        description:
          err instanceof ApiError
            ? err.message
            : "Check your connection and try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <RiskThresholdSlider
          value={riskThreshold}
          onChange={setRiskThreshold}
          disabled={saving}
        />
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-body font-medium text-[var(--color-text-primary)]">
              Fail open on engine failure
            </p>
            <p className="text-caption mt-1 max-w-md">
              {failOpen
                ? "If the risk engine is unreachable, logins are allowed through unscored. Prioritizes availability over risk scoring."
                : "If the risk engine is unreachable, logins are blocked entirely. Prioritizes security over uptime."}
            </p>
          </div>
          <Switch
            checked={failOpen}
            onCheckedChange={setFailOpen}
            disabled={saving}
            label="Fail open on engine failure"
          />
        </div>
      </Card>

      <Button
        variant="primary"
        onClick={handleSave}
        disabled={!dirty || saving}
      >
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

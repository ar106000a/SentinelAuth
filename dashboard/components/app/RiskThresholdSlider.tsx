"use client";

import { RiskBadge } from "@/components/ui/Badge";

export interface RiskThresholdSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function RiskThresholdSlider({
  value,
  onChange,
  disabled,
}: RiskThresholdSliderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label
          htmlFor="risk-threshold"
          className="text-body font-medium text-[var(--color-text-primary)]"
        >
          Risk threshold
        </label>
        <RiskBadge score={value} />
      </div>
      <input
        id="risk-threshold"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="risk-slider"
      />
      <p className="text-caption">
        Logins scoring at or above this threshold are challenged with MFA
        instead of passing straight through. Lower it to challenge more logins;
        raise it to challenge fewer.
      </p>
    </div>
  );
}

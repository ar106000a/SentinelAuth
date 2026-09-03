export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function OtpInput({ value, onChange, disabled }: OtpInputProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="otp" className="text-caption block">
        Verification code
      </label>
      <input
        id="otp"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        autoComplete="one-time-code"
        required
        disabled={disabled}
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, 6))
        }
        className="text-data h-12 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-3 text-center text-2xl tracking-[0.5em] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-focus)] disabled:opacity-50"
      />
    </div>
  );
}

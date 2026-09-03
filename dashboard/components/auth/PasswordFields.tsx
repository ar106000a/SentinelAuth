import { Input } from "@/components/ui/Input";

export const MIN_PASSWORD_LENGTH = 12;

export interface PasswordFieldsProps {
  password: string;
  onPasswordChange: (value: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (value: string) => void;
  disabled?: boolean;
  passwordLabel?: string;
}

export function PasswordFields({
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  disabled,
  passwordLabel = "Password",
}: PasswordFieldsProps) {
  const confirmError =
    confirmPassword.length > 0 && confirmPassword !== password
      ? "Passwords don't match."
      : undefined;
  const passwordHint =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `At least ${MIN_PASSWORD_LENGTH} characters (${password.length}/${MIN_PASSWORD_LENGTH}).`
      : undefined;

  return (
    <>
      <Input
        label={passwordLabel}
        type="password"
        autoComplete="new-password"
        required
        disabled={disabled}
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        error={passwordHint}
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        disabled={disabled}
        value={confirmPassword}
        onChange={(e) => onConfirmPasswordChange(e.target.value)}
        error={confirmError}
      />
    </>
  );
}

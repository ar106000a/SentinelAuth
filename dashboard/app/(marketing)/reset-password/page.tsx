import { Suspense } from "react";
import { ResetPasswordPageContent } from "./ResetPasswordPageContent";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}

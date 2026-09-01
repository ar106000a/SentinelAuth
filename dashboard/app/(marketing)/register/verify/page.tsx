import { Suspense } from "react";
import { VerifyEmailPageContent } from "./VerifyEmailPageContent";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}

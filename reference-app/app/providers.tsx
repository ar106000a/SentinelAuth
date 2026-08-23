"use client";

import { SentinelAuthProvider } from "@sentinelauth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SentinelAuthProvider
      apiUrl="http://localhost:3000"
      apiKey="d739bbf086564fde444f6b927506864b50eb7ff2f3a14626d5f4070a6bedf1bb"
    >
      {children}
    </SentinelAuthProvider>
  );
}

"use client";

import {
  SentinelAuthProvider,
  SentinelAuthLoginFlow,
} from "@sentinelauth/react";
import { useState } from "react";

export default function LoginReactPage() {
  const [result, setResult] = useState<string | null>(null);

  return (
    <SentinelAuthProvider
      apiUrl="http://localhost:3000"
      apiKey="bcbaa755da0360929a90799f3eefa08f48dc2fe42ab3c4620a344353ee5f1515"
    >
      <main
        style={{ maxWidth: 400, margin: "4rem auto", fontFamily: "system-ui" }}
      >
        <h1>Sample App — React Package</h1>
        <div style={{ "--sentinel-primary-color": "#16a34a" } as any}>
          <SentinelAuthLoginFlow
            onSuccess={(res) => setResult(JSON.stringify(res, null, 2))}
            onError={(err) => setResult(`ERROR: ${err.message}`)}
          />
        </div>
        {result && (
          <pre
            style={{
              marginTop: "2rem",
              background: "#f3f4f6",
              padding: "1rem",
            }}
          >
            {result}
          </pre>
        )}
      </main>
    </SentinelAuthProvider>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dashboardApi, DashboardApiError } from "@/lib/api";

export default function DashboardLoginPage() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await dashboardApi.login(adminEmail, password);
      router.push("/");
    } catch (err) {
      const message =
        err instanceof DashboardApiError
          ? err.message
          : "Something went wrong.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{ maxWidth: 360, margin: "6rem auto", fontFamily: "system-ui" }}
    >
      <h1>SentinelAuth Dashboard</h1>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <div>
          <label htmlFor="email">Admin email</label>
          <input
            id="email"
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </div>
        {error && (
          <p style={{ color: "#dc2626", fontSize: "0.875rem" }}>{error}</p>
        )}
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}

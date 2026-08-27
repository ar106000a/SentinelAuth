import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { RiskBadge } from "@/components/ui/Badge";
import { SignalLine } from "@/components/ui/SignalLine";

const SAMPLE_SCORES = [0.04, 0.18, 0.33, 0.49, 0.51, 0.67, 0.82, 0.96];

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-[var(--color-base)] px-8 py-12">
      <div className="mx-auto max-w-3xl space-y-12">
        <header className="space-y-2">
          <p className="text-caption uppercase tracking-wide">Week A · Day 1</p>
          <h1 className="text-display-xl">Design tokens & primitives</h1>
          <p className="text-body text-[var(--color-text-secondary)]">
            Button, Card, RiskBadge, and the signal line — rendered against real values, not placeholders.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-display-md">Signal line</h2>
          <Card className="p-5 space-y-4">
            <SignalLine />
            <p className="text-caption">Static — used as a structural accent.</p>
            <SignalLine loading />
            <p className="text-caption">Loading — the same gradient, animated. This is the app&apos;s loading indicator.</p>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-display-md">Buttons</h2>
          <Card className="p-5 flex flex-wrap items-center gap-3">
            <Button variant="primary">Save settings</Button>
            <Button variant="secondary">View details</Button>
            <Button variant="ghost">Dismiss</Button>
            <Button variant="danger">Revoke key</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-display-md">Risk badge — continuous gradient</h2>
          <Card signal className="p-5">
            <CardHeader className="px-0 pt-0">
              <CardTitle>Recent login attempts</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-4">
              <ul className="space-y-3">
                {SAMPLE_SCORES.map((score) => (
                  <li key={score} className="flex items-center justify-between border-b border-[var(--color-border)] pb-3 last:border-0 last:pb-0">
                    <span className="text-body text-[var(--color-text-secondary)]">score {score.toFixed(2)}</span>
                    <RiskBadge score={score} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-display-md">Type scale</h2>
          <Card className="p-5 space-y-3">
            <p className="text-display-xl">Display XL — Space Grotesk 600</p>
            <p className="text-display-lg">Display LG — Space Grotesk 600</p>
            <p className="text-display-md">Display MD — Space Grotesk 600</p>
            <p className="text-body">Body — Inter 400, for copy and labels.</p>
            <p className="text-caption">Caption — Inter 400, muted, for metadata.</p>
            <p className="text-data text-lg">0.847 — JetBrains Mono, tabular-nums, for every number.</p>
          </Card>
        </section>
      </div>
    </main>
  );
}

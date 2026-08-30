"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import { Card } from "@/components/ui/Card";

// Sourced from SRS §3.5 (Non-Functional Requirements) — these are the
// system's design targets, not measured production metrics. Framed as
// "built for" rather than "we currently achieve," since there's no
// production traffic yet to have measured.
const STATS = [
  {
    value: "<100ms",
    label: "Built for 95% of auth requests, excluding network latency",
  },
  {
    value: "<50ms",
    label: "Target response time for the AI risk-inference call",
  },
  { value: "99.9%", label: "Availability SLA the system is designed to" },
  { value: "1,000+", label: "Concurrent tenants the architecture targets" },
];

export function SecuritySection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(".security-stat", {
        opacity: 0,
        y: 16,
        duration: 0.4,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 80%",
          once: true,
        },
      });
    },
    { scope: sectionRef }
  );

  return (
    <section
      id="security"
      ref={sectionRef}
      className="border-y border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-xl">
          <h2 className="text-display-lg">
            Designed for production from day one
          </h2>
          <p className="text-body mt-3 text-[var(--color-text-secondary)]">
            Argon2id hashing, RS256-signed tokens, and RLS-enforced isolation
            aren&apos;t optional layers — they&apos;re the foundation. These are
            the targets the system is architected against.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat) => (
            <Card key={stat.label} className="security-stat p-5">
              <p className="text-data text-3xl text-[var(--color-text-primary)]">
                {stat.value}
              </p>
              <p className="text-caption mt-2">{stat.label}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

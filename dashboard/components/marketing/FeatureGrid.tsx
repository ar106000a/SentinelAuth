"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import {
  Fingerprint,
  Layers,
  Blocks,
  ShieldCheck,
  KeyRound,
  SlidersHorizontal,
  Activity,
  MapPin,
  ScrollText,
} from "lucide-react";
import { gsap } from "@/lib/gsap";
import { Card } from "@/components/ui/Card";

// Grouped the way SRS §2.2 defines the product's three pillars — this
// isn't marketing-invented categorization, it's the actual functional
// requirements structure (§3.2.1–3.2.10).
const PILLARS = [
  {
    name: "Identity Management",
    features: [
      {
        icon: Fingerprint,
        title: "Argon2id password hashing",
        description:
          "Every credential hashed with Argon2id and a 16-byte salt — not a legacy bcrypt/PBKDF2 fallback.",
      },
      {
        icon: Layers,
        title: "Stateless JWT sessions",
        description:
          "RS256-signed tokens with refresh rotation. No session store to scale, no shared secret to leak.",
      },
      {
        icon: Blocks,
        title: "Drop-in SDK components",
        description:
          "Themeable web components for login, registration, MFA, and password reset — or go headless.",
      },
    ],
  },
  {
    name: "Multi-Tenant Governance",
    features: [
      {
        icon: ShieldCheck,
        title: "RLS-enforced isolation",
        description:
          "Every query runs through Postgres row-level security scoped to app.current_tenant — isolation enforced at the database layer.",
      },
      {
        icon: KeyRound,
        title: "Per-tenant key rotation",
        description:
          "RSA-2048 key pairs per tenant, encrypted at rest. Rotate on demand without touching any other tenant.",
      },
      {
        icon: SlidersHorizontal,
        title: "Configurable risk policy",
        description:
          "Tune your own risk-tolerance threshold and fail-open behavior per tenant, no code changes required.",
      },
    ],
  },
  {
    name: "Adaptive Security",
    features: [
      {
        icon: Activity,
        title: "Real-time risk inference",
        description:
          "Every login scored 0.0–1.0 by an XGBoost model built for sub-100ms response, before a decision is made.",
      },
      {
        icon: MapPin,
        title: "Impossible-travel detection",
        description:
          "Haversine-based geo-velocity checks catch a login from Lagos eight minutes after one from Toronto.",
      },
      {
        icon: ScrollText,
        title: "Full security audit log",
        description:
          "Every authentication event, risk score, and admin action recorded — filterable, paginated, exportable.",
      },
    ],
  },
];

export function FeatureGrid() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(".feature-card", {
        opacity: 0,
        y: 24,
        duration: 0.5,
        ease: "power2.out",
        stagger: 0.08,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 75%",
          once: true,
        },
      });
    },
    { scope: sectionRef }
  );

  return (
    <section
      id="features"
      ref={sectionRef}
      className="mx-auto max-w-6xl px-6 py-24"
    >
      <div className="mb-14 text-center">
        <h2 className="text-display-lg">
          Built for the parts that are hard to get right
        </h2>
        <p className="text-body mx-auto mt-3 max-w-lg text-[var(--color-text-secondary)]">
          Three pillars, one platform — identity, tenant governance, and the
          risk engine that ties them together.
        </p>
      </div>

      <div className="space-y-14">
        {PILLARS.map((pillar) => (
          <div key={pillar.name}>
            <h3 className="text-caption mb-4 uppercase tracking-wide">
              {pillar.name}
            </h3>
            <div className="grid gap-5 md:grid-cols-3">
              {pillar.features.map((feature) => (
                <Card key={feature.title} className="feature-card p-6">
                  <feature.icon
                    className="h-6 w-6 text-[var(--color-text-secondary)]"
                    aria-hidden="true"
                  />
                  <h4 className="text-body mt-4 font-medium text-[var(--color-text-primary)]">
                    {feature.title}
                  </h4>
                  <p className="text-caption mt-2">{feature.description}</p>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

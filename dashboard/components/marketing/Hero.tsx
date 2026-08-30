"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { RiskGauge } from "@/components/marketing/RiskGauge";

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".hero-eyebrow", { opacity: 0, y: 12, duration: 0.5 })
        .from(".hero-headline", { opacity: 0, y: 20, duration: 0.6 }, "-=0.3")
        .from(".hero-subhead", { opacity: 0, y: 16, duration: 0.5 }, "-=0.35")
        .from(".hero-cta", { opacity: 0, y: 12, duration: 0.5 }, "-=0.3")
        .from(
          ".hero-gauge",
          { opacity: 0, scale: 0.92, duration: 0.7, ease: "power2.out" },
          "-=0.5"
        );
    },
    { scope: containerRef }
  );

  return (
    <section
      ref={containerRef}
      className="mx-auto max-w-6xl px-6 pb-20 pt-24 md:pt-32"
    >
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <p className="hero-eyebrow text-caption uppercase tracking-wide">
            Auth-as-a-Service, adaptive by default
          </p>
          <h1 className="hero-headline text-display-xl mt-3 ">
            Authentication that scores every login, not just gates it.
          </h1>
          <p className="hero-subhead text-body mt-4 max-w-md text-[var(--color-text-secondary)]">
            SentinelAuth runs every login through a real-time risk model — new
            device, impossible travel, credential stuffing — and only asks for
            MFA when it actually matters.
          </p>
          <div className="hero-cta mt-8 flex flex-wrap gap-3">
            <Link
              href="/register"
              className={buttonVariants({ variant: "primary", size: "lg" })}
            >
              Get started
            </Link>
            <Link
              href="#how-it-works"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              See how it works
            </Link>
          </div>
        </div>
        <div className="hero-gauge flex justify-center">
          <RiskGauge />
        </div>
      </div>
    </section>
  );
}

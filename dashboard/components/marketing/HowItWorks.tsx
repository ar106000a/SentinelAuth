"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { riskColor } from "@/lib/risk";
import { RISK_GRADIENT_HEX } from "@/lib/tokens";
import { CodeWindow } from "@/components/marketing/CodeWindow";

const STEPS = [
  {
    n: 1,
    title: "A login attempt comes in",
    description:
      "Your app calls the SDK or hits the API directly. No extra step on your end.",
  },
  {
    n: 2,
    title: "Scored in real time",
    description:
      "An XGBoost model returns a 0.0–1.0 risk score, built for sub-100ms response.",
  },
  {
    n: 3,
    title: "Adaptively decided",
    description:
      "Below threshold, the login passes straight through. Above it, MFA is required — automatically.",
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stepRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];
  const reqLineRef = useRef<HTMLDivElement>(null);
  const scoreLineRef = useRef<HTMLDivElement>(null);
  const scoreValueRef = useRef<HTMLSpanElement>(null);
  const scoreBarRef = useRef<HTMLDivElement>(null);
  const decisionLineRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.set(
        stepRefs.map((r) => r.current),
        { opacity: 0.4 }
      );
      gsap.set(
        [reqLineRef.current, scoreLineRef.current, decisionLineRef.current],
        { opacity: 0, y: 6 }
      );
      gsap.set(scoreBarRef.current, { scaleX: 0 });

      const score = { value: 0 };
      const tl = gsap.timeline({
        paused: true,
        repeat: -1, // Tells the timeline to loop infinitely
        defaults: { ease: "power2.out" },
      });

      tl.to(stepRefs[0].current, { opacity: 1, duration: 0.3 })
        .to(reqLineRef.current, { opacity: 1, y: 0, duration: 0.35 }, "-=0.1")
        .to(stepRefs[0].current, { opacity: 0.4, duration: 0.3 }, "+=0.5")
        .to(stepRefs[1].current, { opacity: 1, duration: 0.3 }, "-=0.2")
        .to(scoreLineRef.current, { opacity: 1, y: 0, duration: 0.3 })
        .to(
          score,
          {
            value: 0.81,
            duration: 0.7,
            onUpdate: () => {
              if (scoreValueRef.current) {
                scoreValueRef.current.textContent = score.value.toFixed(2);
                scoreValueRef.current.style.color = riskColor(score.value);
              }
            },
          },
          "-=0.1"
        )
        .to(
          scoreBarRef.current,
          { scaleX: 0.81, duration: 0.7, ease: "power1.inOut" },
          "<"
        )
        .to(stepRefs[1].current, { opacity: 0.4, duration: 0.3 }, "+=0.4")
        .to(stepRefs[2].current, { opacity: 1, duration: 0.3 }, "-=0.2")
        .to(decisionLineRef.current, { opacity: 1, y: 0, duration: 0.35 })
        // Added: Hold for 2 seconds, then smoothly fade out to reset the loop
        .to(stepRefs[2].current, { opacity: 0.4, duration: 0.4 }, "+=2")
        .to(
          [reqLineRef.current, scoreLineRef.current, decisionLineRef.current],
          { opacity: 0, duration: 0.4 },
          "<"
        );

      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top 65%",
        once: true, // Trigger fires once to start the infinite timeline
        onEnter: () => tl.play(),
      });
    },
    { scope: sectionRef }
  );

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="mx-auto max-w-6xl px-6 py-24"
    >
      <div className="mb-14 text-center">
        <h2 className="text-display-lg">
          How the risk decision actually works
        </h2>
        <p className="text-body mx-auto mt-3 max-w-lg text-[var(--color-text-secondary)]">
          Every login gets scored before it&apos;s ever challenged. Most
          attempts pass straight through.
        </p>
      </div>

      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-8">
          {STEPS.map((step, i) => (
            <div key={step.n} ref={stepRefs[i]} className="flex gap-4">
              <span
                className="text-data flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                style={{
                  background:
                    i === 2
                      ? `${RISK_GRADIENT_HEX.high}22`
                      : i === 1
                        ? `${RISK_GRADIENT_HEX.mid}22`
                        : "var(--color-surface-raised)",
                  color:
                    i === 2
                      ? RISK_GRADIENT_HEX.high
                      : i === 1
                        ? RISK_GRADIENT_HEX.mid
                        : "var(--color-text-secondary)",
                }}
              >
                {step.n}
              </span>
              <div>
                <h3 className="text-body font-medium text-[var(--color-text-primary)]">
                  {step.title}
                </h3>
                <p className="text-caption mt-1">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <CodeWindow live>
          <div className="text-data space-y-3 text-xs sm:text-sm">
            <div ref={reqLineRef}>
              <p className="text-[var(--color-text-primary)]">
                $ POST /api/auth/login
              </p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                ip: 203.0.113.4 device: unrecognized
              </p>
            </div>

            <div ref={scoreLineRef}>
              <p className="text-[var(--color-text-secondary)]">
                risk_score: <span ref={scoreValueRef}>0.00</span>
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
                <div
                  ref={scoreBarRef}
                  className="gradient-signal h-full w-full origin-left rounded-full"
                  style={{ transform: "scaleX(0)" }}
                />
              </div>
            </div>

            <div ref={decisionLineRef}>
              <p style={{ color: RISK_GRADIENT_HEX.high }}>
                ⚠ threshold exceeded (0.50)
              </p>
              <p className="mt-1 text-[var(--color-text-primary)]">
                → decision: MFA_REQUIRED
              </p>
            </div>
          </div>
        </CodeWindow>
      </div>
    </section>
  );
}

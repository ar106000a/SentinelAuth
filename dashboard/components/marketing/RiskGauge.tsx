"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import { riskColor } from "@/lib/risk";
import { RISK_GRADIENT_HEX } from "@/lib/tokens";

const SIZE = { width: 280, height: 170 };
const CX = 140;
const CY = 150;
const RADIUS = 110;
const NEEDLE_LENGTH = 90;
const ARC_LENGTH = Math.PI * RADIUS;

// A loop of target scores simulating live monitoring: mostly calm, one
// spike that gets caught and settles back down. This is meant to *read*
// as "the product working," not just as a number changing.
const SIMULATED_SCORES = [0.06, 0.09, 0.05, 0.08, 0.74, 0.15, 0.07, 0.06];

export function RiskGauge() {
  const progressRef = useRef<SVGPathElement>(null);
  const needleRef = useRef<SVGLineElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    const state = { value: SIMULATED_SCORES[0] };

    const applyValue = (value: number) => {
      const offset = ARC_LENGTH * (1 - value);
      const rotation = value * 180 - 90;

      if (progressRef.current)
        progressRef.current.style.strokeDashoffset = `${offset}`;
      if (needleRef.current)
        needleRef.current.style.transform = `rotate(${rotation}deg)`;
      if (readoutRef.current) {
        readoutRef.current.textContent = value.toFixed(2);
        readoutRef.current.style.color = riskColor(value);
      }
    };

    applyValue(state.value);

    const tl = gsap.timeline({ repeat: -1 });
    for (const target of [...SIMULATED_SCORES.slice(1), SIMULATED_SCORES[0]]) {
      tl.to(state, {
        value: target,
        duration: target > 0.5 || state.value > 0.5 ? 0.6 : 1.4,
        ease: "power2.inOut",
        onUpdate: () => applyValue(state.value),
      });
    }
  });

  return (
    <div className="flex w-full flex-col items-center">
      <svg
        viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
        className="h-auto w-full max-w-[280px]"
        role="img"
        aria-label="Animated live risk score gauge"
      >
        <defs>
          <linearGradient
            id="gauge-gradient"
            x1={CX - RADIUS}
            y1="0"
            x2={CX + RADIUS}
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={RISK_GRADIENT_HEX.low} />
            <stop offset="50%" stopColor={RISK_GRADIENT_HEX.mid} />
            <stop offset="100%" stopColor={RISK_GRADIENT_HEX.high} />
          </linearGradient>
        </defs>

        <path
          d={`M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY}`}
          fill="none"
          stroke="var(--color-border-strong)"
          strokeWidth={10}
          strokeLinecap="round"
        />

        <path
          ref={progressRef}
          d={`M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY}`}
          fill="none"
          stroke="url(#gauge-gradient)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={ARC_LENGTH}
        />

        <line
          ref={needleRef}
          x1={CX}
          y1={CY}
          x2={CX}
          y2={CY - NEEDLE_LENGTH}
          stroke="var(--color-text-primary)"
          strokeWidth={2}
          strokeLinecap="round"
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        />
        <circle cx={CX} cy={CY} r={5} fill="var(--color-text-primary)" />
      </svg>

      <div className="-mt-4 text-center">
        <span ref={readoutRef} className="text-data text-4xl font-medium">
          0.06
        </span>
        <p className="text-caption mt-1">live risk score</p>
      </div>
    </div>
  );
}

"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { LogIn, Activity, CheckCircle2, ShieldAlert } from "lucide-react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { RISK_GRADIENT_HEX } from "@/lib/tokens";

// Geometry — laid out by hand once, referenced by both the JSX and the
// timeline below so line endpoints and node positions can't drift apart.
const A = { x: 20, y: 92, w: 150, h: 56 };
const B = { x: 230, y: 92, w: 150, h: 56 };
const DIAMOND_CENTER = { x: 480, y: 120 };
const DIAMOND_HALF_DIAGONAL = 63.6;
const D1 = { x: 560, y: 25, w: 170, h: 55 }; // pass-through (upper)
const D2 = { x: 560, y: 185, w: 170, h: 55 }; // MFA challenge (lower)

const diamondTip = {
  left: { x: DIAMOND_CENTER.x - DIAMOND_HALF_DIAGONAL, y: DIAMOND_CENTER.y },
  top: { x: DIAMOND_CENTER.x, y: DIAMOND_CENTER.y - DIAMOND_HALF_DIAGONAL },
  bottom: { x: DIAMOND_CENTER.x, y: DIAMOND_CENTER.y + DIAMOND_HALF_DIAGONAL },
};

function drawLine(el: SVGLineElement | null) {
  if (!el) return;
  const length = el.getTotalLength();
  gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
}

export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const nodeARef = useRef<SVGGElement>(null);
  const nodeBRef = useRef<SVGGElement>(null);
  const nodeCRef = useRef<SVGGElement>(null);
  const nodeD1Ref = useRef<SVGGElement>(null);
  const nodeD2Ref = useRef<SVGGElement>(null);
  const lineABRef = useRef<SVGLineElement>(null);
  const lineBCRef = useRef<SVGLineElement>(null);
  const lineCD1Ref = useRef<SVGLineElement>(null);
  const lineCD2Ref = useRef<SVGLineElement>(null);
  const packetRef = useRef<SVGCircleElement>(null);
  const scoreTextRef = useRef<SVGTextElement>(null);

  useGSAP(
    () => {
      const nodes = [nodeARef, nodeBRef, nodeCRef, nodeD1Ref, nodeD2Ref];
      gsap.set(
        nodes.map((r) => r.current),
        { opacity: 0, y: 8 }
      );
      gsap.set(nodeD1Ref.current, { opacity: 0.35 }); // the untaken branch settles here, not to 0
      gsap.set(packetRef.current, { opacity: 0 });

      drawLine(lineABRef.current);
      drawLine(lineBCRef.current);
      drawLine(lineCD1Ref.current);
      drawLine(lineCD2Ref.current);

      const score = { value: 0 };
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });

      tl.to(nodeARef.current, { opacity: 1, y: 0, duration: 0.4 })
        .to(lineABRef.current, { strokeDashoffset: 0, duration: 0.4, ease: "none" }, "-=0.05")
        .to(nodeBRef.current, { opacity: 1, y: 0, duration: 0.4 }, "-=0.1")
        .to(
          score,
          {
            value: 0.81,
            duration: 0.8,
            onUpdate: () => {
              if (scoreTextRef.current) scoreTextRef.current.textContent = score.value.toFixed(2);
            },
          },
          "-=0.1"
        )
        .to(lineBCRef.current, { strokeDashoffset: 0, duration: 0.4, ease: "none" })
        .to(nodeCRef.current, { opacity: 1, y: 0, duration: 0.4 }, "-=0.1")
        .to(nodeD1Ref.current, { y: 0, duration: 0.4 }, "-=0.1") // fades to 0.35, not 0 — see gsap.set above
        .to([lineCD1Ref.current, lineCD2Ref.current], { strokeDashoffset: 0, duration: 0.5, ease: "none" })
        .to(packetRef.current, { opacity: 1, duration: 0.15 }, "-=0.5")
        .to(
          packetRef.current,
          {
            attr: { cx: D2.x, cy: D2.y + D2.h / 2 },
            duration: 0.5,
            ease: "power1.inOut",
          },
          "-=0.5"
        )
        .to(nodeD2Ref.current, { opacity: 1, y: 0, duration: 0.3 }, "-=0.15")
        .to(nodeD2Ref.current, { scale: 1.04, duration: 0.15, yoyo: true, repeat: 1 });

      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top 65%",
        once: true,
        onEnter: () => tl.play(),
      });
    },
    { scope: sectionRef }
  );

  return (
    <section id="how-it-works" ref={sectionRef} className="mx-auto max-w-5xl px-6 py-24">
      <div className="mb-10 text-center">
        <h2 className="text-display-lg">How the risk decision actually works</h2>
        <p className="text-body mx-auto mt-3 max-w-lg text-[var(--color-text-secondary)]">
          Every login gets scored before it&apos;s ever challenged. Most attempts pass straight through.
        </p>
      </div>

      <svg viewBox="0 0 760 260" className="w-full" role="img" aria-label="Adaptive MFA decision flow diagram">
        <line ref={lineABRef} x1={A.x + A.w} y1={A.y + A.h / 2} x2={B.x} y2={B.y + B.h / 2} stroke="var(--color-border-strong)" strokeWidth={2} />
        <line ref={lineBCRef} x1={B.x + B.w} y1={B.y + B.h / 2} x2={diamondTip.left.x} y2={diamondTip.left.y} stroke="var(--color-border-strong)" strokeWidth={2} />
        <line ref={lineCD1Ref} x1={diamondTip.top.x} y1={diamondTip.top.y} x2={D1.x} y2={D1.y + D1.h / 2} stroke="var(--color-border-strong)" strokeWidth={2} />
        <line ref={lineCD2Ref} x1={diamondTip.bottom.x} y1={diamondTip.bottom.y} x2={D2.x} y2={D2.y + D2.h / 2} stroke={RISK_GRADIENT_HEX.high} strokeWidth={2} />

        <g ref={nodeARef}>
          <rect x={A.x} y={A.y} width={A.w} height={A.h} rx={10} fill="var(--color-surface)" stroke="var(--color-border-strong)" />
          <foreignObject x={A.x} y={A.y} width={A.w} height={A.h}>
            <div className="flex h-full items-center gap-2 px-4">
              <LogIn className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" />
              <span className="text-body">Login attempt</span>
            </div>
          </foreignObject>
        </g>

        <g ref={nodeBRef}>
          <rect x={B.x} y={B.y} width={B.w} height={B.h} rx={10} fill="var(--color-surface)" stroke="var(--color-border-strong)" />
          <foreignObject x={B.x} y={B.y} width={B.w} height={22}>
            <div className="flex h-full items-center justify-center gap-1.5 text-[var(--color-text-secondary)]">
              <Activity className="h-3.5 w-3.5" />
              <span className="text-caption">risk score</span>
            </div>
          </foreignObject>
          <text
            ref={scoreTextRef}
            x={B.x + B.w / 2}
            y={B.y + B.h - 12}
            textAnchor="middle"
            className="text-data"
            fontSize={16}
            fill="var(--color-text-primary)"
          >
            0.00
          </text>
        </g>

        <g ref={nodeCRef}>
          <rect
            x={DIAMOND_CENTER.x - 45}
            y={DIAMOND_CENTER.y - 45}
            width={90}
            height={90}
            rx={8}
            transform={`rotate(45 ${DIAMOND_CENTER.x} ${DIAMOND_CENTER.y})`}
            fill="var(--color-surface)"
            stroke="var(--color-border-strong)"
          />
          <foreignObject x={DIAMOND_CENTER.x - 55} y={DIAMOND_CENTER.y - 20} width={110} height={40}>
            <p className="text-caption text-center leading-tight">score &gt; threshold?</p>
          </foreignObject>
        </g>

        <g ref={nodeD1Ref}>
          <rect x={D1.x} y={D1.y} width={D1.w} height={D1.h} rx={10} fill="var(--color-surface)" stroke="var(--color-border-strong)" />
          <foreignObject x={D1.x} y={D1.y} width={D1.w} height={D1.h}>
            <div className="flex h-full items-center gap-2 px-4">
              <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: RISK_GRADIENT_HEX.low }} />
              <span className="text-body">Pass through</span>
            </div>
          </foreignObject>
        </g>

        <g ref={nodeD2Ref}>
          <rect x={D2.x} y={D2.y} width={D2.w} height={D2.h} rx={10} fill="var(--color-surface)" stroke={RISK_GRADIENT_HEX.high} />
          <foreignObject x={D2.x} y={D2.y} width={D2.w} height={D2.h}>
            <div className="flex h-full items-center gap-2 px-4">
              <ShieldAlert className="h-4 w-4 shrink-0" style={{ color: RISK_GRADIENT_HEX.high }} />
              <span className="text-body">MFA challenge</span>
            </div>
          </foreignObject>
        </g>

        <circle ref={packetRef} cx={diamondTip.bottom.x} cy={diamondTip.bottom.y} r={5} fill={RISK_GRADIENT_HEX.high} />
      </svg>
    </section>
  );
}
"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import { CodeWindow } from "@/components/marketing/CodeWindow";

type Seg = {
  text: string;
  cls?: "keyword" | "component" | "string" | "property" | "comment";
};
type Line = { indent: number; segs: Seg[] };

const K = (t: string): Seg => ({ text: t, cls: "keyword" });
const C = (t: string): Seg => ({ text: t, cls: "component" });
const S = (t: string): Seg => ({ text: t, cls: "string" });
const P = (t: string): Seg => ({ text: t, cls: "property" });
const plain = (t: string): Seg => ({ text: t });

const LINES: Line[] = [
  { indent: 0, segs: [S('"use client"'), plain(";")] },
  {
    indent: 0,
    segs: [
      K("import"),
      plain(" { "),
      C("SentinelAuthLoginFlow"),
      plain(" } "),
      K("from"),
      plain(" "),
      S('"@sentinelauth/react"'),
      plain(";"),
    ],
  },
  {
    indent: 0,
    segs: [
      K("import"),
      plain(" { useRouter } "),
      K("from"),
      plain(" "),
      S('"next/navigation"'),
      plain(";"),
    ],
  },
  { indent: 0, segs: [plain("")] },
  {
    indent: 0,
    segs: [
      K("export default function"),
      plain(" "),
      C("LoginPage"),
      plain("() {"),
    ],
  },
  { indent: 1, segs: [K("const"), plain(" router = useRouter();")] },
  { indent: 1, segs: [K("return"), plain(" (")] },
  {
    indent: 2,
    segs: [
      plain("<"),
      C("main"),
      plain(" "),
      P("style"),
      plain("={{ maxWidth: 400, margin: "),
      S('"4rem auto"'),
      plain(" }}>"),
    ],
  },
  { indent: 3, segs: [plain("<h1>Log in</h1>")] },
  {
    indent: 3,
    segs: [
      plain("<"),
      C("SentinelAuthLoginFlow"),
      plain(" "),
      P("onSuccess"),
      plain("={() => router.push("),
      S('"/dashboard"'),
      plain(")} />"),
    ],
  },
  {
    indent: 3,
    segs: [
      plain("<a "),
      P("href"),
      plain("="),
      S('"/forgot-password"'),
      plain(">Forgot password?</a>"),
    ],
  },
  { indent: 2, segs: [plain("</"), C("main"), plain(">")] },
  { indent: 1, segs: [plain(");")] },
  { indent: 0, segs: [plain("}")] },
];

const TOKEN_CLASS: Record<NonNullable<Seg["cls"]>, string> = {
  keyword: "text-[var(--color-code-keyword)]",
  component: "text-[var(--color-code-component)]",
  string: "text-[var(--color-code-string)]",
  property: "text-[var(--color-code-property)]",
  comment: "text-[var(--color-code-comment)] italic",
};

function renderLine(line: Line): ReactNode {
  return (
    <>
      {line.segs.map((seg, i) => (
        <span
          key={i}
          className={
            seg.cls ? TOKEN_CLASS[seg.cls] : "text-[var(--color-text-primary)]"
          }
        >
          {seg.text}
        </span>
      ))}
    </>
  );
}

const SNIPPET_PLAIN_TEXT = [
  '"use client";',
  'import { SentinelAuthLoginFlow } from "@sentinelauth/react";',
  'import { useRouter } from "next/navigation";',
  "",
  "export default function LoginPage() {",
  "  const router = useRouter();",
  "  return (",
  '    <main style={{ maxWidth: 400, margin: "4rem auto" }}>',
  "      <h1>Log in</h1>",
  '      <SentinelAuthLoginFlow onSuccess={() => router.push("/dashboard")} />',
  '      <a href="/forgot-password">Forgot password?</a>',
  "    </main>",
  "  );",
  "}",
].join("\n");

export function SetupSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(".setup-reveal", {
        opacity: 0,
        y: 20,
        duration: 0.5,
        ease: "power2.out",
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
      id="quickstart"
      ref={sectionRef}
      className="mx-auto max-w-5xl px-6 py-24"
    >
      <div className="setup-reveal grid items-center gap-10 md:grid-cols-2">
        <CodeWindow filename="app/login/page.tsx" copyText={SNIPPET_PLAIN_TEXT}>
          <pre className="text-data text-xs leading-relaxed sm:text-sm">
            {LINES.map((line, i) => (
              <div key={i} style={{ paddingLeft: `${line.indent * 1}em` }}>
                {renderLine(line)}
              </div>
            ))}
          </pre>
        </CodeWindow>
        <div>
          <p className="text-caption uppercase tracking-wide">
            Developer experience
          </p>
          <h2 className="text-display-lg mt-2">Three lines and a component.</h2>
          <p className="text-body mt-4 text-[var(--color-text-secondary)]">
            That&apos;s the entire integration for a themeable, risk-aware login
            flow — MFA, device fingerprinting, and adaptive challenges included,
            no extra wiring required.
          </p>
        </div>
      </div>
    </section>
  );
}

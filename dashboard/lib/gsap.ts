"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Registration is idempotent (GSAP no-ops repeat registrations), but this
// module still only ever runs in a "use client" tree, never during SSR —
// ScrollTrigger touches `window`/`document` at registration time.
gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

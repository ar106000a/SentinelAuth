import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { SetupSection } from "@/components/marketing/SetupSection";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { SecuritySection } from "@/components/marketing/SecuritySection";
import { CtaSection } from "@/components/marketing/CtaSection";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <SetupSection />
      <FeatureGrid />
      <SecuritySection />
      <CtaSection />
    </>
  );
}

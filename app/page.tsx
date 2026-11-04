import { Suspense } from "react";
import Onboarding from "./Onboarding";

// useSearchParams() needs a suspense boundary, otherwise the build fails while
// prerendering "/". The boundary lives here so the form itself stays a plain
// client component.
export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-black" />}>
      <Onboarding />
    </Suspense>
  );
}

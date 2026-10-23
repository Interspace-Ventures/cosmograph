import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import { AppStateProvider, useAppState } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";
import { Scene } from "@/components/Scene";
import { Overlay } from "@/components/Overlay";
import { TourOverlay } from "@/components/TourOverlay";
import { AuthCallbackPage, SignInPage } from "@/components/AuthPages";
import { Dashboard } from "@/components/Dashboard";
import { FlyCockpit } from "@/components/FlyCockpit";
import { DatasetLoadingOverlay } from "@/components/DatasetLoadingOverlay";
import { EntitlementBridge } from "@/components/EntitlementBridge";
import { ShipBridge } from "@/components/ShipBridge";
import { ReferralBridge } from "@/components/ReferralBridge";
import { AuthMemoryBridge } from "@/components/AuthMemoryBridge";
import { Paywall } from "@/components/Paywall";
import { ScreenshotGate } from "@/components/ScreenshotGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WebGLFallback } from "@/components/WebGLFallback";
import { isWebGLAvailable } from "@/lib/webgl";
import { featureEnabled } from "@/config/features";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Everything that reads the (swappable) dataset lives under a key={datasetVersion}
// wrapper so loading a new scientist fully remounts the 3D scene and panels,
// re-registering all object refs against the freshly rebuilt galaxy.
function GalaxyView() {
  const { datasetVersion, introFinished, canExplore, selectedObject } =
    useAppState();
  const isMobile = useIsMobile();
  // When a detail panel is open it floats over the top-LEFT on desktop, so nudge
  // the framed (camera-centered) object to the right with a cheap GPU transform
  // so the panel can never occlude the planet/sun you just selected. Mobile shows
  // the detail panel as a bottom sheet, so no horizontal nudge is needed there.
  const selectionShift =
    introFinished && !isMobile && selectedObject ? "8rem" : "0px";
  return (
    <div
      key={datasetVersion}
      className="relative h-full w-full overflow-hidden"
    >
      {canExplore ? (
        <>
          {/* The galaxy is full-bleed now that the rail is gone; only the
              selection nudge (a cheap GPU transform, no resize) shifts the framed
              object right so the top-left detail panel can't occlude it. */}
          <div
            className="absolute inset-0 will-change-transform"
            style={{
              transform: `translateX(${selectionShift})`,
              transition: "transform 450ms cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <Scene />
          </div>
          {/* 2D HUD stays put (not translated) so nothing clips off the left edge. */}
          <FlyCockpit />
          <Overlay />
          {/* The cockpit dashboard is hidden during the intro so nothing covers
              the title screen. */}
          {introFinished && <Dashboard />}
          {/* Hoisted OUT of the Overlay (z-10) subtree to a top-level sibling so
              its z-40 actually stacks ABOVE the navbar (z-30) — otherwise the
              tour card is trapped under the Overlay's stacking context and the
              navbar clips its bottom edge. Self-gates on tourActive. */}
          {introFinished && featureEnabled("guided-tour") && <TourOverlay />}
        </>
      ) : (
        // Non-member on a non-default scientist: the interactive galaxy is
        // replaced by the screenshot-only paywall gate (capture → static card +
        // Subscribe CTA). Flips back to the interactive branch the moment the
        // entitlement lands (canExplore), with no reload.
        <ScreenshotGate />
      )}
    </div>
  );
}

// The immersive galaxy — the public landing experience for everyone, signed in
// or not. The default scientist is fully free; deep exploration of OTHER
// searched scientists is gated by the paywall (see store + Paywall).
function GalaxyHome() {
  // Probe WebGL once on mount. If the browser/device can't render it, show the
  // friendly fallback instead of mounting <Canvas> (which would throw and blank
  // the page). The ErrorBoundary is the runtime safety net for everything else.
  const [webglOk] = useState(isWebGLAvailable);

  if (!webglOk) {
    return <WebGLFallback variant="no-webgl" />;
  }

  return (
    <ErrorBoundary fallback={<WebGLFallback variant="error" />}>
      <div className="w-screen h-[100dvh] bg-black text-foreground overflow-hidden relative font-sans">
        <GalaxyView />
        <DatasetLoadingOverlay />
      </div>
    </ErrorBoundary>
  );
}

// Auth is Exo Key only (see lib/auth.tsx). /sign-in and /sign-up hand off to
// Exo's hosted sign-in page; /auth/callback redeems the one-time code.
function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppStateProvider>
          <DocumentTitle />
          <EntitlementBridge />
          <ShipBridge />
          {featureEnabled("referrals") && <ReferralBridge />}
          <AuthMemoryBridge />
          <Switch>
            <Route path="/" component={GalaxyHome} />
            <Route path="/auth/callback" component={AuthCallbackPage} />
            <Route path="/sign-in/*?">
              <SignInPage mode="sign-in" />
            </Route>
            <Route path="/sign-up/*?">
              <SignInPage mode="sign-up" />
            </Route>
            <Route component={GalaxyHome} />
          </Switch>
          <Paywall />
          <Sonner theme="dark" position="top-center" richColors />
        </AppStateProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Keeps the browser tab title in sync with the active scientist, so a runtime
// dataset swap relabels the tab too (e.g. "Cosmograph - Ada Lovelace"). No
// hardcoded identity — the name comes only from the loaded snapshot.
function DocumentTitle() {
  const { activeAuthorLabel } = useAppState();
  useEffect(() => {
    document.title = activeAuthorLabel
      ? `Cosmograph - ${activeAuthorLabel}`
      : "Cosmograph";
  }, [activeAuthorLabel]);
  return null;
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}

export default App;

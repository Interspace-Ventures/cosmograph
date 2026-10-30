import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster as Sonner } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { AppStateProvider, useAppState } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";
import { Scene } from "@/components/Scene";
import { Overlay } from "@/components/Overlay";
import { TourOverlay } from "@/components/TourOverlay";
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
import { ExoConvexProvider, ExoSessionProvider, useExoSession } from "@/lib/exoSession";
import { ExoAuthCallback, ExoSignInPanel } from "@/components/ExoAuth";

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

// Dismissible shell for the auth widget: a blurred backdrop over the galaxy with
// an explicit close button, click-outside, and Escape — all navigating back to
// the galaxy so sign-in/up reads as a panel you can leave, not a dead-end
// full-screen takeover.
function AuthModal({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const close = () => setLocation("/");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={close}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-4 backdrop-blur-sm"
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={close}
          aria-label="Back to the galaxy"
          className="absolute -right-3 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-edge bg-background text-ink shadow-lg transition-colors hover:bg-white/10"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

// Everything below the auth provider. `authRoutes` are the Exo sign-in routes; `children` mount inside the query client
// (cache invalidators).
function AppShell({
  authRoutes,
  children,
}: {
  authRoutes: ReactNode[];
  children?: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <AppStateProvider>
        <DocumentTitle />
        <EntitlementBridge />
        <ShipBridge />
        {featureEnabled("referrals") && <ReferralBridge />}
        <AuthMemoryBridge />
        <Switch>
          <Route path="/" component={GalaxyHome} />
          {authRoutes}
          <Route component={GalaxyHome} />
        </Switch>
        <Paywall />
        <Sonner theme="dark" position="top-center" richColors />
      </AppStateProvider>
    </QueryClientProvider>
  );
}

// Exo Imprint (Exo Key) is the only sign-in: the standalone sign-in routes hand
// off to Exo, and /auth/callback is the redirect URI registered with Exo
// (<origin><base>/auth/callback).
function ExoSignInPage() {
  return (
    <AuthModal>
      <ExoSignInPanel mode="sign-in" />
    </AuthModal>
  );
}

function ExoSignUpPage() {
  return (
    <AuthModal>
      <ExoSignInPanel mode="sign-up" />
    </AuthModal>
  );
}

// Drop cached Express-backed queries (Ask, stars) when the signed-in Exo user
// changes, so one person never sees another's cached data.
function ExoQueryClientCacheInvalidator() {
  const { user } = useExoSession();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const userId = user?.id ?? null;
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
      queryClient.clear();
    }
    prevUserIdRef.current = userId;
  }, [userId, queryClient]);
  return null;
}

function ExoProviderWithRoutes() {
  return (
    <ExoSessionProvider>
      <ExoConvexProvider>
        <AppShell
          authRoutes={[
            <Route key="callback" path="/auth/callback" component={ExoAuthCallback} />,
            <Route key="sign-in" path="/sign-in/*?" component={ExoSignInPage} />,
            <Route key="sign-up" path="/sign-up/*?" component={ExoSignUpPage} />,
          ]}
        >
          <ExoQueryClientCacheInvalidator />
        </AppShell>
      </ExoConvexProvider>
    </ExoSessionProvider>
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
      <ExoProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;

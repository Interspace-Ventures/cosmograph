import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster as Sonner } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { clerkAppearance } from "@/lib/clerkAppearance";
import { AppStateProvider, useAppState } from "@/lib/store";
import { Scene } from "@/components/Scene";
import { Overlay } from "@/components/Overlay";
import { Sidebar } from "@/components/Sidebar";
import { FlyCockpit } from "@/components/FlyCockpit";
import { DatasetLoadingOverlay } from "@/components/DatasetLoadingOverlay";
import { EntitlementBridge } from "@/components/EntitlementBridge";
import { Paywall } from "@/components/Paywall";
import { ScreenshotGate } from "@/components/ScreenshotGate";

// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so the
// same build serves multiple Clerk custom domains. Do not inline the env var, leave
// publishableKey undefined, or replace publishableKeyFromHost with anything else.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev (Clerk hits dev FAPI directly), auto-set
// in prod. Do NOT gate on import.meta.env.PROD / NODE_ENV — the empty dev value
// is intentional, and any branching breaks the prod proxy.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Clerk passes full paths to routerPush/routerReplace, but wouter's
// setLocation prepends the base — strip it to avoid doubling.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

// Everything that reads the (swappable) dataset lives under a key={datasetVersion}
// wrapper so loading a new scientist fully remounts the 3D scene and panels,
// re-registering all object refs against the freshly rebuilt galaxy.
function GalaxyView() {
  const { datasetVersion, consoleOpen, introFinished, canExplore } =
    useAppState();
  // While the intro/title screen plays the console is hidden entirely, so the
  // galaxy isn't shifted for it. Once the intro finishes: shift by half the
  // console width when open, or by the collapsed rail width (1.75rem) when shut.
  const galaxyShift = !introFinished
    ? "0px"
    : consoleOpen
      ? "calc(min(14rem,80vw) * -0.5)"
      : "-1.75rem";
  return (
    <div key={datasetVersion} className="relative h-full w-full overflow-hidden">
      {canExplore ? (
        <>
          {/* The 3D galaxy stays full-size and slides aside with a GPU transform when
              the console expands — instead of resizing the canvas (which reallocates
              the WebGL + bloom buffers and made the shift snap). The shift recenters
              the galaxy in the space left of the console: half the console's width. */}
          <div
            className="absolute inset-0 transition-transform duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform"
            style={{ transform: `translateX(${galaxyShift})` }}
          >
            <Scene />
          </div>
          {/* 2D HUD stays put (not translated) so nothing clips off the left edge. */}
          <FlyCockpit />
          <Overlay />
          {/* Console is hidden during the intro so nothing covers the title screen. */}
          {introFinished && <Sidebar />}
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
  return (
    <div className="w-screen h-[100dvh] bg-black text-foreground overflow-hidden relative font-sans">
      <GalaxyView />
      <DatasetLoadingOverlay />
    </div>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      {/* path must be the full browser path — Clerk reads window.location.pathname directly */}
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={basePath || "/"}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={basePath || "/"}
      />
    </div>
  );
}

// Helps user's webview stay up-to-date when the signed-in user changes by invalidating the QueryClient cache.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to unlock the full galaxy",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "One account, every researcher's galaxy",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <AppStateProvider>
          <EntitlementBridge />
          <Switch>
            <Route path="/" component={GalaxyHome} />
            {/* REQUIRED — copy "/sign-in/*?" and "/sign-up/*?" verbatim. The /*? optional
                wildcard is the only wouter syntax that matches both the bare URL and Clerk's
                OAuth sub-paths. Not /sign-in, not /sign-in/*, not /sign-in/:rest*. */}
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={GalaxyHome} />
          </Switch>
          <Paywall />
          <Sonner theme="dark" position="top-center" richColors />
        </AppStateProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;

import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * True when the app is running inside an iframe (e.g. the Replit dev preview, or
 * anyone embedding cosmograph.space). OAuth providers refuse to render their
 * consent screens in an iframe, so Clerk pops them into a new tab while the bot
 * challenge stays in the embedded page — a confusing split. We sidestep it by
 * handing the whole auth flow off to a single top-level tab.
 */
function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin access throws — which only happens when we're framed.
    return true;
  }
}

/**
 * Wraps the Clerk <SignIn>/<SignUp> widget. When framed, it replaces the widget
 * with a card that opens the same auth route in a new top-level tab, so the bot
 * challenge and the OAuth redirect happen together in one window. When not
 * framed (the published app, or the preview opened in its own tab), it renders
 * the real auth widget unchanged.
 */
export function AuthHandoff({
  mode,
  bare = false,
  children,
}: {
  mode: "sign-in" | "sign-up";
  /**
   * Drop the card chrome (border, background, shadow). Use inside the cockpit
   * panel, where the panel itself is the container — a card-in-a-panel reads
   * as a redundant box-in-a-box. The standalone routes keep the card, since
   * there it's the only frame against the blurred backdrop.
   */
  bare?: boolean;
  children: ReactNode;
}) {
  const [framed] = useState(inIframe);

  if (!framed) return <>{children}</>;

  const verb = mode === "sign-in" ? "Welcome back, cosmonaut" : "Become a cosmonaut";
  // Open the full-page auth ROUTE (not window.location.href): this component now
  // also renders inside the in-app auth panel at "/", where the current URL is
  // the galaxy, not an auth page. Building the route from `mode` lands the new
  // top-level window on the real widget in both places.
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const open = () =>
    window.open(
      `${window.location.origin}${basePath}/${mode}`,
      "_blank",
      "noopener,noreferrer",
    );

  return (
    <div
      className={
        bare
          ? "w-full max-w-md py-4 text-center"
          : "w-full max-w-md rounded-none border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl backdrop-blur"
      }
    >
      <h1 className="text-xl font-semibold text-foreground">{verb}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        For your security, sign-in opens in its own window — Google and GitHub
        won&apos;t load inside an embedded preview. The whole flow finishes
        there, then you&apos;ll be signed in here too.
      </p>
      <Button onClick={open} size="lg" className="mt-6 w-full gap-2">
        <ExternalLink className="h-4 w-4" />
        Continue in a new window
      </Button>
    </div>
  );
}

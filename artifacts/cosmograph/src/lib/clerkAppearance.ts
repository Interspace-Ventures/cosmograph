import { shadcn } from "@clerk/themes";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Themed to match the galaxy's "Structured Liquidity" 2D UI: near-black glass
// surfaces, hard edges, the accent violet (#a388ee), and the app's Outfit /
// Archivo type stack so the Clerk pages feel native to Cosmograph.
export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    // Use the square brand mark (not the wide lockup): an SVG loaded as an <img>
    // can't pull in the Archivo web font, so the lockup's wordmark dropped to a
    // muddy gray fallback and the mark got squished. Clerk renders the
    // "Cosmograph" name itself, so the crisp icon completes the lockup.
    logoImageUrl: `${window.location.origin}${basePath}/logo-mark.svg`,
    // SSO first: full-width, fully-labeled provider buttons are the default
    // sign-in path; the email form follows below as the alternative. (At the
    // bottom with 4 providers Clerk compacts them into one row of truncated
    // "Ap…/Gi…/Go…" buttons you can't read — placement "top" stacks them.)
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#a388ee",
    colorForeground: "#e6e6e6",
    colorMutedForeground: "#9da0ab",
    colorDanger: "#f87171",
    colorBackground: "#1f2028",
    colorInput: "#272933",
    colorInputForeground: "#e6e6e6",
    colorNeutral: "#3c3f4b",
    fontFamily: "'Outfit', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[#1f2028] border-2 border-[#3c3f4b] w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#e6e6e6] font-display font-extrabold tracking-tight",
    headerSubtitle: "text-[#9da0ab]",
    // Force one provider per row so each block button is full-width and shows
    // its complete label ("Continue with Google") instead of being compacted
    // into a row of unreadable truncated buttons.
    socialButtons: "!grid !grid-cols-1 !gap-2",
    socialButtonsBlockButton:
      "border-2 border-[#3c3f4b] bg-white/5 hover:bg-white/10 !w-full justify-center",
    socialButtonsBlockButtonText: "text-[#e6e6e6]",
    formFieldLabel:
      "text-[#9da0ab] font-mono text-[10px] uppercase tracking-widest",
    formFieldInput:
      "bg-[#272933] border-2 border-[#3c3f4b] text-[#e6e6e6] focus:border-[#a388ee]",
    formButtonPrimary:
      "bg-[#a388ee] text-black font-display uppercase tracking-widest hover:bg-[#b59ff2]",
    footerAction: "bg-transparent",
    footerActionText: "text-[#9da0ab]",
    footerActionLink: "text-[#a388ee] hover:text-[#b59ff2]",
    dividerLine: "bg-[#3c3f4b]",
    dividerText: "text-[#9da0ab]",
    identityPreviewEditButton: "text-[#a388ee]",
    formFieldSuccessText: "text-[#a388ee]",
    alert: "border-2 border-[#3c3f4b] bg-white/5",
    alertText: "text-[#e6e6e6]",
    otpCodeFieldInput: "bg-[#272933] border-2 border-[#3c3f4b] text-[#e6e6e6]",
    logoBox: "h-9 w-9 shrink-0",
    logoImage: "h-9 w-9 object-contain",
    main: "gap-4",
  },
};

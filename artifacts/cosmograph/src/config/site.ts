import { CURRENT_VERSION } from "@/data/changelog";

export const SITE = {
  domain: "cosmograph.space",
  version: CURRENT_VERSION,
  org: {
    name: "Interspace Venture",
    url: "https://interspace.ventures",
  },
  github: {
    repo: "Interspace-Ventures/cosmograph",
    url: "https://github.com/Interspace-Ventures/cosmograph",
    sponsors: "https://github.com/sponsors/heyinterspace",
  },
} as const;

import { CURRENT_VERSION } from "@/data/changelog";

export const SITE = {
  domain: "galactic.dad",
  version: CURRENT_VERSION,
  org: {
    name: "Interspace Venture",
    url: "https://interspace.ventures",
  },
  replitUrl: "https://replit.com",
  github: {
    repo: "heyinterspace/galactic",
    url: "https://github.com/heyinterspace/galactic",
    sponsors: "https://github.com/sponsors/heyinterspace",
  },
} as const;

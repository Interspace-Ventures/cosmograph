import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  ReactNode,
} from "react";
import {
  Filters,
  makeDefaultFilters,
  applyDataset,
  galaxyData,
  isDefaultAuthor,
  DEFAULT_AUTHOR_ID,
} from "@/data/galaxy";
import { buildGalaxyData } from "@/data/buildGalaxy";
import {
  fetchAuthor,
  fetchAuthorWorks,
  type AuthorCandidate,
} from "@/lib/openalex";
import { rebuildLayout } from "@/components/GalaxySystem";
import { readAuthorParam, writeAuthorParam } from "@/lib/authorUrl";
import { getSelfSeed, setSelfSeed, randomSeed } from "@/lib/shipLook";

export type DatasetStatus = "idle" | "loading" | "ready" | "error";

export type CameraMode = "god" | "spaceship";

// The entitlement snapshot pushed in from the server (EntitlementBridge): whether
// the account is an active member, which researchers it has unlocked, and how many
// unlocks the base membership includes.
export type EntitlementState = {
  entitled: boolean;
  unlocked: string[];
  includedSlots: number;
};

export type SelectedObject = {
  type: "sun" | "planet";
  id: string;
} | null;

export type HoveredObject = {
  type: "sun" | "planet";
  id: string;
  name: string;
} | null;

interface AppState {
  introFinished: boolean;
  setIntroFinished: (val: boolean) => void;
  introStarted: boolean;
  setIntroStarted: (val: boolean) => void;
  replayIntro: () => void;
  forgetIntro: () => void;
  introProgressRef: React.MutableRefObject<number>;
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;
  showSelfShip: boolean;
  setShowSelfShip: (val: boolean) => void;
  // The viewer's own ship-look seed. Derived deterministically into a ship in
  // shipLook.ts, broadcast over presence so others see this exact craft, and —
  // for signed-in accounts — persisted server-side (savedShipSeed) so it follows
  // across devices. Defaults to the per-browser local seed.
  shipSeed: string;
  setShipSeed: (seed: string) => void;
  shuffleShip: () => void;
  // The seed the server has on file for the signed-in account (null = none / not
  // signed in). When it differs from shipSeed there are unsaved changes.
  savedShipSeed: string | null;
  setSavedShipSeed: (seed: string | null) => void;
  selectedObject: SelectedObject;
  setSelectedObject: (obj: SelectedObject) => void;
  hoveredObject: HoveredObject;
  setHoveredObject: (obj: HoveredObject) => void;
  galaxyTilt: number;
  setGalaxyTilt: (val: number) => void;
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  tourActive: boolean;
  tourStopIndex: number;
  startTour: () => void;
  endTour: () => void;
  setTourStopIndex: (i: number) => void;
  // Entitlement / paywall. The default baked researcher is always free; deep
  // exploration (fly, tour, rich planet detail) of any OTHER searched researcher
  // requires an active membership (entitled) AND that researcher to be in the
  // account's unlocked set. The base membership includes `includedSlots`
  // researchers; each beyond that adds a prorated +$1/year add-on.
  entitled: boolean;
  unlockedAuthors: string[];
  includedSlots: number;
  setEntitlement: (e: EntitlementState) => void;
  isDefaultScientist: boolean;
  canExplore: boolean;
  paywallOpen: boolean;
  setPaywallOpen: (val: boolean) => void;
  infoOpen: boolean;
  setInfoOpen: (val: boolean) => void;
  askOpen: boolean;
  setAskOpen: (val: boolean) => void;
  infoTab: "about" | "log";
  setInfoTab: (tab: "about" | "log") => void;
  customizeOpen: boolean;
  setCustomizeOpen: (val: boolean) => void;
  // The slim top "deal" banner: shown to non-members until dismissed (persisted).
  showDealBanner: boolean;
  dismissDealBanner: () => void;
  // Height (px) of the active top notification banner, or 0 when none. The
  // BannerHost publishes this so the header chrome can slide down to make room
  // (iPhone-style push, not an overlay toast).
  bannerHeight: number;
  setBannerHeight: (h: number) => void;
  // Width (px) of the cockpit Dashboard bar, published by the Dashboard via a
  // ResizeObserver so the rich panels (Drawer) can match the navbar width.
  cockpitWidth: number;
  setCockpitWidth: (w: number) => void;
  // Right-hand "Mission Control" expanded vs collapsed-to-rail. Lifted to the store
  // so the galaxy can slide aside (GPU transform) in sync with the console width.
  consoleOpen: boolean;
  setConsoleOpen: (val: boolean) => void;
  // Live dataset switching: load any scientist from OpenAlex at runtime.
  datasetVersion: number;
  datasetStatus: DatasetStatus;
  datasetError: string | null;
  loadProgress: { fetched: number; total: number } | null;
  // For the gated (non-member) path: the unified loading overlay stays up while
  // ScreenshotGate captures the preview, so there's a single continuous load
  // instead of a second in-panel spinner. ScreenshotGate flips this true once
  // its capture settles; loadAuthor resets it false at the start of every load.
  previewReady: boolean;
  setPreviewReady: (v: boolean) => void;
  activeAuthorLabel: string;
  activeAuthorId: string | null;
  loadAuthor: (target: string | AuthorCandidate) => Promise<void>;
  dismissDatasetError: () => void;
}

const AppStateContext = createContext<AppState | undefined>(undefined);

const INTRO_SEEN_KEY = "cosmograph:introSeen";
const SHOW_SELF_SHIP_KEY = "cosmograph:showSelfShip";
const DEAL_DISMISSED_KEY = "cosmograph:dealDismissed";

function readDealDismissed(): boolean {
  try {
    return localStorage.getItem(DEAL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function readIntroSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // ignore (private mode / storage disabled)
  }
}

function clearIntroSeen() {
  try {
    localStorage.removeItem(INTRO_SEEN_KEY);
  } catch {
    // ignore (private mode / storage disabled)
  }
}

// Phones (narrow viewports) keep the console as a collapsed rail by default so
// the expanded panel doesn't cover most of the screen. Read at call time so it
// reflects the live viewport without a resize listener.
function isCompactViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const introSeen = readIntroSeen();
  const [introFinished, setIntroFinishedState] = useState(introSeen);
  const [introStarted, setIntroStarted] = useState(false);
  const introProgressRef = useRef(introSeen ? 1 : 0);
  // Console starts collapsed while the intro/title screen plays so it never
  // covers it; it auto-opens once the intro finishes. Returning visitors (intro
  // already seen) get the console open immediately — except on phones, where the
  // expanded panel would cover most of the narrow screen, so it stays a rail.
  const [consoleOpen, setConsoleOpen] = useState(
    introSeen && !isCompactViewport(),
  );

  const setIntroFinished = useCallback((val: boolean) => {
    if (val) writeIntroSeen();
    setIntroFinishedState(val);
    if (val && !isCompactViewport()) setConsoleOpen(true);
  }, []);

  const replayIntro = useCallback(() => {
    introProgressRef.current = 0;
    setIntroStarted(false);
    setIntroFinishedState(false);
    setConsoleOpen(false);
    setInfoOpen(false);
    setCustomizeOpen(false);
  }, []);

  const forgetIntro = useCallback(() => {
    clearIntroSeen();
    introProgressRef.current = 0;
    setIntroStarted(false);
    setIntroFinishedState(false);
    setConsoleOpen(false);
    setInfoOpen(false);
    setCustomizeOpen(false);
  }, []);
  const [cameraMode, setCameraModeState] = useState<CameraMode>("god");
  // Whether the viewer's own (faint) chase ship is drawn in Orbit view. Persisted
  // per-browser so the preference sticks across visits.
  const [showSelfShip, setShowSelfShipState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHOW_SELF_SHIP_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setShowSelfShip = useCallback((val: boolean) => {
    setShowSelfShipState(val);
    try {
      localStorage.setItem(SHOW_SELF_SHIP_KEY, val ? "1" : "0");
    } catch {
      /* ignore storage failures (private mode, etc.) */
    }
  }, []);
  // Own ship-look seed: starts from the per-browser local default. ShipBridge
  // overrides it with a signed-in account's saved seed once it loads.
  const [shipSeed, setShipSeedState] = useState<string>(() => getSelfSeed());
  const [savedShipSeed, setSavedShipSeed] = useState<string | null>(null);
  const setShipSeed = useCallback((seed: string) => {
    setShipSeedState(seed);
    setSelfSeed(seed); // keep the local default in sync so it sticks per-browser
  }, []);
  const shuffleShip = useCallback(() => {
    setShipSeed(randomSeed());
  }, [setShipSeed]);
  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);
  const [hoveredObject, setHoveredObject] = useState<HoveredObject>(null);
  const [galaxyTilt, setGalaxyTilt] = useState<number>(0);
  const [filters, setFiltersState] = useState<Filters>(makeDefaultFilters);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(makeDefaultFilters());
  }, []);

  const [tourActive, setTourActive] = useState(false);
  const [tourStopIndex, setTourStopIndex] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<"about" | "log">("about");
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Drawers (info / ask / customize) are mutually exclusive: opening any one
  // closes the others so only a single panel is ever open at a time. The
  // exclusive setters below replace the raw useState setters in the context value
  // (the raw ones stay for internal "close all" use in replay/forget intro).
  const openDrawer = useCallback(
    (target: "info" | "ask" | "customize" | null) => {
      setInfoOpen(target === "info");
      setAskOpen(target === "ask");
      setCustomizeOpen(target === "customize");
    },
    [],
  );
  const setInfoOpenExclusive = useCallback(
    (v: boolean) => openDrawer(v ? "info" : null),
    [openDrawer],
  );
  const setAskOpenExclusive = useCallback(
    (v: boolean) => openDrawer(v ? "ask" : null),
    [openDrawer],
  );
  const setCustomizeOpenExclusive = useCallback(
    (v: boolean) => openDrawer(v ? "customize" : null),
    [openDrawer],
  );

  // Entitlement: membership (entitled) + the set of researchers this account has
  // unlocked. Mirrored into refs so the gated handlers below read current values
  // without a stale closure.
  const [entitled, setEntitledState] = useState(false);
  const [unlockedAuthors, setUnlockedAuthorsState] = useState<string[]>([]);
  const [includedSlots, setIncludedSlots] = useState(3);
  const entitledRef = useRef(false);
  const unlockedRef = useRef<string[]>([]);
  const setEntitlement = useCallback((e: EntitlementState) => {
    entitledRef.current = e.entitled;
    unlockedRef.current = e.unlocked;
    setEntitledState(e.entitled);
    setUnlockedAuthorsState(e.unlocked);
    setIncludedSlots(e.includedSlots);
  }, []);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Slim top "deal" banner. Shown to non-members until dismissed; the dismissal
  // is persisted so it never nags a returning visitor.
  const [dealDismissed, setDealDismissed] = useState(readDealDismissed);
  const dismissDealBanner = useCallback(() => {
    setDealDismissed(true);
    try {
      localStorage.setItem(DEAL_DISMISSED_KEY, "1");
    } catch {
      // ignore (private mode / storage disabled)
    }
  }, []);
  const showDealBanner = !dealDismissed && !entitled;

  // Published by the BannerHost: how far the header chrome should slide down to
  // make room for the active top notification banner.
  const [bannerHeight, setBannerHeight] = useState(0);

  // Published by the Dashboard: the cockpit bar's measured width, so the rich
  // panels can render exactly as wide as the navbar.
  const [cockpitWidth, setCockpitWidth] = useState(0);

  // Live gate check for handlers: free on the default researcher, otherwise the
  // active researcher must be a member-unlocked one. Reads galaxyData live
  // (mutable binding) + the entitlement refs.
  const canExploreNow = useCallback(() => {
    if (isDefaultAuthor()) return true;
    const id = galaxyData.author.openAlexId;
    return !!id && entitledRef.current && unlockedRef.current.includes(id);
  }, []);

  const [datasetVersion, setDatasetVersion] = useState(0);
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatus>("idle");
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<{
    fetched: number;
    total: number;
  } | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [activeAuthorLabel, setActiveAuthorLabel] = useState<string>(
    galaxyData.author.name,
  );
  const [activeAuthorId, setActiveAuthorId] = useState<string | null>(
    galaxyData.author.openAlexId ?? null,
  );
  // Monotonic request id so a superseded (older) load can't clobber a newer one.
  const loadReqRef = useRef(0);

  // Fetch a scientist live from OpenAlex, re-derive the whole galaxy, rebuild the
  // 3D layout, reset any view state tied to the old dataset, and bump
  // datasetVersion so the data tree remounts cleanly (see key={datasetVersion}).
  const loadAuthor = useCallback(async (target: string | AuthorCandidate) => {
    const reqId = ++loadReqRef.current;
    const id = typeof target === "string" ? target : target.id;
    setDatasetStatus("loading");
    setDatasetError(null);
    setLoadProgress({ fetched: 0, total: 0 });
    setPreviewReady(false);
    try {
      const rawAuthor = await fetchAuthor(id);
      const rawWorks = await fetchAuthorWorks(id, (fetched, total) => {
        if (loadReqRef.current === reqId) setLoadProgress({ fetched, total });
      });
      if (loadReqRef.current !== reqId) return; // superseded by a newer load
      const data = buildGalaxyData(rawAuthor, rawWorks);
      applyDataset(data);
      rebuildLayout();
      // Drop any selection/hover/tour/filters that referenced the old galaxy.
      setSelectedObject(null);
      setHoveredObject(null);
      setTourActive(false);
      setTourStopIndex(0);
      setCameraModeState("god");
      setFiltersState(makeDefaultFilters());
      setActiveAuthorLabel(data.author.name);
      const loadedId = data.author.openAlexId ?? id;
      setActiveAuthorId(loadedId);
      // Keep the URL in sync so a reload (or the Stripe round-trip) restores this
      // scientist. The default scientist clears the param for a clean home URL.
      writeAuthorParam(loadedId === DEFAULT_AUTHOR_ID ? null : loadedId);
      setDatasetVersion((v) => v + 1);
      setDatasetStatus("ready");
      setLoadProgress(null);
    } catch (err) {
      if (loadReqRef.current !== reqId) return;
      setDatasetStatus("error");
      const status = (err as { status?: number })?.status;
      setDatasetError(
        status === 429
          ? "OpenAlex is rate-limiting requests right now — please try again in a little while."
          : err instanceof Error
            ? err.message
            : "Could not load this researcher from OpenAlex.",
      );
      setLoadProgress(null);
    }
  }, []);

  const dismissDatasetError = useCallback(() => {
    loadReqRef.current++; // invalidate any in-flight load
    setDatasetStatus("idle");
    setDatasetError(null);
    setLoadProgress(null);
  }, []);

  // On first load, restore the scientist named in the URL (?author=A123). This
  // covers a plain reload/shared link AND the return from Stripe Checkout, which
  // redirects back to the app's base URL and would otherwise drop the user on
  // the default home scientist instead of the one they just paid to unlock.
  useEffect(() => {
    const requested = readAuthorParam();
    if (requested && requested !== DEFAULT_AUTHOR_ID) {
      void loadAuthor(requested);
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gated camera switch: only "spaceship" (fly) is paywalled — "god"/orbit is
  // always free. Reads the gate live so it stays correct after a dataset swap.
  const setCameraMode = useCallback(
    (mode: CameraMode) => {
      if (mode === "spaceship" && !canExploreNow()) {
        setPaywallOpen(true);
        return;
      }
      setCameraModeState(mode);
    },
    [canExploreNow],
  );

  const startTour = useCallback(() => {
    if (!canExploreNow()) {
      setPaywallOpen(true);
      return;
    }
    setSelectedObject(null);
    setCameraModeState("god");
    setTourStopIndex(0);
    setTourActive(true);
  }, [canExploreNow]);

  const endTour = () => {
    setTourActive(false);
  };

  // Render-time gate flags. isDefaultScientist recomputes on a dataset swap
  // (datasetVersion bumps after applyDataset), and canExplore folds in entitled.
  const isDefaultScientist = useMemo(
    () => isDefaultAuthor(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datasetVersion],
  );
  const canExplore = useMemo(() => {
    if (isDefaultScientist) return true;
    return (
      !!activeAuthorId && entitled && unlockedAuthors.includes(activeAuthorId)
    );
  }, [isDefaultScientist, entitled, unlockedAuthors, activeAuthorId]);

  return (
    <AppStateContext.Provider
      value={{
        introFinished,
        setIntroFinished,
        introStarted,
        setIntroStarted,
        replayIntro,
        forgetIntro,
        introProgressRef,
        cameraMode,
        setCameraMode,
        showSelfShip,
        setShowSelfShip,
        shipSeed,
        setShipSeed,
        shuffleShip,
        savedShipSeed,
        setSavedShipSeed,
        selectedObject,
        setSelectedObject,
        hoveredObject,
        setHoveredObject,
        galaxyTilt,
        setGalaxyTilt,
        filters,
        setFilters,
        resetFilters,
        tourActive,
        tourStopIndex,
        startTour,
        endTour,
        setTourStopIndex,
        entitled,
        unlockedAuthors,
        includedSlots,
        setEntitlement,
        isDefaultScientist,
        canExplore,
        paywallOpen,
        setPaywallOpen,
        infoOpen,
        setInfoOpen: setInfoOpenExclusive,
        askOpen,
        setAskOpen: setAskOpenExclusive,
        infoTab,
        setInfoTab,
        customizeOpen,
        setCustomizeOpen: setCustomizeOpenExclusive,
        showDealBanner,
        dismissDealBanner,
        bannerHeight,
        setBannerHeight,
        cockpitWidth,
        setCockpitWidth,
        consoleOpen,
        setConsoleOpen,
        datasetVersion,
        datasetStatus,
        datasetError,
        loadProgress,
        previewReady,
        setPreviewReady,
        activeAuthorLabel,
        activeAuthorId,
        loadAuthor,
        dismissDatasetError,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}

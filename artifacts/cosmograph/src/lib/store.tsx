import React, { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect, ReactNode } from 'react';
import { Filters, makeDefaultFilters, applyDataset, galaxyData, isDefaultAuthor, DEFAULT_AUTHOR_ID } from '@/data/galaxy';
import { buildGalaxyData } from '@/data/buildGalaxy';
import { fetchAuthor, fetchAuthorWorks, type AuthorCandidate } from '@/lib/openalex';
import { rebuildLayout } from '@/components/GalaxySystem';
import { readAuthorParam, writeAuthorParam } from '@/lib/authorUrl';

export type DatasetStatus = 'idle' | 'loading' | 'ready' | 'error';

export type CameraMode = 'god' | 'spaceship';

export type SelectedObject = {
  type: 'sun' | 'planet';
  id: string;
} | null;

export type HoveredObject = {
  type: 'sun' | 'planet';
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
  // Entitlement / paywall. The default baked scientist is always free; deep
  // exploration (fly, tour, rich planet detail) of any OTHER searched scientist
  // requires the one-time global account unlock (entitled).
  entitled: boolean;
  setEntitlement: (val: boolean) => void;
  isDefaultScientist: boolean;
  canExplore: boolean;
  paywallOpen: boolean;
  setPaywallOpen: (val: boolean) => void;
  infoOpen: boolean;
  setInfoOpen: (val: boolean) => void;
  askOpen: boolean;
  setAskOpen: (val: boolean) => void;
  changelogOpen: boolean;
  setChangelogOpen: (val: boolean) => void;
  customizeOpen: boolean;
  setCustomizeOpen: (val: boolean) => void;
  // Right-hand "Mission Control" expanded vs collapsed-to-rail. Lifted to the store
  // so the galaxy can slide aside (GPU transform) in sync with the console width.
  consoleOpen: boolean;
  setConsoleOpen: (val: boolean) => void;
  // Live dataset switching: load any scientist from OpenAlex at runtime.
  datasetVersion: number;
  datasetStatus: DatasetStatus;
  datasetError: string | null;
  loadProgress: { fetched: number; total: number } | null;
  activeAuthorLabel: string;
  activeAuthorId: string | null;
  loadAuthor: (target: string | AuthorCandidate) => Promise<void>;
  dismissDatasetError: () => void;
}

const AppStateContext = createContext<AppState | undefined>(undefined);

const INTRO_SEEN_KEY = 'cosmograph:introSeen';

function readIntroSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
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

export function AppStateProvider({ children }: { children: ReactNode }) {
  const introSeen = readIntroSeen();
  const [introFinished, setIntroFinishedState] = useState(introSeen);
  const [introStarted, setIntroStarted] = useState(false);
  const introProgressRef = useRef(introSeen ? 1 : 0);
  // Console starts collapsed while the intro/title screen plays so it never
  // covers it; it auto-opens once the intro finishes. Returning visitors (intro
  // already seen) get the console open immediately.
  const [consoleOpen, setConsoleOpen] = useState(introSeen);

  const setIntroFinished = useCallback((val: boolean) => {
    if (val) writeIntroSeen();
    setIntroFinishedState(val);
    if (val) setConsoleOpen(true);
  }, []);

  const replayIntro = useCallback(() => {
    introProgressRef.current = 0;
    setIntroStarted(false);
    setIntroFinishedState(false);
    setConsoleOpen(false);
    setInfoOpen(false);
    setChangelogOpen(false);
    setCustomizeOpen(false);
  }, []);

  const forgetIntro = useCallback(() => {
    clearIntroSeen();
    introProgressRef.current = 0;
    setIntroStarted(false);
    setIntroFinishedState(false);
    setConsoleOpen(false);
    setInfoOpen(false);
    setChangelogOpen(false);
    setCustomizeOpen(false);
  }, []);
  const [cameraMode, setCameraModeState] = useState<CameraMode>('god');
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
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Entitlement: the one-time global account unlock. Mirrored into a ref so the
  // gated handlers below read the current value without a stale closure.
  const [entitled, setEntitledState] = useState(false);
  const entitledRef = useRef(false);
  const setEntitlement = useCallback((val: boolean) => {
    entitledRef.current = val;
    setEntitledState(val);
  }, []);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Live gate check for handlers: free on the default scientist, otherwise needs
  // the unlock. Reads galaxyData live (mutable binding) + the entitlement ref.
  const canExploreNow = useCallback(
    () => isDefaultAuthor() || entitledRef.current,
    [],
  );

  const [datasetVersion, setDatasetVersion] = useState(0);
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatus>('idle');
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [activeAuthorLabel, setActiveAuthorLabel] = useState<string>(galaxyData.author.name);
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
    const id = typeof target === 'string' ? target : target.id;
    setDatasetStatus('loading');
    setDatasetError(null);
    setLoadProgress({ fetched: 0, total: 0 });
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
      setCameraModeState('god');
      setFiltersState(makeDefaultFilters());
      setActiveAuthorLabel(data.author.name);
      const loadedId = data.author.openAlexId ?? id;
      setActiveAuthorId(loadedId);
      // Keep the URL in sync so a reload (or the Stripe round-trip) restores this
      // scientist. The default scientist clears the param for a clean home URL.
      writeAuthorParam(loadedId === DEFAULT_AUTHOR_ID ? null : loadedId);
      setDatasetVersion((v) => v + 1);
      setDatasetStatus('ready');
      setLoadProgress(null);
    } catch (err) {
      if (loadReqRef.current !== reqId) return;
      setDatasetStatus('error');
      const status = (err as { status?: number })?.status;
      setDatasetError(
        status === 429
          ? 'OpenAlex is rate-limiting requests right now — please try again in a little while.'
          : err instanceof Error
            ? err.message
            : 'Could not load this researcher from OpenAlex.',
      );
      setLoadProgress(null);
    }
  }, []);

  const dismissDatasetError = useCallback(() => {
    loadReqRef.current++; // invalidate any in-flight load
    setDatasetStatus('idle');
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
      if (mode === 'spaceship' && !canExploreNow()) {
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
    setCameraModeState('god');
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
  const canExplore = useMemo(
    () => isDefaultScientist || entitled,
    [isDefaultScientist, entitled],
  );

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
        setEntitlement,
        isDefaultScientist,
        canExplore,
        paywallOpen,
        setPaywallOpen,
        infoOpen,
        setInfoOpen,
        askOpen,
        setAskOpen,
        changelogOpen,
        setChangelogOpen,
        customizeOpen,
        setCustomizeOpen,
        consoleOpen,
        setConsoleOpen,
        datasetVersion,
        datasetStatus,
        datasetError,
        loadProgress,
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
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}

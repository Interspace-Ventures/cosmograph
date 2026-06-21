import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { Filters, defaultFilters, applyDataset, galaxyData } from '@/data/galaxy';
import { buildGalaxyData } from '@/data/buildGalaxy';
import { fetchAuthor, fetchAuthorWorks, type AuthorCandidate } from '@/lib/openalex';
import { rebuildLayout } from '@/components/GalaxySystem';

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
  searchActive: boolean;
  setSearchActive: (val: boolean) => void;
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
  infoOpen: boolean;
  setInfoOpen: (val: boolean) => void;
  changelogOpen: boolean;
  setChangelogOpen: (val: boolean) => void;
  // Live dataset switching: load any scientist from OpenAlex at runtime.
  datasetVersion: number;
  datasetStatus: DatasetStatus;
  datasetError: string | null;
  loadProgress: { fetched: number; total: number } | null;
  activeAuthorLabel: string;
  loadAuthor: (target: string | AuthorCandidate) => Promise<void>;
  dismissDatasetError: () => void;
}

const AppStateContext = createContext<AppState | undefined>(undefined);

const INTRO_SEEN_KEY = 'galactic:introSeen';

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

  const setIntroFinished = useCallback((val: boolean) => {
    if (val) writeIntroSeen();
    setIntroFinishedState(val);
  }, []);

  const replayIntro = useCallback(() => {
    introProgressRef.current = 0;
    setIntroStarted(false);
    setIntroFinishedState(false);
    setInfoOpen(false);
    setChangelogOpen(false);
  }, []);

  const forgetIntro = useCallback(() => {
    clearIntroSeen();
    introProgressRef.current = 0;
    setIntroStarted(false);
    setIntroFinishedState(false);
    setInfoOpen(false);
    setChangelogOpen(false);
  }, []);
  const [cameraMode, setCameraMode] = useState<CameraMode>('god');
  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);
  const [hoveredObject, setHoveredObject] = useState<HoveredObject>(null);
  const [searchActive, setSearchActive] = useState<boolean>(false);
  const [galaxyTilt, setGalaxyTilt] = useState<number>(0);
  const [filters, setFiltersState] = useState<Filters>(defaultFilters);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(defaultFilters);
  }, []);

  const [tourActive, setTourActive] = useState(false);
  const [tourStopIndex, setTourStopIndex] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  const [datasetVersion, setDatasetVersion] = useState(0);
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatus>('idle');
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [activeAuthorLabel, setActiveAuthorLabel] = useState<string>(galaxyData.author.name);
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
      setSearchActive(false);
      setTourActive(false);
      setTourStopIndex(0);
      setCameraMode('god');
      setFiltersState(defaultFilters);
      setActiveAuthorLabel(data.author.name);
      setDatasetVersion((v) => v + 1);
      setDatasetStatus('ready');
      setLoadProgress(null);
    } catch (err) {
      if (loadReqRef.current !== reqId) return;
      setDatasetStatus('error');
      setDatasetError(
        err instanceof Error ? err.message : 'Could not load this scientist from OpenAlex.',
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

  const startTour = () => {
    setSelectedObject(null);
    setCameraMode('god');
    setTourStopIndex(0);
    setTourActive(true);
  };

  const endTour = () => {
    setTourActive(false);
  };

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
        searchActive,
        setSearchActive,
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
        infoOpen,
        setInfoOpen,
        changelogOpen,
        setChangelogOpen,
        datasetVersion,
        datasetStatus,
        datasetError,
        loadProgress,
        activeAuthorLabel,
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

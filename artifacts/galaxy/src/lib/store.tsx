import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { Filters, defaultFilters } from '@/data/galaxy';

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
  }, []);

  const forgetIntro = useCallback(() => {
    clearIntroSeen();
    introProgressRef.current = 0;
    setIntroStarted(false);
    setIntroFinishedState(false);
    setInfoOpen(false);
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

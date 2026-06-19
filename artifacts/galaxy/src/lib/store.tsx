import React, { createContext, useContext, useState, ReactNode } from 'react';

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
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;
  selectedObject: SelectedObject;
  setSelectedObject: (obj: SelectedObject) => void;
  hoveredObject: HoveredObject;
  setHoveredObject: (obj: HoveredObject) => void;
  galaxyTilt: number;
  setGalaxyTilt: (val: number) => void;
}

const AppStateContext = createContext<AppState | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [introFinished, setIntroFinished] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('god');
  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);
  const [hoveredObject, setHoveredObject] = useState<HoveredObject>(null);
  const [galaxyTilt, setGalaxyTilt] = useState<number>(0);

  return (
    <AppStateContext.Provider
      value={{
        introFinished,
        setIntroFinished,
        cameraMode,
        setCameraMode,
        selectedObject,
        setSelectedObject,
        hoveredObject,
        setHoveredObject,
        galaxyTilt,
        setGalaxyTilt,
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

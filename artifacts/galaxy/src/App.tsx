import { AppStateProvider, useAppState } from "@/lib/store";
import { Scene } from "@/components/Scene";
import { Overlay } from "@/components/Overlay";
import { FlyCockpit } from "@/components/FlyCockpit";
import { DatasetLoadingOverlay } from "@/components/DatasetLoadingOverlay";

// Everything that reads the (swappable) dataset lives under a key={datasetVersion}
// wrapper so loading a new scientist fully remounts the 3D scene and panels,
// re-registering all object refs against the freshly rebuilt galaxy.
function GalaxyView() {
  const { datasetVersion } = useAppState();
  return (
    <div key={datasetVersion} className="contents">
      <Scene />
      <FlyCockpit />
      <Overlay />
    </div>
  );
}

function App() {
  return (
    <AppStateProvider>
      <div className="w-screen h-[100dvh] bg-black text-foreground overflow-hidden relative font-sans">
        <GalaxyView />
        <DatasetLoadingOverlay />
      </div>
    </AppStateProvider>
  );
}

export default App;

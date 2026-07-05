import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

// Total lengths must be strictly less than the 6000ms generated video assets to prevent looping
export const SCENE_DURATIONS = {
  intro: 4500,
  concept: 5500,
  fly: 5500,
  details: 5500,
  stats: 5500,
  outro: 5000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  intro: Scene1,
  concept: Scene2,
  fly: Scene3,
  details: Scene4,
  stats: Scene5,
  outro: Scene6,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#08080e] text-[#f3f4f8] font-sans">
      {/* Persistent space background elements */}
      <div className="absolute inset-0 z-0 opacity-40">
        <motion.div
          className="absolute w-[80vw] h-[80vw] rounded-full blur-[120px] top-[-20%] left-[-20%]"
          style={{ background: 'radial-gradient(circle, rgba(163,136,238,0.15), transparent)' }}
          animate={{ x: ['0%', '10%', '0%'], scale: [1, 1.1, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[60vw] h-[60vw] rounded-full blur-[100px] bottom-[-10%] right-[-10%]"
          style={{ background: 'radial-gradient(circle, rgba(31,32,40,0.5), transparent)' }}
          animate={{ x: ['0%', '-5%', '0%'], scale: [1, 1.05, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}

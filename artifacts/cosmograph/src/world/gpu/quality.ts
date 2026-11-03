// Adaptive quality for the GPU world. Frame time is measured every frame (an
// exponential average over ~half a second); when it stays slow the world sheds
// cost in steps, cheapest-to-lose first, and earns it back once frames are fast
// again for a few seconds:
//
//   3  full      : flipbooks play, auras pulse, canvas at up to 2x device px
//   2  calm      : flipbooks hold their rest frame, auras still, canvas 1.5x max
//   1  lean      : no sprites (the pyramid shows machines at rest), canvas 1x,
//                  ground one level coarser, one live machine at a time
//   0  minimal   : as lean, canvas at 0.75x
//
// prefers-reduced-motion pins motion off at every level.

export interface QualitySettings {
  level: number;
  anim: boolean;
  pulse: boolean;
  sprites: boolean;
  /** canvas px per CSS px */
  scale: number;
  /** pyramid resolution bias (1 = matched to the canvas) */
  bias: number;
  /** live machines allowed at once (multiplier on the running cap) */
  liveCap: number | null;
}

export class Quality {
  level = 3;
  private ema = 1000 / 60;
  private slowFor = 0;
  private fastFor = 0;
  private last = 0;
  readonly reduced: boolean;
  /** frames per second the device should hold before quality drops */
  constructor(
    private dpr: number,
    private target = 40,
    reduced = false,
    /** lowest level adaptation may reach; also forced by #q= */
    private pinned: number | null = null,
  ) {
    this.reduced = reduced;
    if (pinned !== null) this.level = pinned;
  }

  /** Feed a frame timestamp; returns true when the level changed. */
  frame(t: number): boolean {
    const dt = this.last ? Math.min(250, t - this.last) : 16.7;
    this.last = t;
    this.ema += (dt - this.ema) * 0.08;
    if (this.pinned !== null) return false;
    const fps = 1000 / this.ema;
    if (fps < this.target) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (fps > Math.max(55, this.target + 12)) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = Math.max(0, this.slowFor - dt);
      this.fastFor = 0;
    }
    if (this.slowFor > 900 && this.level > 0) {
      this.level--;
      this.slowFor = 0;
      this.ema = 1000 / this.target; // give the new level a fair start
      return true;
    }
    if (this.fastFor > 4000 && this.level < 3) {
      this.level++;
      this.fastFor = 0;
      return true;
    }
    return false;
  }

  /** a camera jump (fly-to, tap) is not a slow device: don't count it */
  forgive() {
    this.slowFor = 0;
  }

  get fps(): number {
    return 1000 / this.ema;
  }

  get settings(): QualitySettings {
    const L = this.level;
    const d = this.dpr;
    return {
      level: L,
      anim: L >= 3 && !this.reduced,
      pulse: L >= 3 && !this.reduced,
      sprites: L >= 2,
      scale: L >= 3 ? Math.min(d, 2) : L === 2 ? Math.min(d, 1.5) : L === 1 ? Math.min(d, 1) : Math.min(d, 0.75),
      bias: L >= 2 ? 1 : 0.5,
      liveCap: L >= 2 ? null : 1,
    };
  }
}

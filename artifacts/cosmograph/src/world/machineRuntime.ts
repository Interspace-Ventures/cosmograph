// Live machines. Each machine is a static ES module under public/world/machines/
// (generated from the approved mockup) that exports its rest-state svg and a
// mount(document) which runs the machine's own script against a document shim
// scoped to that machine's group. The group travels with the machine when it is
// lifted, so the script keeps working while enlarged.

export interface MachineModule {
  svg: string;
  mount: (doc: ScopedDocument) => void;
}

export interface ScopedDocument {
  querySelector: (s: string) => Element | null;
  querySelectorAll: (s: string) => NodeListOf<Element>;
  createElementNS: typeof document.createElementNS;
}

export interface MachineHook {
  startTest: (mode?: number) => void;
  readonly u: number;
}

const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
export const machineUrl = (slug: string) => `${base}world/machines/${slug}.js`;
export const thumbUrl = (slug: string) => `${base}world/thumbs/${slug}.webp`;

const cache = new Map<string, Promise<MachineModule>>();

export function loadMachine(slug: string): Promise<MachineModule> {
  let p = cache.get(slug);
  if (!p) {
    p = import(/* @vite-ignore */ machineUrl(slug)) as Promise<MachineModule>;
    p.catch(() => cache.delete(slug));
    cache.set(slug, p);
  }
  return p;
}

export type LiveState = "loading" | "ready" | "error";

export interface LiveMachine {
  state: LiveState;
  statusEl: HTMLElement | null;
  hook: () => MachineHook | undefined;
}

/**
 * Swap the machine's thumbnail for its live svg and run its script.
 * `holder` is the machine's own <g>; `stub` is a hidden element that receives the
 * machine's button / status / readout nodes (the machine page's own controls).
 */
export async function mountLive(
  holder: SVGGElement,
  stub: HTMLElement,
  m: { slug: string; hook: string; status: string; button: string },
): Promise<LiveMachine> {
  const mod = await loadMachine(m.slug);
  holder.innerHTML = mod.svg;
  stub.innerHTML = "";
  const btn = document.createElement("button");
  btn.className = m.button;
  const st = document.createElement("p");
  st.className = m.status;
  const ro = document.createElement("span");
  ro.setAttribute("data-readout", "");
  stub.append(btn, st, ro);
  const scoped: ScopedDocument = {
    querySelector: (s) => (s === ".iso-stage" ? holder : stub.querySelector(s) || holder.querySelector(s)),
    querySelectorAll: (s) => holder.querySelectorAll(s),
    createElementNS: ((...a: Parameters<typeof document.createElementNS>) =>
      document.createElementNS(...a)) as typeof document.createElementNS,
  };
  mod.mount(scoped);
  const hookName = m.hook.replace(/^__/, "");
  const w = window as unknown as Record<string, MachineHook | undefined>;
  return {
    state: "ready",
    statusEl: st,
    hook: () => w[`__${hookName}`],
  };
}

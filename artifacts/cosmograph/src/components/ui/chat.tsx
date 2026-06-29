import { useState, type ReactNode } from "react";
import { ChevronRight, Bug, Lightbulb } from "lucide-react";

// Chat primitives for "Ask Cosmos", reskinned in Structured Glass (square edges,
// border-edge / ink / accent tokens) rather than shadcn's rounded chat look.

// A user or assistant message row. User messages sit right with an accent wash;
// assistant messages sit left, plain.
export function ChatMessage({
  role,
  feedbackKind,
  children,
}: {
  role: "user" | "assistant";
  feedbackKind?: "bug" | "feature";
  children: ReactNode;
}) {
  if (role === "user") {
    return (
      <div className="self-end max-w-[90%] border-2 border-edge bg-accent/15 px-2.5 py-1.5 text-sm text-ink">
        {feedbackKind && (
          <span className="mb-0.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-accent">
            {feedbackKind === "bug" ? <Bug size={9} /> : <Lightbulb size={9} />}
            {feedbackKind === "bug" ? "Bug report" : "Feature request"}
          </span>
        )}
        {children}
      </div>
    );
  }
  return (
    <div className="max-w-[95%] self-start whitespace-pre-wrap border-2 border-edge bg-white/5 px-2.5 py-1.5 text-sm leading-snug text-ink">
      {children}
    </div>
  );
}

// The collapsible "Thinking…" reasoning trace. While `active` it shows a shimmer
// label and the live reasoning text; once the answer arrives it auto-collapses to
// "Thought for a moment ▸", expandable on click.
export function ChatThinking({
  text,
  active,
}: {
  text: string;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expanded = active || open;
  if (!text && !active) return null;

  return (
    <div className="self-start max-w-[95%]">
      <button
        type="button"
        onClick={() => !active && setOpen((o) => !o)}
        disabled={active}
        className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition-colors enabled:hover:text-ink"
      >
        <ChevronRight
          size={11}
          className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        {active ? (
          <span className="shimmer-text">Thinking…</span>
        ) : (
          <span>Thought for a moment</span>
        )}
      </button>
      {expanded && text && (
        <p className="mt-1 border-l-2 border-edge/60 pl-2 text-[12px] italic leading-relaxed text-ink-dim whitespace-pre-wrap">
          {text}
        </p>
      )}
    </div>
  );
}

// A blinking caret appended to text that is still streaming in.
export function StreamCaret() {
  return (
    <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-accent align-middle" />
  );
}

// The composer: a single bordered input + send button that flips to a stop
// button while a turn is streaming.
export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  placeholder,
  leading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  placeholder: string;
  leading: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-2 border-edge bg-white/5 px-2 focus-within:border-accent">
      <span className="shrink-0 text-accent">{leading}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) onSend();
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink placeholder:text-ink-dim/70 focus:outline-none"
      />
      {busy ? (
        <button
          onClick={onStop}
          aria-label="Stop"
          className="shrink-0 text-ink-dim transition-colors hover:text-accent"
        >
          <span className="block h-3 w-3 bg-current" />
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={!value.trim()}
          aria-label="Send"
          className="shrink-0 text-ink-dim transition-colors hover:text-accent disabled:opacity-40"
        >
          <SendGlyph />
        </button>
      )}
    </div>
  );
}

function SendGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      <path d="M3 12 L21 4 L13 21 L11 13 Z" />
    </svg>
  );
}

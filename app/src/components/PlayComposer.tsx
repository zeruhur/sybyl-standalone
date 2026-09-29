import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ComposerIntent, ComposerMode, composerIntentReady, detectPrefixMode, parseComposerInput } from "../lib/composer";

const MODES: { id: ComposerMode; symbol: string; label: string; send: string; placeholder: string }[] = [
  { id: "oracle", symbol: "?", label: "Oracle", send: "Ask", placeholder: "Is the guard asleep?   (add  -> Yes, but  if you already rolled)" },
  { id: "action", symbol: "@", label: "Action", send: "Act", placeholder: "Pick the lock   (add  d: 2d6=8  to report a roll)" },
  { id: "scene", symbol: "S", label: "Scene", send: "Start", placeholder: "Dark alley, midnight   (leave blank to let Sybyl set the scene)" },
  { id: "interpret", symbol: "->", label: "Interpret", send: "Interpret", placeholder: "Yes, and...   (leave blank to interpret the selected text)" }
];

export interface PlayComposerHandle {
  focus: () => void;
}

interface PlayComposerProps {
  disabled: boolean;
  loading: boolean;
  /** Whether the editor currently has selected text (enables a blank Interpret). */
  hasSelection: () => boolean;
  /** Resolves true when the generation landed, so the input is only cleared on success. */
  onSubmit: (intent: ComposerIntent) => Promise<boolean>;
  onExpandScene: () => void;
  onWhatNow: () => void;
  onWhatCanIDo: () => void;
  onMoreCommands: () => void;
}

const PlayComposer = forwardRef<PlayComposerHandle, PlayComposerProps>(function PlayComposer(
  { disabled, loading, hasSelection, onSubmit, onExpandScene, onWhatNow, onWhatCanIDo, onMoreCommands },
  ref
) {
  const [mode, setMode] = useState<ComposerMode>("oracle");
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  // A typed prefix (`?`, `@`, `->`) overrides the chip, and the chip highlight follows it.
  const effectiveMode = detectPrefixMode(text) ?? mode;
  const current = MODES.find((m) => m.id === effectiveMode)!;
  const busy = disabled || loading;

  async function submit() {
    if (busy) return;
    const intent = parseComposerInput(text, mode);
    if (!composerIntentReady(intent, hasSelection())) {
      inputRef.current?.focus();
      return;
    }
    const ok = await onSubmit(intent);
    if (ok) setText("");
    inputRef.current?.focus();
  }

  function pickMode(next: ComposerMode) {
    setMode(next);
    // Drop a typed prefix that would otherwise keep overriding the chip just clicked.
    if (detectPrefixMode(text)) setText(parseComposerInput(text, next).text);
    inputRef.current?.focus();
  }

  return (
    <div className={`play-composer${busy ? " play-composer-busy" : ""}`}>
      <div className="play-composer-chips">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`play-chip${effectiveMode === m.id ? " active" : ""}`}
            onClick={() => pickMode(m.id)}
            disabled={disabled}
            title={`${m.label} — or start the line with ${m.symbol === "S" ? "the Scene chip" : m.symbol}`}
          >
            <span className="play-chip-symbol">{m.symbol}</span>
            {m.label}
          </button>
        ))}
        <span className="play-composer-divider" />
        <button className="play-chip play-chip-quiet" onClick={onExpandScene} disabled={busy} title="Expand the current scene into prose">
          Expand
        </button>
        <button className="play-chip play-chip-quiet" onClick={onWhatNow} disabled={busy} title="Suggest possible consequences or complications">
          What now?
        </button>
        <button className="play-chip play-chip-quiet" onClick={onWhatCanIDo} disabled={busy} title="Suggest three actions the PC could take">
          What can I do?
        </button>
        <button className="play-chip play-chip-quiet" onClick={onMoreCommands} disabled={busy} title="All commands (Ctrl+K)">
          More…
        </button>
      </div>
      <form
        className="play-composer-row"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="play-composer-symbol" aria-hidden="true">{current.symbol}</span>
        <input
          ref={inputRef}
          className="play-composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={current.placeholder}
          disabled={disabled}
          aria-label={`${current.label} input`}
          spellCheck
        />
        <button type="submit" className="play-composer-send" disabled={busy}>
          {loading ? "…" : current.send}
        </button>
      </form>
    </div>
  );
});

export default PlayComposer;

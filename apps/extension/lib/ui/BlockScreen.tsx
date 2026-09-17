import { useEffect, useId, useRef, useState } from "react";
import type { HitDto } from "../api-types";
import { deepActiveElement, getFocusable, isEditableElement } from "./focus";
import { HitList } from "./panel-parts";
import { ReplayBadge } from "./ReplayBadge";

export type BlockScreenProps = {
  hits: HitDto[];
  phrase: string;
  onEvidence: () => void;
  onOverride: () => void;
  /** Focus the override input on mount, unless a host-page field already has focus.
   * Default true; the runner can pass false to suppress (e.g. it manages focus itself). */
  autoFocus?: boolean;
  /** True while an `override()` call is in flight. Disables the Override button (in addition
   * to the phrase-match check) so a slow network round-trip can't be raced by repeat clicks.
   * Default false. */
  pending?: boolean;
  /** A message from the runner's last FAILED override attempt (e.g. "Override not recorded:
   * backend offline. Still blocked."). Rendered as a `role="status"` line so it's announced;
   * the trade stays blocked. Default null (nothing rendered). */
  error?: string | null;
  replay?: boolean;
};

const MAX_HITS = 3;

/** Full-yellow block screen: hazard stripe, TRIPWIRE display word, up to 3 hits, and an
 * override input that only unlocks the Override button on an exact (case-sensitive,
 * trimmed) match of `phrase`.
 *
 * Focus management: on mount, focus moves to the override input (the primary action) unless
 * the host page already has an editable field focused (the user is mid-typing elsewhere —
 * e.g. a swap amount field — in which case we leave focus alone and rely on the
 * `role="alertdialog"` announcement). While focus is inside the block screen, Tab/Shift+Tab
 * cycle only through its own focusable elements (input, Override, Evidence) — a lightweight
 * trap, since this dialog isn't dismissible by clicking outside it either.
 *
 * Escape intentionally does NOT dismiss this dialog. This is a safety block, not a
 * convenience popover: closing it on Escape would defeat its purpose, so no keydown handler
 * here ever calls anything on "Escape" — that key is a deliberate no-op.
 */
export function BlockScreen({ hits, phrase, onEvidence, onOverride, autoFocus = true, pending = false, error = null, replay }: BlockScreenProps) {
  const [input, setInput] = useState("");
  const headingId = useId();
  const inputId = `${headingId}-override-input`;
  const matches = input.trim() === phrase;
  const overrideDisabled = !matches || pending;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    // Walk through shadow roots too: document.activeElement alone only reports the shadow
    // HOST when focus is inside a third-party widget's (RainbowKit/WalletConnect-style) own
    // shadow root, which would otherwise look "not editable" and get its focus stolen.
    const active = deepActiveElement();
    const root = rootRef.current;
    // Already focused somewhere inside our own block screen (e.g. a re-mount) — no-op.
    if (root && active && root.contains(active)) return;
    // Don't steal focus from a host-page field (other than <body>, i.e. nothing focused) the
    // user is actively using, such as a swap amount input.
    if (isEditableElement(active) && active !== document.body) return;
    inputRef.current?.focus();
    // Run once on mount only: re-running on every `autoFocus` toggle would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tryOverride() {
    if (input.trim() === phrase && !pending) onOverride();
  }

  function handleRootKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      // Safety block: Escape must never dismiss this dialog. Deliberate no-op.
      return;
    }
    if (e.key !== "Tab") return;
    const root = rootRef.current;
    if (!root) return;
    const focusable = getFocusable(root);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = e.target as HTMLElement;
    if (e.shiftKey) {
      if (current === first || !focusable.includes(current)) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (current === last || !focusable.includes(current)) {
        e.preventDefault();
        first?.focus();
      }
    }
  }

  return (
    <div className="tw-block" role="alertdialog" aria-labelledby={headingId} ref={rootRef} onKeyDown={handleRootKeyDown}>
      <div className="tw-block-stripe" aria-hidden="true" />
      <div className="tw-block-body">
        <h3 id={headingId} className="tw-block-heading">
          TRIPWIRE
        </h3>
        <ReplayBadge replay={replay} />

        <HitList hits={hits} max={MAX_HITS} className="tw-block-hits" />

        <div className="tw-block-footer">
          <div className="tw-block-input-row">
            <div className="tw-block-input-wrap">
              <label htmlFor={inputId}>{`Type ${phrase} to trade anyway`}</label>
              <input
                id={inputId}
                ref={inputRef}
                type="text"
                spellCheck={false}
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") tryOverride();
                }}
              />
            </div>
            <button type="button" className="tw-block-override-btn" disabled={overrideDisabled} onClick={tryOverride}>
              {pending ? "Overriding…" : "Override"}
            </button>
          </div>
          {error ? (
            <p className="tw-block-error" role="status">
              {error}
            </p>
          ) : null}
          <button type="button" className="tw-block-evidence" onClick={onEvidence}>
            Evidence →
          </button>
        </div>
      </div>
    </div>
  );
}

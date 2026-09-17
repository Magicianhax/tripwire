import { useEffect, useId, useRef, useState } from "react";
import type { HitDto } from "../api-types";
import { HitList } from "./panel-parts";

export type BlockScreenProps = {
  hits: HitDto[];
  phrase: string;
  onEvidence: () => void;
  onOverride: () => void;
  /** Focus the override input on mount, unless a host-page field already has focus.
   * Default true; the runner can pass false to suppress (e.g. it manages focus itself). */
  autoFocus?: boolean;
};

const MAX_HITS = 3;

function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

/** Focusable elements inside the block screen, in DOM/tab order, skipping disabled ones
 * (the Override button is disabled until the phrase matches). */
function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("input, button")).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

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
export function BlockScreen({ hits, phrase, onEvidence, onOverride, autoFocus = true }: BlockScreenProps) {
  const [input, setInput] = useState("");
  const headingId = useId();
  const inputId = `${headingId}-override-input`;
  const matches = input.trim() === phrase;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const active = document.activeElement;
    // Don't steal focus from a host-page field (other than <body>, i.e. nothing focused) the
    // user is actively using, such as a swap amount input.
    if (isEditableElement(active) && active !== document.body) return;
    inputRef.current?.focus();
    // Run once on mount only: re-running on every `autoFocus` toggle would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tryOverride() {
    if (input.trim() === phrase) onOverride();
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
            <button type="button" className="tw-block-override-btn" disabled={!matches} onClick={tryOverride}>
              Override
            </button>
          </div>
          <button type="button" className="tw-block-evidence" onClick={onEvidence}>
            Evidence →
          </button>
        </div>
      </div>
    </div>
  );
}

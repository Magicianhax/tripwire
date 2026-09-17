import { useEffect, useId, useRef, useState } from "react";
import type { TargetKind } from "@tripwire/core";
import type { HitDto } from "../api-types";
import { ArrowRight, Lock, OctagonX, ShieldCheck, Users } from "lucide-react";
import { deepActiveElement, getFocusable, isEditableElement } from "./focus";
import { Icon } from "./icons";
import { VenueLogo } from "./Logo";
import { HitList } from "./panel-parts";
import { ReplayBadge } from "./ReplayBadge";

export type BlockScreenProps = {
  hits: HitDto[];
  phrase: string;
  /** Opens the evidence card anchored to the button it receives. */
  onEvidence: (trigger: HTMLElement) => void;
  onOverride: () => void;
  /** What's blocked: labels the Evidence button ("See who's selling" / "See positions" /
   * "See holders"). Default "spot". */
  kind?: TargetKind;
  /** Focus the dialog itself on mount (so screen readers announce the hits via
   * aria-describedby), unless a host-page field already has focus.
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
  /** Adapter id: the venue's logo sits in the header. */
  venue?: string;
};

const MAX_HITS = 3;

/** Which evidence tab the block screen's button opens on. */
export const EVIDENCE_TAB: Record<TargetKind, string> = {
  spot: "wallets",
  perp: "positioning",
  prediction: "holders",
};

const EVIDENCE_LABEL: Record<TargetKind, string> = {
  spot: "See who's selling",
  perp: "See positions",
  prediction: "See holders",
};

/** Case-insensitive, whitespace-normalized: mobile keyboards auto-capitalize, and the friction
 * that matters is typing the words, not their case. */
export function normalizePhrase(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function phraseMatches(input: string, phrase: string): boolean {
  return normalizePhrase(input) !== "" && normalizePhrase(input) === normalizePhrase(phrase);
}

/** Block screen: a red-bordered card with a TRIPWIRE header (venue logo, "Trade blocked by
 * your rules"), up to 3 hits, the Evidence button, a reassurance line, and an override input that only unlocks the Override button when
 * `phrase` is typed (case-insensitive, whitespace-normalized).
 *
 * Focus management: on mount, focus moves to the dialog container (tabIndex -1, described by
 * the hits list) rather than the override input, so the block is announced and nothing steers
 * the user toward overriding; unless
 * the host page already has an editable field focused (the user is mid-typing elsewhere —
 * e.g. a swap amount field — in which case we leave focus alone and rely on the
 * `role="alertdialog"` announcement). While focus is inside the block screen, Tab/Shift+Tab
 * cycle only through its own focusable elements (Evidence, input, Override) — a lightweight
 * trap, since this dialog isn't dismissible by clicking outside it either.
 *
 * Escape intentionally does NOT dismiss this dialog. This is a safety block, not a
 * convenience popover: closing it on Escape would defeat its purpose, so no keydown handler
 * here ever calls anything on "Escape" — that key is a deliberate no-op.
 */
export function BlockScreen({ hits, phrase, onEvidence, onOverride, kind = "spot", autoFocus = true, pending = false, error = null, replay, venue }: BlockScreenProps) {
  const [input, setInput] = useState("");
  const headingId = useId();
  const inputId = `${headingId}-override-input`;
  const hitsId = `${headingId}-hits`;
  const safeId = `${headingId}-safe`;
  const matches = phraseMatches(input, phrase);
  const overrideDisabled = !matches || pending;
  const rootRef = useRef<HTMLDivElement>(null);

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
    root?.focus({ preventScroll: true });
    // Run once on mount only: re-running on every `autoFocus` toggle would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // React only synthesizes keypress for character keys it recognizes, so stop the native
    // event directly (nothing in here listens for keypress; keydown/keyup go via React below).
    const root = rootRef.current;
    if (!root) return;
    const stop = (e: Event) => e.stopPropagation();
    root.addEventListener("keypress", stop);
    return () => root.removeEventListener("keypress", stop);
  }, []);

  function tryOverride() {
    if (phraseMatches(input, phrase) && !pending) onOverride();
  }

  /** Keystrokes inside the block screen (typing the override phrase) must never trigger the
   * venue's own document-level hotkeys (e.g. "b" = buy). */
  function isolateKey(e: React.KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation();
  }

  function handleRootKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    isolateKey(e);
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
    <div
      className="tw-block"
      role="alertdialog"
      aria-labelledby={headingId}
      aria-describedby={hits.length > 0 ? `${hitsId} ${safeId}` : safeId}
      tabIndex={-1}
      ref={rootRef}
      onKeyDown={handleRootKeyDown}
      onKeyUp={isolateKey}
    >
      <div className="tw-block-band">
        <Icon icon={OctagonX} size={20} className="tw-block-icon" />
        <div className="tw-block-titles">
          <h3 id={headingId} className="tw-block-heading">
            TRIPWIRE
          </h3>
          <span className="tw-block-sub">Trade blocked by your rules</span>
        </div>
        <ReplayBadge replay={replay} />
        <VenueLogo venue={venue} size={20} labelled />
      </div>
      <div className="tw-block-body">
        <HitList hits={hits} max={MAX_HITS} className="tw-block-hits" id={hitsId} />

        <div className="tw-block-footer">
          <button type="button" className="tw-block-evidence" aria-haspopup="dialog" onClick={(e) => onEvidence(e.currentTarget)}>
            <Icon icon={Users} size={16} />
            {EVIDENCE_LABEL[kind]}
            <Icon icon={ArrowRight} size={14} />
          </button>
          <p id={safeId} className="tw-block-safe">
            <Icon icon={ShieldCheck} size={16} />
            Not trading is the safe move.
          </p>
          <label className="tw-block-prompt" htmlFor={inputId}>
            Type <span className="tw-block-phrase">{phrase}</span> to trade anyway
          </label>
          <div className="tw-block-input-row">
            <div className="tw-block-input-wrap">
              <input
                id={inputId}
                type="text"
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") tryOverride();
                }}
              />
            </div>
            <button type="button" className="tw-block-override-btn" disabled={overrideDisabled} onClick={tryOverride}>
              {overrideDisabled && !pending ? <Icon icon={Lock} size={14} /> : null}
              {pending ? "Overriding…" : "Override"}
            </button>
          </div>
          {error ? (
            <p className="tw-block-error" role="status">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import { useId, useState } from "react";
import type { HitDto } from "../api-types";
import { HitList } from "./panel-parts";

export type BlockScreenProps = {
  hits: HitDto[];
  phrase: string;
  onEvidence: () => void;
  onOverride: () => void;
};

const MAX_HITS = 3;

/** Full-yellow block screen: hazard stripe, TRIPWIRE display word, up to 3 hits, and an
 * override input that only unlocks the Override button on an exact (case-sensitive,
 * trimmed) match of `phrase`. */
export function BlockScreen({ hits, phrase, onEvidence, onOverride }: BlockScreenProps) {
  const [input, setInput] = useState("");
  const headingId = useId();
  const inputId = `${headingId}-override-input`;
  const matches = input.trim() === phrase;

  function tryOverride() {
    if (input.trim() === phrase) onOverride();
  }

  return (
    <div className="tw-block" role="alertdialog" aria-labelledby={headingId}>
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

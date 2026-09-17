import { targetPartsFromJson } from "../_lib/target-label";
import { ChainMark } from "./Brand";

/** A logged target: addresses in mono, words in the UI face, the chain with its logo. */
export function TargetLabel({ json }: { json: string }) {
  return (
    <span className="tw-target">
      {targetPartsFromJson(json).map((part, i) =>
        part.chain ? (
          <span key={i} className="tw-target-chain">
            <ChainMark chain={part.chain} />
            {part.text}
          </span>
        ) : part.mono ? (
          <span key={i} className="tw-data">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}

import { targetPartsFromJson } from "../_lib/target-label";

/** A logged target: addresses in mono, words in the UI face. */
export function TargetLabel({ json }: { json: string }) {
  return (
    <>
      {targetPartsFromJson(json).map((part, i) =>
        part.mono ? (
          <span key={i} className="tw-data">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

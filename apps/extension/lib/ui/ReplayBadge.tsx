/** "Replay" watermark: the backend is serving recorded fixtures, not live Nansen data. */
export function ReplayBadge({ replay }: { replay?: boolean }) {
  if (!replay) return null;
  return (
    <span className="tw-replay-badge" title="Replay mode: recorded Nansen data, not live">
      Replay
    </span>
  );
}

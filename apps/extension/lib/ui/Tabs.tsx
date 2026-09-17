import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type TabDef = {
  id: string;
  label: string;
  content: ReactNode;
  /** An optional brand mark before the label (the author badge card's venue tabs). */
  icon?: ReactNode;
  /** What opening this tab costs, when it costs something ("11 credits"). Shown beside the
   * label so the price is visible before the press, not after it. */
  cost?: string;
};

/**
 * WAI-ARIA tabs with automatic activation: one tab stop, arrow keys (wrapping), Home and End
 * move selection and focus together. Every panel stays in the DOM (`hidden` when inactive), so
 * switching is instant and nothing refetches.
 *
 * `onSelect` fires for the tab that is showing — once on mount for the initial tab, and once per
 * change after that. It is how a tab loads its own data the first time it is looked at, and it
 * is the reason a card open costs only what the first tab costs.
 */
export function Tabs({ tabs, label, initial, onSelect }: { tabs: TabDef[]; label: string; initial?: string; onSelect?: (id: string) => void }) {
  const base = useId();
  const [selected, setSelected] = useState<string | undefined>(initial);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const current = tabs.some((t) => t.id === selected) ? selected : tabs[0]?.id;

  // The selected tab announces itself, including the first one. `onSelect` is expected to be
  // idempotent (the card's loader ignores a section it already has or is already fetching), so
  // a re-render that keeps the same tab costs nothing.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    if (current) onSelectRef.current?.(current);
  }, [current]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.id === current);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    setSelected(tab.id);
    refs.current.get(tab.id)?.focus();
  }

  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = (id: string) => `${base}-panel-${id}`;

  return (
    <div className="tw-tabs">
      <div className="tw-tablist" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => {
          const on = t.id === current;
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) refs.current.set(t.id, el);
                else refs.current.delete(t.id);
              }}
              type="button"
              role="tab"
              id={tabId(t.id)}
              className="tw-tab"
              aria-selected={on}
              aria-controls={panelId(t.id)}
              tabIndex={on ? 0 : -1}
              onClick={() => setSelected(t.id)}
            >
              {t.icon}
              {t.label}
              {t.cost ? <span className="tw-tab-cost tw-fig">{t.cost}</span> : null}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={panelId(t.id)} aria-labelledby={tabId(t.id)} className="tw-tabpanel" hidden={t.id !== current} tabIndex={0}>
          {t.content}
        </div>
      ))}
    </div>
  );
}

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type TabDef = { id: string; label: string; content: ReactNode };

/**
 * WAI-ARIA tabs with automatic activation: one tab stop, arrow keys (wrapping), Home and End
 * move selection and focus together. Every panel stays in the DOM (`hidden` when inactive), so
 * switching is instant and nothing refetches.
 */
export function Tabs({ tabs, label, initial }: { tabs: TabDef[]; label: string; initial?: string }) {
  const base = useId();
  const [selected, setSelected] = useState<string | undefined>(initial);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const current = tabs.some((t) => t.id === selected) ? selected : tabs[0]?.id;

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
              {t.label}
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

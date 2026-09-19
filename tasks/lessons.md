# Lessons

## 2026-09-19 takeover corrections

- **Low confidence — assert accessibility behavior, not one ARIA attribute.** A control can keep the same browser-computed accessible name while moving from `aria-label` to `aria-labelledby`. Playwright checks should prefer `toHaveAccessibleName` and role/name locators unless a specific attribute is itself the contract.
- **Low confidence — place overlays against every clipping ancestor.** Tooltips inside an `overflow: hidden` popover header must open inward (below the trigger) or escape that clipping context; checking the trigger alone is insufficient.
- **Low confidence — test-data cleanup begins at the first mutation.** Capture/E2E fixtures that create durable records need `try/finally` around the entire mutation-to-capture span, checked cleanup responses, and resource closure protected by its own `finally`.

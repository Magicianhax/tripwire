# Project patterns

- **Low confidence (1 confirmation):** In E2E accessibility coverage, query by role and computed accessible name instead of coupling tests to `aria-label`; use attribute assertions only when the attribute itself is required.
- **Low confidence (1 confirmation):** Any floating hint inside a clipped surface needs a placement that points into the surface, plus a reduced-motion override.
- **Low confidence (1 confirmation):** Wrap persistent test-fixture mutations in `try/finally` immediately; await and validate cleanup, then close pages/contexts in a nested `finally`.

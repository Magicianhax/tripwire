# Architecture

## System map

```mermaid
flowchart LR
  x[x.com content script] --> bg[Extension background worker]
  v[Venue content script + adapters] --> bg
  bg -->|http://127.0.0.1:3000| api[Next.js API routes]
  api --> core[@tripwire/core signals + rules]
  api --> client[Nansen client: cache, dedupe, ledger, budget]
  client --> db[(node:sqlite .data/tripwire.db)]
  client --> nansen[Nansen API v1]
  api --> gamma[Polymarket Gamma API: slug to market id]
  pages[/rules /ledger /history pages/] --> db
```

## Components

| Component | Path | Runtime | Owns |
|---|---|---|---|
| Core | `packages/core` | pure TS | types, zod schemas, signals, rules engine, presets |
| Backend | `apps/web` | Next.js on 127.0.0.1:3000 (local only) | Nansen access, cache, ledger, rules storage, pages |
| Extension | `apps/extension` | WXT, Chrome MV3 | page reading, venue adapters, Shadow DOM UI |
| Fixtures | `fixtures/nansen` | JSON | live-recorded responses for replay mode and tests |

## Data

- **Store:** SQLite via built-in `node:sqlite` (`apps/web/.data/tripwire.db`). Tables: cache, ledger, settings, checks, overrides.
- **Schema source of truth:** `apps/web/lib/db.ts` (`CREATE TABLE IF NOT EXISTS` at startup).
- **Migrations:** none needed. The database is local and disposable.

## External services and trust boundaries

| Service | Used for | Credential location | Trust |
|---|---|---|---|
| Nansen API v1 | all verdict data | `NANSEN_API_KEY` in `apps/web/.env.local`, or `~/.nansen/config.json` (`nansen login`) | untrusted data |
| Polymarket Gamma API | slug to market id | none | untrusted data |
| x.com / venue DOM | reading targets | none | hostile: text only, never inserted as HTML |

## Key invariants

- The Nansen key never reaches the extension, logs, fixtures or git.
- API routes accept only the local pages and the pinned Tripwire extension ID (`TRIPWIRE_EXTENSION_ORIGIN` overrides), and every route refuses a Host other than 127.0.0.1/localhost on the backend port, so other websites and extensions can't spend credits or weaken rules.
- Local pages can't be framed (`X-Frame-Options: DENY`, `frame-ancestors 'none'`).
- A missing signal is `null` and never produces CLEAR (verdict UNCHECKED).
- Tripwire never touches wallets, signing or transactions.
- A Polymarket target is checked only against an unambiguous Yes/No market and an outcome read from that market's trade form; otherwise UNCHECKED.
- `TRIPWIRE_REPLAY=1` (`pnpm dev:replay`) never calls the network, and every web page and extension surface shows a REPLAY watermark.

## Verify

- `pnpm verify` runs typecheck plus unit tests for all workspaces.
- `pnpm -F extension build` and `pnpm -F web build` produce the artifacts.
- `pnpm verify:e2e` (not part of `pnpm verify`) loads the built extension in Playwright's Chromium against a replay backend and stubbed X / Jupiter pages.

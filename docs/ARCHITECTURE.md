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
- API routes reject browser origins other than the extension and local pages, so other websites can't spend credits.
- A missing signal is `null` and never produces CLEAR (verdict UNCHECKED).
- Tripwire never touches wallets, signing or transactions.
- `TRIPWIRE_REPLAY=1` never calls the network, and the UI shows a REPLAY watermark.

## Verify

- `pnpm verify` runs typecheck plus unit tests for all workspaces.
- `pnpm -F extension build` and `pnpm -F web build` produce the artifacts.

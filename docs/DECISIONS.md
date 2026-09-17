# Decisions

Append-only. Never edit or delete an entry; supersede it with a new one.

---

## ADR-0001 Adopt project template (2026-09-17)
**Status:** accepted
**Context:** Project bootstrapped from `~/.claude/templates/project` during /ship.
**Decision:** `PRODUCT.md`, `DESIGN.md`, `docs/ARCHITECTURE.md` and this log are the durable context; `tasks/todo.md` is the working plan.
**Consequences:** `/ship` reads these first.

## ADR-0002 Tripwire concept and scope (2026-09-17)
**Status:** accepted
**Context:** Nansen Meridian Buildathon. The user rejected dashboards, OSINT, and previously built ideas (Crowd vs Sharks, follow/fade, etc.).
**Decision:** Build a browser extension with a local backend. It shows X post verdicts and blocks trade buttons on tier-1 venues (Jupiter, pump.fun, Uniswap, Jumper, Hyperliquid, Polymarket). Tier-2 venues get a docked panel. The spec is `docs/superpowers/specs/2026-09-17-tripwire-design.md`.
**Consequences:** Venue DOMs change, so adapters are small and tested against fixtures, with a fallback to a docked panel.

## ADR-0003 Local SQLite via node:sqlite (2026-09-17)
**Status:** accepted
**Context:** Needed a cache, ledger and rules store. `better-sqlite3` needs a native build on Windows, and F: is nearly full.
**Decision:** Use Node's built-in `node:sqlite` (Node >= 22.13), with no ORM.
**Consequences:** No native dependency. Node >= 22.13 is required.

## ADR-0004 Nansen key resolution: env first, then Nansen CLI config (2026-09-17)
**Status:** accepted
**Context:** The user already runs the Nansen CLI (`nansen login`), and judges should need minimal setup.
**Decision:** The backend reads `NANSEN_API_KEY`, falling back to `~/.nansen/config.json` `apiKey`. The key is only ever used as the `apikey` header.
**Consequences:** Zero extra setup for CLI users. The fallback is documented in the README.

## ADR-0005 Person intel reduced to exact entity match + holdings (2026-09-17)
**Status:** accepted (supersedes the spec's `shill_dump`)
**Context:** Live check: `search/general` returns entities as `{name, tags}` with no addresses. `profiler/address/current-balance` accepts `entity_name`, but DEX trades need an address.
**Decision:** An X display name or handle is matched exactly (normalized) against Nansen entities, and the panel shows current holdings of the posted token (`author_holds_token`, info only).
**Consequences:** It can't show "sold after posting". There is no wallet guessing.

## ADR-0006 Risk count uses token-specific indicators only (2026-09-17)
**Status:** accepted
**Context:** Live `tgm/indicators` mixes items between `risk_indicators` and `reward_indicators`, and marks `btc-reflexivity` high for majors such as WIF.
**Decision:** `risk_high_count` scans both arrays but counts only `concentration-risk`, `liquidity-risk` and `token-supply-inflation`.
**Consequences:** Fewer false blocks on liquid majors.

## ADR-0007 Visual direction A: Hazard (2026-09-17)
**Status:** accepted
**Context:** The user asked for no terminal or retro look, no editorial look and no AI-generated look, then delegated the choice ("do it all").
**Decision:** Safety yellow on ink, used only for CAUTION and TRIPWIRE. Condensed display type, mono readouts, hazard-stripe block screen. Tokens are in `DESIGN.md`.
**Consequences:** CLEAR and neutral states stay quiet so yellow keeps its meaning.

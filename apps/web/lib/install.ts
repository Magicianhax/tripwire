import { createHash, randomBytes } from "node:crypto";
import { getDb, SELF_HOST_INSTALL } from "./db";

/**
 * Who the backend is answering for.
 *
 * Locally there is one user and the machine is the identity, so there is nothing to resolve: a
 * self-hosted backend answers as {@link SELF_HOST_INSTALL} and never looks at a token. Hosted,
 * the backend is answering strangers who share one Nansen key and one bill, so every request has
 * to say which install it belongs to — not to know who anyone is, but to know whose daily credits
 * are being spent and whose rules to load.
 *
 * The token is the only identity that exists here: no account, no email, nothing that survives a
 * reinstall, nothing that can be looked up from the outside.
 */

export const isHosted = () => process.env.TRIPWIRE_HOSTED === "1";

/**
 * How many installs one network may mint per UTC day. Generous on purpose: a household, an office
 * behind one address, or someone reinstalling while testing all mint from one IP, and the first
 * cut (2/day) locked real users out. Spend is what needs bounding, and it is — every install on a
 * network shares one daily allowance (`NANSEN_PER_IP_DAILY_CREDITS`), so extra mints buy nothing.
 */
const mintsPerIpPerDay = () => Number(process.env.TRIPWIRE_MINTS_PER_IP ?? 20);
/** The ceiling on new installs per UTC day, whatever their IPs. */
const mintsPerDay = () => Number(process.env.TRIPWIRE_MINTS_PER_DAY ?? 2000);

export function dayStart(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * An IP is a personal datum and we only need to count with it, so it is never stored. The hash is
 * salted with a server secret so the table cannot be brute-forced back into addresses — the whole
 * IPv4 space is 2^32 and a bare hash of it is a lookup table, not an anonymisation.
 */
function ipBucket(ip: string): string {
  const salt = process.env.TRIPWIRE_IP_SALT?.trim();
  // A published default salt is no salt: anyone with the source could rebuild the lookup table.
  // Hosted, refuse to count with it rather than quietly store reversible hashes.
  if (!salt && isHosted()) throw new Error("TRIPWIRE_IP_SALT must be set on a hosted backend");
  return createHash("sha256").update(`${salt ?? "self-hosted"}|${ip}`).digest("base64url").slice(0, 22);
}

export class MintRefused extends Error {
  constructor(public reason: "ip" | "global") {
    super(reason === "ip" ? "Too many installs from this address today" : "Too many new installs today");
  }
}

/**
 * Issues an install token. Minting is free, which is the obvious hole: a script can mint a token
 * per request and defeat any per-install cap. The answer is not to make minting expensive (a
 * proof-of-work or an email costs far more adoption than it saves credits at this size) but to
 * cap it per address and in total, and to keep the global credit ceiling underneath both as the
 * brake that actually protects the bill.
 */
export function mintInstall(ip: string | null, now = Date.now()): string {
  const db = getDb();
  const since = dayStart(now);
  const total = db.prepare("SELECT COUNT(*) AS n FROM installs WHERE created_at >= ?").get(since) as { n: number };
  if (total.n >= mintsPerDay()) throw new MintRefused("global");

  // Hosted, an address we cannot determine is refused rather than waved past the per-IP cap:
  // skipping the counter would make "no address" the easiest way to mint without limit.
  if (!ip && isHosted()) throw new MintRefused("ip");
  const bucket = ip ? ipBucket(ip) : null;
  if (bucket) {
    const mine = db.prepare("SELECT COUNT(*) AS n FROM install_mints WHERE ip_bucket = ? AND day = ?").get(bucket, since) as { n: number };
    if (mine.n >= mintsPerIpPerDay()) throw new MintRefused("ip");
  }

  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO installs (token, created_at, last_seen, ip_bucket) VALUES (?, ?, ?, ?)").run(token, now, now, bucket);
  if (bucket) db.prepare("INSERT INTO install_mints (ip_bucket, day, ts) VALUES (?, ?, ?)").run(bucket, since, now);
  return token;
}

const BEARER = /^Bearer\s+(.+)$/i;

/** The token a request presents, or null. Never trusted before {@link resolveInstall} checks it. */
export function presentedToken(headers: Headers): string | null {
  const header = headers.get("authorization");
  const m = header && BEARER.exec(header.trim());
  return m?.[1]?.trim() || null;
}

/**
 * The install this request belongs to, or `null` when it presents no valid one.
 *
 * Self-hosted, this always answers {@link SELF_HOST_INSTALL} and ignores whatever was presented —
 * a local backend has exactly one user and demanding a token from them would be ceremony. Hosted,
 * an unknown token is `null` so the route can answer 401 and let the extension mint a new one:
 * tokens are disposable by design, so "I don't recognise you" costs a user nothing.
 */
export function resolveInstall(headers: Headers, now = Date.now()): string | null {
  if (!isHosted()) return SELF_HOST_INSTALL;
  const token = presentedToken(headers);
  if (!token) return null;
  const db = getDb();
  const row = db.prepare("SELECT token FROM installs WHERE token = ?").get(token) as { token: string } | undefined;
  if (!row) return null;
  db.prepare("UPDATE installs SET last_seen = ? WHERE token = ?").run(now, token);
  return token;
}

/**
 * The user's own Nansen key, when they supplied one.
 *
 * The project rule (CLAUDE.md) says the Nansen key never reaches the extension, and that rule is about
 * *our* key — it must not be handed out to code running in a browser. A key the user typed in
 * themselves is a different object with a different owner: it arrives per request, is used for
 * that request, and is never written to our database, our ledger or our logs. See ADR-0014.
 */
export function byokKey(headers: Headers): string | null {
  const key = headers.get("x-nansen-key")?.trim();
  return key || null;
}

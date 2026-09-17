import { getDb } from "../db";
import { isReplay } from "../nansen/client";

/**
 * Name resolution for the wallet lens, server-side and key-free.
 *
 * Nothing here costs a Nansen credit and nothing here is reached from the extension: the
 * content script sends the string it saw, the backend turns it into an address.
 *
 * ENS has two independent sources, tried in order, first success wins:
 *  1. `api.ensideas.com/ens/resolve/<name>` — one request, returns the resolved address.
 *  2. A public Ethereum RPC, `eth_call` to the ENS registry for the name's resolver and then
 *     `addr(bytes32)` on it. Slower (two calls) but depends on no single company's service.
 *
 * SNS (`*.sol`) has no equivalent. Bonfida's documented public proxy
 * (`sns-sdk-proxy.bonfida.workers.dev`) answered `error code: 1042` for every name tried on
 * 2026-09-18, and `sns-api.bonfida.com` / `api.sns.id` 404. Resolving a `.sol` name properly
 * needs a Solana RPC plus the SPL name-service program's account derivation, which is a
 * dependency this build will not add on a guess. So a `.sol` name comes back unresolved with a
 * sentence saying why, rather than with an address that might belong to somebody else.
 */

export const ENSIDEAS_URL = "https://api.ensideas.com/ens/resolve";
/** cloudflare-eth.com answers `-32046 Cannot fulfill request` as of 2026-09-18; publicnode does not. */
export const ETH_RPC_URL = "https://ethereum-rpc.publicnode.com";
export const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
export const NAME_TTL_MS = 24 * 60 * 60 * 1000;

const RESOLVER_SELECTOR = "0x0178b8bf"; // resolver(bytes32)
const ADDR_SELECTOR = "0x3b3b57de"; // addr(bytes32)
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TIMEOUT_MS = 8_000;

export type NameResolution = {
  address: string | null;
  /** Which source answered: "ensideas", "ens-rpc", or null when nothing did. */
  source: string | null;
  /** Present when nothing resolved: what to tell the user. */
  message?: string;
};

/** EIP-137 namehash. */
export function namehash(name: string): string {
  let node: Buffer = Buffer.alloc(32);
  if (name) {
    for (const label of name.split(".").reverse()) {
      node = keccak(Buffer.concat([node, keccak(Buffer.from(label, "utf8"))]));
    }
  }
  return `0x${node.toString("hex")}`;
}

/**
 * keccak-256. Node's `crypto` ships SHA3-256, which is a different padding from Ethereum's
 * keccak, so this is the compact reference permutation rather than a dependency.
 */
export function keccak(input: Uint8Array): Buffer {
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
    0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
    0x000000000000800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];
  const ROT = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
  ];
  const MASK = (1n << 64n) - 1n;
  const rotl = (x: bigint, n: number) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK);

  const RATE = 136; // 1088 bits, keccak-256
  const state = new Array<bigint>(25).fill(0n);
  const padded = Buffer.concat([Buffer.from(input), Buffer.alloc(RATE - (input.length % RATE))]);
  padded[input.length] = 0x01;
  // `padded` always has at least one byte (RATE - 0 == RATE when the input is block-aligned).
  padded[padded.length - 1] = padded[padded.length - 1]! | 0x80;

  for (let offset = 0; offset < padded.length; offset += RATE) {
    for (let i = 0; i < RATE / 8; i++) state[i] = state[i]! ^ padded.readBigUInt64LE(offset + i * 8);
    // Keccak-f[1600]
    for (let round = 0; round < 24; round++) {
      const c = new Array<bigint>(5);
      for (let x = 0; x < 5; x++) c[x] = state[x]! ^ state[x + 5]! ^ state[x + 10]! ^ state[x + 15]! ^ state[x + 20]!;
      for (let x = 0; x < 5; x++) {
        const d = c[(x + 4) % 5]! ^ rotl(c[(x + 1) % 5]!, 1);
        for (let y = 0; y < 5; y++) state[x + 5 * y] = state[x + 5 * y]! ^ d;
      }
      const b = new Array<bigint>(25).fill(0n);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y]!, ROT[x]![y]!);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) state[x + 5 * y] = b[x + 5 * y]! ^ (~b[((x + 1) % 5) + 5 * y]! & MASK & b[((x + 2) % 5) + 5 * y]!);
      state[0] = state[0]! ^ RC[round]!;
    }
  }

  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) out.writeBigUInt64LE(state[i]!, i * 8);
  return out;
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

async function ethCall(to: string, data: string): Promise<string | null> {
  const out = (await postJson(ETH_RPC_URL, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] })) as {
    result?: string;
    error?: { message?: string };
  };
  if (out.error) throw new Error(out.error.message ?? "eth_call failed");
  const word = out.result;
  if (!word || word.length < 66) return null;
  const address = `0x${word.slice(-40)}`;
  return address.toLowerCase() === ZERO_ADDRESS ? null : address;
}

async function viaEnsideas(name: string): Promise<string | null> {
  const res = await fetch(`${ENSIDEAS_URL}/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ensideas ${res.status}`);
  const body = (await res.json()) as { address?: string | null };
  const address = body.address ?? null;
  return address && address.toLowerCase() !== ZERO_ADDRESS ? address : null;
}

async function viaRpc(name: string): Promise<string | null> {
  const node = namehash(name).slice(2);
  const resolver = await ethCall(ENS_REGISTRY, `${RESOLVER_SELECTOR}${node}`);
  if (!resolver) return null;
  return ethCall(resolver, `${ADDR_SELECTOR}${node}`);
}

const cacheKey = (name: string) => `name|${name.toLowerCase()}`;

function readCached(name: string): NameResolution | null {
  const row = getDb().prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(cacheKey(name)) as
    | { value: string; expires_at: number }
    | undefined;
  if (!row || row.expires_at <= Date.now()) return null;
  return JSON.parse(row.value) as NameResolution;
}

function writeCached(name: string, value: NameResolution) {
  const now = Date.now();
  getDb()
    .prepare("INSERT OR REPLACE INTO cache (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(cacheKey(name), JSON.stringify(value), now, now + NAME_TTL_MS);
}

/**
 * Resolve `*.eth`. Cached 24h, including a miss — a name that does not resolve does not start
 * resolving because the card was opened twice.
 */
export async function resolveEns(name: string): Promise<NameResolution> {
  const lower = name.toLowerCase();
  const cached = readCached(lower);
  if (cached) return cached;

  const attempts: [string, () => Promise<string | null>][] = [
    ["ensideas", () => viaEnsideas(lower)],
    ["ens-rpc", () => viaRpc(lower)],
  ];
  const failures: string[] = [];
  for (const [source, fn] of attempts) {
    try {
      const address = await fn();
      if (address) {
        const value: NameResolution = { address, source };
        writeCached(lower, value);
        return value;
      }
    } catch (e) {
      failures.push(`${source}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const value: NameResolution = {
    address: null,
    source: null,
    message: failures.length > 0 ? `${lower} could not be resolved (${failures.join("; ")}).` : `${lower} has no address set.`,
  };
  writeCached(lower, value);
  return value;
}

/** `*.sol` has no free resolver this build trusts; see the module comment. */
export function resolveSns(name: string): NameResolution {
  return {
    address: null,
    source: null,
    message: `Tripwire can't resolve ${name.toLowerCase()}: no free Solana Name Service resolver answered when this was built. Paste the wallet address instead.`,
  };
}

/**
 * The address replay answers every ENS name with: the wallet every wallet-lens fixture was
 * recorded against. Replay exists so a test run touches no network at all, and name resolution
 * is network even though it is free.
 */
export const REPLAY_ADDRESS = "0x7fdafde5cfb5465924316eced2d3715494c517d1";

export const replayResolution = (): NameResolution | null => (isReplay() ? { address: REPLAY_ADDRESS, source: "replay" } : null);

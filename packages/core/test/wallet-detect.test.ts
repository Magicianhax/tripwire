import { describe, expect, it } from "vitest";
import { capMarkers, detectInHref, detectInText, MAX_WALLET_MARKERS, walletKey, type WalletRef } from "../src/wallet-detect";

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOL = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

const queries = (text: string) => detectInText(text).map((h) => h.query);
const kinds = (text: string) => detectInText(text).map((h) => h.kind);

describe("detectInText", () => {
  it("finds an EVM address, keeping its checksum casing", () => {
    expect(queries(`sent to ${VITALIK} earlier`)).toEqual([VITALIK]);
    expect(kinds(`sent to ${VITALIK} earlier`)).toEqual(["evm"]);
  });

  it("finds a lowercase EVM address", () => {
    expect(queries(VITALIK.toLowerCase())).toEqual([VITALIK.toLowerCase()]);
  });

  it("reports the slice it matched so the marker can go after it", () => {
    const [hit] = detectInText(`gm ${VITALIK}!`);
    expect(hit).toBeDefined();
    expect(`gm ${VITALIK}!`.slice(hit!.start, hit!.end)).toBe(VITALIK);
  });

  it("finds a Solana address", () => {
    expect(detectInText(`ca: ${SOL}`)).toEqual([{ kind: "solana", query: SOL, start: 4, end: 4 + SOL.length }]);
  });

  it("finds ENS and SNS names, lowercased", () => {
    expect(detectInText("ping Vitalik.eth or toly.sol")).toEqual([
      { kind: "ens", query: "vitalik.eth", start: 5, end: 16 },
      { kind: "sns", query: "toly.sol", start: 20, end: 28 },
    ]);
  });

  it("finds a subdomain ENS name", () => {
    expect(queries("pay me at wallet.brantly.eth")).toEqual(["wallet.brantly.eth"]);
  });

  it("skips a transaction hash (0x + 64 hex)", () => {
    expect(detectInText(`tx 0x${"a1".repeat(32)} confirmed`)).toEqual([]);
  });

  it("skips 0x used in prose and short hex", () => {
    expect(detectInText("0x is the prefix; 0xdead is not an address")).toEqual([]);
  });

  it("skips an address glued to surrounding word characters", () => {
    expect(detectInText(`x${VITALIK}`)).toEqual([]);
    expect(detectInText(`${VITALIK}z`)).toEqual([]);
  });

  it("skips base58-looking words with no digits", () => {
    expect(detectInText("Supercalifragilisticexpialidociousness notarealaddresshere")).toEqual([]);
  });

  it("skips a domain that merely starts with eth", () => {
    expect(detectInText("see docs.ethereum.org for more")).toEqual([]);
  });

  it("skips a file name ending in .sol", () => {
    // A Solidity file is written the same way a SNS name is; requiring a word boundary is all
    // that separates them, so `Vault.sol.` in prose still reads as a name. Accepted: the card
    // answers "no SNS resolver" rather than inventing an address.
    expect(queries("open Vault.sol")).toEqual(["vault.sol"]);
  });

  it("finds several refs in one string, in order", () => {
    expect(queries(`${VITALIK} and ${SOL} and nick.eth`)).toEqual([VITALIK, SOL, "nick.eth"]);
  });

  it("returns nothing for empty or plain text", () => {
    expect(detectInText("")).toEqual([]);
    expect(detectInText("just a normal sentence about trading")).toEqual([]);
  });
});

describe("detectInHref", () => {
  const cases: [string, WalletRef][] = [
    [`https://etherscan.io/address/${VITALIK}`, { kind: "evm", query: VITALIK, chainHint: "ethereum" }],
    [`https://basescan.org/address/${VITALIK}`, { kind: "evm", query: VITALIK, chainHint: "base" }],
    [`https://arbiscan.io/address/${VITALIK}`, { kind: "evm", query: VITALIK, chainHint: "arbitrum" }],
    [`https://bscscan.com/address/${VITALIK}`, { kind: "evm", query: VITALIK, chainHint: "bnb" }],
    [`https://polygonscan.com/address/${VITALIK}`, { kind: "evm", query: VITALIK, chainHint: "polygon" }],
    [`https://snowtrace.io/address/${VITALIK}`, { kind: "evm", query: VITALIK, chainHint: "avalanche" }],
    [`https://optimistic.etherscan.io/address/${VITALIK}`, { kind: "evm", query: VITALIK, chainHint: "optimism" }],
    [`https://solscan.io/account/${SOL}`, { kind: "solana", query: SOL, chainHint: "solana" }],
    [`https://solana.fm/address/${SOL}`, { kind: "solana", query: SOL, chainHint: "solana" }],
    [`https://polymarket.com/profile/${VITALIK}`, { kind: "evm", query: VITALIK }],
    [`https://polymarket.com/markets?address=${VITALIK}`, { kind: "evm", query: VITALIK }],
    [`https://hypurrscan.io/address/${VITALIK}`, { kind: "evm", query: VITALIK }],
    [`https://app.hyperliquid.xyz/explorer/address/${VITALIK}`, { kind: "evm", query: VITALIK }],
    [`https://debank.com/profile/${VITALIK}`, { kind: "evm", query: VITALIK }],
    [`https://dexscreener.com/maker/${SOL}`, { kind: "solana", query: SOL, chainHint: "solana" }],
    [`https://app.pendle.finance/trade/dashboard/overview?address=${VITALIK}`, { kind: "evm", query: VITALIK }],
  ];

  for (const [href, expected] of cases) {
    it(`reads ${new URL(href).hostname}`, () => {
      expect(detectInHref(href)).toEqual(expected);
    });
  }

  it("ignores www. and query strings on the explorer hosts", () => {
    expect(detectInHref(`https://www.etherscan.io/address/${VITALIK}?tab=tokens`)).toEqual({ kind: "evm", query: VITALIK, chainHint: "ethereum" });
  });

  it("does not treat a token contract page as a wallet", () => {
    expect(detectInHref(`https://etherscan.io/token/${VITALIK}`)).toBeNull();
  });

  it("does not read an unlisted host", () => {
    expect(detectInHref(`https://evil.example.com/address/${VITALIK}`)).toBeNull();
  });

  it("does not read a transaction link", () => {
    expect(detectInHref(`https://etherscan.io/tx/0x${"a1".repeat(32)}`)).toBeNull();
  });

  it("returns null for junk and non-http URLs", () => {
    expect(detectInHref("not a url")).toBeNull();
    expect(detectInHref(`javascript:alert(1)`)).toBeNull();
    expect(detectInHref(`data:text/html,${VITALIK}`)).toBeNull();
  });
});

describe("capMarkers", () => {
  const item = (query: string, id = query) => ({ id, ref: { kind: "evm", query } as WalletRef });

  it("keeps everything under the cap, in page order", () => {
    const items = [item("0xa"), item("0xb")];
    expect(capMarkers(items).keep.map((i) => i.id)).toEqual(["0xa", "0xb"]);
    expect(capMarkers(items).drop).toEqual([]);
  });

  it("drops the oldest duplicate of the same wallet, whatever its casing", () => {
    const { keep, drop } = capMarkers([item("0xAB", "first"), item("0xab", "second")]);
    expect(keep.map((i) => i.id)).toEqual(["second"]);
    expect(drop.map((i) => i.id)).toEqual(["first"]);
  });

  it("recycles the oldest markers past the cap", () => {
    const items = Array.from({ length: MAX_WALLET_MARKERS + 3 }, (_, i) => item(`0x${i}`));
    const { keep, drop } = capMarkers(items);
    expect(keep).toHaveLength(MAX_WALLET_MARKERS);
    expect(drop.map((i) => i.id)).toEqual(["0x2", "0x1", "0x0"]);
    expect(keep[0]!.id).toBe("0x3");
  });

  it("honours a smaller cap", () => {
    expect(capMarkers([item("0xa"), item("0xb"), item("0xc")], 2).keep.map((i) => i.id)).toEqual(["0xb", "0xc"]);
  });
});

describe("walletKey", () => {
  it("is case-insensitive and kind-aware", () => {
    expect(walletKey({ kind: "evm", query: "0xAB" })).toBe(walletKey({ kind: "evm", query: "0xab" }));
    expect(walletKey({ kind: "ens", query: "a.eth" })).not.toBe(walletKey({ kind: "evm", query: "a.eth" }));
  });
});

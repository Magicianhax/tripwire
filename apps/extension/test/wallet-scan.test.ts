// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createScanState, removeSlot, scanForWallets, SLOT_ATTR } from "../lib/wallet/scan";

const EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOL = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

const scan = (state = createScanState()) => scanForWallets(document.body, { state });

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("scanForWallets", () => {
  it("marks an address in running text without changing what the page reads", () => {
    document.body.innerHTML = `<p id="post">ape into ${EVM} now</p>`;
    const hits = scan();
    expect(hits).toHaveLength(1);
    expect(hits[0]!.ref).toEqual({ kind: "evm", query: EVM });
    expect(document.getElementById("post")!.textContent).toBe(`ape into ${EVM} now`);
    // The slot sits immediately after the match, not around it.
    expect(hits[0]!.slot.parentElement!.id).toBe("post");
    expect(hits[0]!.slot.previousSibling!.textContent!.endsWith(EVM)).toBe(true);
    expect(hits[0]!.slot.nextSibling!.textContent).toBe(" now");
  });

  it("marks an explorer link once, as the link, not again as its text", () => {
    document.body.innerHTML = `<a id="l" href="https://etherscan.io/address/${EVM}">${EVM}</a>`;
    const hits = scan();
    expect(hits).toHaveLength(1);
    expect(hits[0]!.ref.chainHint).toBe("ethereum");
    expect(hits[0]!.slot.previousElementSibling!.id).toBe("l");
  });

  it("finds an ENS name and a Solana address", () => {
    document.body.innerHTML = `<p>gm vitalik.eth</p><p>ca ${SOL}</p>`;
    expect(scan().map((h) => h.ref)).toEqual([
      { kind: "ens", query: "vitalik.eth" },
      { kind: "solana", query: SOL },
    ]);
  });

  it("never marks what the user is typing", () => {
    document.body.innerHTML = `
      <input value="${EVM}">
      <textarea>${EVM}</textarea>
      <div contenteditable="true">${EVM}</div>
      <code>${EVM}</code>`;
    expect(scan()).toEqual([]);
  });

  it("never marks its own UI", () => {
    document.body.innerHTML = `<tripwire-ui><p>${EVM}</p></tripwire-ui><span ${SLOT_ATTR}><i>${EVM}</i></span>`;
    expect(scan()).toEqual([]);
  });

  it("marks the same text node only once, however often the page is rescanned", () => {
    document.body.innerHTML = `<p>${EVM}</p>`;
    const state = createScanState();
    expect(scan(state)).toHaveLength(1);
    expect(scan(state)).toHaveLength(0);
    expect(scan(state)).toHaveLength(0);
    expect(document.querySelectorAll(`[${SLOT_ATTR}]`)).toHaveLength(1);
  });

  it("picks up a wallet added after the first pass", () => {
    document.body.innerHTML = `<p>nothing here</p>`;
    const state = createScanState();
    expect(scan(state)).toEqual([]);
    document.body.insertAdjacentHTML("beforeend", `<p>later: ${EVM}</p>`);
    expect(scan(state)).toHaveLength(1);
  });

  it("marks several addresses in one text node, left to right, at the right offsets", () => {
    document.body.innerHTML = `<p id="p">${EVM} beat ${SOL} today</p>`;
    const hits = scan();
    expect(hits.map((h) => h.ref.query)).toEqual([SOL, EVM]); // split right-to-left
    expect(document.getElementById("p")!.textContent).toBe(`${EVM} beat ${SOL} today`);
    const slots = [...document.querySelectorAll(`[${SLOT_ATTR}]`)];
    expect(slots[0]!.previousSibling!.textContent!.endsWith(EVM)).toBe(true);
    expect(slots[1]!.previousSibling!.textContent!.endsWith(SOL)).toBe(true);
  });

  it("skips a wallet the page already handles as something else", () => {
    document.body.innerHTML = `<p>${SOL} and ${EVM}</p>`;
    const hits = scanForWallets(document.body, {
      state: createScanState(),
      skip: (ref) => ref.query.toLowerCase() === SOL.toLowerCase(),
    });
    expect(hits.map((h) => h.ref.query)).toEqual([EVM]);
  });

  it("stops at the pass limit", () => {
    document.body.innerHTML = Array.from({ length: 10 }, (_, i) => `<p>0x${String(i).repeat(2)}${"ab".repeat(19)}</p>`).join("");
    expect(scanForWallets(document.body, { state: createScanState(), limit: 3 })).toHaveLength(3);
  });

  it("leaves the text whole again when a marker is removed", () => {
    document.body.innerHTML = `<p id="p">to ${EVM} now</p>`;
    const [hit] = scan();
    removeSlot(hit!.slot);
    const p = document.getElementById("p")!;
    expect(p.textContent).toBe(`to ${EVM} now`);
    expect(p.childNodes).toHaveLength(1);
    expect(document.querySelectorAll(`[${SLOT_ATTR}]`)).toHaveLength(0);
  });

  it("never marks a transaction hash", () => {
    document.body.innerHTML = `<p>tx 0x${"a1".repeat(32)}</p><a href="https://etherscan.io/tx/0x${"a1".repeat(32)}">tx</a>`;
    expect(scan()).toEqual([]);
  });
});

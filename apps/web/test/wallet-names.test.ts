import { describe, expect, it } from "vitest";
import { keccak, namehash } from "@/lib/wallet/names";

/**
 * The ENS RPC fallback stands on a hand-written keccak-256: Node ships SHA3-256, which is a
 * different padding, and this repo has no hashing dependency. So it is checked against the
 * published vectors, and namehash against values that were confirmed live against the ENS
 * registry on 2026-09-18 (`resolver(namehash("vitalik.eth"))` returned the public resolver,
 * whose `addr` returned 0xd8dA…6045).
 */
describe("keccak-256", () => {
  const hex = (s: string) => keccak(Buffer.from(s, "utf8")).toString("hex");

  it("matches the published vectors", () => {
    expect(hex("")).toBe("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(hex("abc")).toBe("4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
    expect(hex("The quick brown fox jumps over the lazy dog")).toBe("4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15");
  });

  it("handles input longer than one 136-byte block", () => {
    expect(hex("a".repeat(200))).toHaveLength(64);
    expect(hex("a".repeat(136))).not.toBe(hex("a".repeat(137)));
  });
});

describe("namehash", () => {
  it("matches EIP-137", () => {
    expect(namehash("")).toBe(`0x${"00".repeat(32)}`);
    expect(namehash("eth")).toBe("0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae"); // gitleaks:allow -- published EIP-137 vector
    expect(namehash("foo.eth")).toBe("0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f"); // gitleaks:allow -- published EIP-137 vector
  });

  it("matches the live-verified vitalik.eth node", () => {
    expect(namehash("vitalik.eth")).toBe("0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835"); // gitleaks:allow -- public ENS node hash
  });
});

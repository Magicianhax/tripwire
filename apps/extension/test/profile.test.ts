// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProfileDiscovery, parseProfile, type ProfileHeader } from "../lib/x/profile";

function header(handle = "zachxbt", name = "ZachXBT") {
  document.body.innerHTML = `<main data-testid="primaryColumn"><div data-testid="UserName"><div><span>${name}</span><button aria-label="Verified"><svg><title>Verified</title></svg></button></div><div><span>@${handle}</span></div></div></main>`;
  return parseProfile(document, `/${handle}`)!;
}
afterEach(() => { document.body.innerHTML = ""; });

describe("profile identity and badge anchor", () => {
  it("recognizes nested React Native identity rows in the main profile", () => {
    document.body.innerHTML = `<main data-testid="primaryColumn"><div data-testid="UserName"><div><div><div><span>vitalik.eth</span><span role="button" aria-label="Verified"><svg></svg></span></div></div><div><div><span>@VitalikButerin</span></div></div></div></div></main>`;
    const profile = parseProfile(document, "/VitalikButerin");
    expect(profile?.displayName).toBe("vitalik.eth");
    expect(profile?.anchor.querySelector('[aria-label="Verified"]')).not.toBeNull();
    expect(profile?.anchor.parentElement?.closest('a,button,[role="button"]')).toBeNull();
  });
  it("recognizes the live semantic X header without test IDs", () => {
    document.body.innerHTML = `<div><div class="overflow-hidden flex flex-col items-start"><span class="flex max-w-full min-w-0 shrink-0 items-center gap-1"><h1>ZachXBT</h1><div class="flex shrink-0 items-center gap-1"><span aria-label="Verified account" role="button" tabindex="0"><svg></svg></span></div></span><span class="flex min-w-0 items-center gap-2"><span>@zachxbt</span></span></div></div>`;
    const profile = parseProfile(document, "/zachxbt");
    expect(profile?.displayName).toBe("ZachXBT");
    expect(profile?.anchor.querySelector('[aria-label="Verified account"]')).not.toBeNull();
    expect(profile?.anchor.parentElement?.closest("a,button,[role=button]")).toBeNull();
    const badge = document.createElement("tripwire-ui");
    profile?.anchor.after(badge);
    expect(parseProfile(document, "/zachxbt")?.anchor).toBe(profile?.anchor);
    expect(parseProfile(document, "/VitalikButerin")).toBeNull();
  });
  it("rejects ambiguous headings and an unrelated handle outside the adjacent identity row", () => {
    document.body.innerHTML = `<div><span><h1>ZachXBT</h1></span><span>Other content</span><span>@zachxbt</span></div>`;
    expect(parseProfile(document, "/zachxbt")).toBeNull();
    document.body.innerHTML = `<div><span><h1>ZachXBT</h1></span><span>@zachxbt</span></div><h1>Another identity</h1>`;
    expect(parseProfile(document, "/zachxbt")).toBeNull();
  });
  it("recognizes ordinary handles and anchors after the verification control", () => {
    const profile = header();
    expect(profile.handle).toBe("zachxbt");
    expect(profile.displayName).toBe("ZachXBT");
    expect(profile.anchor.tagName).toBe("BUTTON");
    expect(profile.anchor.parentElement?.closest("a,button")).toBeNull();
    expect(parseProfile(document, "/ZachXBT/media")?.handle).toBe("ZachXBT");
  });
  it("ignores injected badge content and preserves the same anchor", () => {
    const profile = header("VitalikButerin", "vitalik.eth");
    const badge = document.createElement("tripwire-ui");
    badge.textContent = "Nansen";
    profile.anchor.after(badge);
    expect(parseProfile(document, "/VitalikButerin")?.anchor).toBe(profile.anchor);
    expect(parseProfile(document, "/VitalikButerin")?.displayName).toBe("vitalik.eth");
  });
  it("rejects stale identities, reserved routes, status pages and nested tweet headers", () => {
    const profile = header();
    for (const path of ["/VitalikButerin", "/home", "/search", "/zachxbt/status/123", "/zachxbt/followers"]) {
      expect(parseProfile(document, path)).toBeNull();
    }
    const article = document.createElement("article");
    profile.owner.before(article);
    article.append(profile.owner);
    expect(parseProfile(document, "/zachxbt")).toBeNull();
  });
  it("waits for both identity rows and refuses an interactive parent", () => {
    const profile = header();
    profile.owner.lastElementChild?.remove();
    expect(parseProfile(document, "/zachxbt")).toBeNull();
    const next = header();
    next.anchor.parentElement?.setAttribute("role", "button");
    expect(parseProfile(document, "/zachxbt")).toBeNull();
  });
});

describe("profile discovery lifetime", () => {
  it("waits for hydration, attaches once, and tears down on navigation", async () => {
    let profile: ProfileHeader | null = null;
    const dispose = vi.fn();
    const attach = vi.fn(async () => ({ dispose, retry: false }));
    const discovery = createProfileDiscovery({ read: () => profile, attach });
    await discovery.tick();
    expect(attach).not.toHaveBeenCalled();
    profile = header();
    await discovery.tick();
    await discovery.tick();
    expect(attach).toHaveBeenCalledTimes(1);
    profile = null;
    await discovery.tick();
    expect(dispose).toHaveBeenCalledTimes(1);
    discovery.stop();
  });
  it("discards stale in-flight mounts and allows a new account", async () => {
    let profile: ProfileHeader | null = header();
    let finish!: (value: { dispose(): void; retry: boolean }) => void;
    let valid!: () => boolean;
    const dispose = vi.fn();
    const discovery = createProfileDiscovery({ read: () => profile, attach: async (_profile, isCurrent) => {
      valid = isCurrent;
      return new Promise((resolve) => { finish = resolve; });
    } });
    const pending = discovery.tick();
    profile = null;
    expect(valid()).toBe(false);
    await discovery.tick();
    finish({ dispose, retry: false });
    await pending;
    expect(dispose).toHaveBeenCalledTimes(1);
    discovery.stop();
  });
  it("caps transient retries at three and disposes successful attachments on stop", async () => {
    const profile = header();
    const dispose = vi.fn();
    const attach = vi.fn(async () => ({ dispose, retry: true }));
    const discovery = createProfileDiscovery({ read: () => profile, attach });
    for (let i = 0; i < 10; i++) await discovery.tick();
    expect(attach).toHaveBeenCalledTimes(3);
    discovery.stop();
    expect(dispose).toHaveBeenCalledTimes(3);
    await discovery.tick();
    expect(attach).toHaveBeenCalledTimes(3);
  });
  it("replaces an attachment when X reuses a connected header for another account", async () => {
    let profile = header();
    const dispose = vi.fn();
    const attach = vi.fn(async () => ({ dispose, retry: false }));
    const discovery = createProfileDiscovery({ read: () => profile, attach });
    await discovery.tick();
    profile = { ...profile, handle: "VitalikButerin", displayName: "vitalik.eth" };
    await discovery.tick();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(2);
    discovery.stop();
  });
});

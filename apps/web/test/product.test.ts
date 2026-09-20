import { describe, expect, it } from "vitest";
import { repositoryLinks } from "../lib/product";

describe("product release configuration", () => {
  it("leaves download unavailable until a real repository is configured", () => {
    expect(repositoryLinks(undefined)).toBeNull();
    expect(repositoryLinks("")).toBeNull();
  });
  it("links to packaged releases rather than pretending to download source code", () => {
    expect(repositoryLinks("https://github.com/example/tripwire/")).toEqual({repository:"https://github.com/example/tripwire",release:"https://github.com/example/tripwire/releases/latest"});
  });
  it.each(["javascript:alert(1)","http://github.com/example/repo","https://github.com.evil.test/a/b","https://user:pass@github.com/a/b","https://github.com/a","https://github.com/a/b/releases/latest"])("rejects malformed or unsafe repository %s", value => {
    expect(repositoryLinks(value)).toBeNull();
  });
});

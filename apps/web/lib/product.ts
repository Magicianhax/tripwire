import { EXTENSION_RELEASE_ASSET, TRIPWIRE_REPOSITORY_URL } from "@tripwire/core";

/**
 * The repository, its releases page, and the packaged extension in the latest release — the zip
 * `.github/workflows/release.yml` attaches, never GitHub's source-code archive. Null for anything
 * that is not a plain https://github.com/<owner>/<repo>.
 */
export function repositoryLinks(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port) return null;
    const parts = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts.length !== 2 || parts.some(part => !/^[\w.-]+$/.test(part) || part === "." || part === "..")) return null;
    const repository = `https://github.com/${parts.join("/")}`;
    return { repository, release: `${repository}/releases/latest`, download: `${repository}/releases/latest/download/${EXTENSION_RELEASE_ASSET}` };
  } catch { return null; }
}

/** The links the product page shows: the configured repository, or Tripwire's own. */
export const productLinks = () => repositoryLinks(process.env.TRIPWIRE_REPOSITORY_URL || TRIPWIRE_REPOSITORY_URL);

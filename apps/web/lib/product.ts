/** Configure after the public release repository is ready. Never invent a download URL. */
export function repositoryLinks(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port) return null;
    const parts = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts.length !== 2 || parts.some(part => !/^[\w.-]+$/.test(part) || part === "." || part === "..")) return null;
    const repository = `https://github.com/${parts.join("/")}`;
    return { repository, release: `${repository}/releases/latest` };
  } catch { return null; }
}

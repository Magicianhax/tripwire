/**
 * Packaged fonts for content-script UI. `@font-face` doesn't work inside a shadow root, and
 * WXT copies any @font-face in an entry's CSS into a NEW document `<style>` on every mount
 * (with the fonts inlined as base64, ~556KB each). Instead the woff2 files ship as
 * web_accessible_resources under `fonts/` (copied from @fontsource by wxt.config.ts) and ONE
 * small `<style data-tripwire-fonts>` is added to the host document, however many chips mount.
 *
 * Family names are Tripwire-prefixed so the rules can never restyle the host page's own text.
 * No DOM or extension-runtime imports here: wxt.config.ts imports FONT_FILES at build time.
 */

export type FontFile = {
  family: "Tripwire Inter" | "Tripwire Sora" | "Tripwire Mono";
  /** npm package that ships the file, and the file name inside its `files/` dir. */
  pkg: "@fontsource/inter" | "@fontsource/sora" | "@fontsource/jetbrains-mono";
  file: string;
  weight: string;
  format: "woff2";
  unicodeRange: string;
};

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

type Pkg = FontFile["pkg"];
const FAMILY: Record<Pkg, { family: FontFile["family"]; prefix: string }> = {
  "@fontsource/inter": { family: "Tripwire Inter", prefix: "inter" },
  "@fontsource/sora": { family: "Tripwire Sora", prefix: "sora" },
  "@fontsource/jetbrains-mono": { family: "Tripwire Mono", prefix: "jetbrains-mono" },
};

/** Both latin subsets of each weight: the unicode-range keeps latin-ext from loading unless a
 * character needs it. */
function weights(pkg: Pkg, list: string[]): FontFile[] {
  const { family, prefix } = FAMILY[pkg];
  return list.flatMap((weight) =>
    (
      [
        ["latin-ext", LATIN_EXT],
        ["latin", LATIN],
      ] as const
    ).map(([subset, unicodeRange]) => ({ family, pkg, file: `${prefix}-${subset}-${weight}-normal.woff2`, weight, format: "woff2" as const, unicodeRange })),
  );
}

/** Inter for UI text and figures (tabular numerals), Sora for headings and verdict words,
 * JetBrains Mono only for addresses and hashes. */
export const FONT_FILES: FontFile[] = [
  ...weights("@fontsource/inter", ["400", "500", "600"]),
  ...weights("@fontsource/sora", ["600", "700"]),
  ...weights("@fontsource/jetbrains-mono", ["400"]),
];

/** Published path of a font inside the extension (and its web_accessible_resources pattern). */
export const FONT_DIR = "fonts";

export function fontFaceCss(urlFor: (publicPath: string) => string): string {
  return FONT_FILES.map((f) =>
    [
      "@font-face{",
      `font-family:"${f.family}";font-style:normal;font-display:swap;font-weight:${f.weight};`,
      `src:url("${urlFor(`/${FONT_DIR}/${f.file}`)}") format("${f.format}");`,
      `unicode-range:${f.unicodeRange};}`,
    ].join(""),
  ).join("\n");
}

const MARKER = "data-tripwire-fonts";

/** Adds the @font-face rules to `doc` once; later calls are no-ops. */
export function ensureFontFaces(doc: Document, urlFor: (publicPath: string) => string): void {
  if (doc.querySelector(`style[${MARKER}]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(MARKER, "");
  style.textContent = fontFaceCss(urlFor);
  (doc.head ?? doc.documentElement).append(style);
}

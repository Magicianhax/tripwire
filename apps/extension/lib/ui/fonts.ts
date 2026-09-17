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
  family: "Tripwire Archivo" | "Tripwire Mono";
  /** npm package that ships the file, and the file name inside its `files/` dir. */
  pkg: "@fontsource-variable/archivo" | "@fontsource/jetbrains-mono";
  file: string;
  weight: string;
  stretch?: string;
  format: "woff2" | "woff2-variations";
  unicodeRange: string;
};

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

const archivo = (subset: string, unicodeRange: string): FontFile => ({
  family: "Tripwire Archivo",
  pkg: "@fontsource-variable/archivo",
  file: `archivo-${subset}-standard-normal.woff2`,
  weight: "100 900",
  stretch: "62% 125%",
  format: "woff2-variations",
  unicodeRange,
});

const mono = (subset: string, weight: "400" | "700", unicodeRange: string): FontFile => ({
  family: "Tripwire Mono",
  pkg: "@fontsource/jetbrains-mono",
  file: `jetbrains-mono-${subset}-${weight}-normal.woff2`,
  weight,
  format: "woff2",
  unicodeRange,
});

export const FONT_FILES: FontFile[] = [
  archivo("latin-ext", LATIN_EXT),
  archivo("latin", LATIN),
  mono("latin-ext", "400", LATIN_EXT),
  mono("latin", "400", LATIN),
  mono("latin-ext", "700", LATIN_EXT),
  mono("latin", "700", LATIN),
];

/** Published path of a font inside the extension (and its web_accessible_resources pattern). */
export const FONT_DIR = "fonts";

export function fontFaceCss(urlFor: (publicPath: string) => string): string {
  return FONT_FILES.map((f) =>
    [
      "@font-face{",
      `font-family:"${f.family}";font-style:normal;font-display:swap;font-weight:${f.weight};`,
      f.stretch ? `font-stretch:${f.stretch};` : "",
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

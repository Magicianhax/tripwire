/**
 * The published Tripwire extension's pinned Chrome extension ID. It is derived from the public
 * `key` in apps/extension/wxt.config.ts (sha256 of the SubjectPublicKeyInfo DER, first 32 hex
 * digits mapped 0-f -> a-p); apps/extension/test/extension-id.test.ts recomputes it. The backend
 * only accepts `chrome-extension://${TRIPWIRE_EXTENSION_ID}` unless TRIPWIRE_EXTENSION_ORIGIN
 * overrides it (forks that load the extension with their own key).
 */
export const TRIPWIRE_EXTENSION_ID = "hocgbioagcfmdpgcnfgnneopohjfkeoj";

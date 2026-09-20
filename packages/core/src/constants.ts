/**
 * The published Tripwire extension's pinned Chrome extension ID. It is derived from the public
 * `key` in apps/extension/wxt.config.ts (sha256 of the SubjectPublicKeyInfo DER, first 32 hex
 * digits mapped 0-f -> a-p); apps/extension/test/extension-id.test.ts recomputes it. The backend
 * only accepts `chrome-extension://${TRIPWIRE_EXTENSION_ID}` unless TRIPWIRE_EXTENSION_ORIGIN
 * overrides it (forks that load the extension with their own key).
 */
export const TRIPWIRE_EXTENSION_ID = "hocgbioagcfmdpgcnfgnneopohjfkeoj";

/**
 * The first usage milestone the ledger counts toward, so "is this thing actually being used
 * against live Nansen data?" has a number rather than an impression. A printed milestone that
 * drifts from the measured count is the same defect as a printed price that drifts from the
 * charged one, so the ledger reads both from here.
 */
export const LEDGER_CALL_MILESTONE = 1000;

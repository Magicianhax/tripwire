/**
 * The published Tripwire extension's pinned Chrome extension ID. It is derived from the public
 * `key` in apps/extension/wxt.config.ts (sha256 of the SubjectPublicKeyInfo DER, first 32 hex
 * digits mapped 0-f -> a-p); apps/extension/test/extension-id.test.ts recomputes it. The backend
 * only accepts `chrome-extension://${TRIPWIRE_EXTENSION_ID}` unless TRIPWIRE_EXTENSION_ORIGIN
 * overrides it (forks that load the extension with their own key).
 */
export const TRIPWIRE_EXTENSION_ID = "hocgbioagcfmdpgcnfgnneopohjfkeoj";

/**
 * The Nansen Meridian Buildathon's API-call allowance. The ledger page and the popup's counter
 * tile both print progress toward it, and a printed cap that drifts from the measured one is the
 * same defect as a printed price that drifts from the charged one.
 */
export const BUILDATHON_CALL_CAP = 1000;

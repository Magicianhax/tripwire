/** The replay backend's port for e2e runs: 3000 by default, or TRIPWIRE_E2E_PORT when 3000 is
 * busy (for example a live dev server). */
export const E2E_PORT = /^\d{2,5}$/.test(process.env.TRIPWIRE_E2E_PORT ?? "") ? process.env.TRIPWIRE_E2E_PORT! : "3000";

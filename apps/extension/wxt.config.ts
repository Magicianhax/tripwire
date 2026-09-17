import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Tripwire",
    description:
      "Nansen onchain data at the moment of decision: verdicts on X posts, trade blocks on DEX, perp and prediction venues.",
    permissions: ["storage"],
    host_permissions: ["http://127.0.0.1:3000/*", "http://localhost:3000/*"],
  },
});

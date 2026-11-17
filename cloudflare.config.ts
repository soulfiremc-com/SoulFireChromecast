import { defineConfig } from "cf/config";

// The Cast receiver is a static single-page app, served as an assets-only Worker.
export default defineConfig({
  accountId: "4dd0e72d7bf89402be905fb40cdb230a",
  worker: {
    name: "soulfire-chromecast",
    domains: ["cast-receiver.soulfiremc.com"],
    compatibilityDate: "2026-04-10",
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "single-page-application",
    },
  },
});

const { defineConfig } = require("@playwright/test");
// The managed Windows test host cannot start Chromium's sandbox/GPU child process.
// This flag is consumed only by the desktop test entry; production keeps its sandbox.
process.env.TECHORBIT_E2E_COMPATIBILITY = "1";
module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 90000,
  workers: 1,
  reporter: "list",
  use: { trace: "retain-on-failure" },
});

# Desktop trust boundary (P064)

The renderer is untrusted. It runs with Node integration disabled, context
isolation enabled, and a sandbox in production. The preload exposes only the
158 named commands in `commands.cjs`; main accepts IPC only from the current
main frame at `techorbit://app/index.html`. The custom protocol serves only the
Vite entry and named flat assets, with no arbitrary disk path translation.
Navigation, new windows, and web permission requests are denied. The entry
page applies a restrictive Content Security Policy.

`src/contracts.ts` is the input type inventory. `scripts/build-ipc-schemas.cjs`
generates `ipc-schemas.json` on every build, and `ipc-contract.cjs` validates
all command inputs at the main boundary and again in the worker. Unknown
fields, unexpected types, dangerous object keys, oversized strings/arrays,
out-of-range paging, and unsafe import filenames are rejected before dispatch.
The worker's `Gateway` requires an active session for all business commands;
each branch enforces its own permission. Exceptions are `login`, `logout`, and
`reviewAccess` (the latter intentionally displays the isolated demo credential
on the sign-in page). `resetDemo` requires an authenticated admin with
`user.manage` permission and is unavailable against a live database.

IPC failures return a stable code and request ID to the preload. SQLite and
filesystem details are converted to a generic internal error. Business-rule
messages remain user-facing. Never log input payloads or credential values.

Production packaging still needs a separate Electron fuse and signer review,
including RunAsNode, NodeOptions, ASAR integrity, code signing, update channel,
and a packaged-app smoke test. This is part of the release hardening gate,
not a claim that the current source checkout is ready for go-live. The
`TECHORBIT_E2E_COMPATIBILITY` environment override disables the sandbox for
the managed test host only; it must be blocked/removed from signed releases.

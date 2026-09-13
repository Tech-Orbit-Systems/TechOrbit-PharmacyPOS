# Approved UI — implementation increment 1

React + TypeScript + Vite renderer for the approved Dashboard/POS. One component tree and CSS token sheet serve Light, Dark and System appearance; no alternate dark layout exists.

## Run locally

From `D:\TechOrbit\PharmacyPOS\source\modernization`:

```powershell
npm ci
npm run build
npm run desktop
```

Default launch creates a separate **TechOrbit UI Review** database under Electron userData. It never imports the legacy server or opens the pharmacy's production SQLite/NeDB data. Review credentials: `demo` / `TechOrbit-Demo-2026!`. These credentials exist only in the seeded review database.

The original application remains available from the source root. This new launcher is a review increment, not the production default or a finished migration.

## Implemented

- Dashboard backed by SQLite, chart presets and custom dates, Pakistan civil-date boundaries, zero-filled buckets, monthly partial-window labels.
- Net amount after sale returns, gross profit after returned cost, receivable/payable summaries guarded by dues-management permission, recent sales and stock/expiry detail dialogs.
- POS barcode lookup, name/generic search, units, quantity, FEFO allocation display, existing customer selection, held-sale save/resume, authoritative quote, atomic sale posting and receipt preview/print path.
- Cash / Card / Digital buttons only. Digital is stored explicitly as `digital` in Sales and MoneyMovements; no bank/provider inference or extra confirmation panel.
- Sandboxed Electron renderer with context isolation, named preload functions, sender validation, login and service-side permission enforcement. SQLite and password work runs in a separate worker thread.
- Theme preference persistence; identical layout geometry checked through actual Electron UI tests.

## Important implementation boundaries

- Only Dashboard, POS and Appearance screens are enabled. Remaining navigation is visibly disabled until those workflows are implemented.
- The existing engine allocates batches automatically with FEFO. The finder displays valid batches; it does not promise manual batch selection that the backend cannot honour.
- Receipt preview and print layout are available after posting; a physical thermal printer has not been tested. Printing is explicitly initiated from the receipt dialog, allowing reprint without reposting.
- Dashboard cash is a user/shift estimate from the existing money ledger; full device-level attribution is not yet available. No open shift shows “No open shift”, not a fabricated amount.
- Alert detail lists are bounded to 100 and labelled 100+ when capped. Ledger detail lists are bounded to 200; full ledger workflows remain in the legacy/backend scope.
- The current quote reuses the existing transaction engine inside a rolled-back savepoint to preserve GST/discount/rounding parity. This is correctness-first; a shared pure pricing service is the next performance refinement before production scale.
- Held sales are stored per user and review/live mode on the local device. They are revalidated at checkout. Active unheld-cart crash recovery and logout policy still need product hardening.
- No automatic live cutover, new production users, real sale, schema rewrite, dependency replacement in the legacy application, installer or release publication has been performed.

## Verification

```powershell
npm test
npm run build
npm run test:e2e
```

The Electron test uses a unique temporary review database, posts a sample Digital sale, checks hold/resume and verifies invoice/finder/payment-bar bounding boxes match exactly across themes. Screenshots are in `evidence/`. Tests do not send payment to an external service.

## Architecture decision

The review desktop uses a narrow IPC adapter over the same domain services as v2 HTTP endpoints. This avoids placing Node access or SQL in React and avoids exposing another localhost server. Transport can later use v2 HTTP for a separate client; domain rules stay shared. Adding a UI does not require replacing the tested database layer with an ORM.

Build follows the official [Vite guide](https://vite.dev/guide/); desktop isolation follows [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

# TechOrbit Pharmacy POS

Standalone desktop pharmacy sales and inventory software maintained by Tech Orbit Systems.

> Status: modernization baseline. Existing POS workflows are being stabilized before the NeDB-to-SQLite migration and UI redesign.

## Current capabilities

- Desktop point of sale with barcode lookup and receipt printing path
- Products, categories, stock levels, suppliers, prices, and expiry tracking
- Customer records and customer orders
- Paid and held transactions with history and filters
- Staff accounts and permissions
- Store/network settings
- Backup and restore workflow

## Development

Requirements: Node.js 24+, npm, and Git.

```text
npm ci
npm test -- --runInBand --coverage=false
node_modules\.bin\electron.cmd .
```

The direct Electron command is the current Windows baseline because the inherited Forge setup detects the legacy Yarn lockfile. Package-manager cleanup is tracked in the modernization roadmap.

## Architecture direction

Persistence will move from NeDB to SQLite before the user interface is redesigned. The target model covers products, batches, purchases, inventory movements, sales, users, suppliers, customers, expenses, returns, cash shifts/closing, settings, and audit history.

## Repository

- Issues: https://github.com/Tech-Orbit-Systems/TechOrbit-PharmacyPOS/issues
- Releases: https://github.com/Tech-Orbit-Systems/TechOrbit-PharmacyPOS/releases

## License and attribution

Licensed under the MIT License. This product contains software originally released as PharmaSpot, copyright © 2023 Nsubuga Derrick. The original MIT copyright and permission notice is preserved in `LICENSE` as required. Subsequent modifications are copyright © 2026 Tech Orbit Systems.

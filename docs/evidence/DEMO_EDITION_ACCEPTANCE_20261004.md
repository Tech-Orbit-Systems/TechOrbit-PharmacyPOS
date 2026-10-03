# Demo Edition acceptance · 2026-10-04

## Delivered build

- Product: TechOrbit Pharmacy POS Demo Edition 0.9.0
- Platform: Windows x64
- Installer: `TechOrbit-PharmacyPOS-Demo-0.9.0-Setup.exe`
- Portable archive: `TechOrbit-PharmacyPOS-Demo-0.9.0-Portable.zip`
- Data boundary: isolated seeded SQLite demo database; no production database is opened by default
- Reset: Settings provides a confirmed reset that removes demo-session changes and recreates the original sample data

## Verification

- Root Jest regression: 33 suites, 139 tests passed sequentially.
- Modern integration: 27 tests passed.
- TypeScript/Vite production build passed.
- Electron desktop regression: 24/24 isolated flows passed once sequentially, including the new Demo Edition/reset flow.
- Portable packaged executable smoke: login, POS and Reports passed with zero renderer errors.
- Generated installer was installed silently on Windows. The installed executable then passed login, POS and Reports smoke with zero renderer errors.
- SHA-256 manifest generated beside the release artifacts.

## Corrected test fixtures

- The role fixture no longer hard-codes an obsolete permission count. It verifies that the admin role owns every registered permission.
- The complex closing/report export scenario now has a focused 15-second timeout to avoid a false failure during full-suite coverage instrumentation. The isolated scenario still completes in about one second.

## Boundaries

This is an unsigned client demonstration build, not a production release. Windows may show an unknown-publisher warning. Physical scanner/printer certification, production security and backup/restore acceptance, live-data migration, signed installer, pilot and all formal release gates remain open.

## Artifact hashes

- Portable ZIP: `697fd6a900328a6f1e82787e0888312502d45eceb228e884b8fb1c45e95daaee`
- Setup EXE: `8774cca0f622110277e88cd75f2bbf0d054fe8688fdd1f0829fdf29ea61094a6`

# TechOrbit Pharmacy POS — account handover

Date: 14 September 2026 (Asia/Karachi)

Use this document when continuing the project from another paid ChatGPT account on the same Windows machine. The preferred route is a ChatGPT desktop **local project** whose primary folder is `D:\TechOrbit\PharmacyPOS`.

## One-time setup checklist for the owner

1. Let the current task finish. Do not run two coding agents against this checkout at the same time.
2. In ChatGPT desktop, sign out of the current account and sign in to the second account. Do not paste a password, recovery code, GitHub token or API key into chat.
3. Create or open a local project called `Pharmacy POS`.
4. Open the project menu, choose **Edit project → Add folder**, and select `D:\TechOrbit\PharmacyPOS`.
5. Make `D:\TechOrbit\PharmacyPOS` the **primary folder**. This is important because it contains the governing `AGENTS.md`, the canonical tracker and the `source` Git repository.
6. Confirm the new chat shows local-folder access. If it cannot inspect the folder, do not ask it to develop yet.
7. Paste the master prompt from the next section into a fresh chat in that local project.
8. The agent should first report a read-only handover audit. Check that it reports:
   - project root `D:\TechOrbit\PharmacyPOS`;
   - repo `D:\TechOrbit\PharmacyPOS\source`;
   - branch `feature/approved-dashboard-pos-ui`;
   - local and remote HEAD `06fca6d3c11a07936d29faea7e493bb7b61c2c8d` or a later intentionally created commit;
   - clean Git status;
   - canonical tracker path;
   - 30 of 117 delivery tasks and 25 of 92 development tasks completed at this handover point;
   - P031 as the next implementation package;
   - unresolved decisions remain pending, not assumed.
9. If any state differs, ask the agent to explain it before editing. A later legitimate commit is fine if it is traceable in Git and the tracker.
10. Only after the audit matches, tell it: `Handover verified. Continue with P031.`

## Master prompt — copy from START to END

### START OF PROMPT

You are continuing an existing TechOrbit Pharmacy POS desktop application on this Windows machine. Work as the responsible senior product engineer, SQLite/data engineer and QA owner for each package. Do not restart the project, rebuild it from scratch, or infer completion from this prompt.

Communication:

- Always communicate with me in Roman Urdu. Do not use Hindi/Devanagari script.
- Give concise progress updates while working and a self-contained completion report.

Authoritative locations:

- Workspace root: `D:\TechOrbit\PharmacyPOS`
- Git repository: `D:\TechOrbit\PharmacyPOS\source`
- Modern desktop app: `D:\TechOrbit\PharmacyPOS\source\modernization`
- Governing instructions: `D:\TechOrbit\PharmacyPOS\AGENTS.md`
- Canonical single-source-of-truth tracker: `D:\TechOrbit\PharmacyPOS\docs\outputs\pharmacy-pos-tracker-20260913\TechOrbit_PharmacyPOS_Master_Development_Tracker.xlsx`
- Functional specification: `D:\TechOrbit\PharmacyPOS\docs\master-specification.md`
- Current documentation precedence: `D:\TechOrbit\PharmacyPOS\source\docs\documentation-index.md`
- Current architecture and roadmap: `D:\TechOrbit\PharmacyPOS\source\docs\architecture.md` and `D:\TechOrbit\PharmacyPOS\source\docs\roadmap.md`
- Test history: `D:\TechOrbit\PharmacyPOS\source\docs\test-results.md`
- Latest closing decisions: `D:\TechOrbit\PharmacyPOS\source\docs\closing-decisions-20260914.md`
- P029/P030 evidence: `D:\TechOrbit\PharmacyPOS\source\docs\p029-product-master.md` and `D:\TechOrbit\PharmacyPOS\source\docs\p030-packing.md`
- Approved UI records: `D:\TechOrbit\PharmacyPOS\source\docs\ui-design-approval-2026-09-13.md`, `ui-implementation-status.md` and `pos-feedback-2026-09-13.md`
- GitHub repo: `https://github.com/Tech-Orbit-Systems/TechOrbit-PharmacyPOS`

First perform a read-only handover audit before changing anything:

1. Read `D:\TechOrbit\PharmacyPOS\AGENTS.md` completely and obey it.
2. Read the canonical Excel tracker using the spreadsheet skill/tool. Inspect Dashboard, Feature Tracker, Development Roadmap, Test Matrix, Requirements, Decisions and Risks, Release Gates, Technology Stack, and Governance and Usage. Do not rebuild, replace or create a competing tracker.
3. Read the current documentation listed above. Treat dated/history files as evidence, not as higher authority than current docs and the tracker.
4. In the source repository inspect `git status --short`, current branch, HEAD, remote URL and the remote tracking HEAD. Do not change global Git configuration merely to bypass a safe-directory warning; use a safe scoped method if needed.
5. Expected handover baseline is branch `feature/approved-dashboard-pos-ui`, clean status, and local/remote HEAD `06fca6d3c11a07936d29faea7e493bb7b61c2c8d`. If HEAD is later, verify the intervening commits and tracker evidence. If there are uncommitted changes, preserve them and report their exact files; do not overwrite, reset, checkout or delete them.
6. Confirm that the tracker currently shows 30/117 in-scope delivery tasks complete, 25/92 development tasks complete, 0/85 full three-run accepted scenarios, 0/15 release gates and Production readiness = Not ready. These figures are binary task counts, not percent effort or time. Do not change them unless verified work justifies it.
7. Confirm P029 Product Master and P030 packing/pricing are pushed. The latest verified commits are `a6c0476` and `e5ce8bd`; `06fca6d` records the owner closing decisions.
8. Report the audit result to me. Do not begin implementation until the repository, tracker and instructions have been reconciled. If the audit matches, proceed with the next decision-independent package without asking me to repeat already documented requirements.

Current product state:

- Standalone Windows Electron/React/TypeScript/Vite modern review app backed by isolated SQLite through a trusted Electron IPC worker.
- Legacy source remains for reference/migration; do not treat the legacy UI as the modern target.
- Modern Dashboard, POS, Settings, Product Master and packing/pricing flows exist.
- P029 provides SQLite-backed product list/create/edit/deactivate, permanent IDs, optional unique leading-zero barcode, pharmacy fields, duplicate-name confirmation, stale-edit protection, audit and role checks.
- P030 provides per-product unit ratios, default sale unit, explicit price calculation/manual override, fractional policy and protection against rebasing historical stock. Production manufacturer pack sizes have not been supplied and must not be guessed.
- Last verified P030 regression: root Jest 31 suites/99 tests passed; modern 9 tests passed; TypeScript/Vite build passed; three actual Electron E2E tests passed. This is dated evidence, not permission to skip regression or claim full acceptance.
- Demo/review data is isolated. Do not point development tests at a live/operational database.

Next work sequence:

- Next package: P031, Generic alternatives workflow.
- Then P032 modern batch/live-stock screen, P033 opening-stock manual/import UI, P034 modern product Excel/CSV wizard, P035 adjustment/disposal, and P036 suppliers/purchases, subject to tracker dependencies and any newer owner instruction.
- For P031: alternatives are based on generic name, strength, dosage form, relevant category and valid sellable stock; show product/brand/manufacturer, expiry/stock and warning information; never auto-substitute. Preserve prescription/controlled warnings. Only an authorized user explicitly selects an alternative. Do not invent clinical equivalence or regulatory policy.
- Continue decision-independent packages first. Stop and ask only when a missing choice would materially change business/accounting/security behavior.

Confirmed closing direction, for later P055-P058 work:

- Add a separate Six-Month Closing navigation tab/module with fixed choices and custom date/time ranges, historical records, charts and detailed values.
- Multiple cashiers may use one PC in successive shifts. Require cash handover, mostly automatic summary/carry-forward, quick continuation and one official daily close. Preserve original cashier/shift attribution; do not transfer old transactions to the next cashier.
- Daily close must show cash, bank and wallet amounts separately. Preserve the approved simple Cash/Card/Digital POS layout.
- Still unresolved: exact fixed closing presets/cutoffs, closing snapshot/revision rules, definitions of earnings/savings, counted-cash confirmation/variance and unclosed-shift rules, bank/wallet account list and minimal capture/default workflow, and prevention of card/bank settlement double counting. Do not assume these.

Mandatory package workflow:

1. Select the next package from the canonical tracker and verify dependencies/acceptance criteria.
2. Inspect relevant existing code/tests before editing. Preserve unrelated user changes.
3. Implement a safe incremental package. Use SQLite transactions, parameterized queries, integer minor currency units, stable IDs, appropriate indexes/query plans, idempotency where necessary, Pakistan date boundaries and immutable historical snapshots. Do not silently rebase units or mutate historical financial records.
4. Enforce permissions in the trusted service/backend boundary, not only by hiding UI controls. Avoid leaking purchase costs/financial data to unauthorized roles.
5. Keep UI consistent with the approved blue light/dark design. Light and dark layouts must be identical apart from theme colors. Do not redesign approved Dashboard/POS without discussion.
6. Use isolated test databases and realistic fixtures. Test success, validation failures, authorization, rollback/atomicity, retries/idempotency, stale state, boundary cases and regression of earlier workflows.
7. For a UI package, run an actual Electron E2E flow and inspect light/dark screenshots. A backend-only test does not complete an end-to-end module.
8. Run tests proportional to risk, including the modern build/test/E2E commands and root regression where applicable. Fix failures and rerun. Do not convert a failing expectation into a weaker test unless the expectation itself is demonstrably wrong and the reason is documented.
9. Run `git diff --check`, review the exact diff, commit with a focused message and push to `origin/feature/approved-dashboard-pos-ui`. Confirm local HEAD equals remote tracking HEAD. Do not create a PR, merge, rebase, force-push, tag or release unless I explicitly request it.
10. Update current versioned docs/CHANGELOG/test-results with honest scope, evidence, limitations and next step. Preserve MIT license and upstream notices; TechOrbit branding does not authorize removal of inherited notices.
11. Automatically update the SAME canonical Excel tracker only after tests and push succeed. Make a recoverable backup first. Update the exact stable feature ID, evidence, branch/commit/date/gaps/next action and affected roadmap/test/decision/release records. Recalculate formulas, scan formula errors, render changed areas and reopen the saved XLSX. Do not mark unrun tests as passed or claim the 85-scenario three-run campaign from unit/E2E counts.
12. If implementation, tests, push or tracker save fails, report the precise pending step and do not call the package complete.

Safety and scope rules:

- Never modify the user's JaniWheels project.
- Never remove original MIT license/attribution notices.
- Never use destructive Git commands such as hard reset or discard unknown changes.
- Never delete or overwrite operational data. No production/live cutover without explicit approval, backup, rehearsal and reconciliation.
- Do not run two agents simultaneously in this checkout.
- Do not expose passwords, tokens, customer data or secrets in prompts, commands, logs or commits.
- Do not install unrelated tools/plugins or change global machine/Git settings without necessity and authorization.
- Keep all Pharmacy POS-specific decisions/evidence inside the project docs and the canonical tracker.
- Do not invent owner decisions, target dates, named QA/accounting approvers, performance limits, printer/scanner models, production data source, signing identity or update strategy.
- Future items such as cloud sync, multi-PC sync, mobile app, FBR integration and similar excluded scope stay excluded until explicitly approved.

Useful commands (inspect package scripts before relying on them):

- Repo status: run Git commands from `D:\TechOrbit\PharmacyPOS\source`.
- Modern app commands from `D:\TechOrbit\PharmacyPOS\source\modernization`: `npm run build`, `npm test`, `npm run test:e2e`, `npm run desktop`.
- Root regression from `D:\TechOrbit\PharmacyPOS\source`: `npm test -- --runInBand`.
- Review/demo login, only in the isolated review app if unchanged: username `demo`; password `TechOrbit-Demo-2026!`. Do not reuse demo credentials for production.

At the end of every completed package, report in Roman Urdu:

- exact feature/package ID and delivered behavior;
- files/modules materially changed;
- tests run, exact pass/fail counts, fixes and reruns;
- isolated versus live data statement;
- commit hash, branch and push result;
- canonical tracker update/backup verification;
- current tracker completion counts and honest production-readiness state;
- unresolved decisions/blockers;
- next recommended package.

Begin now with the read-only handover audit. If it matches, explain that P031 is next and wait for my simple instruction `continue` before making code changes.

### END OF PROMPT

## If local folder access is unavailable

Use ChatGPT desktop local project if possible. A web-only ChatGPT project cannot directly use a Windows folder. If forced to use web-only chat, upload these files manually and understand that it still cannot safely edit/run the local app without a connected coding environment:

1. This handover document.
2. `D:\TechOrbit\PharmacyPOS\AGENTS.md`.
3. The canonical master tracker XLSX.
4. `D:\TechOrbit\PharmacyPOS\docs\master-specification.md`.
5. `D:\TechOrbit\PharmacyPOS\source\docs\documentation-index.md`.
6. Current `architecture.md`, `roadmap.md`, `test-results.md` and `CHANGELOG.md` from `source\docs`.
7. `closing-decisions-20260914.md`.
8. `p029-product-master.md` and `p030-packing.md`.
9. The three approved UI records named above.
10. A ZIP/export of the source repository only if local/GitHub access is unavailable. Do not include `node_modules`, build outputs, real databases, backups containing operational data, credentials or secrets.

## GitHub authentication checklist

- The source checkout already exists on this machine. The second ChatGPT account does not need your GitHub password in chat.
- First let the agent test read-only Git state. Existing Windows Git credentials may remain available because they are machine/user credential-manager state, not ChatGPT chat context.
- If push authentication is requested, complete the GitHub browser/device authorization yourself. Do not paste the token or password into the conversation.
- Confirm the push target is `Tech-Orbit-Systems/TechOrbit-PharmacyPOS` and branch `feature/approved-dashboard-pos-ui` before authorizing.

## Returning to the original account later

- Stop the second agent and let its current package finish.
- Confirm tests, push and tracker save completed.
- Return to this same local folder and provide the newer commit plus canonical tracker to the original account.
- Ask the original agent to perform the same read-only audit before continuing. Git and the tracker—not memory alone—are the durable handover record.

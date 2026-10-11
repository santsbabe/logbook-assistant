# Legacy Life Management Toolkit — migration handoff
**Status:** scope reconciliation complete; implementation and device acceptance outstanding  
**Date:** 11 October 2026  
**Build Garden parent:** `notion-life-toolkit` (administrative tracking only)

## Non-negotiable boundaries
- Retire the separate Notion app and **do not** add third-party applications.
- Keep existing FamilyRoy, Bloom, BudgetRoy/Cashflow, Build Garden, Google Drive, school and other tools; do not rebuild their functioning components.
- Preview/test branches only. Do not merge to `main`, publish, trigger new Netlify deployments, or expose sensitive records without Santie's explicit production approval.
- A classified or queued Intake record is **not** proof of delivery or an iPhone notification.
- Preserve existing data, histories, approval gates and recovery paths.

## Completed scope decisions
| Question | Decision | Disposition |
| --- | --- | --- |
| Q1 | D: work and family travel | M1 → FamilyRoy; keep Logbook Assistant separate |
| Q2 | C: personal/family medical admin fragmented | M2 → FamilyRoy family admin; Bloom personal tracking |
| Q3 | A: work planning adequate | Retire all legacy work-planner features |
| Q4 | E: audit finance and personal admin | A1; complete existing workbook/ingestion before adding anything |
| Q5 | E: audit family operations | A2; verify existing school, shopping, meal, chore and household modules |
| Q6 | E: audit dashboard/reminders coordination | A3; fix coordination rather than build another dashboard |
| Q7 | D: documents and reminders | M3 → FamilyRoy Personal Admin + Google Drive |
| Q8 | C: multi-step life-event checklists | M4 → extend existing dependency-aware Personal Admin cases only |
| Q9 | D: emergency reference + secure records | M5 → FamilyRoy SOS + Bloom + appropriately restricted Google Drive |

## Functional audit findings — distinguish evidence from acceptance
**A1 — partial:** The 8 October Cashflow backup contains 35 worksheets/sections, and Matthew's 14/14 bank-statement audit is documented. Santie's ledger remains uneven, January Sixty60 details are missing, and the September statement had not been imported in that snapshot. No live reconciled FamilyRoy feed is verified.

**A2 — partial:** Published FamilyRoy and QA FamilyRoy have different capabilities. The School Notice parser's v13 QA passed, but end-to-end intake must still be checked. The Shopping Radar manual UI exists; stationery/deal monitors are not automatically inserting reliable BUY/WATCH/CHECK HOME items. Meal/chore UI coverage not demonstrated in published FamilyRoy. Term 4 Launch Pad interaction issues remain in its separate project.

**A3 — partial:** Build Garden reads `project-board/projects.json`; FamilyRoy live stores task, shopping and document state in browser localStorage. No verified, durable cross-app task synchronisation or guaranteed iPhone reminder delivery. Do not equate enabled task automations or passing CI with delivered alerts.

## Intake verification work (existing code, not a new project)
- Existing open stacked preview PR: [final-router-hardening #9](https://github.com/santsbabe/familyroy-intake/pull/9). Existing adapters include homework, School Readiness, calendar, contacts, repairs, electricity, admin, pets, shopping, food and review.
- The PR9 head (`6172ce1`) failed automated tests: literal `\\n` between `inferChildren` and `calendarCandidate` in `core.mjs` causes a SyntaxError; missing empty `alerts` for unresolved calendar candidates causes another failure.
- Isolated remediation: [`audit/intake-preflight-20261011`](https://github.com/santsbabe/familyroy-intake/tree/audit/intake-preflight-20261011) corrects those two faults on the existing preview head, without touching production. **Do not** claim acceptance until tests actually pass.
- The PR9 preview-smoke workflow was blocked waiting for a matching Netlify deploy context. Do **not** initiate a Netlify deploy merely to satisfy that smoke job. Keep live smoke and iPhone acceptance separate from local/static and GitHub CI checks.
- Intake consumer acceptance must verify receipt → deterministic source ID → all correct route projections → outbox → scoped browser capability → destination dedupe and durable save → acknowledgement → duplicate re-share partial-route repair. School messages may have several destinations. Queue != delivered.
- Recovery should reopen a pending route without re-sharing source material, and sensitive credentials must never appear in browser localStorage, public source, URLs or notification text.

## Future feature packages (only confirmed gaps)
- **M1** Travel: work/family trip itinerary, documents, booking refs and reminders in FamilyRoy. Do not duplicate existing calendar, maps or Logbook Assistant.
- **M2** Family medical admin: appointments, referrals, prescriptions, claims, invoices and follow-up actions in FamilyRoy; Bloom remains personal health data. Record privacy boundary.
- **M3** Documents: Google Drive remains source storage, FamilyRoy records search/index metadata, authorised links and expiry/renewal/missing status.
- **M4** Life-event cases: extend Personal Admin stages/owners/dependencies/next action/evidence; do not create blanket monthly checklists.
- **M5** Emergency: readable SOS instructions and contacts plus access-controlled sensitive-record retrieval, without a password vault or raw record duplication.

## Completion evidence required
1. Every retained requirement has an assigned existing owning project (assigned in `projects.json`).
2. A1–A3 defects remediated and independently checked against real data.
3. Unit/CI and QA smoke checks pass for the specific commit; no confusing old passes with current failures.
4. Device-only steps grouped for the smallest feasible real-use acceptance test.
5. Security checks for school/medical/private records; durable acknowledgements, provenance, dedupe and recovery.
6. User explicitly approves any production deployment. Only then consider `notion-life-toolkit` closure after verified handoff; no standalone Notion build.

**Current release decision:** preview branch only, no main merge, no production deploy.
## Isolated preflight outcome — 11 October 2026
- **PASS:** [GitHub CI run 38166125892](https://github.com/santsbabe/familyroy-intake/actions/runs/38166125892) on audit commit `6c48575db536abd4edc9940e4cfc77a8b756e36c`: **124/124 tests passing**, zero failures, and `npm run check:functions` passed.
- Corrected a literal backslash-n causing a router syntax error, added empty alerts for unresolved calendar candidates, and aligned an obsolete route-projection test with existing domain/electricity candidate contracts.
- **NOT YET PASSED:** the original stacked PR9 branch remains as originally failed; fixes are in an isolated audit branch and are **not merged**. Its Netlify deploy-preview smoke workflow previously failed while awaiting an exact-commit preview context, so this isolated GitHub test result is not a live smoke acceptance result.
- **Still outstanding:** preview runtime acceptance for the corrected code, route-by-route outbox delivery confirmation, recovery/dedupe in the destination apps, and grouped iPhone/Chrome acceptance where unavoidable. There was **no production deployment or merge**.

## Delivery/recovery verification — 11 October 2026, Batch 2
### Source and outbox contract
- [Intake CI run 38169768996](https://github.com/santsbabe/familyroy-intake/actions/runs/38169768996) at `a7fe4e8b73548448ec406786b703a233cbe6eec0`: **130/130 tests passed; function compilation passed**. No preview or production deploy was started.
- Verified in isolated code tests: one shared PNPS item produces separate homework/readiness/calendar route records; the same canonical source ID remains stable; an already-consumed destination is not requeued on re-share; pending routes remain separately recoverable.
- Corrected `/handoff` duplicate POST handling to check explicit acknowledgement intent and matching source ID **before** responding as already acknowledged. A revoked/mismatched source cannot silently get a positive acknowledgement.
- Corrected `usageInterval` for the actual **prepaid remaining-balance** convention: 129.06 → 125.39 is 3.67 kWh used; increases indicate recharge/top-up, not consumption. These are source-level changes, not live-device confirmation.

### FamilyRoy QA receiver
- [Receiver CI run 38169974734](https://github.com/santsbabe/logbook-assistant/actions/runs/38169974734) at `28a663c49604ac6c61445c4c1257d6456e733167`: **7/7 receiver contract tests passed** and inline syntax check passed. Branch `audit/readiness-handoff-20261011` is isolated and not published.
- The previous title-only School Readiness dedupe could collapse a later week's identical Friday obligation. Staged identity incorporates title + child + due date; undated tasks remain source-scoped.
- The QA handoff now restricts the endpoint to the known FamilyRoy Intake host(s) and provides a one-tap retry of the current scoped handoff after transient failure. Re-sharing after expiry remains deduplicated.
- Production FamilyRoy and the existing published QA page are **unchanged** by this work.

### Destination acceptance gap
- The inspected Homework Quest `parent-console/app.js`, `parent-console/index.html`, processing modules and parent environment contain no verified FamilyRoy scoped-handoff consumption entry point. Intake emitting a `homework_quest` route or issuing a scoped capability must **not** be reported as homework delivered to the learner. A minimal existing Parent Console adapter and real Quest Package approval/persistence acceptance is needed before marking this route integrated.
- Calendar, Contacts, Repairs, Shopping, Food, Personal Admin, Pets and Electricity may have structured review/outbox contracts but must each be marked *queued* until a real owning destination confirms durable consumption. Do not mark these as end-to-end working based on unit tests.
- Remaining release gates: exact-commit preview runtime smoke (only if user authorises credit-consuming preview), destination persistence and acknowledgement verification, failure/retry check, smallest possible iPhone Chrome acceptance, and separate express production promotion approval.

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
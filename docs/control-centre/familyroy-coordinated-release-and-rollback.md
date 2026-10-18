# FamilyRoy ↔ Control Centre — coordinated integration, test and rollback plan

**Status, 18 October 2026: HELD for deployment; offline code only. No Netlify deploy, no merge into either repository's main, no paid infrastructure or production changes.**

**Authoritative control:** https://github.com/santsbabe/logbook-assistant/issues/16 ; tracker CC-080 / CC-081.

## Immutable reference points

- FamilyRoy fix: `santsbabe/familyroy-intake`, branch `fix/ocr-school-and-domain-boundaries`, tested SHA `76b9a5f90a5dbef49d6adec9f5bffe73bf7f71b0`. Passing image/OCR regressions: https://github.com/santsbabe/familyroy-intake/actions/runs/39157957583 .
- Existing FamilyRoy preview PR #1 is a separate, potentially stale branch; **do not advance it** as a side effect of this plan.
- Control Centre integration staging branch `integration/control-centre-familyroy-year-registry-20261018`, based on held `integration/control-centre-rls-oauth-revocation-20261018`. Both remain unmerged into main.
- Current Control Centre published QA is a different (main-branch) version. Green integration-branch CI **does not mean these UI changes are visible on the published QA URL**.
- Netlify existing Free team has seven sites; actual credit balance, new-build cost and production hosting cost are not verified. See `docs/control-centre/private-hosting-cost-comparison-20261018.md` and read-only usage screen https://app.netlify.com/teams/santsbabe .

## Ownership and routing contract

1. iPhone Shortcut resizes image attachment to 640px for transport, while OCR reads the original image. FamilyRoy accepts the original recognised text, preserves evidence attachment SHA and assigns a deterministic source ID. Full-size 413 and false Pet Care routing from "multiplication" remain covered by FamilyRoy's held tests.
2. FamilyRoy decides `homework_quest`, `control_centre.school_readiness`, `control_centre.calendar_events` and review independently. **Ready / queued is not delivered.** Only an issued and redeemed scoped handoff may reach Control Centre's school readiness parser. Calendar event route remains queued, not auto-created as a confirmed calendar event.
3. Control Centre resolves learner(s) using the **notice's school, applicable year, grade and class**, plus explicit named learners. Named multi-child notices keep all applicable children. It preserves automatic PNPS 2026 Grade 2/2M/2D → Harrison, 2026 PNPS Grade R → Alexander, 2027 Grade 3 → Harrison, 2027 Grade 1 → Alexander; PNPS 2E is ignored by default, whole-school PNPS → Harrison + Alexander. Conflicting and unknown cases → Review.
4. Stored registry version 1 has per-year records, annual confirmation flags and append-only audit history for amendments/deletions. Every year on opening Control Centre, the UI prompts the parent if that calendar year's records are unconfirmed. Existing confirmed historical mappings remain usable and can be updated without altering other years. **The seeded defaults must not be falsely described as user-confirmed annual entries.**
5. Each school action carries school, schoolYear, schoolKind, learner, original text, source timestamp/sender/chat, source ID and evidence metadata. Each distinct learner/action is a separate task; replay of the same FamilyRoy source yields the same task IDs. Homework and calendar candidates are NOT smuggled into the readiness handoff. Review actions show original evidence and preserve Add now/Add later/Dismiss.
6. The handoff must **not be acknowledged if local persistence fails**, even though an accepted handoff still means local device only, not authoritative private cross-device backend persistence. Private authenticated sync remains disabled.

## Joint release acceptance matrix

| Test | Responsibility | Evidence / current status |
|---|---|---|
| iPhone original OCR text and resized image transport, no attachment 413 | FamilyRoy | Previous iPhone 201 only proves transport. **Fresh on-device acceptance pending.** |
| OCR school recovery across wrapped/interleaved PNPS heading, unknown school image → Review, "multiplication" ≠ pets | FamilyRoy held fix | `npm test` and `npm run check:functions` in its pinned commit, CI run above |
| Grade/year/class mapping, explicit names, 2E, whole school, annual confirmation and history | Control Centre integration branch | `tests/control-centre-school-year-familyroy.cjs`; confirmation on real iPhone pending |
| Real FamilyRoy `buildRecord()` upstream with mixed Grade 2 notice, source ID/evidence into Control Centre readiness handoff | **Joint** CI, check out pinned FamilyRoy SHA without deploy | New cross-repository test, CI job on integration branch |
| Separate homework/readiness/calendar routes; no accidental Pet Care or invented calendar | Joint | FamilyRoy `buildRecord` fixture, Control Centre `schoolKind`; downstream calendar event activation deliberately not claimed |
| Unknown school or conflicting learner → parent Review, provenance visible, no date or owner guess | Control Centre | Offline unit tests; real parent interaction pending |
| Replay, handoff failure, local persistence failure, no premature ack | Joint | Source-stable task IDs and local persistence regression. Private cross-device durability unproven |
| Signed Google identity, private RLS database, Gmail callback/revocation, backup/restore | Control Centre staged backend | Separate CI jobs; no live Google/DB/worker consent or deployment |
| Physical iPhone Safari QA, parent decisions, rollback, both environments' deployed revisions | Joint human/device acceptance | **BLOCKED. Do not mark go-live passed.** |

## Coordinated release order — NO ACTION without explicit approval

**Preparation (safe, already authorised):** hold FamilyRoy fix at pinned SHA; run its own image/OCR tests, compile functions locally, run Control Centre QA + real disposable PostgreSQL tests and cross-repo acceptance, audit source/evidence/expiry and conflict resolution. Produce a reviewed release manifest with both SHAs, Netlify usage evidence, projected credits and rollback commits. No merges into main.

**Gate A:** user explicitly approves each contemplated Netlify preview deploy after seeing actual credit meter and cost. If approved, advance **only the relevant preview ref** to the reviewed FamilyRoy fix, record exact Netlify deploy ID/SHA, verify /health, origin and scoped capability auth using synthetic evidence. Do not publish a production deployment or assume a 201 constitutes downstream delivery.

**Gate B:** after FamilyRoy preview passes, separately approve a Control Centre QA integration publish (and any private server/database charge). Pin FamilyRoy origin, verify handoff at destination, 2026 Grade 2 without child name → Harrison, explicit two learners → two actions, 2E → none, image unknown school → Review, calendar route → queued. Test original evidence display, Review actions, repeated Share Sheet replay, browser refresh and device restore. Confirm authenticated private backend still disabled unless independently approved.

**Gate C:** stage a complete iPhone + desktop acceptance drill; verify school-year prompt and effective historical routing, one integrated pass/fail report, backup/rollback rehearsal, and explicit separate production authorisation. No automatic promotion.

## Coordinated rollback

1. Stop all intake/worker activity and capture deploy IDs, SHAs, backend/queue revisions, last issued handoff source ID and date. Do not revoke or expose bearer capabilities in logs.
2. Roll FamilyRoy **preview** back to its previously recorded last-known-good preview SHA/deploy (do not assume `main` is the right target); retain immutable source/outbox/evidence records and acknowledgement history. Never replay a deleted capability blindly.
3. Disable any Control Centre backend activation first, revert QA integration to the last known-good published GitHub Pages version, and preserve browser local storage and private Drive copies. **No destructive database migration down or historical mapping rewrite.**
4. If a private backend were ever activated, suspend the scheduler, preserve the encrypted database and queue, and restore to a **separate** staging database before reconciling newer accepted writes. Roll back app binaries/config only after confirming data compatibility.
5. Re-run FamilyRoy OCR/photo, scoped handoff, year-routing, provenance/Review and no-duplicate smoke tests; do not reopen or deploy without user acceptance.

**Do not infer a Netlify balance or claim phone acceptance from Github tests.** All costs, provider authorisation and go-live flags are gated separately.

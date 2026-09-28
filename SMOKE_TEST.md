# Release smoke test

Run this before merging changes to `main`. This is deliberately short: it is a release gate, not a second project-management system.

## Automated / code review gate

- [ ] Branch is not behind `main` and PR is mergeable.
- [ ] No unexpected files are changed.
- [ ] No credentials, OAuth tokens, email contents, personal records or household data are committed.
- [ ] FamilyRoy contains no duplicate function definitions.
- [ ] `project-board/updates.json` parses as valid JSON.
- [ ] Canonical external-build URLs match Build Garden.
- [ ] Completed FamilyRoy actions use `Done`; normal completion does not delete them.
- [ ] School and Email Attention Watch share the single Gmail read-only OAuth connection.
- [ ] New action-producing integrations use `normaliseAction()` / `ingestActions()`.
- [ ] Domain data remains domain data unless an exception genuinely needs attention.

## Control Centre fix list

- [ ] Create a proper remote write route/API so ChatGPT can genuinely add tasks to FamilyRoy Control Centre instead of only browser-local state. The route must use the shared action record (what, when, by whom, why, source), feed Today, deduplicate safely, and preserve the existing local/browser workflow.

## FamilyRoy browser test

- [ ] Open every tab: Today, Inbox, School, Radar, Money, Electricity, Admin, More.
- [ ] Today count matches the visible actionable Today items.
- [ ] Move an item Now → Waiting → Now; reload; state persists.
- [ ] Mark an item Done; reload; it stays out of Today/Before We Leave and remains stored.
- [ ] Quick Capture creates one item, not duplicates.
- [ ] School notice extraction assigns the expected child and practical readiness type.
- [ ] Before We Leave excludes Waiting and Done items.
- [ ] Gmail connects once; School sync and Attention Watch both work from that connection.
- [ ] Re-run each Gmail sync; previously seen messages do not duplicate actions.
- [ ] Attention Watch leaves obvious newsletters/FYIs out and separates action from waiting.
- [ ] Add two electricity readings; usage delta is correct.
- [ ] Correct a same-date electricity reading; it updates instead of duplicating.
- [ ] Enter a lower subsequent meter reading; a Review action is created.
- [ ] Shopping Radar add/bought/delete and branch/deep-link behaviour still work.
- [ ] Personal Admin dependency chain still blocks/unblocks in sequence.
- [ ] More links open the canonical Logbook, Build Garden, Homework Quest and Bloom destinations.
- [ ] Reload/close/reopen: local FamilyRoy data survives.

## Existing-app regression test

- [ ] Logbook root loads.
- [ ] Existing trips still render after reload.
- [ ] Add/edit/delete trip behaviour works.
- [ ] CSV export and copy-summary controls still work.
- [ ] Existing Shortcut query-parameter handoff still populates the Logbook correctly.
- [ ] Build Garden loads project cards and status counts.
- [ ] Build Garden filters/cards remain clickable.
- [ ] Build Garden canonical links open the intended build.
- [ ] Closed projects such as HAW Corrected Photographer Order-Form Watch remain closed.

## iPhone acceptance

- [ ] No horizontal overflow at normal phone width.
- [ ] Tabs/buttons are comfortably tappable.
- [ ] Keyboard does not hide the active form control.
- [ ] Number/date inputs behave correctly in iOS Safari.
- [ ] Add-to-Home-Screen launch works if installed.
- [ ] Gmail consent returns to the Control Centre successfully.
- [ ] Back navigation from linked tools is understandable.

## Release decision

Merge only when:
1. automated/code-review gate is clear;
2. browser regression tests pass;
3. iPhone-specific acceptance passes for changed interaction paths.

Record any failure as a concrete Build Garden blocker. Do not add workaround code to production merely to make the checklist pass.

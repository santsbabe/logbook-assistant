# Logbook Assistant + FamilyRoy

This repository hosts three related static GitHub Pages surfaces:

- `/` — Logbook Assistant. Owns vehicle-trip capture and export.
- `/familyroy-control-centre/` — FamilyRoy Control Centre. Owns household actions and native modules such as School Readiness, Email Attention Watch, Shopping Radar, Personal Admin, price history and electricity readings.
- `/project-board/` — Build Garden / Master Build Board. Owns project/build status, blockers, next actions and canonical links to other builds.

## Source-of-truth rules

Keep ownership simple. Do not create a second copy of data unless a real integration requires it.

- **FamilyRoy actions:** browser local storage key `familyroy_cc_live_v1`. All new action-producing modules must use `normaliseAction()` and `ingestActions()`.
- **FamilyRoy domain data:** stays inside the same Control Centre store under its domain collection (for example `electricity`, `shopping`, `purchases`). Domain data becomes a Today action only when attention is required.
- **Gmail:** School Readiness and Email Attention Watch share one OAuth client ID and one Gmail read-only access token. Do not build a second Gmail connection for either module.
- **Build Garden catalogue:** the `projects` array in `project-board/index.html` is the canonical project catalogue. `project-board/updates.json` is an override/QA feed only; it is not a second project catalogue.
- **External build URLs:** use the canonical links recorded in Build Garden. FamilyRoy may link to them but should not invent alternate deployment URLs.
- **Logbook trips:** remain owned by the root Logbook Assistant. FamilyRoy links to Logbook rather than duplicating trip storage.

## State semantics

FamilyRoy action states are `Now`, `Next`, `Waiting`, `Review`, and `Done`.

- `Now`: needs attention now.
- `Next`: actionable but not urgent; due/overdue Next items may be elevated onto Today automatically.
- `Waiting`: someone/something else must move first.
- `Review`: uncertain or human judgement required.
- `Done`: completed and retained for history. Do not delete completed actions as the normal completion path.

## Integration rule

The standard pattern is:

`source -> validate/classify -> store domain data -> create/update FamilyRoy action only when attention is required -> Today`

Avoid direct one-off pushes into Today. Avoid separate inboxes or task stores for each module.

## Deployment

The current production site is GitHub Pages. Operational-core work is developed on `familyroy-operational-core-v1` and should be merged deliberately after QA. Netlify is not required to deploy this repository's current static surfaces.

# Price monitor snags

## FLM-001 — unrelated offer recommended as confirmed

- Symptom: assistant claimed Salticrax 400g any 2 for R28. User's shelf photo shows assorted 200g R26.99 each, valid 21 Sep–4 Oct 2026. Branch N1 City comes from conversation context, not visible photo text. Berry answers also conflicted; no berry price is accepted here.
- Root cause: assistant selected an unrelated source without verifying year, region, pack or mechanic. Code independently allowed similar failure: FLM parser used heading/first page price and marked it first-party; UI accepted missing region/date; ingestion discarded confidence, dates, promotion and evidence; value/mix paths lacked freshness gating.
- Boundary: source extraction → price feed → browser persistence → basket recommendations; conversational web answers must honour the same evidence requirements.
- Implemented prevention: fail-closed FLM gate, exact chosen branch/date, evidence contract, separate cache identity, metadata preservation, shared consumer safeguards and inspected shelf precedence. Generic unsafe parser disabled.
- Rejected: more confident wording; treating official hostname as proof; inferred weekly validity; region filename matching as branch proof; using nearby or multiple branches as the chosen store.
- Regression: `tests/promotion-validation.test.mjs` includes the shelf-photo fixture and negative cases, browser ingestion and recommendation-path checks.
- Physical evidence: user-provided IMG_F144A5E0-3F4B-4178-8FFD-CE884FA85552.jpeg inspected in chat. Fixture contains extracted data; actual photo is not added to the public repository.
- Status: code and regression suite prepared on isolated branch. Not deployed or physically verified in hosted UI. Automatic catalogue evidence extraction remains outstanding. Keep open until real source ingestion, preview browser workflow and persistence/reload are verified.

Validation run: 32 regression checks passed; shared module, refresh worker and inline browser script pass syntax checks. A separate local browser test was prepared but could not execute here: Chromium was absent and the browser download returned an invalid archive. UI and reload checks remain unverified; this infrastructure failure is not a passing browser test.

# FamilyRoy changes

- Preview/test only. Never push to a production publishing branch or deploy without explicit permission in this conversation.
- Food Lover’s Market recommendations must pass `familyroy-control-centre/promotion-validation.js` for exactly one planned branch and the Africa/Johannesburg shopping date. Unknown scope, exclusions, dates, pack or terms must fail closed.
- A search snippet, official hostname, URL filename, retrieval timestamp or weekly promotion habit does not prove an offer is current or applicable. Inspect the offer and printed applicability/date terms in the actual source.
- Preserve promotion evidence, identity, dates, branch and confidence through ingestion and persistence. Do not turn unavailable evidence into verified defaults.
- Run `node --test familyroy-control-centre/tests/promotion-validation.test.mjs` before accepting price-monitor changes. All recommendation paths (individual, quantity-step and mix pools) must use the gate.
- Do not recommend mushrooms unless Santie explicitly asks to buy them.

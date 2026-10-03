# Store promotion evidence contract

Applies to the FLM collector, Shopping recommendations, basket maths and assistant answers derived from them. Never bypass the gate with a separate web-search claim.

1. Resolve one chosen branch for the trip. No ambiguous multi-branch pooling. Existing “Already going” action supplies today's branch; its date uses Africa/Johannesburg. Nearby alone does not choose a branch.
2. Start from the retailer's official branch/specials page. Open the actual linked catalogue or source photo; inspect the product panel, dates and all applicability/exclusion terms. Search snippets and filename region abbreviations are discovery hints only. Official publication dates/printed promotion dates govern, not URL timestamps or Monday–Sunday assumptions.
3. Extract price, brand, variant, exact pack, each vs multibuy, participating products, membership requirements and full printed start/end dates. Unknowns stay unknown. Never join the first price on a page to its heading. Year must be explicit in the source range (a shared trailing year is allowed).
4. Store `promotionEvidence`: kind (`catalogue` or `shelf-photo`), stable artifactId, actual sourceUrl for catalogue, page/panel locator, reviewedAt, offerText, datesText, scopeText, termsText, product {name, brand, variant, netQuantity, unit}, price, currency, memberOnly, validFrom, validTo, terms {kind, quantity, label, participatingProducts for multibuy}, scope {includedBranches, excludedBranches, exclusionsKnown}. Retain the inspected bytes separately under the artifactId. Dates and scope may be on another page in the same publication; preserve their page references in the locator. No evidence field may be supplied from a query assumption.
5. Explicit national/regional scope may be expanded to includedBranches only after proving the chosen branch belongs to that scope and inspecting exclusions. A bare “Western Cape” string proves neither. A shelf photo needs observedBranch obtained from the trip context or user, not inferred from products in the picture.
6. Feed ingestion preserves evidence. Cache identity distinguishes pack, branch scope, offer period and source artifact. Cached observations without proof remain unverified even if labelled first-party. Conflicts block recommendations. Valid inspected shelf evidence supersedes catalogue observations only for that same product/pack at the chosen branch.
7. Require fresh source inspection (within 36 hours), valid date range and the chosen branch. Expiry includes the whole South African final day. Unverified prices carry a reason; never star them as best, calculate savings or put them into basket/value/mix recommendations.
8. Same-product comparisons use unit prices; describe differing packs explicitly. Apply mushroom exclusion before making additional-purchase suggestions.

## Present implementation limits

Generic FLM HTML price parsing is disabled: it cannot safely associate heading/first-price/date/store. Official document discovery continues, but no automatic rendered catalogue/OCR evidence extractor is implemented in this revision. The gate accepts the evidence contract; it does not turn source discovery into verified promotions. No live offers are invented or seeded from the regression fixture.

## Acceptance evidence

Run the regression suite including Salticrax 200g R26.99 each, wrong 400g / 2-for-R28, other-region/year, ambiguous branch, loyalty/multibuy errors, persistence and expiry. Test preview UI and real catalogue ingestion before claiming the full workflow verified.

Local browser regression: install Playwright and its Chromium browser, then run `node --test familyroy-control-centre/tests/promotion-browser.test.mjs` from the repository root. `FAMILYROY_PLAYWRIGHT_MODULE` may point to a runtime-provided Playwright module. The test supplies a synthetic feed and shelf fixture, exercises branch selection, rejects a changed pack and checks reload persistence. It is not evidence of real catalogue ingestion.

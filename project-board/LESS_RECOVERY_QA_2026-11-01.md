# Build Garden recovery repair — LESS evidence (1 November 2026)

## Scope
Review-only changes to `project-board/index.html` and the canonical `project-board/projects.json`. No production deployment, spending or changes to learner data.

## Expected behaviour
- Tapping a card opens a **new** ChatGPT conversation; a complete recovery prompt is copied to the clipboard for pasting.
- Recovery context contains project identity, purpose, lifecycle, latest state, blocker, next action, worklog, established decisions, unresolved snags and source links when recorded.
- Separate canonical snag and GitHub links remain independent.
- If clipboard access fails, the prompt is displayed for manual copying.
- The board does not claim that a new chat automatically receives context: **paste is required**. There is no documented reliable URL prefill contract.
- If popup opening is blocked, the current tab navigates to ChatGPT after recovery context is prepared.

## Static/source validation (15/15)
- 48 records preserved; IDs unique.
- All recorded link URLs have HTTPS schemes.
- Recovery builder includes worklogs, decisions, snags and source links.
- LESS safety instruction present.
- Old conversation-ID route and unsupported app deep links absent.
- Window opening precedes the first asynchronous clipboard call.
- Separate link clicks excluded from card action; Enter/Space keyboard path retained.
- Cache-busted canonical register refresh retained.
- Conflicting Homework Quest snag snapshots explicitly recorded for reconciliation.

## Remaining acceptance gates (not passed)
1. Browser: click a card, verify new ChatGPT tab and clipboard content, paste into chat, inspect complete context.
2. Browser: test canonical snag link independently, and test clipboard permission denial.
3. iPhone: tap card, verify new-chat navigation, clipboard/paste, and return to Build Garden.
4. Verify that latest live Homework Quest tracker count (134/19 user accepted on 21 October) is reconciled with stale GitHub snapshot (131/7 dated 30 September) before marking counts canonical.

**LESS status:** tested source-level release candidate, **not accepted / not resolved**. No merge or production deployment without explicit permission.

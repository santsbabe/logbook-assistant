# Control Centre: family privacy containment and migration gates

**Status: P0 security review, NOT deployed. Created 23 October 2026.**

The public production `familyroy-control-centre/index.html` contains baked-in family tasks and localStorage-backed household records. The live browser-local state is *not* the public repo; embedded literals and all public `.ics`, school research and historical commits require full exposure review.

**Do not:** upload private household documents to the current app; commit personal names, patient numbers, identity documents, medical or bank content, OAuth secrets, Google Drive direct links, encryption keys, snapshots, or live action payloads to public GitHub; publish a trial cloud connection; overwrite browser localStorage; claim tests prove production security.

**Immediate containment recommendation:** replace hard-coded family data with empty/non-identifying examples while preserving a tested, explicit per-device backup/legacy migration path. A production change must wait for verified local-state continuity and page functional smoke tests. Review historic Git exposure; deletion in a new commit does not remove history. Discuss GitHub Pages availability BEFORE switching a public repo to private. Never assume old links become confidential.

**Target:** separate authenticated central canonical database for task and action metadata, no public frontend privileged keys, server-verified account identity, per-account DB isolation/forced RLS or equivalent, optimistic concurrency and idempotent writes, immutable audit trail. Client local storage is an optional stale-marked display cache only. Offline edits stay queued and visibly unsynced. Preserve/reconcile local device data during migration.

**Family document vault:** keep source files in private restricted document storage, initially user-owned Google Drive; server/database store minimum metadata and immutable file identifiers with owner checks, not public sharing links. Extremely sensitive documents require individually controlled encryption policy, key recovery, and separate backup of original file bytes. No default indexing of entire contents by AI.

**Release gates:** synthetic-only staging first; permission and account-isolation tests; iPhone + desktop simultaneous edits; conflicts and offline failure; vault URL/share-access tests; backup checksum, encrypted recovery on clean device, revocation and key-loss plan; POPIA/relevant jurisdiction review; monthly cost cap; explicit owner authorisation for hosting, deployment and promotion. Existing QA backend-config.enabled=false must remain disabled.

**Private follow-up**: the Tygerberg request is already recorded in the owner's PRIVATE Google Drive Control Centre folder; it is not in canonical central live app until migration. Avoid embedding medical identifiers in code.

**Owner's verified private security audit:** in Control Centre Google Drive, titled "Control Centre — Urgent Family Data Security Review and Release Gates — 23 Oct 2026".

**Status warning:** this file is a non-production hardening plan, not proof of successful deployment, security remediation, or protection of historical public commits.

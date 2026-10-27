/* FamilyRoy Control Centre -> LESS: explicit, pure, source-attributed action snapshot.
 * No browser storage, OAuth, network, timestamps generated, DOM, save(), or
 * handoff acknowledgement. Not installed into the running Control Centre page.
 * The owner of a household action remains Control Centre, not LESS.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FamilyRoyLESSReadOnly = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
  'use strict';
  const FORMAT = 'familyroy-control-centre-less-readonly';
  const VERSION = 1;
  const has = (o, p) => Object.prototype.hasOwnProperty.call(o, p);
  const str = v => typeof v === 'string' ? v : null;
  const text = v => typeof v === 'string' ? v.slice(0, 500) : null;
  const url = v => {
    if (typeof v !== 'string') return null;
    try {
      const u = new URL(v);
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
    } catch { return null; }
  };
  function projectAction(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || !str(item.id)?.trim()) throw new Error('Control Centre action has no stable identifier');
    return {
      id: item.id, module: str(item.module || item.cat),
      title: text(item.title), state: str(item.state),
      owner: str(item.owner), due: str(item.due), child: str(item.child),
      familyRoySourceId: str(item.familyRoySourceId),
      familyRoyRoute: str(item.familyRoyRoute), gmailId: str(item.gmailId),
      source: text(item.source), sourceUrl: url(item.sourceUrl),
      lessCaseKey: str(item.lessCaseKey || item.caseKey),
      createdAt: str(item.created), updatedAt: str(item.updatedAt),
      completedAt: str(item.completedAt), resolution: text(item.resolution),
      correctionOf: str(item.correctionOf), reviewReason: text(item.reviewReason),
      evidenceTextPresent: Boolean(item.evidenceText),
      originalEvidenceKeptInControlCentre: Boolean(item.evidenceText),
    };
  }
  function projectControlCentreSnapshot(data, {snapshotId = null} = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)
        || !Array.isArray(data.tasks)) throw new Error('An explicit saved Control Centre task collection is required');
    if (data.tasks.length > 20000) throw new Error('Snapshot exceeds Control Centre task limit');
    const tasks = data.tasks.map(projectAction);
    const idSet = new Set();
    const duplicateIds = [];
    for (const t of tasks) {
      if (idSet.has(t.id)) duplicateIds.push(t.id);
      idSet.add(t.id);
    }
    return {
      format: FORMAT, version: VERSION,
      snapshotStatus: 'caller_supplied_partial_not_live_verified',
      snapshotId: str(snapshotId),
      domainOwner: 'familyroy_control_centre',
      collection: 'tasks', taskCount: tasks.length,
      duplicateIds: [...new Set(duplicateIds)],
      seenIdsCount: Array.isArray(data.seen) ? data.seen.length : null,
      tasks,
      restrictions: [
        'No evidence text, private credentials or access tokens in this projection',
        'Reported Done is not independent proof of completion',
        'No owner, state, consent, payment or history change',
        'Not an automatic cross-application data feed',
      ]
    };
  }
  return Object.freeze({FORMAT, VERSION, projectControlCentreSnapshot});
});

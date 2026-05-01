// Server-side loss-point label snapshotting (Part 4).
//
// When a teacher saves a V2 daily progress, the client sends `lossPointIds`
// (chosen from the catalog). We resolve those ids to current labels and
// persist them as `lossPointLabelsSnapshot` so historical records keep their
// human-readable labels even if a loss-point is renamed/deactivated later.
//
// Pure function: takes an activities array and a catalog map, returns a new
// array. Idempotent — re-running just refreshes the snapshot to current.

import type { EnglishFieldsV2 } from './englishNormalize';
import { normalizeEnglishFields } from './englishNormalize';

export type LossPointLookup = Map<string, string>; // id → label

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isEnglishActivity = (a: Record<string, unknown>): boolean => {
  if (a.type === 'english') return true;
  if (isPlainObject(a.english)) return true;
  const subjectName = String(a.subjectName ?? a.subject ?? '').toLowerCase();
  return (
    subjectName === 'english' ||
    subjectName.includes('英文') ||
    subjectName.includes('英语')
  );
};

const FIELD_KEYS = ['editing', 'reading', 'grammar', 'essay'] as const;

const snapshotOne = (
  block: { lossPointIds: string[]; lossPointLabelsSnapshot: string[] },
  lookup: LossPointLookup,
): string[] => {
  // Preserve any caller-provided labels for ids we can't resolve (lets stale
  // historical snapshots survive across loss-point deletions).
  const preserved = new Map<string, string>();
  block.lossPointIds.forEach((id, i) => {
    const fromCaller = block.lossPointLabelsSnapshot[i];
    if (typeof fromCaller === 'string' && fromCaller.length) {
      preserved.set(id, fromCaller);
    }
  });
  return block.lossPointIds.map(
    (id) => lookup.get(id) ?? preserved.get(id) ?? '',
  );
};

export function enrichLossPointLabels(
  activities: unknown,
  lookup: LossPointLookup,
): unknown {
  if (!Array.isArray(activities)) return activities;
  return activities.map((a) => {
    if (!isPlainObject(a) || !isEnglishActivity(a)) return a;
    const eng: EnglishFieldsV2 = normalizeEnglishFields(a.english ?? {});
    const next = { ...eng };
    for (const key of FIELD_KEYS) {
      const block = next[key];
      if ('lossPointIds' in block && Array.isArray(block.lossPointIds)) {
        (block as { lossPointLabelsSnapshot: string[] }).lossPointLabelsSnapshot =
          snapshotOne(
            block as { lossPointIds: string[]; lossPointLabelsSnapshot: string[] },
            lookup,
          );
      }
    }
    return { ...a, type: 'english', english: next };
  });
}

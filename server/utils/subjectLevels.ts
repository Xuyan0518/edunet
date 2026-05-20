import { eq } from 'drizzle-orm';
import { db } from '../db';
import { subjectLevelsTable } from '../schema';
import { parseFiniteInteger, trimString } from './inputValidation';

export const DEFAULT_SUBJECT_LEVEL_NAME = 'O-Level';

export const sanitizeLevelName = (value: unknown) => trimString(value).slice(0, 64);

export const sanitizeLevelDescription = (value: unknown) => {
  const text = trimString(value);
  return text ? text.slice(0, 240) : null;
};

export const sanitizeSortOrder = (value: unknown, fallback = 0) => {
  const n = parseFiniteInteger(value);
  if (n === null) return fallback;
  if (n < 0) return 0;
  if (n > 9999) return 9999;
  return n;
};

export const ensureDefaultSubjectLevel = async () => {
  const existing = await db
    .select()
    .from(subjectLevelsTable)
    .where(eq(subjectLevelsTable.name, DEFAULT_SUBJECT_LEVEL_NAME))
    .limit(1);
  if (existing.length) {
    return existing[0];
  }
  const created = await db
    .insert(subjectLevelsTable)
    .values({
      name: DEFAULT_SUBJECT_LEVEL_NAME,
      description: 'Default level for legacy subjects',
      sortOrder: 0,
      isDefault: true,
      isActive: true,
      createdBy: 'system',
      updatedBy: 'system',
      updatedAt: new Date(),
    })
    .returning();
  return created[0];
};

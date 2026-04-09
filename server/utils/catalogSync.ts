import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { topicsTable } from '../schema';

type Catalog = Record<string, TopicEntry[]>;
type TopicEntry = {
  code: string;
  topic: string;
  subtopics?: string[];
};

type SubjectRef = {
  id: string;
  code: string;
};

let cachedCatalog: Catalog | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const catalogPath = join(__dirname, '../../subjectCatalogs.json');

function loadCatalog(): Catalog {
  if (cachedCatalog) return cachedCatalog;
  const raw = fs.readFileSync(catalogPath, 'utf-8');
  cachedCatalog = JSON.parse(raw) as Catalog;
  return cachedCatalog;
}

function makeSubjectCode(key: string) {
  return key
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 64);
}

function makeOrderIndexFromCode(code: string) {
  const numeric = code.replace(/^[^\d]*/g, '');
  return numeric || code;
}

function cleanTitle(title: string) {
  return title.replace(/:contentReference\[oaicite:\d+\]\{index=\d+\}/g, '').trim();
}

function buildCatalogByCode(catalog: Catalog) {
  const byCode = new Map<string, TopicEntry[]>();
  for (const [subjectKey, topics] of Object.entries(catalog)) {
    byCode.set(makeSubjectCode(subjectKey), topics);
  }
  return byCode;
}

async function upsertTopic(params: {
  subjectId: string;
  code: string;
  title: string;
  orderIndex: string;
  parentTopicId: string | null;
}) {
  const { subjectId, code, title, orderIndex, parentTopicId } = params;
  const [row] = await db
    .insert(topicsTable)
    .values({ subjectId, code, title, orderIndex, parentTopicId })
    .onConflictDoUpdate({
      target: [topicsTable.subjectId, topicsTable.code],
      set: {
        title: sql`excluded.title`,
        orderIndex: sql`excluded.order_index`,
        parentTopicId: sql`excluded.parent_topic_id`,
      },
    })
    .returning();
  return row;
}

export async function syncCatalogForStudentSubjects(subjects: SubjectRef[]) {
  const catalog = loadCatalog();
  const catalogByCode = buildCatalogByCode(catalog);
  const summary = {
    syncedSubjectCodes: [] as string[],
    skippedSubjectCodes: [] as string[],
    topicsUpsertedCount: 0,
  };

  for (const subject of subjects) {
    const topicEntries = catalogByCode.get(subject.code);
    if (!topicEntries) {
      summary.skippedSubjectCodes.push(subject.code);
      continue;
    }

    summary.syncedSubjectCodes.push(subject.code);

    for (const t of topicEntries) {
      const mainOrder = makeOrderIndexFromCode(t.code);
      const main = await upsertTopic({
        subjectId: subject.id,
        code: t.code,
        title: cleanTitle(t.topic),
        orderIndex: mainOrder,
        parentTopicId: null,
      });
      summary.topicsUpsertedCount += 1;

      if (Array.isArray(t.subtopics) && t.subtopics.length > 0) {
        for (let i = 0; i < t.subtopics.length; i += 1) {
          const subCode = `${t.code}.${i + 1}`;
          const subOrder = `${mainOrder}.${i + 1}`;
          await upsertTopic({
            subjectId: subject.id,
            code: subCode,
            title: cleanTitle(t.subtopics[i]),
            orderIndex: subOrder,
            parentTopicId: main.id,
          });
          summary.topicsUpsertedCount += 1;
        }
      }
    }
  }

  return summary;
}

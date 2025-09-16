// server/scripts/seedSubjects.ts
import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "../db";
import { subjectsTable, topicsTable } from "../schema";
import { and, eq, sql } from "drizzle-orm";

// ===================== ESM-safe __dirname =====================
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// From server/scripts → project root → subjectCatalogs.json
const catalogPath = join(__dirname, "../../subjectCatalogs.json");

// ===================== Types (match your JSON) =====================
type Catalog = Record<string, TopicEntry[]>;
type TopicEntry = {
  code: string;
  topic: string;
  subtopics?: string[];
};

// ===================== Helpers =====================
function makeSubjectCode(key: string) {
  // Uppercase, underscores, trimmed to <=64 chars (fits subjects.code)
  return key
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 64);
}

function makeOrderIndexFromCode(code: string) {
  // Extract trailing numeric chunk(s) for stable ordering; fallback to code
  const numeric = code.replace(/^[^\d]*/g, "");
  return numeric || code;
}

// Remove things like :contentReference[oaicite:39]{index=39}
function cleanTitle(s: string) {
  return s.replace(/:contentReference\[oaicite:\d+\]\{index=\d+\}/g, "").trim();
}

// ===================== Upserts =====================
async function upsertSubject(code: string, name: string, level: string) {
  // Upsert by unique subjects.code; update name/level on conflict
  const [row] = await db
    .insert(subjectsTable)
    .values({ code, name, level })
    .onConflictDoUpdate({
      target: subjectsTable.code,
      set: {
        // use excluded.* to update with incoming values
        name: sql`excluded.name`,
        level: sql`excluded.level`,
      },
    })
    .returning();
  return row;
}

async function upsertTopic(params: {
  subjectId: string;
  code: string;
  title: string;
  orderIndex: string;
  parentTopicId: string | null;
}) {
  const { subjectId, code, title, orderIndex, parentTopicId } = params;

  // Upsert by unique (subject_id, code); update title/order/parent on conflict
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

  // row will contain the resolved topic (inserted or updated), including its id
  return row;
}

// ===================== Main =====================
async function seed() {
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catalog file not found at: ${catalogPath}`);
  }

  const catalogRaw = fs.readFileSync(catalogPath, "utf-8");
  const catalog: Catalog = JSON.parse(catalogRaw);

  for (const [subjectKey, topicEntries] of Object.entries(catalog)) {
    const subjectCode = makeSubjectCode(subjectKey);
    const subjectName = subjectKey; // keep same as key (edit if you want custom names)
    const subjectLevel = subjectKey; // same as key; parse if you want a separate "level"

    console.log(`Syncing subject: ${subjectKey}`);
    const subject = await upsertSubject(subjectCode, subjectName, subjectLevel);

    for (const t of topicEntries) {
      // Upsert main topic
      const mainOrder = makeOrderIndexFromCode(t.code);
      const main = await upsertTopic({
        subjectId: subject.id,
        code: t.code,
        title: cleanTitle(t.topic),
        orderIndex: mainOrder,
        parentTopicId: null,
      });

      // Upsert subtopics (children)
      if (Array.isArray(t.subtopics) && t.subtopics.length > 0) {
        for (let i = 0; i < t.subtopics.length; i++) {
          const subCode = `${t.code}.${i + 1}`;
          const subOrder = `${mainOrder}.${i + 1}`;
          await upsertTopic({
            subjectId: subject.id,
            code: subCode,
            title: cleanTitle(t.subtopics[i]),
            orderIndex: subOrder,
            parentTopicId: main.id, // ensure correct parent linkage even after updates
          });
        }
      }
    }
  }
}

seed()
  .then(() => {
    console.log("✅ Seeding complete (database synchronized with subjectCatalogs.json).");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  });

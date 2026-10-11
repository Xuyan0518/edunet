import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db";
import { studentPapersTable } from "../schema";
type PaperDatabase = Pick<Database, "delete" | "insert" | "batch">;
type PaperInsert = typeof studentPapersTable.$inferInsert;
// Run only after the existing student write lock and version check. Both DML
// statements share a Neon HTTP transaction; an insertion failure retains the old set.
export async function replaceDayPapers(
  database: PaperDatabase,
  studentId: string,
  date: string,
  values: PaperInsert[]
) {
  const remove = database
    .delete(studentPapersTable)
    .where(
      and(
        eq(studentPapersTable.studentId, studentId),
        eq(studentPapersTable.date, date),
        isNull(studentPapersTable.deletedAt)
      )
    );
  if (!values.length) {
    await database.batch([remove]);
    return 0;
  }
  const result = await database.batch([
    remove,
    database
      .insert(studentPapersTable)
      .values(values)
      .returning({ id: studentPapersTable.id })
  ]);
  return result[1].length;
}

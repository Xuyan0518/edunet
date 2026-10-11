import { expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import {
  studentDeletionBatch,
  deleteStudentCascade
} from "../../server/services/studentDeletion";
import * as schema from "../../server/schema";
const studentId = "11111111-1111-4111-8111-111111111111";
const query = vi.fn((sql: string, params: unknown[]) => ({ sql, params }));
const transaction = vi.fn(async (items: { sql: string; params: unknown[] }[]) =>
  items.map((item, index) => ({
    rows: index === 0 || index === items.length - 1 ? [[studentId]] : [],
    rowCount: 1,
    fields: []
  }))
);
// Compile with the installed Drizzle driver and intercept its Neon transaction boundary.
// No connection string, environment, network, or database is involved.
const database = drizzle(({ query, transaction } as unknown) as Parameters<
  typeof drizzle
>[0]);
it("covers every student foreign-key relation, including soft-deleted rows and exam scores", () => {
  const sql = studentDeletionBatch(database, studentId).map(query =>
    query.toSQL()
  );
  expect(sql[0].sql).toMatch(/for update$/);
  expect(sql.at(-1)?.sql).toMatch(/^delete from "students"/);
  const tables = Object.values(schema).filter(value =>
    is(value, PgTable)
  ) as PgTable[];
  const relations = tables.filter(table =>
    getTableConfig(table).foreignKeys.some(
      key => key.reference().foreignTable === schema.studentsTable
    )
  );
  for (const table of relations)
    expect(
      sql.some(query =>
        query.sql.startsWith(`delete from "${getTableName(table)}"`)
      )
    ).toBe(true);
  expect(
    sql.findIndex(query => query.sql.startsWith('delete from "exam_scores"'))
  ).toBeLessThan(
    sql.findIndex(query => query.sql.startsWith('delete from "exams"'))
  );
  for (const statement of sql) {
    expect(statement.params).toContain(studentId);
    expect(statement.sql).not.toContain("deleted_at");
  }
});
it("executes all statements in one installed-driver transaction and confirms the deleted row", async () => {
  transaction.mockClear();
  query.mockClear();
  expect(await deleteStudentCascade(database, studentId)).toBe(true);
  expect(transaction).toHaveBeenCalledOnce();
  expect(transaction.mock.calls[0][0]).toHaveLength(16);
});
it("propagates transaction failure without reporting success or retrying", async () => {
  transaction.mockClear();
  transaction.mockRejectedValueOnce(new Error("fixture transaction rejected"));
  await expect(deleteStudentCascade(database, studentId)).rejects.toThrow(
    "fixture transaction rejected"
  );
  expect(transaction).toHaveBeenCalledOnce();
});
it("reports a missing student from the final returning row", async () => {
  transaction.mockResolvedValueOnce(
    Array.from({ length: 16 }, () => ({ rows: [], rowCount: 0, fields: [] }))
  );
  expect(await deleteStudentCascade(database, studentId)).toBe(false);
});

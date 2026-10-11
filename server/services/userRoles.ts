import { eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import {
  adminsTable,
  teachersTable,
  parentsTable,
  studentsTable,
  studentParentBindingsTable
} from "../schema";
type RoleDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete" | "batch"
>;
type Existing = {
  admin: { id: string } | null;
  teacher: { id: string } | null;
  parent: { id: string } | null;
};
type Values = typeof adminsTable.$inferInsert;
export async function parentRoleHasBindings(
  database: Pick<Database, "select">,
  parentId: string
) {
  const [primary, secondary] = await Promise.all([
    database
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(eq(studentsTable.parentId, parentId))
      .limit(1),
    database
      .select({ id: studentParentBindingsTable.id })
      .from(studentParentBindingsTable)
      .where(eq(studentParentBindingsTable.parentId, parentId))
      .limit(1)
  ]);
  return primary.length > 0 || secondary.length > 0;
}
// All role writes share one Neon transaction. FK rejection, including a new
// parent binding racing with removal, rolls back the other role writes too.
export function userRoleBatch(
  database: RoleDatabase,
  nextRoles: string[],
  existing: Existing,
  base: Values
) {
  const approved = { ...base, status: "approved", emailVerified: "true" };
  return [
    nextRoles.includes("admin")
      ? existing.admin
        ? database
            .update(adminsTable)
            .set(base)
            .where(eq(adminsTable.id, existing.admin.id))
        : database.insert(adminsTable).values(base)
      : existing.admin
      ? database
          .delete(adminsTable)
          .where(eq(adminsTable.id, existing.admin.id))
      : database
          .select({ id: adminsTable.id })
          .from(adminsTable)
          .where(sql`false`),
    nextRoles.includes("teacher")
      ? existing.teacher
        ? database
            .update(teachersTable)
            .set(approved)
            .where(eq(teachersTable.id, existing.teacher.id))
        : database.insert(teachersTable).values(approved)
      : existing.teacher
      ? database
          .delete(teachersTable)
          .where(eq(teachersTable.id, existing.teacher.id))
      : database
          .select({ id: teachersTable.id })
          .from(teachersTable)
          .where(sql`false`),
    nextRoles.includes("parent")
      ? existing.parent
        ? database
            .update(parentsTable)
            .set(approved)
            .where(eq(parentsTable.id, existing.parent.id))
        : database.insert(parentsTable).values(approved)
      : existing.parent
      ? database
          .delete(parentsTable)
          .where(eq(parentsTable.id, existing.parent.id))
      : database
          .select({ id: parentsTable.id })
          .from(parentsTable)
          .where(sql`false`)
  ] as const;
}
export async function applyUserRoles(
  database: RoleDatabase,
  nextRoles: string[],
  existing: Existing,
  base: Values
) {
  await database.batch(userRoleBatch(database, nextRoles, existing, base));
}

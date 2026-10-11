import { SessionUser } from "@/features/auth/session";
import { sessionKey } from "@/app/queryKeys";
export interface DailyDraft<T> {
  version: 1;
  studentId: string;
  date: string;
  savedAt: string;
  serverVersion: string | null;
  paperVersion: string | null;
  form: T;
}
export function dailyDraftKey(
  user: SessionUser,
  studentId: string,
  date: string
) {
  return `edunet:draft:${sessionKey(user)
    .map(encodeURIComponent)
    .join(":")}:daily:${encodeURIComponent(studentId)}:${date}`;
}
export function readDailyDraft<T>(
  storage: Pick<Storage, "getItem">,
  key: string,
  studentId: string,
  date: string
): DailyDraft<T> | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (
    value?.version !== 1 ||
    value.studentId !== studentId ||
    value.date !== date ||
    !value.form ||
    typeof value.form !== "object" ||
    value.form.daily?.studentId !== studentId ||
    value.form.daily?.date !== date ||
    !Array.isArray(value.form.daily?.activities) ||
    !Array.isArray(value.form.papers)
  )
    throw new Error("Invalid local draft");
  return value;
}
export function writeDailyDraft<T>(
  storage: Pick<Storage, "setItem">,
  key: string,
  draft: Omit<DailyDraft<T>, "version" | "savedAt">
) {
  const value: DailyDraft<T> = {
    version: 1,
    studentId: draft.studentId,
    date: draft.date,
    serverVersion: draft.serverVersion,
    paperVersion: draft.paperVersion,
    savedAt: new Date().toISOString(),
    form: draft.form
  };
  storage.setItem(key, JSON.stringify(value));
  return value;
}

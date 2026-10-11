import { useEffect, useState } from "react";
import { SessionUser } from "@/features/auth/session";
import { sessionKey } from "@/app/queryKeys";
export type SeenKind = "weekly" | "exams" | "reports";
export function seenKey(user: SessionUser, studentId: string, kind: SeenKind) {
  return `edunet:seen:${sessionKey(user)
    .map(encodeURIComponent)
    .join(":")}:${encodeURIComponent(studentId)}:${kind}`;
}
export function latestSeenToken(rows: unknown[], kind: SeenKind) {
  return (
    rows
      .map(value => {
        const row = value as Record<string, unknown>;
        return String(
          kind === "weekly"
            ? row.weekStarting || ""
            : row.updatedAt ||
                row.createdAt ||
                (kind === "exams" ? row.examDate : row.endDate) ||
                ""
        );
      })
      .sort()
      .at(-1) || ""
  );
}
export function isUnseen(
  storage: Pick<Storage, "getItem">,
  key: string,
  latest: string
) {
  if (!latest) return false;
  try {
    return (storage.getItem(key) || "") < latest;
  } catch {
    return false;
  }
}
export function markSeen(
  storage: Pick<Storage, "setItem">,
  key: string,
  latest: string
) {
  if (!latest) return;
  try {
    storage.setItem(key, latest);
  } catch {
    /* Browser-local markers are optional; never block the record view. */
  }
}
export function useSeenMarker(
  user: SessionUser,
  studentId: string,
  kind: SeenKind,
  rows: unknown[],
  mark = false
) {
  const latest = latestSeenToken(rows, kind);
  const key = seenKey(user, studentId, kind);
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    if (mark && latest) markSeen(localStorage, key, latest);
    setUnread(isUnseen(localStorage, key, latest));
  }, [key, latest, mark]);
  return unread;
}

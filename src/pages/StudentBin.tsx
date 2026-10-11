import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { requestJson, ApiError } from "@/services/http";
import {
  BinItem,
  BinResponse,
  binBody,
  binKey,
  binRows
} from "@/features/bin/contracts";
import { StudentSwitcher } from "@/components/layout/StudentSwitcher";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { AsyncState } from "@/components/shared/AsyncState";
import { Button } from "@/components/ui/button";
export default function StudentBin() {
  const { id } = useParams();
  const { user } = useAuth();
  const c = useWebCopy();
  const cache = useQueryClient();
  const [action, setAction] = useState<{
    row: BinItem;
    permanent: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState("");
  const path = `students/${encodeURIComponent(id)}/bin`;
  const query = useQuery({
    queryKey: queryKeys.student(user, id, "bin"),
    queryFn: ({ signal }) => requestJson<BinResponse>(path, { signal })
  });
  const labels: Record<string, string> = {
    dailyProgress: c("每日进度", "Daily progress"),
    weeklyReports: c("每周反馈", "Weekly feedback"),
    studentReports: c("报告与旧版总结", "Reports and legacy summaries"),
    exams: c("考试", "Exams"),
    papers: c("试卷", "Papers")
  };
  async function act() {
    if (!action || pending || unknown) return;
    setPending(true);
    setMessage("");
    try {
      await requestJson(
        `${path}/${action.permanent ? "permanent" : "restore"}`,
        {
          method: action.permanent ? "DELETE" : "POST",
          body: binBody(action.row)
        }
      );
      const fresh = await requestJson<BinResponse>(path);
      if (binRows(fresh).some(row => binKey(row) === binKey(action.row)))
        throw new Error("Outcome could not be confirmed");
      cache.setQueryData(queryKeys.student(user, id, "bin"), fresh);
      await cache.invalidateQueries({ queryKey: sessionKey(user) });
      setAction(null);
      setMessage(
        action.permanent
          ? c("已永久删除。", "Permanently deleted.")
          : c(
              "已恢复。原有状态和家长可见性保持不变。",
              "Restored with its existing status and parent visibility."
            )
      );
    } catch (err) {
      setUnknown(!(err instanceof ApiError) || err.status >= 500);
      setMessage(
        err instanceof ApiError && err.status === 409
          ? c(
              "恢复冲突：可能已有同一日期或周期的有效记录。未覆盖或删除任何现有记录。",
              "Restore conflict: an active record may already occupy that day or period. No active record was replaced or deleted."
            )
          : err instanceof Error
          ? err.message
          : "Action failed"
      );
    } finally {
      setPending(false);
    }
  }
  async function reconcile() {
    if (!action) return;
    setPending(true);
    try {
      const fresh = await requestJson<BinResponse>(path);
      cache.setQueryData(queryKeys.student(user, id, "bin"), fresh);
      if (binRows(fresh).some(row => binKey(row) === binKey(action.row))) {
        setUnknown(false);
        setMessage(
          c(
            "记录仍在回收站。可重新选择操作。",
            "The item is still in the bin. You may choose the action again."
          )
        );
      } else {
        setAction(null);
        setUnknown(false);
        setMessage(
          c(
            "此记录已不在当前回收站列表。请到原记录列表核对结果。",
            "This item is no longer in the current bin list. Check its live record list to confirm the outcome."
          )
        );
        await cache.invalidateQueries({ queryKey: sessionKey(user) });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Read failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="web-page space-y-5">
      <h1>{c("学生回收站", "Student recycle bin")}</h1>
      <fieldset disabled={pending}>
        <StudentSwitcher studentId={id} />
      </fieldset>
      <p>
        {c(
          "仅显示删除后保留期限内的记录；此列表不代表已启用自动清理。",
          "Shows records within the retention window. This list does not imply automatic cleanup is enabled."
        )}
      </p>
      <AsyncState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {message && <p role="status">{message}</p>}
      {unknown && (
        <div className="web-card">
          <p>
            {c(
              "结果未确认，先读取列表核对。",
              "Outcome unconfirmed; reread the list before another action."
            )}
          </p>
          <Button disabled={pending} onClick={() => void reconcile()}>
            {c("读取服务器核对", "Reconcile with server")}
          </Button>
        </div>
      )}
      {query.data && (
        <>
          <p>
            {c("显示期限", "Retention window")}: {query.data.retentionDays}{" "}
            {c("天", "days")}
          </p>
          {Object.entries(query.data.groups).map(([group, rows]) => (
            <section key={group} className="web-card space-y-4">
              <h2>
                {labels[group] || group} · {rows.length}
              </h2>
              {[...rows]
                .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
                .map(row => (
                  <article
                    key={binKey(row)}
                    className="border-t pt-3 space-y-2"
                  >
                    <h3>{row.title}</h3>
                    <p className="whitespace-pre-wrap">{row.summary}</p>
                    <p>
                      {c("原日期", "Original date")}: {row.originalDate || "—"}{" "}
                      · {c("删除时间", "Deleted")}: {row.deletedAt} ·{" "}
                      {row.deletedByName || "—"}
                    </p>
                    <p>
                      {c("剩余", "Remaining")}: {row.daysRemaining}{" "}
                      {c("天", "days")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        disabled={pending || unknown}
                        onClick={() => {
                          setMessage("");
                          setAction({ row, permanent: false });
                        }}
                      >
                        {c("恢复", "Restore")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={pending || unknown}
                        onClick={() => {
                          setMessage("");
                          setAction({ row, permanent: true });
                        }}
                      >
                        {c("永久删除", "Delete permanently")}
                      </Button>
                    </div>
                  </article>
                ))}
            </section>
          ))}
        </>
      )}
      <ConfirmAction
        open={!!action && !unknown}
        title={
          action?.permanent
            ? c("永久删除此记录？", "Permanently delete this record?")
            : c("恢复此记录？", "Restore this record?")
        }
        description={`${action?.row.title || ""} (${action?.row.recordType ||
          ""}) — ${
          action?.permanent
            ? c(
                "此操作无法撤销，考试相关成绩也会被删除。",
                "This cannot be undone. Associated exam scores are also removed."
              )
            : c(
                "原有可见性保持不变；之前对家长可见的报告可能立即重新出现。",
                "Existing visibility is retained. A previously visible report may immediately reappear for parents."
              )
        }`}
        pending={pending}
        error={message || undefined}
        destructive={action?.permanent}
        onClose={() => setAction(null)}
        onConfirm={() => void act()}
      />
    </div>
  );
}

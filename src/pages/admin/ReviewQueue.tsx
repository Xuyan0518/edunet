import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { requestJson } from "@/services/http";
import { ReviewItem, reviewDestination } from "@/features/admin/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AsyncState } from "@/components/shared/AsyncState";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
export default function ReviewQueue() {
  const { user } = useAuth();
  const c = useWebCopy();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [action, setAction] = useState<{
    row: ReviewItem;
    remove: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: queryKeys.resource(user, "admin/feedback-review"),
    queryFn: ({ signal }) =>
      requestJson<{ pending: ReviewItem[] }>("admin/feedback-review", {
        signal
      })
  });
  const labels: Record<string, string> = {
    weekly: c("每周反馈", "Weekly"),
    quarterly: c("旧版学期", "Legacy semester"),
    yearly: c("旧版年度", "Legacy yearly"),
    report: c("结构化报告", "Structured report")
  };
  async function act() {
    if (!action) return;
    setPending(true);
    const key = `${action.row.type}:${action.row.id}`;
    try {
      await requestJson(
        `admin/feedback-review/${action.row.type}/${encodeURIComponent(
          action.row.id
        )}${action.remove ? "" : "/publish"}`,
        { method: action.remove ? "DELETE" : "POST" }
      );
      const fresh = await query.refetch();
      if (fresh.error) throw fresh.error;
      if (fresh.data.pending.some(row => `${row.type}:${row.id}` === key))
        throw new Error("Queue outcome not confirmed");
      await cache.invalidateQueries({ queryKey: sessionKey(user) });
      setMessage(
        action.remove
          ? c("已移到回收站。", "Moved to the bin.")
          : c(
              "发布操作完成；这不代表通知已送达。",
              "Publication completed; this does not confirm notification delivery."
            )
      );
    } catch (err) {
      setUncertain(values => [...values, key]);
      setMessage(
        (err instanceof Error ? err.message : "Action failed") +
          " " +
          c(
            "请打开原记录核对。此条操作已暂停，避免重复发布通知。",
            "Open the original record to reconcile. This item is paused to avoid repeated publication notifications."
          )
      );
    } finally {
      setPending(false);
      setAction(null);
    }
  }
  return (
    <div className="web-page space-y-5">
      <h1>{c("内容审核", "Content review")}</h1>
      <div className="web-grid">
        <label className="web-field">
          {c("搜索学生或标题", "Search student or title")}
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>
        <label className="web-field">
          {c("内容类型", "Content type")}
          <select
            value={filter}
            onChange={event => setFilter(event.target.value)}
          >
            <option value="">{c("全部", "All")}</option>
            {Object.entries(labels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <AsyncState
        pending={query.isPending}
        error={query.error}
        empty={query.data?.pending.length === 0}
        retry={() => void query.refetch()}
      />
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => void query.refetch()}
      >
        {c("刷新队列", "Refresh queue")}
      </Button>
      {message && <p role="status">{message}</p>}
      {query.data?.pending
        .filter(
          row =>
            (!filter || row.type === filter) &&
            `${row.studentName} ${row.title}`
              .toLowerCase()
              .includes(search.toLowerCase())
        )
        .map(row => (
          <article key={`${row.type}:${row.id}`} className="web-card space-y-3">
            <h2>
              {row.studentName} · {labels[row.type]}
            </h2>
            <Link to={reviewDestination(row)}>{row.title}</Link>
            <p className="whitespace-pre-wrap">{row.summary}</p>
            <p>
              {row.updatedAt} · {row.updatedByName} · {row.reviewStatus} ·{" "}
              {row.visibleToParent ? c("可见", "Visible") : c("隐藏", "Hidden")}
            </p>
            {row.type === "report" && (
              <p>
                {c(
                  "队列发布只改变可见性；草稿可能以草稿状态对家长可见。",
                  "Queue publication changes visibility only; a draft may become visible while remaining a draft."
                )}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                disabled={
                  pending || uncertain.includes(`${row.type}:${row.id}`)
                }
                onClick={() => setAction({ row, remove: false })}
              >
                {c("发布", "Publish")}
              </Button>
              <Button
                variant="outline"
                disabled={
                  pending || uncertain.includes(`${row.type}:${row.id}`)
                }
                onClick={() => setAction({ row, remove: true })}
              >
                {c("移到回收站", "Move to bin")}
              </Button>
            </div>
          </article>
        ))}
      <ConfirmAction
        open={!!action}
        title={
          action?.remove
            ? c("移到回收站？", "Move to bin?")
            : c("发布此内容？", "Publish this content?")
        }
        description={`${action?.row.title || ""} — ${
          action?.remove
            ? c(
                "队列删除不比较原版本；请先打开并核对最新内容。",
                "Queue deletion does not compare the original version. Open and review the latest content first."
              )
            : c(
                "会触发已有家长通知流程。重复发布旧版总结或周反馈可能重复通知。",
                "Triggers the existing parent notification flow. Repeating publication of legacy summaries or weekly feedback may notify again."
              )
        }`}
        pending={pending}
        onClose={() => setAction(null)}
        onConfirm={() => void act()}
      />
    </div>
  );
}

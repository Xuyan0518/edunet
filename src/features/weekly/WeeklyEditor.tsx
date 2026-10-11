import { AssignedSubjects } from "@/components/shared/AssignedSubjects";
import { routerPath } from "@/app/navigation";
import { useSeenMarker } from "@/storage/seen";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { can } from "@/app/permissions";
import { requestJson, ApiError } from "@/services/http";
import {
  businessToday,
  isBusinessDate,
  reportingWeek
} from "@/domain/businessDates";
import { studentsApi } from "@/services/studentsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { TextPreview } from "@/components/shared/TextPreview";
import { AsyncState } from "@/components/shared/AsyncState";
import { WeeklySources } from "./WeeklySources";
import {
  WeeklyRecord,
  weeklyBody,
  weeklyContent,
  weeklyText,
  generateWeeklyDraft
} from "./contracts";
function Form({
  initial,
  name,
  onDirtyChange
}: {
  initial: WeeklyRecord;
  name: string;
  onDirtyChange?: (value: boolean) => void;
}) {
  const { user } = useAuth();
  useSeenMarker(user, initial.studentId, "weekly", [initial], !!initial.id);
  const c = useWebCopy();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [baseline, setBaseline] = useState(initial);
  const [summary, setSummary] = useState(initial.summary);
  const [editing, setEditing] = useState(!initial.id);
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const dirty = summary !== baseline.summary;
  const busy = pending || aiPending;
  const author = can(user, "author", initial.studentId);
  const detailPath = `feedback/one?studentId=${encodeURIComponent(
    initial.studentId
  )}&weekStarting=${initial.weekStarting}`;
  useEffect(() => {
    onDirtyChange?.(dirty || busy);
    const before = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      onDirtyChange?.(false);
      window.removeEventListener("beforeunload", before);
    };
  }, [dirty, busy, onDirtyChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const click = (event: MouseEvent) => {
      const a = (event.target as Element).closest?.("a");
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        !a ||
        a.target === "_blank"
      )
        return;
      const url = new URL(a.href);
      if (
        url.origin !== location.origin ||
        url.hash ||
        url.pathname + url.search === location.pathname + location.search
      )
        return;
      event.preventDefault();
      if (!busy) setDestination(routerPath(url.pathname + url.search));
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [dirty, busy]);
  async function adopt(row: WeeklyRecord) {
    if (!row.id || !row.updatedAt)
      throw new Error("Saved identity/version missing");
    setBaseline(row);
    setSummary(row.summary);
    setEditing(false);
    setUnknown(false);
    await cache.invalidateQueries({ queryKey: sessionKey(user) });
  }
  async function save() {
    if (busy || unknown) return;
    setPending(true);
    setError("");
    let sent = false;
    try {
      const body = weeklyBody(baseline, summary);
      sent = true;
      const saved = await requestJson<WeeklyRecord>(
        baseline.id
          ? `feedback/${encodeURIComponent(baseline.id)}`
          : "feedback",
        { method: baseline.id ? "PUT" : "POST", body }
      );
      const fresh = await requestJson<WeeklyRecord | null>(detailPath);
      if (
        !fresh ||
        fresh.id !== saved.id ||
        weeklyContent(fresh) !== weeklyContent(baseline, summary)
      )
        throw new Error("Saved record could not be confirmed");
      await adopt(fresh);
      setError(
        c(
          "已保存，待审核且家长暂不可见。",
          "Saved for review; currently hidden from parents."
        )
      );
    } catch (err) {
      setUnknown(sent && (!(err instanceof ApiError) || err.status >= 500));
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }
  async function reconcile() {
    setPending(true);
    try {
      const fresh = await requestJson<WeeklyRecord | null>(detailPath);
      if (fresh && weeklyContent(fresh) === weeklyContent(baseline, summary)) {
        await adopt(fresh);
        setError(c("已确认保存。", "Save confirmed."));
      } else {
        setError(
          c(
            "服务器内容不同。请复制当前预览，重新加载后比较；未重复提交。",
            "Server content differs. Copy your preview and reload to compare; nothing was resubmitted."
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Read failed");
    } finally {
      setPending(false);
    }
  }
  async function generate() {
    setAiPending(true);
    setError("");
    try {
      setGenerated(
        await generateWeeklyDraft(initial.studentId, initial.weekStarting)
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "AI_NOT_CONFIGURED"
          ? c(
              "AI 服务尚未配置；当前输入已保留。",
              "AI is not configured. Your text is retained."
            )
          : err instanceof Error
          ? err.message
          : "Generation failed"
      );
    } finally {
      setAiPending(false);
    }
  }
  async function remove() {
    setPending(true);
    setError("");
    try {
      await requestJson(`feedback/${encodeURIComponent(baseline.id)}`, {
        method: "DELETE",
        body: { updatedAt: baseline.updatedAt }
      });
      if (await requestJson(detailPath))
        throw new Error("Deletion not confirmed");
      setRemoveOpen(false);
      setBaseline({
        ...initial,
        id: undefined,
        updatedAt: undefined,
        summary: "",
        strengths: [],
        areasToImprove: [],
        teacherNotes: "",
        nextWeekFocus: ""
      });
      setSummary("");
      setEditing(true);
      await cache.invalidateQueries({ queryKey: sessionKey(user) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="web-heading">
        <div>
          <h2>
            {initial.weekStarting} — {initial.weekEnding}
          </h2>
          <p>
            {baseline.visibleToParent
              ? c(
                  "已对家长可见；编辑保存后将重新待审核。",
                  "Visible to parents. Saving an edit returns it to review."
                )
              : c(
                  "保存后待审核，家长暂不可见。",
                  "Saved feedback awaits review and remains hidden from parents."
                )}
          </p>
        </div>
        <label className="web-field">
          {c("选择周内日期", "Choose a date in the week")}
          <Input
            type="date"
            value={initial.weekStarting}
            disabled={busy}
            min="2000-01-01"
            max="2100-12-31"
            onChange={event => {
              if (!isBusinessDate(event.target.value)) return;
              const path = `/students/${encodeURIComponent(
                initial.studentId
              )}/weekly-feedback?tab=form&weekStarting=${
                reportingWeek(event.target.value).start
              }`;
              if (dirty) setDestination(path);
              else navigate(path);
            }}
          />
        </label>
      </div>
      {error && (
        <p role="status" className="web-card">
          {error}
        </p>
      )}
      {unknown && (
        <div className="web-card">
          <p>
            {c(
              "保存结果未确认。先读取服务器核对。",
              "Save outcome unconfirmed. Reconcile before submitting again."
            )}
          </p>
          <Button disabled={busy} onClick={() => void reconcile()}>
            {c("读取服务器核对", "Reconcile with server")}
          </Button>
        </div>
      )}
      <AssignedSubjects studentId={initial.studentId} />
      <WeeklySources
        studentId={initial.studentId}
        start={initial.weekStarting}
      />
      <form
        onSubmit={event => {
          event.preventDefault();
          void save();
        }}
        className="web-card space-y-4"
      >
        {editing && author ? (
          <label className="web-field">
            {c("本周总结", "Weekly summary")}
            <Textarea
              rows={12}
              maxLength={5000}
              value={summary}
              disabled={busy || unknown}
              onChange={event => setSummary(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              {summary.length} / 5000
            </span>
          </label>
        ) : (
          <section className="space-y-3">
            <h2>{c("本周总结", "Weekly summary")}</h2>
            <p className="whitespace-pre-wrap leading-relaxed text-sm">
              {summary || c("暂无总结", "No summary yet")}
            </p>
          </section>
        )}
        {(baseline.strengths.length > 0 ||
          baseline.areasToImprove.length > 0 ||
          baseline.teacherNotes ||
          baseline.nextWeekFocus) && (
          <details>
            <summary>
              {c("保留的历史字段", "Preserved historical fields")}
            </summary>
            <pre className="whitespace-pre-wrap font-sans">
              {[
                ...baseline.strengths,
                ...baseline.areasToImprove,
                baseline.teacherNotes,
                baseline.nextWeekFocus
              ]
                .filter(Boolean)
                .join("\n")}
            </pre>
          </details>
        )}
        <div className="flex flex-wrap gap-2">
          {author &&
            (editing ? (
              <>
                <Button disabled={busy || unknown}>
                  {pending
                    ? c("保存中…", "Saving…")
                    : c("保存待审核", "Save for review")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || unknown}
                  onClick={() => void generate()}
                >
                  {aiPending
                    ? c("正在生成…", "Generating…")
                    : c("AI 生成草稿", "Generate AI draft")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || unknown}
                  onClick={() => {
                    setSummary(baseline.summary);
                    setEditing(!baseline.id);
                    setGenerated(null);
                  }}
                >
                  {c("取消修改", "Cancel changes")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                {c("编辑", "Edit")}
              </Button>
            ))}
          <TextPreview
            title={`${name} · ${initial.weekStarting}`}
            text={weeklyText({ ...baseline, summary })}
            filename={`weekly-${initial.weekStarting}.txt`}
          />
          {author && baseline.id && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || unknown}
              onClick={() => setRemoveOpen(true)}
            >
              {c("移到回收站", "Move to bin")}
            </Button>
          )}
        </div>
      </form>
      {generated !== null && (
        <section className="web-card space-y-3">
          <h2>{c("AI 草稿（尚未保存）", "AI draft (not saved)")}</h2>
          <p className="whitespace-pre-wrap">{generated}</p>
          <Button
            disabled={busy}
            onClick={() => {
              setSummary(generated);
              setGenerated(null);
            }}
          >
            {c("采用此草稿", "Use this draft")}
          </Button>
          <Button variant="ghost" onClick={() => setGenerated(null)}>
            {c("丢弃", "Discard")}
          </Button>
        </section>
      )}

      <ConfirmAction
        open={removeOpen}
        title={c("移到回收站？", "Move to bin?")}
        description={c(
          "可通过回收站恢复此每周反馈。",
          "This weekly feedback can be restored from the bin."
        )}
        pending={pending}
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => void remove()}
      />
      <ConfirmAction
        open={!!destination}
        title={c("离开未保存内容？", "Leave unsaved changes?")}
        description={c(
          "可以取消并复制预览文本。",
          "Cancel to copy the preview text first."
        )}
        pending={busy}
        onClose={() => setDestination("")}
        onConfirm={() => navigate(destination)}
      />
    </div>
  );
}
export default function WeeklyEditor({
  onDirtyChange
}: {
  onDirtyChange?: (value: boolean) => void;
}) {
  const [params] = useSearchParams();
  const { id: routeStudentId } = useParams();
  const studentId = routeStudentId || params.get("student") || "";
  const selected = params.get("weekStarting") || businessToday();
  const valid = isBusinessDate(selected);
  const week = valid ? reportingWeek(selected) : null;
  const { user } = useAuth();
  const c = useWebCopy();
  const query = useQuery({
    queryKey: queryKeys.student(
      user,
      studentId,
      "weekly-editor",
      week?.start || ""
    ),
    enabled: !!studentId && valid,
    queryFn: async ({ signal }) => {
      const [student, row] = await Promise.all([
        studentsApi.get(studentId, signal),
        requestJson<WeeklyRecord | null>(
          `feedback/one?studentId=${encodeURIComponent(
            studentId
          )}&weekStarting=${week.start}`,
          { signal }
        )
      ]);
      return { student, row };
    }
  });
  if (!valid) return <p role="alert">{c("日期无效", "Invalid date")}</p>;
  return (
    <>
      <AsyncState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <Form
          key={`${studentId}:${week.start}`}
          name={query.data.student.name}
          initial={
            query.data.row || {
              studentId,
              weekStarting: week.start,
              weekEnding: week.end,
              summary: "",
              strengths: [],
              areasToImprove: [],
              teacherNotes: "",
              nextWeekFocus: ""
            }
          }
          onDirtyChange={onDirtyChange}
        />
      )}
    </>
  );
}

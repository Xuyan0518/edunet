import { useUnsavedChanges } from "./useUnsavedChanges";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { can } from "@/app/permissions";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { requestJson, ApiError } from "@/services/http";
import { businessToday } from "@/domain/businessDates";
import { ReportType, LegacyRow, legacyBody, generationBody } from "./contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AsyncState } from "@/components/shared/AsyncState";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { TextPreview } from "@/components/shared/TextPreview";
function Editor({
  initial,
  type,
  studentId,
  reload,
  onDirtyChange
}: {
  initial: LegacyRow;
  type: ReportType;
  studentId: string;
  reload: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { user } = useAuth();
  const c = useWebCopy();
  const cache = useQueryClient();
  const author = can(user, "author", studentId);
  const [row, setRow] = useState(initial);
  const [summary, setSummary] = useState(initial.summary || "");
  const [start, setStart] = useState(
    initial.startDate ||
      `${initial.year}-${String(((initial.quarter || 1) - 1) * 3 + 1).padStart(
        2,
        "0"
      )}-01`
  );
  const [end, setEnd] = useState(
    initial.endDate ||
      new Date(Date.UTC(initial.year, (initial.quarter || 1) * 3, 0))
        .toISOString()
        .slice(0, 10)
  );
  const [editing, setEditing] = useState(!initial.id);
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const dirty =
    editing &&
    (summary !== (row.summary || "") ||
      (!!row.startDate && start !== row.startDate) ||
      (!!row.endDate && end !== row.endDate));
  useUnsavedChanges(
    dirty || pending,
    c(
      "离开将丢失未保存的总结，是否继续？",
      "Leave and discard unsaved summary changes?"
    )
  );
  useEffect(() => {
    onDirtyChange(dirty || pending);
    return () => onDirtyChange(false);
  }, [dirty, pending, onDirtyChange]);
  const endpoint = `students/${encodeURIComponent(studentId)}/${
    type === "yearly" ? "yearly" : "quarterly"
  }-summary`;
  async function read() {
    const result = await requestJson<LegacyRow | LegacyRow[]>(
      `${endpoint}?year=${row.year}`
    );
    return Array.isArray(result)
      ? result.find(item => item.quarter === row.quarter)
      : result.id
      ? result
      : null;
  }
  async function save() {
    setPending(true);
    let sent = false;
    try {
      const body = legacyBody(row, type, summary, start, end);
      sent = true;
      await requestJson(endpoint, { method: "PUT", body });
      const fresh = await read();
      if (!fresh || fresh.summary !== summary)
        throw new Error("Saved summary could not be confirmed");
      setRow(fresh);
      setEditing(false);
      setMessage(
        c(
          "已保存待审核，家长暂不可见。",
          "Saved for review and hidden from parents."
        )
      );
      await cache.invalidateQueries({ queryKey: sessionKey(user) });
    } catch (err) {
      setUnknown(sent && (!(err instanceof ApiError) || err.status >= 500));
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }
  async function generate() {
    setPending(true);
    setMessage("");
    try {
      const result = await requestJson<{ summary: string }>(
        `ai/${type}-summary`,
        {
          method: "POST",
          body: generationBody(studentId, type, row.year, start, end, false)
        }
      );
      if (typeof result.summary !== "string")
        throw new Error("No summary returned");
      setGenerated(result.summary);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    setPending(true);
    try {
      await requestJson(endpoint, {
        method: "DELETE",
        body: { year: row.year, quarter: row.quarter, updatedAt: row.updatedAt }
      });
      if (await read()) throw new Error("Deletion not confirmed");
      setRemoveOpen(false);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="web-card space-y-4">
      <h2>
        {row.year}{" "}
        {type === "quarterly" ? `Q${row.quarter}` : c("年度", "Yearly")} ·{" "}
        {row.visibleToParent
          ? c("家长可见", "Visible to parents")
          : c("家长不可见", "Hidden from parents")}
      </h2>
      <fieldset
        disabled={!author || !editing || pending || unknown}
        className="space-y-3"
      >
        {type === "quarterly" && (
          <div className="web-grid">
            <label className="web-field">
              {c("学期开始日期", "Semester start")}
              <Input
                type="date"
                value={start}
                onChange={event => setStart(event.target.value)}
              />
            </label>
            <label className="web-field">
              {c("学期结束日期", "Semester end")}
              <Input
                type="date"
                value={end}
                onChange={event => setEnd(event.target.value)}
              />
            </label>
          </div>
        )}
        <label className="web-field">
          {c("旧版总结", "Legacy summary")}
          <Textarea
            rows={12}
            maxLength={5000}
            value={summary}
            onChange={event => setSummary(event.target.value)}
          />
        </label>
      </fieldset>
      {message && <p role="status">{message}</p>}
      <div className="flex flex-wrap gap-2">
        {author &&
          (editing ? (
            <>
              <Button disabled={pending || unknown} onClick={() => void save()}>
                {c("保存待审核", "Save for review")}
              </Button>
              <Button
                variant="outline"
                disabled={pending || unknown}
                onClick={() => void generate()}
              >
                {pending
                  ? c("处理中…", "Working…")
                  : c("AI 生成草稿", "Generate AI draft")}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setSummary(row.summary);
                  setStart(row.startDate || start);
                  setEnd(row.endDate || end);
                  setEditing(false);
                  setGenerated(null);
                }}
              >
                {c("取消修改", "Cancel changes")}
              </Button>
            </>
          ) : (
            <Button disabled={pending} onClick={() => setEditing(true)}>
              {c("编辑", "Edit")}
            </Button>
          ))}
        <TextPreview
          title={`${row.year} ${type}`}
          text={summary}
          filename={`legacy-${type}-${row.year}.txt`}
        />
        {author && row.id && (
          <Button
            variant="outline"
            disabled={pending || unknown}
            onClick={() => setRemoveOpen(true)}
          >
            {c("移到回收站", "Move to bin")}
          </Button>
        )}
        {unknown && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                const fresh = await read();
                if (fresh?.summary === summary) {
                  setRow(fresh);
                  setUnknown(false);
                  setEditing(false);
                  setMessage(c("已确认保存。", "Save confirmed."));
                } else
                  setMessage(
                    c(
                      "服务器内容不同。请复制当前预览，再重新加载比较。",
                      "Server content differs. Copy your preview, then reload to compare."
                    )
                  );
              } catch (err) {
                setMessage(err instanceof Error ? err.message : "Read failed");
              } finally {
                setPending(false);
              }
            }}
          >
            {c("读取服务器核对", "Reconcile with server")}
          </Button>
        )}
      </div>
      {generated !== null && (
        <div className="border rounded p-4 space-y-3">
          <h3>{c("AI 草稿，尚未保存", "AI draft, not saved")}</h3>
          <p className="whitespace-pre-wrap">{generated}</p>
          <Button
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
        </div>
      )}
      <ConfirmAction
        open={removeOpen}
        title={c("将旧版总结移到回收站？", "Move legacy summary to bin?")}
        description={`${row.year} ${
          type === "quarterly" ? `Q${row.quarter}` : ""
        }`}
        pending={pending}
        error={message || undefined}
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
export function LegacySummaries({
  studentId,
  onDirtyChange
}: {
  studentId: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { user } = useAuth();
  const c = useWebCopy();
  const [params] = useSearchParams();
  const [year, setYear] = useState(
    Number(params.get("legacyYear") || businessToday().slice(0, 4))
  );
  const [quarter, setQuarter] = useState(
    Number(params.get("legacyQuarter")) || 1
  );
  const [type, setType] = useState<ReportType>(
    params.get("legacyType") === "yearly" ? "yearly" : "quarterly"
  );
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const discard = () =>
    !dirty ||
    window.confirm(
      c(
        "切换将丢失未保存的总结，是否继续？",
        "Switch and discard unsaved summary changes?"
      )
    );
  const valid = Number.isInteger(year) && year >= 2000 && year <= 2100;
  const endpoint = `students/${encodeURIComponent(
    studentId
  )}/${type}-summary?year=${year}`;
  const query = useQuery({
    queryKey: queryKeys.resource(user, endpoint),
    enabled: valid,
    queryFn: ({ signal }) =>
      requestJson<LegacyRow[] | LegacyRow>(endpoint, { signal })
  });
  const row = Array.isArray(query.data)
    ? query.data.find(item => item.quarter === quarter)
    : query.data?.id
    ? query.data
    : null;
  return (
    <div className="space-y-4">
      <p>
        {c(
          "旧版学期与年度总结保留在此。切换年份或类型前请保存或复制当前输入。",
          "Legacy semester and yearly summaries remain here. Save or copy your input before changing the year or type."
        )}
      </p>
      <div className="web-grid">
        <label className="web-field">
          {c("类型", "Type")}
          <select
            value={type}
            onChange={event => {
              if (discard()) setType(event.target.value as ReportType);
            }}
          >
            <option value="quarterly">
              {c("旧版学期", "Legacy semester")}
            </option>
            <option value="yearly">{c("旧版年度", "Legacy yearly")}</option>
          </select>
        </label>
        <label className="web-field">
          {c("年份", "Year")}
          <Input
            type="number"
            min="2000"
            max="2100"
            value={year}
            onChange={event => {
              if (discard()) setYear(Number(event.target.value));
            }}
          />
        </label>
        {type === "quarterly" && (
          <label className="web-field">
            {c("季度", "Quarter")}
            <select
              value={quarter}
              onChange={event => {
                if (discard()) setQuarter(Number(event.target.value));
              }}
            >
              {[1, 2, 3, 4].map(n => (
                <option key={n} value={n}>
                  Q{n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <AsyncState
        pending={valid && query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {valid &&
        query.isSuccess &&
        (row || can(user, "author", studentId) ? (
          <Editor
            key={`${studentId}:${type}:${year}:${quarter}:${revision}`}
            studentId={studentId}
            onDirtyChange={setDirty}
            type={type}
            initial={row || { year, quarter, summary: "" }}
            reload={async () => {
              await query.refetch();
              setRevision(value => value + 1);
            }}
          />
        ) : (
          <p>{c("暂无可见总结。", "No visible summary.")}</p>
        ))}
    </div>
  );
}

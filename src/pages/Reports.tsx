import { StudentWorkspace } from "@/components/layout/StudentWorkspace";
import { AssignedSubjects } from "@/components/shared/AssignedSubjects";
import { useSeenMarker } from "@/storage/seen";
import { generateSavedReport } from "@/features/reports/workflows";
import { useState } from "react";
import {
  useParams,
  useSearchParams,
  useNavigate,
  Link
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys } from "@/app/queryKeys";
import { can } from "@/app/permissions";
import { requestJson, queryString, ApiError } from "@/services/http";
import { businessToday } from "@/domain/businessDates";
import {
  ReportRow,
  ReportType,
  generationBody
} from "@/features/reports/contracts";
import { LegacySummaries } from "@/features/reports/LegacySummaries";
import { RangeExport } from "@/features/reports/RangeExport";
import { AsyncState } from "@/components/shared/AsyncState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function Reports() {
  const { id } = useParams();
  const { user } = useAuth();
  const c = useWebCopy();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const legacy = params.get("view") === "legacy";
  const type = params.get("reportType") || "";
  const year = params.get("year") || "";
  const visible = params.get("visibleToParent") || "";
  const author = can(user, "author", id);
  const endpoint = `students/${encodeURIComponent(id)}/reports?${queryString({
    reportType: type || undefined,
    year: year || undefined,
    visibleToParent: author && visible ? visible : undefined
  })}`;
  const query = useQuery({
    queryKey: queryKeys.resource(user, endpoint),
    enabled: !legacy,
    queryFn: ({ signal }) => requestJson<ReportRow[]>(endpoint, { signal })
  });
  useSeenMarker(
    user,
    id,
    "reports",
    query.data || [],
    !legacy && query.isSuccess
  );
  const today = businessToday();
  const [generateType, setGenerateType] = useState<ReportType>("quarterly");
  const [generateYear, setGenerateYear] = useState(Number(today.slice(0, 4)));
  const [start, setStart] = useState(today.slice(0, 7) + "-01");
  const [end, setEnd] = useState(today);
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [legacyDirty, setLegacyDirty] = useState(false);
  const [message, setMessage] = useState("");
  function change(key: string, value: string) {
    if (
      legacyDirty &&
      !window.confirm(
        c(
          "切换将丢失未保存的总结，是否继续？",
          "Switch and discard unsaved summary changes?"
        )
      )
    )
      return;
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  async function generate() {
    setPending(true);
    setMessage("");
    let sent = false;
    try {
      generationBody(id, generateType, generateYear, start, end, true);
      sent = true;
      const savedId = await generateSavedReport(
        id,
        generateType,
        generateYear,
        start,
        end
      );
      await query.refetch();
      navigate(`/reports/${encodeURIComponent(savedId)}`);
    } catch (err) {
      setUnknown(sent && (!(err instanceof ApiError) || err.status >= 500));
      setMessage(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="web-page space-y-5">
      <StudentWorkspace
        studentId={id}
        section="reports"
        locked={pending || legacyDirty}
      />
      <div className="section-heading">
        <div>
          <h2>{c("学习报告", "Learning reports")}</h2>
          <p>
            {c(
              "回顾学习成果，审阅后分享给家长。",
              "Review learning over time and share approved reports with parents."
            )}
          </p>
        </div>
      </div>
      <AssignedSubjects studentId={id} />
      <div className="flex gap-3">
        <Button
          disabled={pending}
          variant={!legacy ? "default" : "outline"}
          onClick={() => change("view", "structured")}
        >
          {c("结构化报告", "Structured reports")}
        </Button>
        <Button
          disabled={pending}
          variant={legacy ? "default" : "outline"}
          onClick={() => change("view", "legacy")}
        >
          {c("旧版总结", "Legacy summaries")}
        </Button>
      </div>
      {legacy ? (
        <LegacySummaries
          key={id}
          studentId={id}
          onDirtyChange={setLegacyDirty}
        />
      ) : (
        <>
          <div className="web-grid">
            <label className="web-field">
              {c("报告类型", "Report type")}
              <select
                value={type}
                onChange={event => change("reportType", event.target.value)}
              >
                <option value="">{c("全部", "All")}</option>
                <option value="quarterly">{c("学期", "Semester")}</option>
                <option value="yearly">{c("年度", "Yearly")}</option>
              </select>
            </label>
            <label className="web-field">
              {c("年份（留空为全部）", "Year (blank for all)")}
              <Input
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={event => change("year", event.target.value)}
              />
            </label>
            {author && (
              <label className="web-field">
                {c("家长可见性", "Parent visibility")}
                <select
                  value={visible}
                  onChange={event =>
                    change("visibleToParent", event.target.value)
                  }
                >
                  <option value="">{c("全部", "All")}</option>
                  <option value="true">{c("可见", "Visible")}</option>
                  <option value="false">{c("隐藏", "Hidden")}</option>
                </select>
              </label>
            )}
          </div>
          <AsyncState
            pending={query.isPending}
            error={query.error}
            empty={query.data?.length === 0}
            retry={() => void query.refetch()}
          />
          {query.data?.map(row => (
            <article key={row.id} className="web-card space-y-2">
              <h2>
                <Link to={`/reports/${encodeURIComponent(row.id)}`}>
                  {row.title || c("学习报告", "Learning report")}
                </Link>
              </h2>
              <p>
                {row.startDate} — {row.endDate} ·{" "}
                {row.status === "final"
                  ? c("最终版", "Final")
                  : c("草稿", "Draft")}{" "}
                ·{" "}
                {row.visibleToParent
                  ? c("家长可见", "Visible to parents")
                  : c("家长不可见", "Hidden from parents")}
              </p>
              <p>{row.summaryPreview || row.summary}</p>
              <p>
                {c("更新", "Updated")}: {row.updatedAt}
              </p>
            </article>
          ))}
          {author && (
            <section className="web-card space-y-3">
              <h2>
                {c("生成新的结构化报告", "Generate a new structured report")}
              </h2>
              <p>
                {c(
                  "生成会保存一份草稿，家长暂不可见。再次生成可能创建同一时期的另一份报告。",
                  "Generation saves a hidden draft. Another generation may create another report for the same period."
                )}
              </p>
              <fieldset disabled={pending || unknown} className="space-y-3">
                <label className="web-field">
                  {c("生成类型", "Generation type")}
                  <select
                    value={generateType}
                    onChange={event =>
                      setGenerateType(event.target.value as ReportType)
                    }
                  >
                    <option value="quarterly">{c("学期", "Semester")}</option>
                    <option value="yearly">{c("年度", "Yearly")}</option>
                  </select>
                </label>
                {generateType === "yearly" ? (
                  <label className="web-field">
                    {c("生成年份", "Generation year")}
                    <Input
                      type="number"
                      min="2000"
                      max="2100"
                      value={generateYear}
                      onChange={event =>
                        setGenerateYear(Number(event.target.value))
                      }
                    />
                  </label>
                ) : (
                  <div className="web-grid">
                    <label className="web-field">
                      {c("开始日期", "Start date")}
                      <Input
                        type="date"
                        value={start}
                        onChange={event => setStart(event.target.value)}
                      />
                    </label>
                    <label className="web-field">
                      {c("结束日期", "End date")}
                      <Input
                        type="date"
                        value={end}
                        onChange={event => setEnd(event.target.value)}
                      />
                    </label>
                  </div>
                )}
                <Button onClick={() => void generate()}>
                  {pending
                    ? c("生成中…", "Generating…")
                    : c("生成并保存草稿", "Generate and save draft")}
                </Button>
              </fieldset>
              {message && <p role="status">{message}</p>}
              {unknown && (
                <p>
                  {c(
                    "结果未确认。请刷新报告列表并核对生成时间，避免重复生成。",
                    "Outcome unconfirmed. Refresh the report list and inspect generation times before generating again."
                  )}
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setPending(true);
                      try {
                        const result = await query.refetch({
                          throwOnError: true
                        });
                        if (result.isSuccess) {
                          setUnknown(false);
                          setMessage(
                            c(
                              "已刷新。请先打开同一时期的报告核对内容；只有确实需要另一份报告时再生成。",
                              "List refreshed. Inspect existing reports for this period before intentionally generating another."
                            )
                          );
                        }
                      } catch (error) {
                        setMessage(
                          error instanceof Error ? error.message : "Read failed"
                        );
                      } finally {
                        setPending(false);
                      }
                    }}
                    disabled={pending}
                  >
                    {c("刷新列表", "Refresh list")}
                  </Button>
                </p>
              )}
            </section>
          )}
        </>
      )}
      <RangeExport studentId={id} />
    </div>
  );
}

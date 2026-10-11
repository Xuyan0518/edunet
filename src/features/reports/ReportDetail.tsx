import { StudentWorkspace } from "@/components/layout/StudentWorkspace";
import { useUnsavedChanges } from "./useUnsavedChanges";
import { setReportPublication } from "./workflows";
import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { can } from "@/app/permissions";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { requestJson, ApiError } from "@/services/http";
import { readReport } from "@/domain/reportAdapters";
import { record, text } from "@/domain/activityAdapters";
import {
  ReportRow,
  editableReport,
  contentPatch,
  overallField,
  subjectField,
  overallText
} from "./contracts";
import { buildReportMarkdown } from "./compat/reportMarkdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AsyncState } from "@/components/shared/AsyncState";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { TextPreview } from "@/components/shared/TextPreview";
function Content({ initial }: { initial: ReportRow }) {
  const { user } = useAuth();
  const c = useWebCopy();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [row, setRow] = useState(initial);
  const [content, setContent] = useState(editableReport(initial));
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<
    "publish" | "unpublish" | "delete" | ""
  >("");
  useUnsavedChanges(
    pending ||
      (editing &&
        JSON.stringify(content) !== JSON.stringify(editableReport(row))),
    c(
      "离开将丢失未保存的报告修改，是否继续？",
      "Leave and discard unsaved report changes?"
    )
  );
  const author = can(user, "author", row.studentId);
  const admin = can(user, "admin");
  const view = readReport(row);
  const analytics = record(row.analytics);
  const attendance = record(analytics.attendanceAndStudyTime);
  const english = record(analytics.englishAnalytics);
  const skills = record(english.skillBreakdown);
  const subjects = (Array.isArray(content?.subjectReports)
    ? content.subjectReports
    : []
  ).map(record);
  const path = `reports/${encodeURIComponent(row.id)}`;
  async function refresh() {
    const fresh = await requestJson<ReportRow>(path);
    setRow(fresh);
    await cache.invalidateQueries({ queryKey: sessionKey(user) });
    return fresh;
  }
  async function save() {
    setPending(true);
    let sent = false;
    try {
      const body = contentPatch(row, content);
      sent = true;
      await requestJson(path, { method: "PATCH", body });
      const fresh = await refresh();
      setContent(editableReport(fresh));
      setEditing(false);
      setMessage(
        c(
          "内容已保存，可见性保持服务器当前状态。",
          "Content saved; visibility remains at its current server state."
        )
      );
    } catch (err) {
      setUnknown(sent && (!(err instanceof ApiError) || err.status >= 500));
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }
  async function act() {
    setPending(true);
    setMessage("");
    try {
      if (confirm === "delete") {
        await requestJson(path, { method: "DELETE" });
        await cache.invalidateQueries({ queryKey: sessionKey(user) });
        navigate(`/students/${row.studentId}/reports`);
        return;
      }
      await setReportPublication(row.id, confirm === "publish", setRow);
      await cache.invalidateQueries({ queryKey: sessionKey(user) });
      setConfirm("");
      setUnknown(false);
      setMessage(
        c("状态和可见性已重新读取。", "Status and visibility reread.")
      );
    } catch (err) {
      setMessage(
        c(
          "操作未完成。请先读取状态；可能已经标记为最终版但尚未对家长可见。",
          "Operation incomplete. Reread the state; the report may be final but still hidden."
        ) +
          " " +
          (err instanceof Error ? err.message : "")
      );
      setConfirm("");
      setUnknown(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="web-page space-y-5">
      <StudentWorkspace
        studentId={row.studentId}
        section="reports"
        locked={pending || editing}
      />
      <Link to={`/students/${row.studentId}/reports`}>
        {c("返回报告列表", "Back to reports")}
      </Link>
      <h1>{row.title || c("学习报告", "Learning report")}</h1>
      <p>
        {row.startDate} — {row.endDate}
      </p>
      <div className="flex gap-3">
        <span className="record-badge">
          {row.status === "final" ? c("最终版", "Final") : c("草稿", "Draft")}
        </span>
        <span className="record-badge">
          {row.visibleToParent
            ? c("家长可见", "Visible to parents")
            : c("家长不可见", "Hidden from parents")}
        </span>
      </div>
      {author && view.warning && (
        <p role="status">
          {c(
            "部分历史报告内容无法解析。下方保留文字总结，原始数据未被改写。",
            "Some historical content could not be parsed. The text summary is retained; original data has not been rewritten."
          )}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {unknown && (
        <Button
          disabled={pending}
          variant="outline"
          onClick={async () => {
            setPending(true);
            try {
              await refresh();
              setUnknown(false);
              setMessage(
                c(
                  "已读取最新状态。输入仍保留；请比较后再决定操作。",
                  "Latest state read. Your input remains; compare before choosing the next action."
                )
              );
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Read failed");
            } finally {
              setPending(false);
            }
          }}
        >
          {c("读取最新状态", "Reread current state")}
        </Button>
      )}
      {author && (
        <div className="flex flex-wrap gap-2">
          {content &&
            (editing ? (
              <>
                <Button
                  disabled={pending || unknown}
                  onClick={() => void save()}
                >
                  {c("保存内容", "Save content")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setContent(editableReport(row));
                    setEditing(false);
                  }}
                >
                  {c("取消修改", "Cancel changes")}
                </Button>
              </>
            ) : (
              <Button
                disabled={pending || unknown}
                onClick={() => setEditing(true)}
              >
                {c("编辑", "Edit")}
              </Button>
            ))}
          <TextPreview
            title={row.title}
            text={buildReportMarkdown({
              ...row,
              finalReport: content || view.content
            })}
            filename={`report-${row.id}.md`}
          />
          {admin && !editing && (
            <Button
              disabled={pending || unknown}
              variant="outline"
              onClick={() =>
                setConfirm(row.visibleToParent ? "unpublish" : "publish")
              }
            >
              {row.visibleToParent
                ? c("取消发布", "Unpublish")
                : c("发布给家长", "Publish to parents")}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={pending || unknown || editing}
            onClick={() => setConfirm("delete")}
          >
            {c("移到回收站", "Move to bin")}
          </Button>
        </div>
      )}
      <section className="web-card space-y-3">
        <h2>{c("出勤与学习时间", "Attendance and study time")}</h2>
        {Object.keys(attendance).length ? (
          <div className="web-grid">
            {[
              ["presentDays", c("出席天数", "Present days")],
              ["lateDays", c("迟到天数", "Late days")],
              ["absentDays", c("缺勤天数", "Absent days")],
              ["totalStudyHours", c("学习总小时", "Total study hours")],
              [
                "averageStudyHoursPerDay",
                c("日均学习小时", "Average hours per day")
              ]
            ].map(([key, label]) => (
              <p key={key}>
                {label}: {attendance[key] == null ? "—" : text(attendance[key])}
              </p>
            ))}
          </div>
        ) : (
          <p>{c("暂无足够数据", "Insufficient data")}</p>
        )}
      </section>
      <section className="web-card space-y-3">
        <h2>{c("英文学习情况", "English learning")}</h2>
        {Object.entries(skills).map(([key, value]) => {
          const item = record(value);
          return (
            <p key={key}>
              {text(item.label) || key}: {c("次数", "Count")}{" "}
              {item.activityCount == null ? "—" : text(item.activityCount)} ·{" "}
              {c("平均分", "Average")}{" "}
              {item.averageScore == null ? "—" : `${text(item.averageScore)}%`}
            </p>
          );
        })}
        {Array.isArray(english.customTaskStats) &&
          english.customTaskStats.map((value, index) => {
            const item = record(value);
            return (
              <p key={index}>
                {text(item.displayName || item.key)}:{" "}
                {item.completedCount == null ? "—" : text(item.completedCount)}{" "}
                ·{" "}
                {item.averageScore == null
                  ? "—"
                  : `${text(item.averageScore)}%`}
              </p>
            );
          })}
        {Object.keys(record(english.vocabularyStats)).length > 0 && (
          <p>
            {c("单词 / 句子", "Words / sentences")}:{" "}
            {text(record(english.vocabularyStats).vocabularyItemsCount ?? "—")}{" "}
            / {text(record(english.vocabularyStats).sentenceItemsCount ?? "—")}
          </p>
        )}
        {!Object.keys(english).length && (
          <p>{c("暂无足够英文数据", "Insufficient English data")}</p>
        )}
        <p className="whitespace-pre-wrap">
          {text(record(content?.englishSpecialAnalysis).summary)}
        </p>
        <p className="whitespace-pre-wrap">
          {text(record(content?.englishSpecialAnalysis).teacherSuggestion)}
        </p>
      </section>
      <section className="web-card space-y-4">
        <h2>{c("各科总结", "Subject summaries")}</h2>
        {subjects.map((subject, index) => (
          <section key={index} className="space-y-2">
            <h3>{text(subject.subjectRawName || subject.subjectName)}</h3>
            {editing ? (
              <Textarea
                aria-label={`${text(
                  subject.subjectRawName || subject.subjectName
                )} ${c("总结", "summary")}`}
                rows={5}
                disabled={pending || unknown}
                value={text(subject[subjectField(row.reportType)])}
                onChange={event =>
                  setContent({
                    ...content,
                    subjectReports: subjects.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            [subjectField(row.reportType)]: event.target.value
                          }
                        : item
                    )
                  })
                }
              />
            ) : (
              <p className="whitespace-pre-wrap">
                {text(subject[subjectField(row.reportType)]) ||
                  c("暂无总结", "No summary")}
              </p>
            )}
            {[
              "strengths",
              "areasToImprove",
              "nextSteps",
              "evidence",
              "growth",
              "challenges",
              "nextYearFocus"
            ]
              .filter(key => Array.isArray(subject[key]) && subject[key].length)
              .map(key => (
                <ul key={key} className="list-disc pl-5">
                  {(subject[key] as unknown[]).map((value, i) => (
                    <li key={i}>{text(value)}</li>
                  ))}
                </ul>
              ))}
          </section>
        ))}
      </section>
      <section className="web-card space-y-3">
        <h2>{c("总体总结", "Overall summary")}</h2>
        {editing ? (
          <Textarea
            aria-label={c("总体总结", "Overall summary")}
            rows={10}
            disabled={pending || unknown}
            value={overallText(row, content)}
            onChange={event =>
              setContent({
                ...content,
                [overallField(row.reportType)]: event.target.value
              })
            }
          />
        ) : (
          <p className="whitespace-pre-wrap">
            {content ? overallText(row, content) : view.summary}
          </p>
        )}
        {content &&
          [
            "keyHighlights",
            "keyConcerns",
            "annualGrowthHighlights",
            "longTermConcerns"
          ].map(
            key =>
              Array.isArray(content[key]) && (
                <ul className="list-disc pl-5" key={key}>
                  {(content[key] as unknown[]).map((value, index) => (
                    <li key={index}>{text(value)}</li>
                  ))}
                </ul>
              )
          )}
        {(Array.isArray(content?.nextStageRecommendations)
          ? content.nextStageRecommendations
          : Array.isArray(content?.nextYearRecommendations)
          ? content.nextYearRecommendations
          : []
        ).map((value, index) => {
          const item = record(value);
          return (
            <p key={index}>
              {text(item.area)}: {text(item.recommendation)}
            </p>
          );
        })}
      </section>
      <ConfirmAction
        open={!!confirm}
        title={
          confirm === "delete"
            ? c("移到回收站？", "Move to bin?")
            : confirm === "publish"
            ? c("发布给家长？", "Publish to parents?")
            : c("取消发布？", "Unpublish?")
        }
        description={
          confirm === "publish"
            ? c(
                "先标记为最终版，再设为家长可见。首次从隐藏改为可见时会触发已有通知流程。",
                "Marks final, then makes visible to parents. A hidden-to-visible transition triggers the existing notification flow."
              )
            : confirm === "unpublish"
            ? c(
                "家长将不能查看，最终版状态保持不变。",
                "Parents will no longer see this report. Final status is retained."
              )
            : row.title
        }
        pending={pending}
        onClose={() => setConfirm("")}
        onConfirm={() => void act()}
      />
    </div>
  );
}
export default function ReportDetail() {
  const { reportId } = useParams();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.resource(user, `report:${reportId}`),
    queryFn: ({ signal }) =>
      requestJson<ReportRow>(`reports/${encodeURIComponent(reportId)}`, {
        signal
      })
  });
  return (
    <>
      <AsyncState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && <Content key={reportId} initial={query.data} />}
    </>
  );
}

import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys } from "@/app/queryKeys";
import { requestJson } from "@/services/http";
import { businessToday, isBusinessDate } from "@/domain/businessDates";
import {
  validExportRange,
  Cycle,
  GradePlan
} from "@/features/planning/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AsyncState } from "@/components/shared/AsyncState";
import { DownloadButton } from "@/components/shared/DownloadButton";
type Status = {
  planId: string;
  weekStarting: string;
  weekEnding: string;
  topic: string;
  score: number | null;
  completed: boolean;
  comment: string;
};
type Row = {
  studentId: string;
  studentName: string;
  grade: string;
  planId?: string | null;
  recordId?: string | null;
  score?: number | null;
  completed?: boolean;
  comment?: string;
  averageScore?: number | null;
  totalPlans?: number;
  completedCount?: number;
  incompleteCount?: number;
  incompleteTopics?: string[];
  planStatuses?: Status[];
};
type Summary = {
  cycle?: Cycle;
  startDate?: string;
  endDate?: string;
  groups: {
    grade: string;
    plan?: GradePlan | null;
    planCount?: number;
    totalStudents: number;
    completedCount: number;
    incompleteCount: number;
    rows: Row[];
  }[];
  metrics: Record<string, number>;
};
export default function PlanSummaries() {
  const { user } = useAuth();
  const c = useWebCopy();
  const [params, setParams] = useSearchParams();
  const term = params.get("view") === "term";
  const today = businessToday();
  const date = params.get("weekStarting") || today;
  const start = params.get("startDate") || today.slice(0, 7) + "-01";
  const end = params.get("endDate") || today;
  const valid = term ? validExportRange(start, end) : isBusinessDate(date);
  const qs = term
    ? `startDate=${start}&endDate=${end}`
    : `weekStarting=${date}`;
  const path = `admin/${term ? "term" : "weekly"}-plan-summary`;
  const query = useQuery({
    queryKey: queryKeys.resource(user, `${path}?${qs}`),
    enabled: valid,
    queryFn: ({ signal }) => requestJson<Summary>(`${path}?${qs}`, { signal })
  });
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }
  const status = (row: Row) =>
    !row.planId
      ? c("暂无计划", "No plan")
      : !row.recordId
      ? c("暂无记录", "No record")
      : row.completed
      ? c("已完成", "Completed")
      : row.score != null
      ? c("有分数，未勾选完成", "Scored, not completed")
      : c("未完成", "Incomplete");
  const metrics: Record<string, string> = {
    totalGrades: c("年级数", "Grades"),
    totalStudents: c("学生数", "Students"),
    completedCount: c("已完成", "Completed"),
    incompleteCount: c("未完成", "Incomplete"),
    planCount: c("计划数", "Plans"),
    totalPlans: c("计划数", "Plans"),
    incompleteStudentCount: c(
      "有未完成计划的学生",
      "Students with incomplete plans"
    )
  };
  return (
    <div className="web-page space-y-5">
      <h1>{c("学习计划汇总", "Learning plan summaries")}</h1>
      <div className="flex flex-wrap gap-3">
        <Button
          variant={!term ? "default" : "outline"}
          onClick={() => change("view", "weekly")}
        >
          {c("周期汇总", "Cycle summary")}
        </Button>
        <Button
          variant={term ? "default" : "outline"}
          onClick={() => change("view", "term")}
        >
          {c("学期 / 日期范围", "Term / date range")}
        </Button>
      </div>
      <div className="web-grid">
        {term ? (
          <>
            <label className="web-field">
              {c("开始日期", "Start date")}
              <Input
                type="date"
                value={start}
                onChange={event => change("startDate", event.target.value)}
              />
            </label>
            <label className="web-field">
              {c("结束日期", "End date")}
              <Input
                type="date"
                value={end}
                onChange={event => change("endDate", event.target.value)}
              />
            </label>
          </>
        ) : (
          <label className="web-field">
            {c("周期内日期", "Date within cycle")}
            <Input
              type="date"
              value={date}
              onChange={event => change("weekStarting", event.target.value)}
            />
          </label>
        )}
      </div>
      <p>
        {term
          ? c(
              "按计划开始日期筛选，并按学生当前年级分组。平均分包含有分数但未勾选完成的记录。",
              "Filters by plan start date and groups students by current grade. Averages include scored records even when completion is unchecked."
            )
          : c(
              "无计划、无记录与有分数但未完成分别显示。",
              "No-plan, no-record and scored-but-incomplete states are shown separately."
            )}
      </p>
      {!valid ? (
        <p role="alert">
          {c(
            "请选择有效日期范围，最多 370 天。",
            "Choose a valid date range of at most 370 days."
          )}
        </p>
      ) : (
        <AsyncState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}
      <DownloadButton
        endpoint={`${path}/export?${qs}`}
        disabled={!valid || !query.isSuccess}
        label={c("下载汇总 XLS", "Download summary XLS")}
      />
      {query.data && (
        <>
          {query.data.cycle && (
            <h2>
              {query.data.cycle.startDate} — {query.data.cycle.endDate}
            </h2>
          )}
          <div className="web-grid">
            {Object.entries(query.data.metrics).map(([key, value]) => (
              <div className="web-card" key={key}>
                {metrics[key] || key}: <strong>{value}</strong>
              </div>
            ))}
          </div>
          {query.data.groups.map(group => (
            <section key={group.grade} className="web-card space-y-3">
              <h2>
                {group.grade} · {group.totalStudents} {c("名学生", "students")}
              </h2>
              {!term && (
                <p>
                  {group.plan?.topic ||
                    c("此周期暂无计划", "No plan for this cycle")}
                </p>
              )}
              {term && group.planCount === 0 && (
                <p>
                  {c(
                    "此日期范围没有计划，不计为缺交周期。",
                    "No plans in this range; this does not count as a missing weekly submission."
                  )}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th>{c("学生", "Student")}</th>
                      <th>
                        {term ? c("平均分", "Average") : c("得分", "Score")}
                      </th>
                      <th>{c("状态", "Status")}</th>
                      <th>{c("详情", "Details")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(row => (
                      <tr key={row.studentId} className="border-t">
                        <td className="p-2">
                          <Link
                            to={`/students/${encodeURIComponent(
                              row.studentId
                            )}/weekly-plan?weekStarting=${query.data.cycle
                              ?.startDate || start}`}
                          >
                            {row.studentName}
                          </Link>
                        </td>
                        <td>{(term ? row.averageScore : row.score) ?? "—"}</td>
                        <td>
                          {term
                            ? `${row.completedCount ?? 0} / ${row.totalPlans ??
                                0}`
                            : status(row)}
                        </td>
                        <td>
                          {term ? (
                            <details>
                              <summary>{c("计划明细", "Plan details")}</summary>
                              {row.planStatuses?.map(item => (
                                <p key={item.planId}>
                                  {item.weekStarting} · {item.topic} ·{" "}
                                  {item.score ?? "—"} ·{" "}
                                  {item.completed
                                    ? c("已完成", "Completed")
                                    : c("未完成", "Incomplete")}{" "}
                                  {item.comment}
                                </p>
                              ))}
                            </details>
                          ) : (
                            row.comment || "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
      <section className="web-card space-y-3">
        <h2>{c("学习任务完成情况导出", "Learning task completion export")}</h2>
        <p>
          {c(
            "使用下面的独立日期范围，文件格式为 XLSX。",
            "Uses the separate date range below and downloads XLSX."
          )}
        </p>
        <TaskExport />
      </section>
    </div>
  );
}
function TaskExport() {
  const c = useWebCopy();
  const [params, setParams] = useSearchParams();
  const today = businessToday();
  const start = params.get("taskStart") || today.slice(0, 7) + "-01";
  const end = params.get("taskEnd") || today;
  function set(start: string, end: string) {
    const next = new URLSearchParams(params);
    next.set("taskStart", start);
    next.set("taskEnd", end);
    setParams(next);
  }
  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => set(today.slice(0, 7) + "-01", today)}
        >
          {c("本月", "This month")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const date = new Date(today + "T12:00:00Z");
            date.setUTCDate(1);
            date.setUTCMonth(date.getUTCMonth() - 2);
            set(date.toISOString().slice(0, 10), today);
          }}
        >
          {c("最近三个月", "Recent three months")}
        </Button>
      </div>
      <div className="web-grid">
        <label className="web-field">
          {c("任务开始日期", "Task start date")}
          <Input
            type="date"
            value={start}
            onChange={event => set(event.target.value, end)}
          />
        </label>
        <label className="web-field">
          {c("任务结束日期", "Task end date")}
          <Input
            type="date"
            value={end}
            onChange={event => set(start, event.target.value)}
          />
        </label>
      </div>
      <DownloadButton
        endpoint={`admin/learning-task-completion/export?startDate=${start}&endDate=${end}`}
        disabled={!validExportRange(start, end)}
        label={c("下载学习任务 XLSX", "Download learning tasks XLSX")}
      />
    </>
  );
}

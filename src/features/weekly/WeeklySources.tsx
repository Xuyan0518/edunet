import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys } from "@/app/queryKeys";
import { requestJson } from "@/services/http";
import { DailyRecord } from "@/features/progress/dailySave";
import { DailyRecordCard } from "@/features/progress/DailyRecordCard";
import { Paper } from "@/features/assessments/contracts";
import { scoreDisplay } from "@/domain/scoreDisplay";
import { AsyncState } from "@/components/shared/AsyncState";
import { sourceRange } from "./contracts";
export function WeeklySources({
  studentId,
  start
}: {
  studentId: string;
  start: string;
}) {
  const { user } = useAuth();
  const c = useWebCopy();
  const query = useQuery({
    queryKey: queryKeys.student(user, studentId, "weekly-sources", start),
    queryFn: async ({ signal }) => {
      const [daily, papers] = await Promise.all([
        requestJson<DailyRecord[]>(
          `progress/list?studentId=${encodeURIComponent(studentId)}`,
          { signal }
        ),
        requestJson<Paper[]>(
          `students/${encodeURIComponent(studentId)}/papers`,
          { signal }
        )
      ]);
      return {
        daily: sourceRange(daily, start),
        papers: sourceRange(papers, start)
      };
    }
  });
  return (
    <section className="weekly-sources space-y-4">
      <div className="section-heading">
        <div>
          <h2>{c("这一周，每天都学了什么", "This week, day by day")}</h2>
          <p>
            {c(
              "每日记录和独立试卷，供撰写周反馈时参考。",
              "Daily learning and practice results to guide your weekly feedback."
            )}
          </p>
        </div>
        {query.data && (
          <span className="record-badge">
            {query.data.daily.length}{" "}
            {c(
              "天有记录",
              query.data.daily.length === 1 ? "recorded day" : "recorded days"
            )}
          </span>
        )}
      </div>
      <AsyncState
        pending={query.isPending}
        error={query.error}
        empty={
          query.isSuccess &&
          !query.data.daily.length &&
          !query.data.papers.length
        }
        retry={() => void query.refetch()}
      />
      {query.data && (
        <>
          <div className="weekly-day-grid">
            {query.data.daily.map(row => (
              <DailyRecordCard compact key={row.id || row.date} record={row} />
            ))}
          </div>
          {!!query.data.papers.length && (
            <section className="space-y-3">
              <h3 className="font-semibold">
                {c("本周测试与练习", "Tests & practices this week")}
              </h3>
              <div className="weekly-day-grid">
                {query.data.papers.map(paper => {
                  const score = scoreDisplay(paper);
                  return (
                    <article className="practice-source" key={paper.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="subject-chip">
                          {paper.subjectName || c("试卷", "Paper")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {paper.date}
                        </span>
                      </div>
                      <h4>
                        {paper.typeName} · {paper.schoolName}
                      </h4>
                      <p>{paper.description}</p>
                      {score.score !== null && (
                        <p className="font-semibold">
                          {score.score} / {score.total ?? "—"}{" "}
                          {score.percentage !== null &&
                            `· ${score.percentage}%`}
                        </p>
                      )}
                      <div className="feedback-note">
                        <strong>{c("优点", "Strengths")}</strong>
                        <p>{paper.strengths || "—"}</p>
                      </div>
                      <div className="feedback-note">
                        <strong>{c("下一步", "Next steps")}</strong>
                        <p>{paper.improvements || "—"}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}

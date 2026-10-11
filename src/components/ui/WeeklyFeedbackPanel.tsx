import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { useSeenMarker } from "@/storage/seen";
import { queryKeys } from "@/app/queryKeys";
import { requestJson } from "@/services/http";
import { AsyncState } from "@/components/shared/AsyncState";
import { HistoryControls } from "@/components/shared/HistorySlice";
import { useHistorySlice } from "@/features/progress/useHistorySlice";
import { WeeklyRecord } from "@/features/weekly/contracts";
import { WeeklySources } from "@/features/weekly/WeeklySources";
import { Button } from "./button";
export default function WeeklyFeedbackPanel({
  studentId = "",
  weekStarting,
  onEntryClick
}: {
  studentId?: string;
  weekStarting?: string;
  onEntryClick?: (row: WeeklyRecord) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const c = useWebCopy();
  const query = useQuery({
    queryKey: queryKeys.student(
      user,
      studentId,
      "weekly-history",
      weekStarting || ""
    ),
    enabled: !!studentId,
    queryFn: async ({ signal }) => {
      if (weekStarting) {
        const row = await requestJson<WeeklyRecord | null>(
          `feedback/one?studentId=${encodeURIComponent(
            studentId
          )}&weekStarting=${encodeURIComponent(weekStarting)}`,
          { signal }
        );
        return row ? [row] : [];
      }
      return requestJson<WeeklyRecord[]>(
        `feedback/list?studentId=${encodeURIComponent(studentId)}`,
        { signal }
      );
    }
  });
  const history = useHistorySlice(
    query.data || [],
    row => row.weekStarting,
    "weeklyfeedback"
  );
  useSeenMarker(user, studentId, "weekly", query.data || [], query.isSuccess);
  return (
    <div className="space-y-5">
      <AsyncState
        pending={query.isPending}
        error={query.error}
        empty={query.isSuccess && !query.data.length}
        retry={() => void query.refetch()}
      />
      {!!query.data?.length && (
        <>
          {!weekStarting && <HistoryControls state={history} />}
          {history.rows.map(row => (
            <article
              className="web-card weekly-record"
              key={row.id || row.weekStarting}
            >
              <header className="section-heading">
                <div>
                  <p className="web-eyebrow">
                    {c("每周学习回顾", "WEEKLY LEARNING REVIEW")}
                  </p>
                  <h2>
                    {row.weekStarting} — {row.weekEnding}
                  </h2>
                  {user.role !== "parent" && (
                    <span className="record-badge">
                      {row.visibleToParent
                        ? c("家长可见", "Published")
                        : c("待审核", "Awaiting review")}
                    </span>
                  )}
                </div>
                {onEntryClick && (
                  <Button variant="outline" onClick={() => onEntryClick(row)}>
                    {c("打开这一周", "Open week")}
                  </Button>
                )}
              </header>
              {weekStarting && (
                <WeeklySources studentId={studentId} start={row.weekStarting} />
              )}
              <p
                className={`whitespace-pre-wrap leading-relaxed ${
                  weekStarting ? "" : "line-clamp-5"
                }`}
              >
                {row.summary || c("暂无总结", "No summary yet")}
              </p>
              <div className="web-grid">
                {[
                  { title: c("优点", "Strengths"), rows: row.strengths },
                  {
                    title: c("改进方向", "Next steps"),
                    rows: row.areasToImprove
                  }
                ]
                  .filter(item => item.rows?.length)
                  .map(item => (
                    <section className="feedback-note" key={item.title}>
                      <h3>{item.title}</h3>
                      <ul className="list-disc pl-5 space-y-1">
                        {item.rows.map((value, index) => (
                          <li key={index}>{value}</li>
                        ))}
                      </ul>
                    </section>
                  ))}
              </div>
              {row.teacherNotes && (
                <p className="whitespace-pre-wrap">{row.teacherNotes}</p>
              )}
              {row.nextWeekFocus && (
                <section className="feedback-note">
                  <h3>{c("下周重点", "Next week’s focus")}</h3>
                  <p className="whitespace-pre-wrap">{row.nextWeekFocus}</p>
                </section>
              )}
              {!weekStarting && (
                <details
                  className="record-details"
                  open={!!expanded[row.weekStarting]}
                  onToggle={event => {
                    const open = event.currentTarget.open;
                    setExpanded(current =>
                      current[row.weekStarting] === open
                        ? current
                        : { ...current, [row.weekStarting]: open }
                    );
                  }}
                >
                  <summary>
                    {c(
                      "展开完整反馈与每日记录",
                      "Full feedback & daily records"
                    )}
                  </summary>
                  {expanded[row.weekStarting] && (
                    <div className="space-y-5">
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {row.summary}
                      </p>
                      <WeeklySources
                        studentId={studentId}
                        start={row.weekStarting}
                      />
                    </div>
                  )}
                </details>
              )}
            </article>
          ))}
        </>
      )}
    </div>
  );
}

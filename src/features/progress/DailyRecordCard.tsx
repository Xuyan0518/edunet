import {
  CalendarDays,
  ChevronDown,
  Clock,
  ArrowUpRight,
  BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWebCopy } from "@/i18n/web";
import { useI18n } from "@/context/I18nContext";
import { readActivity } from "@/domain/activityAdapters";
import { ActivityReadView } from "./ActivityReadView";
import { DailyRecord } from "./dailySave";
export function DailyRecordCard({
  record,
  compact = false,
  onOpen
}: {
  record: DailyRecord;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const c = useWebCopy();
  const { language } = useI18n();
  const activities = record.activities || [];
  const date = new Date(`${record.date.slice(0, 10)}T12:00:00`);
  const valid = !Number.isNaN(date.getTime());
  const labels = {
    present: c("出席", "Present"),
    late: c("迟到", "Late"),
    absent: c("缺勤", "Absent")
  };
  return (
    <article
      className={`daily-record ${compact ? "daily-record-compact" : ""}`}
    >
      <header className="daily-record-heading">
        <div className="daily-date-tile" aria-hidden="true">
          <span>
            {valid
              ? date.toLocaleDateString(language, { month: "short" })
              : "—"}
          </span>
          <strong>{valid ? date.getDate() : "—"}</strong>
        </div>
        <div className="min-w-0 flex-1">
          <h3>
            {valid
              ? date.toLocaleDateString(language, {
                  weekday: "long",
                  year: "numeric",
                  month: "short",
                  day: "numeric"
                })
              : record.date}
          </h3>
          <div className="daily-meta">
            <span
              className={`record-badge ${
                record.attendance === "absent" ? "record-badge-absent" : ""
              }`}
            >
              {labels[record.attendance] || record.attendance}
            </span>
            {(record.attendanceStart || record.attendanceEnd) && (
              <span>
                <Clock size={13} aria-hidden="true" />
                {record.attendanceStart || "—"}–{record.attendanceEnd || "—"}
              </span>
            )}
            <span>
              <BookOpen size={13} aria-hidden="true" />
              {activities.length}{" "}
              {c(
                "项学习活动",
                activities.length === 1 ? "activity" : "activities"
              )}
            </span>
          </div>
        </div>
        {onOpen && (
          <Button size="sm" variant="outline" onClick={onOpen}>
            {c("打开记录", "Open record")}
            <ArrowUpRight className="ml-1 h-3 w-3" aria-hidden="true" />
          </Button>
        )}
      </header>
      {record.summary && (
        <p className="daily-record-summary">{record.summary}</p>
      )}
      {!!activities.length && (
        <div className="daily-subject-previews">
          {activities.map((activity, index) => {
            const view = readActivity(activity);
            const excerpt =
              view.narratives.find(item =>
                ["taskSummary", "practiceProgress", "description"].includes(
                  item.key
                )
              )?.value || view.legacyEnglishText;
            const taskLabels = view.tasks
              .map(task => task.label)
              .filter(Boolean);
            return (
              <div key={index}>
                <span className="subject-chip">
                  {view.subject || c("学习活动", "Learning activity")}
                </span>
                {excerpt ? (
                  <p>{excerpt}</p>
                ) : taskLabels.length ? (
                  <p>{taskLabels.join(" · ")}</p>
                ) : (
                  <p className="text-muted-foreground">
                    {view.english
                      ? c(
                          "英文技能练习 · 展开查看详情",
                          "English skills practice · expand for details"
                        )
                      : c("展开查看学习详情", "Expand for learning details")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {(!!activities.length || (compact && !!record.summary)) && (
        <details className="record-details">
          <summary>
            <CalendarDays size={15} aria-hidden="true" />
            {c("学习详情与评语", "Activities & teacher feedback")}
            <ChevronDown size={15} className="ml-auto" aria-hidden="true" />
          </summary>
          <div className="space-y-3">
            {compact && record.summary && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {record.summary}
              </p>
            )}
            {activities.map((activity, index) => (
              <ActivityReadView key={index} activity={activity} />
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { can } from "@/app/permissions";
import { businessToday } from "@/domain/businessDates";
import { StudentWorkspace } from "@/components/layout/StudentWorkspace";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { Button } from "@/components/ui/button";
import DailyProgressPanel from "@/components/ui/DailyProgressPanel";
import WeeklyFeedbackPanel from "@/components/ui/WeeklyFeedbackPanel";
import DailyEditor from "./DailyEditor";
import WeeklyEditor from "@/features/weekly/WeeklyEditor";
import Students from "@/pages/Students";
export default function StudentJournalPage({
  weekly = false
}: {
  weekly?: boolean;
}) {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const c = useWebCopy();
  const [dirty, setDirty] = useState(false);
  const [destination, setDestination] = useState<URLSearchParams>();
  const studentId = id || params.get("student") || "";
  const author = can(user, "author", studentId);
  const section = weekly ? "weekly-feedback" : "daily-progress";
  const dateKey = weekly ? "weekStarting" : "date";
  const form =
    author &&
    (params.get("tab") === "form" || (!id && params.get("tab") !== "view"));
  const selected = params.get(dateKey) || "";
  function change(next: URLSearchParams) {
    if (dirty) setDestination(next);
    else setParams(next);
  }
  function showHistory() {
    const next = new URLSearchParams(params);
    next.set("tab", "view");
    next.delete(dateKey);
    change(next);
  }
  function open(date: string) {
    const next = new URLSearchParams(params);
    next.set("tab", "form");
    next.set(dateKey, date);
    change(next);
  }
  if (!studentId) return <Students />;
  return (
    <div className="web-page space-y-6">
      <StudentWorkspace
        studentId={studentId}
        section={section}
        locked={dirty}
        actions={
          author && !form ? (
            <Button onClick={() => open(businessToday())}>
              {weekly
                ? c("新增每周反馈", "New weekly feedback")
                : c("新增每日记录", "New daily record")}
            </Button>
          ) : (
            undefined
          )
        }
      />
      <div className="section-heading">
        <div>
          <h2>
            {weekly
              ? c("每周反馈", "Weekly feedback")
              : c("每日学习记录", "Daily learning journal")}
          </h2>
          <p>
            {weekly
              ? c(
                  "先回顾每日学习，再整理本周总结。",
                  "Review each day’s learning, then bring the week together."
                )
              : c(
                  "查看每天学了什么、出勤情况和教师建议。",
                  "Follow each day’s learning, attendance and teacher feedback."
                )}
          </p>
        </div>
        <div className="flex gap-2">
          {(form || selected) && (
            <Button variant="outline" onClick={showHistory}>
              {c("全部记录", "All records")}
            </Button>
          )}
        </div>
      </div>
      {form ? (
        weekly ? (
          <WeeklyEditor
            key={`${studentId}:${selected}`}
            onDirtyChange={setDirty}
          />
        ) : (
          <DailyEditor
            key={`${studentId}:${selected}`}
            onDirtyChange={setDirty}
          />
        )
      ) : weekly ? (
        <WeeklyFeedbackPanel
          studentId={studentId}
          weekStarting={selected || undefined}
          onEntryClick={
            author || !selected ? row => open(row.weekStarting) : undefined
          }
        />
      ) : (
        <DailyProgressPanel
          studentId={studentId}
          date={selected || undefined}
          onEntryClick={author || !selected ? row => open(row.date) : undefined}
        />
      )}
      <ConfirmAction
        open={!!destination}
        title={c("离开未保存内容？", "Leave unsaved changes?")}
        description={c(
          "先保存当前记录，或确认放弃这些修改。",
          "Save the current record first, or discard these changes to continue."
        )}
        pending={false}
        onClose={() => setDestination(undefined)}
        onConfirm={() => {
          setDirty(false);
          setParams(destination!);
          setDestination(undefined);
        }}
      />
    </div>
  );
}

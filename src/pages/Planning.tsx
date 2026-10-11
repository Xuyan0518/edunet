import { StudentWorkspace } from "@/components/layout/StudentWorkspace";
import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { requestJson, ApiError } from "@/services/http";
import { businessToday, isBusinessDate } from "@/domain/businessDates";
import {
  Cycle,
  GradePlan,
  StudentPlan,
  planBody,
  recordBody,
  planStatus
} from "@/features/planning/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AsyncState } from "@/components/shared/AsyncState";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
function Editor({
  cycle,
  plans = [],
  student,
  reload,
  onDirtyChange
}: {
  cycle: Cycle;
  plans?: GradePlan[];
  student?: StudentPlan;
  reload: () => Promise<void>;
  onDirtyChange: (value: boolean) => void;
}) {
  const { user } = useAuth();
  const c = useWebCopy();
  const cache = useQueryClient();
  const [grade, setGrade] = useState(
    student?.student.grade || plans[0]?.grade || "P1"
  );
  const [topic, setTopic] = useState(plans[0]?.topic || "");
  const [notes, setNotes] = useState(plans[0]?.notes || "");
  const [score, setScore] = useState(
    student?.record?.score == null ? "" : String(student.record.score)
  );
  const [completed, setCompleted] = useState(
    student?.record?.completed || false
  );
  const [comment, setComment] = useState(student?.record?.comment || "");
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState("");
  const [replaceGrade, setReplaceGrade] = useState("");
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    onDirtyChange(changed || pending);
    return () => onDirtyChange(false);
  }, [changed, pending, onDirtyChange]);
  async function reconcile() {
    setPending(true);
    setMessage("");
    try {
      if (student) {
        const fresh = await requestJson<StudentPlan>(
          `students/${encodeURIComponent(
            student.student.id
          )}/weekly-plan-record?weekStarting=${cycle.startDate}`
        );
        const expected = recordBody(student, score, completed, comment);
        if (
          !fresh.record ||
          fresh.plan?.id !== student.plan.id ||
          fresh.record.score !== expected.score ||
          fresh.record.completed !== expected.completed ||
          (fresh.record.comment || "") !== expected.comment
        )
          throw new Error("Saved record could not be confirmed");
      } else {
        const fresh = await requestJson<{ plans: GradePlan[] }>(
          `grade-weekly-plans?weekStarting=${cycle.startDate}`
        );
        const expected = planBody(grade, topic, notes, cycle);
        const plan = fresh.plans.find(row => row.grade === grade);
        if (
          !plan ||
          plan.topic !== expected.topic ||
          (plan.notes || "") !== expected.notes
        )
          throw new Error("Saved plan could not be confirmed");
      }
      setUnknown(false);
      setChanged(false);
      await reload();
      setMessage(c("已读取并确认保存。", "Reread confirms the save."));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Read failed");
    } finally {
      setPending(false);
    }
  }
  const selectGrade = (next: string) => {
    const plan = plans.find(row => row.grade === next);
    setGrade(next);
    setTopic(plan?.topic || "");
    setNotes(plan?.notes || "");
    setChanged(false);
    setReplaceGrade("");
  };
  async function save() {
    if (pending || unknown) return;
    setPending(true);
    setMessage("");
    let sent = false;
    try {
      const body = student
        ? recordBody(student, score, completed, comment)
        : planBody(grade, topic, notes, cycle);
      sent = true;
      await requestJson(
        student ? "student-weekly-plan-records" : "grade-weekly-plans",
        { method: "POST", body }
      );
      if (student) {
        const fresh = await requestJson<StudentPlan>(
          `students/${encodeURIComponent(
            student.student.id
          )}/weekly-plan-record?weekStarting=${cycle.startDate}`
        );
        const expected = recordBody(student, score, completed, comment);
        if (
          !fresh.record ||
          fresh.plan?.id !== student.plan.id ||
          fresh.record.score !== expected.score ||
          fresh.record.completed !== expected.completed ||
          (fresh.record.comment || "") !== expected.comment
        )
          throw new Error("Saved record could not be confirmed");
      } else {
        const fresh = await requestJson<{ plans: GradePlan[] }>(
          `grade-weekly-plans?weekStarting=${cycle.startDate}`
        );
        const expected = planBody(grade, topic, notes, cycle);
        const plan = fresh.plans.find(row => row.grade === grade);
        if (
          !plan ||
          plan.topic !== expected.topic ||
          (plan.notes || "") !== expected.notes
        )
          throw new Error("Saved plan could not be confirmed");
      }
      setChanged(false);
      await cache.invalidateQueries({ queryKey: sessionKey(user) });
      setMessage(c("已保存并重新读取。", "Saved and reread."));
    } catch (err) {
      setUnknown(sent && (!(err instanceof ApiError) || err.status >= 500));
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }
  if (student && !student.plan)
    return (
      <div className="web-card">
        <p>
          {c(
            "当前年级在此周期尚无计划，不能填写完成记录。",
            "There is no plan for this grade and cycle. A completion record cannot be added yet."
          )}
        </p>
        {!user.isReviewer && (
          <Link to={`/planning/grades?weekStarting=${cycle.startDate}`}>
            {c("设置年级计划", "Set grade plan")}
          </Link>
        )}
      </div>
    );
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        void save();
      }}
      className="web-card space-y-4"
    >
      <p>
        {c(
          "保存会更新此周期的现有记录。",
          "Saving updates the existing record for this study cycle."
        )}
      </p>
      <fieldset disabled={pending || unknown} className="space-y-4">
        {student ? (
          <>
            <h2>{student.plan.topic}</h2>
            <p className="whitespace-pre-wrap">{student.plan.notes}</p>
            <label className="web-field">
              {c("得分（可留空）", "Score (optional)")}
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={score}
                onChange={event => {
                  setScore(event.target.value);
                  setChanged(true);
                }}
              />
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={completed}
                onChange={event => {
                  setCompleted(event.target.checked);
                  setChanged(true);
                }}
              />
              {c(
                "已完成（需要得分，0 分有效）",
                "Completed (requires a score; zero is valid)"
              )}
            </label>
            <label className="web-field">
              {c("评语", "Comment")}
              <Textarea
                maxLength={2000}
                value={comment}
                onChange={event => {
                  setComment(event.target.value);
                  setChanged(true);
                }}
              />
            </label>
          </>
        ) : (
          <>
            <label className="web-field">
              {c("年级", "Grade")}
              <Input
                maxLength={20}
                list="plan-grades"
                value={grade}
                onChange={event => {
                  setGrade(event.target.value);
                  setChanged(true);
                }}
              />
              <datalist id="plan-grades">
                {[
                  ...new Set([
                    "P1",
                    "P2",
                    "P3",
                    "P4",
                    "P5",
                    "P6",
                    "S1",
                    "S2",
                    "S3",
                    "S4",
                    ...plans.map(row => row.grade)
                  ])
                ].map(value => (
                  <option key={value}>{value}</option>
                ))}
              </datalist>
            </label>
            <label className="web-field">
              {c("学习主题", "Topic")}
              <Textarea
                required
                maxLength={500}
                value={topic}
                onChange={event => {
                  setTopic(event.target.value);
                  setChanged(true);
                }}
              />
            </label>
            <label className="web-field">
              {c("备注", "Notes")}
              <Textarea
                maxLength={2000}
                value={notes}
                onChange={event => {
                  setNotes(event.target.value);
                  setChanged(true);
                }}
              />
            </label>
          </>
        )}
        <Button>{pending ? c("保存中…", "Saving…") : c("保存", "Save")}</Button>
      </fieldset>
      {message && <p role="status">{message}</p>}
      {unknown && (
        <p>
          {c(
            "结果未确认。请保留当前输入并重新读取核对，勿重复提交。",
            "Outcome unconfirmed. Keep your input and reread before resubmitting."
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void reconcile()}
          >
            {c("重新读取", "Reread")}
          </Button>
        </p>
      )}
      {!student && (
        <section className="space-y-3">
          <h2>{c("此周期已有计划", "Plans in this cycle")}</h2>
          {plans.map(plan => (
            <article key={plan.id} className="rounded border p-3">
              <h3>
                {plan.grade} · {plan.topic}
              </h3>
              <p className="whitespace-pre-wrap">{plan.notes}</p>
              <Button
                type="button"
                variant="outline"
                disabled={pending || unknown}
                onClick={() =>
                  changed
                    ? setReplaceGrade(plan.grade)
                    : selectGrade(plan.grade)
                }
              >
                {c("载入此计划", "Load this plan")}
              </Button>
            </article>
          ))}
        </section>
      )}
      <ConfirmAction
        open={!!replaceGrade}
        title={c("替换未保存输入？", "Replace unsaved input?")}
        description={c(
          "载入所选年级的已存计划。",
          "Load the selected grade’s saved plan."
        )}
        pending={pending}
        onClose={() => setReplaceGrade("")}
        onConfirm={() => selectGrade(replaceGrade)}
      />
    </form>
  );
}
export default function Planning({
  studentScope = false
}: {
  studentScope?: boolean;
}) {
  const { id } = useParams();
  const { user } = useAuth();
  const c = useWebCopy();
  const [params, setParams] = useSearchParams();
  const date = params.get("weekStarting") || businessToday();
  const valid = isBusinessDate(date);
  const endpoint = studentScope
    ? `students/${encodeURIComponent(
        id
      )}/weekly-plan-record?weekStarting=${date}`
    : `grade-weekly-plans?weekStarting=${date}`;
  const query = useQuery({
    queryKey: queryKeys.resource(user, endpoint),
    enabled: valid,
    queryFn: ({ signal }) =>
      requestJson<StudentPlan & { plans: GradePlan[] }>(endpoint, { signal })
  });
  const data = query.data;
  const [dirty, setDirty] = useState(false);
  const [nextDate, setNextDate] = useState("");
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  const statusLabels: Record<string, string> = {
    "no-plan": c("暂无计划", "No plan"),
    "no-record": c("暂无记录", "No record"),
    completed: c("已完成", "Completed"),
    scored: c("有分数，未勾选完成", "Scored, not completed"),
    incomplete: c("未完成", "Incomplete")
  };
  function changeDate(value: string) {
    const next = new URLSearchParams(params);
    next.set("weekStarting", value);
    setParams(next);
    setNextDate("");
  }

  return (
    <div className="web-page space-y-5">
      {!studentScope && <h1>{c("年级学习计划", "Grade learning plans")}</h1>}
      {studentScope && (
        <fieldset disabled={dirty}>
          <StudentWorkspace
            studentId={id}
            section="weekly-plan"
            locked={dirty}
          />
        </fieldset>
      )}
      <label className="web-field max-w-sm">
        {c("周期内日期", "Date within the cycle")}
        <Input
          type="date"
          value={date}
          min="2000-01-01"
          max="2100-12-31"
          onChange={event => {
            if (dirty) setNextDate(event.target.value);
            else changeDate(event.target.value);
          }}
        />
      </label>
      {!valid ? (
        <p role="alert">{c("日期无效", "Invalid date")}</p>
      ) : (
        <AsyncState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}{" "}
      <ConfirmAction
        open={!!nextDate}
        title={c("离开未保存内容？", "Leave unsaved changes?")}
        description={c(
          "切换周期会丢弃当前输入。",
          "Switching cycles discards the current input."
        )}
        pending={false}
        onClose={() => setNextDate("")}
        onConfirm={() => changeDate(nextDate)}
      />
      {data && (
        <>
          <h2>
            {studentScope ? data.student.name + " · " : ""}
            {data.cycle.startDate} — {data.cycle.endDate}
          </h2>
          <p>
            {c(
              "使用学校设置的学习周期。",
              "Uses the school’s configured study cycle."
            )}
          </p>
          {studentScope && (
            <p>
              {c("状态", "Status")}:{" "}
              {statusLabels[planStatus(data.plan, data.record)]}
            </p>
          )}
          <Editor
            key={`${id || "grade"}:${date}`}
            onDirtyChange={setDirty}
            cycle={data.cycle}
            plans={data.plans}
            student={studentScope ? data : undefined}
            reload={async () => {
              await query.refetch();
            }}
          />
        </>
      )}
    </div>
  );
}

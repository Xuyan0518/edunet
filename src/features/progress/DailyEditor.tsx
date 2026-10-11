import { StudentSubjectSelect } from "@/components/shared/StudentSubjectSelect";
import {
  loadStudentSubjects,
  StudentSubject,
  isEnglishSubject,
  validSubjectSelection
} from "@/services/studentSubjects";
import { DailyRecordCard } from "./DailyRecordCard";
import { routerPath } from "@/app/navigation";
import SubjectTopicsPanel from "@/components/ui/SubjectTopicsPanel";
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { can } from "@/app/permissions";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { requestJson, ApiError } from "@/services/http";
import { studentsApi } from "@/services/studentsApi";
import { businessToday, isBusinessDate } from "@/domain/businessDates";
import { studyAttendanceDefaults } from "@/domain/studyDefaults";
import { record, text, readActivity } from "@/domain/activityAdapters";
import { TaskSettings, StudySettings } from "@/features/settings/contracts";
import {
  Paper,
  DictionaryRow,
  paperPayload
} from "@/features/assessments/contracts";
import { PaperFields } from "@/features/assessments/PaperFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AsyncState } from "@/components/shared/AsyncState";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { ActivityReadView } from "./ActivityReadView";
import { EnglishActivityEditor, LossCatalog } from "./EnglishActivityEditor";
import { initializeEnglish, validateEnglish } from "./englishActivity";
import {
  DailyDraft,
  dailyDraftKey,
  readDailyDraft,
  writeDailyDraft
} from "@/storage/dailyDrafts";
import {
  loadDailyRecord,
  DailyRecord,
  DailyForm,
  SaveStage,
  saveDailyStage,
  savePaperStage,
  reconcileDaily,
  reconcilePapers,
  newestPaperVersion,
  dailyBody
} from "./dailySave";

type Loaded = {
  daily: DailyRecord | null;
  papers: Paper[];
  tasks: TaskSettings;
  study: StudySettings;
  types: DictionaryRow[];
  schools: DictionaryRow[];
  subjects: StudentSubject[];
  loss: LossCatalog;
  student: { id: string; name: string };
};
type RecoveryDraft = DailyForm & { stage: SaveStage; originalPapers: Paper[] };
const genericActivity = () => ({
  subject: "",
  type: "generic",
  taskSummary: "",
  strengths: "",
  improvements: "",
  definitionRecitation: "",
  comment: ""
});
function Form({
  loaded,
  date,
  studentId,
  reloadCatalog,
  onDirtyChange
}: {
  loaded: Loaded;
  date: string;
  studentId: string;
  reloadCatalog: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { user } = useAuth();
  const c = useWebCopy();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const teacher = can(user, "strictTeacher", studentId);
  const author = can(user, "author", studentId);
  const initial: DailyForm = {
    daily: loaded.daily
      ? {
          ...structuredClone(loaded.daily),
          summary: loaded.daily.summary || "",
          activities: loaded.daily.activities.map(activity =>
            readActivity(activity).english
              ? initializeEnglish(activity, [])
              : structuredClone(activity)
          )
        }
      : {
          studentId,
          date,
          attendance: "present",
          ...studyAttendanceDefaults(date, loaded.study),
          summary: "",
          activities: loaded.subjects.some(
            subject => !isEnglishSubject(subject)
          )
            ? [genericActivity()]
            : loaded.subjects
                .filter(isEnglishSubject)
                .slice(0, 1)
                .map(subject =>
                  initializeEnglish(
                    {
                      subject: subject.name,
                      subjectName: subject.name,
                      subjectId: subject.id
                    },
                    loaded.tasks.tasks
                  )
                )
        },
    papers: structuredClone(loaded.papers)
  };
  const [form, setForm] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [originalPapers, setOriginalPapers] = useState(loaded.papers);
  const [editing, setEditing] = useState(!loaded.daily && author);
  const [stage, setStage] = useState<SaveStage>({ kind: "idle" });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<DailyDraft<RecoveryDraft> | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [navigateTo, setNavigateTo] = useState("");
  const key = dailyDraftKey(user, studentId, date);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const locked = pending || stage.kind !== "idle";
  useEffect(() => {
    try {
      setDraft(
        readDailyDraft<RecoveryDraft>(localStorage, key, studentId, date)
      );
    } catch {
      setMessage(
        c(
          "本地草稿无法读取。可继续查看服务器记录。",
          "The local draft could not be read. Server records remain available."
        )
      );
    }
  }, [key, studentId, date, c]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("beforeunload", leave);
      onDirtyChange?.(false);
    };
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest?.("a");
      if (!anchor || anchor.target === "_blank") return;
      const url = new URL(anchor.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname + url.search ===
          window.location.pathname + window.location.search ||
        url.hash
      )
        return;
      event.preventDefault();
      setNavigateTo(routerPath(url.pathname + url.search));
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [dirty]);
  function setDaily(patch: Partial<DailyRecord>) {
    setForm({ ...form, daily: { ...form.daily, ...patch } });
  }
  function saveDraft() {
    try {
      const saved = writeDailyDraft(localStorage, key, {
        studentId,
        date,
        serverVersion: form.daily.updatedAt || null,
        paperVersion: newestPaperVersion(originalPapers),
        form: { ...form, stage, originalPapers }
      });
      setDraft(saved);
      setMessage(c("草稿已保存在此浏览器。", "Draft saved in this browser."));
    } catch {
      setMessage(
        c(
          "无法保存草稿，请检查浏览器存储空间。",
          "Draft could not be saved. Check browser storage."
        )
      );
    }
  }
  function discardDraft() {
    try {
      localStorage.removeItem(key);
      setDraft(null);
      setMessage(c("本地草稿已删除。", "Local draft discarded."));
    } catch {
      setMessage(c("无法删除本地草稿。", "Could not discard the local draft."));
    }
  }
  const staleDraft =
    !!draft &&
    (draft.serverVersion !== (baseline.daily.updatedAt || null) ||
      draft.paperVersion !== newestPaperVersion(loaded.papers));
  function restore() {
    if (!draft) return;
    const restored = structuredClone(draft.form);
    setForm({
      ...restored,
      daily: {
        ...restored.daily,
        id: baseline.daily.id,
        updatedAt: baseline.daily.updatedAt,
        studentId,
        date
      }
    });
    setOriginalPapers(
      staleDraft ? loaded.papers : restored.originalPapers || loaded.papers
    );
    setStage(
      staleDraft ? { kind: "idle" } : restored.stage || { kind: "idle" }
    );
    setEditing(true);
    setRestoreOpen(false);
    setMessage(
      c(
        "已恢复为未保存内容。保存前请检查全部字段。",
        "Restored as unsaved content. Review all fields before saving."
      )
    );
  }
  function validate() {
    const errors: string[] = [];
    if (!isBusinessDate(date)) errors.push(c("日期无效", "Invalid date"));
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.daily.attendanceStart || "") ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.daily.attendanceEnd || "")
    )
      errors.push(
        c(
          "到达和离开时间必填，包括缺勤记录。",
          "Arrival and departure times are required, including absent days."
        )
      );
    if ((form.daily.summary || "").length > 5000)
      errors.push(
        c("总结最多 5000 字", "Summary is limited to 5000 characters")
      );
    if (!form.daily.activities.length || form.daily.activities.length > 40)
      errors.push(c("需要 1–40 个学习活动", "Use 1–40 activities"));
    for (const activity of form.daily.activities) {
      if (
        !validSubjectSelection(
          activity,
          loaded.subjects,
          baseline.daily.activities
        )
      )
        errors.push(
          c(
            "请选择学生已关联的科目",
            "Choose a subject assigned to this student"
          )
        );
      if (
        !text(
          activity.subjectName ||
            activity.subject ||
            activity.subjectDisplayName
        ).trim()
      )
        errors.push(c("科目名称必填", "Subject name is required"));
      if (readActivity(activity).english) {
        if (teacher) errors.push(...validateEnglish(activity));
      } else {
        if (
          !text(
            activity.taskSummary ||
              activity.practiceProgress ||
              activity.description
          ).trim() ||
          !text(activity.strengths).trim() ||
          !text(activity.improvements).trim()
        )
          errors.push(
            c(
              "学习内容、优点和改进方向必填",
              "Task summary, strengths and improvements are required"
            )
          );
        for (const field of [
          "taskSummary",
          "strengths",
          "improvements",
          "practiceProgress",
          "definitionRecitation",
          "comment"
        ])
          if (text(activity[field]).length > 1000)
            errors.push(
              `${field}: ${c("最多 1000 字", "maximum 1000 characters")}`
            );
      }
    }
    if (teacher) {
      if (form.papers.length > 60)
        errors.push(c("最多 60 份试卷", "At most 60 papers"));
      for (const paper of form.papers) {
        try {
          if (!validSubjectSelection(paper, loaded.subjects, originalPapers))
            throw new Error(
              c(
                "试卷必须选择学生已关联的科目",
                "Choose an assigned subject for each paper"
              )
            );
          paperPayload({ ...paper, id: undefined, date });
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Invalid paper");
        }
      }
    }
    return errors;
  }
  async function finish(daily: DailyRecord) {
    const fresh = await reconcileDaily({
      ...form,
      daily: { ...form.daily, id: daily.id, updatedAt: daily.updatedAt }
    });
    if (!fresh.matches || !fresh.row || fresh.row.id !== daily.id)
      throw new Error("Daily record could not be reread");
    let papers = originalPapers;
    if (teacher) {
      const result = await reconcilePapers(
        studentId,
        date,
        form.papers,
        originalPapers
      );
      if (!result.matches)
        throw new Error("Saved paper set could not be confirmed");
      papers = result.rows;
    }
    const next = { daily: fresh.row, papers };
    setForm(next);
    setBaseline(next);
    setOriginalPapers(papers);
    setStage({ kind: "idle" });
    setEditing(false);
    let draftCleared = true;
    try {
      localStorage.removeItem(key);
      setDraft(null);
    } catch {
      draftCleared = false;
    }
    await cache.invalidateQueries({ queryKey: sessionKey(user) });
    setMessage(
      !draftCleared
        ? c(
            "记录已保存，但本地草稿未能清除。",
            "Records saved, but the local draft could not be cleared."
          )
        : teacher
        ? c(
            "每日记录和当天全部试卷已保存并重新读取。",
            "Daily record and the complete day’s paper set saved and reread."
          )
        : c(
            "每日记录已保存；试卷未作更改。",
            "Daily record saved; papers are unchanged."
          )
    );
  }
  async function save() {
    if (pending || stage.kind !== "idle") return;
    const errors = validate();
    if (errors.length) {
      setMessage(errors.join("\n"));
      return;
    }
    setPending(true);
    setMessage("");
    let saved: DailyRecord | undefined;
    try {
      saved = await saveDailyStage(form, setStage);
      setForm(current => ({
        ...current,
        daily: { ...current.daily, id: saved.id, updatedAt: saved.updatedAt }
      }));
      if (teacher)
        await savePaperStage(
          studentId,
          date,
          form.papers,
          newestPaperVersion(originalPapers),
          saved,
          setStage
        );
      await finish(saved);
    } catch (error) {
      if (saved && !(error && typeof error === "object" && "stage" in error))
        setStage({
          kind: "outcomeUnknown",
          part: teacher ? "papers" : "daily",
          daily: saved
        });
      setMessage(
        error instanceof Error
          ? error.message
          : c("保存未完成。", "Save incomplete.")
      );
    } finally {
      setPending(false);
    }
  }
  async function reconcile() {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const current = await reconcileDaily(form);
      if (!current.matches || !current.row) {
        setMessage(
          c(
            "服务器每日记录与当前输入不同。请保存本地草稿，再重新加载并比较。",
            "The server’s daily record differs from your input. Save a local draft, then reload and compare."
          )
        );
        return;
      }
      setForm(currentForm => ({
        ...currentForm,
        daily: {
          ...currentForm.daily,
          id: current.row.id,
          updatedAt: current.row.updatedAt
        }
      }));
      if (!teacher) {
        await finish(current.row);
        return;
      }
      const papers = await reconcilePapers(
        studentId,
        date,
        form.papers,
        originalPapers
      );
      if (papers.matches) {
        await finish(current.row);
        return;
      }
      if (papers.unchanged) {
        setStage({ kind: "dailySavedPaperPending", daily: current.row });
        setMessage(
          c(
            "每日记录已确认保存；试卷仍为原版本。可仅重试试卷步骤。",
            "Daily save confirmed. Papers are unchanged; retry only the paper step."
          )
        );
      } else {
        setStage({
          kind: "outcomeUnknown",
          part: "papers",
          daily: current.row
        });
        setMessage(
          c(
            "当天试卷已变化，不能用旧列表覆盖。请保存草稿后重新加载比较。",
            "The day’s papers changed. Do not replace them with the old set. Save a draft and reload to compare."
          )
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Reconciliation failed"
      );
    } finally {
      setPending(false);
    }
  }
  async function retryPapers() {
    if (stage.kind !== "dailySavedPaperPending" || pending) return;
    setPending(true);
    setMessage("");
    try {
      const current = await reconcilePapers(
        studentId,
        date,
        form.papers,
        originalPapers
      );
      if (current.matches) {
        await finish(stage.daily);
        return;
      }
      if (!current.unchanged) {
        setStage({
          kind: "outcomeUnknown",
          part: "papers",
          daily: stage.daily
        });
        throw new Error(
          c(
            "试卷版本已变化，请先核对。",
            "Paper version changed; reconcile first."
          )
        );
      }
      await savePaperStage(
        studentId,
        date,
        form.papers,
        newestPaperVersion(current.rows),
        stage.daily,
        setStage
      );
      await finish(stage.daily);
    } catch (error) {
      if (!(error && typeof error === "object" && "stage" in error))
        setStage({
          kind: "outcomeUnknown",
          part: "papers",
          daily: stage.daily
        });
      setMessage(
        error instanceof Error ? error.message : "Paper save incomplete"
      );
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (!form.daily.id || pending) return;
    setPending(true);
    try {
      await requestJson(`progress/${encodeURIComponent(form.daily.id)}`, {
        method: "DELETE",
        body: { updatedAt: form.daily.updatedAt }
      });
      const row = await loadDailyRecord(studentId, date);
      if (row) throw new Error("Deletion not confirmed");
      setDeleteOpen(false);
      await cache.invalidateQueries({ queryKey: sessionKey(user) });
      navigate(
        `/daily-progress?student=${encodeURIComponent(studentId)}&tab=view`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete incomplete");
    } finally {
      setPending(false);
    }
  }
  const changeActivity = (index: number, value: Record<string, unknown>) =>
    setDaily({
      activities: form.daily.activities.map((activity, i) =>
        i === index ? value : activity
      )
    });
  return (
    <div className="space-y-5">
      <div className="web-heading">
        <div>
          <h2>
            {c("每日记录", "Daily record")} · {date}
          </h2>
          <p>
            {c(
              "记录当天出勤、学习内容和下一步建议。",
              "Capture attendance, learning activities and next steps for this day."
            )}
          </p>
        </div>
        <Input
          aria-label={c("选择日期", "Select date")}
          type="date"
          value={date}
          disabled={pending}
          min="2000-01-01"
          max="2100-12-31"
          onChange={event => {
            const path = `/students/${encodeURIComponent(
              studentId
            )}/daily-progress?tab=form&date=${event.target.value}`;
            if (dirty) setNavigateTo(path);
            else navigate(path);
          }}
        />
      </div>
      {draft && (
        <div className="web-card space-y-2">
          <p>
            {c("此浏览器有本地草稿", "A local draft exists in this browser")}:{" "}
            {draft.savedAt}
            {staleDraft && c("（服务器已变化）", " (server data changed)")}
          </p>
          <Button
            variant="outline"
            disabled={pending || !author}
            onClick={() => setRestoreOpen(true)}
          >
            {c("查看并恢复草稿", "Review and restore draft")}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={discardDraft}>
            {c("丢弃草稿", "Discard draft")}
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="web-card whitespace-pre-wrap">
          {message}
        </p>
      )}
      {stage.kind !== "idle" && (
        <div className="web-card space-y-3">
          <p>
            {stage.kind === "dailySavedPaperPending"
              ? c(
                  "每日记录已保存；试卷步骤尚未完成。",
                  "Daily record saved; paper step incomplete."
                )
              : c(
                  "保存结果未确认。当前输入已保留。",
                  "Save outcome is unconfirmed. Your input is retained."
                )}
          </p>
          <Button disabled={pending} onClick={() => void reconcile()}>
            {c("读取服务器核对", "Reconcile with server")}
          </Button>
          {stage.kind === "dailySavedPaperPending" && teacher && (
            <Button disabled={pending} onClick={() => void retryPapers()}>
              {c("仅重试试卷步骤", "Retry paper step only")}
            </Button>
          )}
        </div>
      )}
      <form
        onSubmit={event => {
          event.preventDefault();
          void save();
        }}
        className="space-y-5"
      >
        {!editing ? (
          <DailyRecordCard record={form.daily} />
        ) : (
          <fieldset disabled={locked} className="space-y-5">
            <section className="web-card space-y-4">
              <label className="web-field">
                {c("出勤", "Attendance")}
                <select
                  value={form.daily.attendance}
                  onChange={event =>
                    setDaily({
                      attendance: event.target
                        .value as DailyRecord["attendance"]
                    })
                  }
                >
                  {["present", "late", "absent"].map(value => (
                    <option key={value} value={value}>
                      {value === "present"
                        ? c("出席", "Present")
                        : value === "late"
                        ? c("迟到", "Late")
                        : c("缺勤", "Absent")}
                    </option>
                  ))}
                </select>
              </label>
              <div className="web-grid">
                <label className="web-field">
                  {c("到达时间", "Arrival time")}
                  <Input
                    required
                    type="time"
                    value={form.daily.attendanceStart || ""}
                    onChange={event =>
                      setDaily({ attendanceStart: event.target.value })
                    }
                  />
                </label>
                <label className="web-field">
                  {c("离开时间", "Departure time")}
                  <Input
                    required
                    type="time"
                    value={form.daily.attendanceEnd || ""}
                    onChange={event =>
                      setDaily({ attendanceEnd: event.target.value })
                    }
                  />
                </label>
              </div>
              <label className="web-field">
                {c("当日总结", "Daily summary")}
                <Textarea
                  maxLength={5000}
                  value={form.daily.summary || ""}
                  onChange={event => setDaily({ summary: event.target.value })}
                />
              </label>
            </section>
            {form.daily.activities.map((activity, index) => (
              <section key={index} className="web-card space-y-4">
                <StudentSubjectSelect
                  value={activity}
                  subjects={loaded.subjects}
                  onChange={subject => {
                    const fields = {
                      subject: subject.name,
                      subjectName: subject.name,
                      subjectDisplayName: subject.name,
                      subjectId: subject.id
                    };
                    const wasEnglish = !!readActivity(activity).english;
                    changeActivity(
                      index,
                      isEnglishSubject(subject)
                        ? initializeEnglish(
                            { ...(wasEnglish ? activity : {}), ...fields },
                            loaded.tasks.tasks
                          )
                        : {
                            ...(wasEnglish ? genericActivity() : activity),
                            ...fields
                          }
                    );
                  }}
                />
                {readActivity(activity).english ? (
                  teacher ? (
                    <EnglishActivityEditor
                      activity={activity}
                      onChange={value => changeActivity(index, value)}
                      config={loaded.tasks.tasks}
                      loss={loaded.loss}
                    />
                  ) : (
                    <ActivityReadView activity={activity} />
                  )
                ) : (
                  <div className="space-y-3">
                    {[
                      "taskSummary",
                      "strengths",
                      "improvements",
                      "definitionRecitation",
                      "comment"
                    ].map(field => (
                      <label className="web-field" key={field}>
                        {field === "taskSummary"
                          ? c("学习内容", "Task summary")
                          : field === "strengths"
                          ? c("优点", "Strengths")
                          : field === "improvements"
                          ? c("改进方向", "Improvements")
                          : field === "definitionRecitation"
                          ? c("定义背诵", "Definition recitation")
                          : c("评语", "Comment")}
                        <Textarea
                          required={[
                            "taskSummary",
                            "strengths",
                            "improvements"
                          ].includes(field)}
                          maxLength={1000}
                          value={text(
                            activity[field] ||
                              (field === "taskSummary"
                                ? activity.practiceProgress ||
                                  activity.description
                                : "")
                          )}
                          onChange={event =>
                            changeActivity(index, {
                              ...activity,
                              [field]: event.target.value
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
                {Array.isArray(activity.papers) && activity.papers.length > 0 && (
                  <details>
                    <summary>
                      {c(
                        "历史嵌入试卷（单独保留）",
                        "Historical embedded papers (retained separately)"
                      )}
                    </summary>
                    <ActivityReadView
                      activity={{
                        subject: activity.subject,
                        papers: activity.papers
                      }}
                    />
                  </details>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={form.daily.activities.length <= 1}
                  onClick={() =>
                    setDaily({
                      activities: form.daily.activities.filter(
                        (_, i) => i !== index
                      )
                    })
                  }
                >
                  {c("移除活动", "Remove activity")}
                </Button>
              </section>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={
                  form.daily.activities.length >= 40 ||
                  !loaded.subjects.some(subject => !isEnglishSubject(subject))
                }
                onClick={() =>
                  setDaily({
                    activities: [...form.daily.activities, genericActivity()]
                  })
                }
              >
                {c("添加普通科目", "Add subject")}
              </Button>
              {teacher && loaded.subjects.some(isEnglishSubject) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={form.daily.activities.length >= 40}
                  onClick={() =>
                    setDaily({
                      activities: [
                        ...form.daily.activities,
                        initializeEnglish(
                          {
                            subject: loaded.subjects.find(isEnglishSubject)!
                              .name,
                            subjectName: loaded.subjects.find(isEnglishSubject)!
                              .name,
                            subjectId:
                              loaded.subjects.find(isEnglishSubject)?.id || ""
                          },
                          loaded.tasks.tasks
                        )
                      ]
                    })
                  }
                >
                  {c("添加英文活动", "Add English activity")}
                </Button>
              )}
            </div>
            {teacher && (
              <section className="web-card space-y-4">
                <h2>{c("当天全部试卷", "All papers for this day")}</h2>
                <p>
                  {c(
                    "包含独立录入的试卷。保存会替换此日的全部有效试卷；移除条目后不会进入回收站。",
                    "Includes standalone papers. Saving replaces all active papers for this day; removed rows do not enter the bin."
                  )}
                </p>
                {form.papers.map((paper, index) => (
                  <section className="border rounded p-4 space-y-3" key={index}>
                    <PaperFields
                      fixedDate
                      form={paper}
                      onChange={value =>
                        setForm({
                          ...form,
                          papers: form.papers.map((row, i) =>
                            i === index ? { ...value, date } : row
                          )
                        })
                      }
                      types={loaded.types}
                      schools={loaded.schools}
                      subjects={loaded.subjects}
                      onReload={reloadCatalog}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setForm({
                          ...form,
                          papers: form.papers.filter((_, i) => i !== index)
                        })
                      }
                    >
                      {c("从当天试卷中移除", "Remove from this day’s papers")}
                    </Button>
                  </section>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={form.papers.length >= 60}
                  onClick={() =>
                    setForm({
                      ...form,
                      papers: [
                        ...form.papers,
                        {
                          typeId: "",
                          schoolId: "",
                          date,
                          subjectId: null,
                          subjectName: "",
                          description: "",
                          strengths: "",
                          improvements: "",
                          score: null,
                          total: null
                        }
                      ]
                    })
                  }
                >
                  {c("添加试卷", "Add paper")}
                </Button>
              </section>
            )}
          </fieldset>
        )}
        {!editing && !!form.papers.length && (
          <section className="web-card space-y-3">
            <h2>{c("当天测试与练习", "Tests & practices for this day")}</h2>
            {form.papers.map((paper, index) => (
              <div key={paper.id || index} className="feedback-note">
                <strong>
                  {paper.subjectName} · {paper.typeName} {paper.schoolName}
                </strong>
                <p>{paper.description}</p>
                {paper.score !== null && paper.score !== "" && (
                  <p>
                    {paper.score} / {paper.total ?? "—"}
                  </p>
                )}
                <p>
                  {c("优点", "Strengths")}: {paper.strengths}
                </p>
                <p>
                  {c("下一步", "Next steps")}: {paper.improvements}
                </p>
              </div>
            ))}
          </section>
        )}
        <div className="editor-actions flex flex-wrap gap-2">
          {author && !editing && (
            <Button type="button" onClick={() => setEditing(true)}>
              {c("编辑", "Edit")}
            </Button>
          )}
          {editing && author && (
            <>
              <Button disabled={locked}>
                {pending
                  ? c("保存中…", "Saving…")
                  : teacher
                  ? c("保存每日记录和试卷", "Save daily record and papers")
                  : c("仅保存每日记录", "Save daily record only")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={saveDraft}
              >
                {c("保存本地草稿", "Save local draft")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending || stage.kind !== "idle"}
                onClick={() => {
                  setForm(structuredClone(baseline));
                  setEditing(!baseline.daily.id);
                  setMessage("");
                }}
              >
                {c("取消修改", "Cancel changes")}
              </Button>
            </>
          )}
          {author && form.daily.id && (
            <Button
              type="button"
              variant="outline"
              disabled={pending || stage.kind !== "idle"}
              onClick={() => setDeleteOpen(true)}
            >
              {c("删除每日记录", "Delete daily record")}
            </Button>
          )}
        </div>
      </form>
      <details className="web-card">
        <summary>
          {c("章节进度（单独保存）", "Chapter progress (saved separately)")}
        </summary>
        <SubjectTopicsPanel
          studentId={studentId}
          readOnly={!teacher || pending}
        />
      </details>
      <ConfirmAction
        open={deleteOpen}
        title={c("将每日记录移到回收站？", "Move daily record to bin?")}
        description={c(
          "仅删除每日记录；当天试卷保持不变。",
          "Only the daily record is deleted. Day papers remain unchanged."
        )}
        pending={pending}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
      <ConfirmAction
        open={!!navigateTo}
        title={c("离开未保存的内容？", "Leave unsaved changes?")}
        description={c(
          "可以先取消并保存本地草稿。离开将丢弃当前未保存输入。",
          "Cancel to save a local draft first. Leaving discards the current unsaved input."
        )}
        pending={pending}
        onClose={() => setNavigateTo("")}
        onConfirm={() => navigate(navigateTo)}
      />
      <ConfirmAction
        open={restoreOpen}
        title={
          staleDraft
            ? c(
                "以草稿内容替换当前表单？",
                "Replace the current form with the draft?"
              )
            : c("恢复本地草稿？", "Restore local draft?")
        }
        description={
          staleDraft
            ? c(
                "服务器记录或试卷已变化。此操作采用最新版本作为保存基础；请先关闭对话框查看最新记录，恢复后逐项比较再保存。",
                "Server records or papers changed. Restoring adopts the latest version for a future save. Close this dialog to review the latest record first; compare every field after restoring before saving."
              )
            : c(
                "草稿仅存于此浏览器，恢复不会立即写入服务器。",
                "This browser-only draft is restored as unsaved input. It does not immediately write to the server."
              )
        }
        pending={pending}
        destructive={false}
        onClose={() => setRestoreOpen(false)}
        onConfirm={restore}
      />
    </div>
  );
}
export default function DailyEditor({
  onDirtyChange
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [params] = useSearchParams();
  const { id: routeStudentId } = useParams();
  const studentId = routeStudentId || params.get("student") || "";
  const date = params.get("date") || businessToday();
  const { user } = useAuth();
  const c = useWebCopy();
  const teacher = can(user, "strictTeacher", studentId);
  const query = useQuery({
    queryKey: queryKeys.student(user, studentId, "daily-editor", date),
    enabled: !!studentId && isBusinessDate(date),
    queryFn: async ({ signal }) => {
      const [
        student,
        daily,
        papers,
        tasks,
        study,
        types,
        schools,
        subjects,
        loss
      ] = await Promise.all([
        studentsApi.get(studentId, signal),
        loadDailyRecord(studentId, date, signal),
        requestJson<Paper[]>(
          `students/${encodeURIComponent(studentId)}/papers?date=${date}`,
          { signal }
        ),
        requestJson<TaskSettings>(
          `students/${encodeURIComponent(studentId)}/english-tasks`,
          { signal }
        ),
        requestJson<StudySettings>("study-settings", { signal }),
        teacher ? requestJson<DictionaryRow[]>("paper-types", { signal }) : [],
        teacher
          ? requestJson<DictionaryRow[]>("paper-schools", { signal })
          : [],
        loadStudentSubjects(studentId, signal),
        teacher
          ? requestJson<LossCatalog>("loss-points", { signal })
          : { categories: [] }
      ]);
      return {
        student,
        daily,
        papers,
        tasks,
        study,
        types,
        schools,
        subjects,
        loss
      };
    }
  });
  if (!isBusinessDate(date))
    return <p role="alert">{c("日期无效。", "Invalid date.")}</p>;
  return (
    <>
      <AsyncState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <Form
          key={`${studentId}:${date}`}
          loaded={query.data}
          date={date}
          studentId={studentId}
          reloadCatalog={async () => {
            const result = await query.refetch();
            if (result.error) throw result.error;
          }}
          onDirtyChange={onDirtyChange}
        />
      )}
    </>
  );
}

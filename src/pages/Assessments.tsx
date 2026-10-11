import { StudentWorkspace } from "@/components/layout/StudentWorkspace";
import { StudentSubjectSelect } from "@/components/shared/StudentSubjectSelect";
import {
  loadStudentSubjects,
  validSubjectSelection
} from "@/services/studentSubjects";
import { useSeenMarker } from "@/storage/seen";
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/app/permissions";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { useWebCopy } from "@/i18n/web";
import { businessToday } from "@/domain/businessDates";
import { scoreDisplay } from "@/domain/scoreDisplay";
import { requestJson, ApiError } from "@/services/http";
import { studentsApi } from "@/services/studentsApi";
import { AsyncState } from "@/components/shared/AsyncState";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import {
  Exam,
  Paper,
  DictionaryRow,
  examPayload,
  paperPayload
} from "@/features/assessments/contracts";
import { PaperFields } from "@/features/assessments/PaperFields";
type Assessment = Exam | Paper;
function Score({ score, total }: { score: unknown; total?: unknown }) {
  const result = scoreDisplay({ score, total });
  return (
    <span>
      {result.score === null
        ? "—"
        : `${result.score}${result.total !== null ? ` / ${result.total}` : ""}${
            result.percentage !== null ? ` · ${result.percentage}%` : ""
          }${result.grade ? ` · ${result.grade}` : ""}`}
    </span>
  );
}
function Editor({
  initial,
  papers,
  studentId,
  catalog,
  onReload,
  onSaved,
  onBusy
}: {
  initial: Assessment;
  papers: boolean;
  studentId: string;
  catalog: {
    types: DictionaryRow[];
    schools: DictionaryRow[];
    subjects: DictionaryRow[];
  };
  onReload: () => Promise<void>;
  onSaved: (id: string) => Promise<void>;
  onBusy: (value: boolean) => void;
}) {
  const c = useWebCopy();
  const [form, setForm] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState(false);
  const exam = form as Exam;
  const paper = form as Paper;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending || unknown) return;
    setPending(true);
    onBusy(true);
    setError("");
    let sent = false;
    try {
      const selected = papers
        ? [paper]
        : exam.subjects.filter(row => row.examDate || row.score);
      const originals = initial.id
        ? papers
          ? [initial as Paper]
          : (initial as Exam).subjects
        : [];
      if (
        selected.some(
          row => !validSubjectSelection(row, catalog.subjects, originals)
        )
      )
        throw new Error(
          c(
            "请选择学生已关联的科目",
            "Choose a subject assigned to this student"
          )
        );
      const body = papers ? paperPayload(paper) : examPayload(exam);
      sent = true;
      const path = papers
        ? `students/${encodeURIComponent(studentId)}/papers${
            form.id ? `/${encodeURIComponent(form.id)}` : ""
          }`
        : form.id
        ? `exams/${encodeURIComponent(form.id)}`
        : `students/${encodeURIComponent(studentId)}/exams`;
      const saved = await requestJson<{ id: string }>(path, {
        method: form.id ? "PUT" : "POST",
        body: !papers && form.id ? { ...body, studentId } : body
      });
      await onSaved(saved.id);
    } catch (err) {
      const uncertain =
        sent && (!(err instanceof ApiError) || err.status >= 500);
      setUnknown(uncertain);
      setError(
        uncertain
          ? c(
              "保存结果未确认。请保留输入并关闭表单，刷新列表核对后再操作。",
              "Save outcome is unconfirmed. Keep your input, close the form and refresh the list before trying again."
            )
          : err instanceof ApiError && err.conflict === "stale"
          ? c(
              "记录已更新。输入保留，请与最新版本核对。",
              "The record changed. Your input is retained; compare it with the latest version."
            )
          : err instanceof Error
          ? err.message
          : "Save failed"
      );
    } finally {
      setPending(false);
      onBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={pending || unknown} className="space-y-4">
        {papers ? (
          <PaperFields
            form={paper}
            onChange={setForm}
            {...catalog}
            onReload={onReload}
          />
        ) : (
          <>
            <label className="web-field">
              {c("考试名称", "Exam name")}
              <Input
                required
                maxLength={50}
                value={exam.name}
                onChange={event =>
                  setForm({ ...exam, name: event.target.value })
                }
              />
            </label>
            <p>
              {c(
                "无日期也无成绩的科目不会保存。主考试日期取已填科目日期中的最早一天。",
                "Subjects without a date or score are omitted. The earliest subject date becomes the main exam date."
              )}
            </p>
            {exam.subjects.map((subject, index) => (
              <fieldset key={index} className="border rounded p-3 space-y-2">
                <legend>
                  {c(`科目 ${index + 1}`, `Subject ${index + 1}`)}
                </legend>
                <StudentSubjectSelect
                  value={subject}
                  subjects={catalog.subjects}
                  label={c("科目名称", "Subject name")}
                  onChange={selected =>
                    setForm({
                      ...exam,
                      subjects: exam.subjects.map((row, i) =>
                        i === index ? { ...row, name: selected.name } : row
                      )
                    })
                  }
                />
                <div className="web-grid">
                  <label className="web-field">
                    {c("考试日期", "Exam date")}
                    <Input
                      type="date"
                      min="2000-01-01"
                      max="2100-12-31"
                      value={subject.examDate || ""}
                      onChange={event =>
                        setForm({
                          ...exam,
                          subjects: exam.subjects.map((row, i) =>
                            i === index
                              ? { ...row, examDate: event.target.value }
                              : row
                          )
                        })
                      }
                    />
                  </label>
                  <label className="web-field">
                    {c("成绩（如 0 或 37/50）", "Score (e.g. 0 or 37/50)")}
                    <Input
                      value={subject.score ?? ""}
                      onChange={event =>
                        setForm({
                          ...exam,
                          subjects: exam.subjects.map((row, i) =>
                            i === index
                              ? { ...row, score: event.target.value }
                              : row
                          )
                        })
                      }
                    />
                  </label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={exam.subjects.length <= 1}
                  onClick={() =>
                    setForm({
                      ...exam,
                      subjects: exam.subjects.filter((_, i) => i !== index)
                    })
                  }
                >
                  {c("移除此科目", "Remove subject")}
                </Button>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={exam.subjects.length >= 30}
              onClick={() =>
                setForm({
                  ...exam,
                  subjects: [
                    ...exam.subjects,
                    { name: "", score: "", examDate: "" }
                  ]
                })
              }
            >
              {c("添加科目", "Add subject")}
            </Button>
            <p>
              {exam.id
                ? c(
                    "修改已有考试不会发送成绩创建通知。",
                    "Editing an existing exam does not send the scored-create notification."
                  )
                : c(
                    "新建含成绩的考试会触发已有家长通知；仅安排日期不会触发。",
                    "Creating an exam with a score triggers the existing parent notification. A scoreless schedule does not."
                  )}
            </p>
          </>
        )}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <Button disabled={pending || unknown}>
        {pending ? c("保存中…", "Saving…") : c("保存", "Save")}
      </Button>
    </form>
  );
}
export default function Assessments({ papers = false }: { papers?: boolean }) {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const c = useWebCopy();
  const cache = useQueryClient();
  const [edit, setEdit] = useState<Assessment>();
  const [busy, setBusy] = useState(false);
  const [deletion, setDeletion] = useState<Assessment>();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const canWrite = can(user, "strictTeacher", id);
  const endpoint = `students/${encodeURIComponent(id)}/${
    papers ? "papers" : "exams"
  }`;
  const query = useQuery({
    queryKey: queryKeys.student(user, id, papers ? "papers" : "exams"),
    queryFn: async ({ signal }) => {
      const [student, rows] = await Promise.all([
        studentsApi.get(id, signal),
        requestJson<Assessment[]>(endpoint, { signal })
      ]);
      return { student, rows };
    }
  });
  useSeenMarker(
    user,
    id,
    "exams",
    query.data?.rows || [],
    !papers && query.isSuccess
  );
  const catalog = useQuery({
    queryKey: queryKeys.student(user, id, "assessment-catalog"),
    queryFn: async ({ signal }) => {
      const [types, schools, subjects] = await Promise.all([
        requestJson<DictionaryRow[]>("paper-types", { signal }),
        requestJson<DictionaryRow[]>("paper-schools", { signal }),
        loadStudentSubjects(id, signal)
      ]);
      return { types, schools, subjects };
    },
    enabled: canWrite
  });
  async function refresh() {
    const result = await catalog.refetch();
    if (result.error) throw result.error;
  }
  async function saved(savedId: string) {
    const result = await query.refetch();
    if (result.error || !result.data?.rows.some(row => row.id === savedId))
      throw new Error("Saved row not confirmed");
    await cache.invalidateQueries({ queryKey: sessionKey(user) });
    setEdit(undefined);
  }
  async function remove() {
    if (!deletion || deleting) return;
    setDeleting(true);
    setError("");
    try {
      const path = papers
        ? `${endpoint}/${encodeURIComponent(deletion.id)}`
        : `exams/${encodeURIComponent(deletion.id)}`;
      await requestJson(path, {
        method: "DELETE",
        body: { updatedAt: deletion.updatedAt }
      });
      const loaded = await query.refetch();
      if (loaded.error || loaded.data?.rows.some(row => row.id === deletion.id))
        throw new Error("Deletion not confirmed");
      setDeletion(undefined);
      await cache.invalidateQueries({ queryKey: sessionKey(user) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }
  return (
    <section className="web-content space-y-6">
      <StudentWorkspace studentId={id} section={papers ? "papers" : "exams"} />
      <div className="section-heading">
        <div>
          <h2>
            {papers
              ? c("测试与练习记录", "Tests & practice records")
              : c("考试与成绩", "Exams & results")}
          </h2>
          <p>
            {papers
              ? c(
                  "记录每次练习，并明确下一步改进方向。",
                  "Keep each practice result with clear feedback and next steps."
                )
              : c(
                  "安排考试日期，跟踪各科成绩。",
                  "Schedule exams and follow results by subject."
                )}
          </p>
        </div>
      </div>
      <AsyncState
        pending={query.isPending}
        error={query.error}
        empty={query.isSuccess && !query.data.rows.length}
        retry={() => void query.refetch()}
      />
      {canWrite && (
        <>
          <AsyncState
            pending={catalog.isPending}
            error={catalog.error}
            retry={() => void catalog.refetch()}
          />
          <Button
            disabled={!catalog.isSuccess || !catalog.data.subjects.length}
            onClick={() =>
              setEdit(
                papers
                  ? {
                      typeId: "",
                      schoolId: "",
                      date: businessToday(),
                      subjectId: null,
                      subjectName: "",
                      description: "",
                      strengths: "",
                      improvements: "",
                      score: null,
                      total: null
                    }
                  : {
                      name: "",
                      examDate: businessToday(),
                      subjects: [
                        { name: "", score: "", examDate: businessToday() }
                      ]
                    }
              )
            }
          >
            {c("添加记录", "Add record")}
          </Button>
        </>
      )}
      <div className="space-y-4">
        {query.data?.rows.map(row => (
          <article className="web-card space-y-3" key={row.id}>
            {papers ? (
              <>
                <h2>
                  {(row as Paper).subjectName || c("试卷", "Paper")} ·{" "}
                  {(row as Paper).date}
                </h2>
                <p>
                  {(row as Paper).typeName} · {(row as Paper).schoolName}
                </p>
                <p className="whitespace-pre-wrap">
                  {(row as Paper).description}
                </p>
                <Score
                  score={(row as Paper).score}
                  total={(row as Paper).total}
                />
                <p className="whitespace-pre-wrap">
                  {c("优点", "Strengths")}: {(row as Paper).strengths}
                </p>
                <p className="whitespace-pre-wrap">
                  {c("改进方向", "Improvements")}: {(row as Paper).improvements}
                </p>
              </>
            ) : (
              <>
                <h2>
                  {(row as Exam).name} · {(row as Exam).examDate}
                </h2>
                {(row as Exam).subjects.map((subject, index) => (
                  <p key={index}>
                    {subject.name} ·{" "}
                    {subject.examDate || (row as Exam).examDate} ·{" "}
                    <Score score={subject.score} />
                  </p>
                ))}
              </>
            )}
            {canWrite && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={!catalog.isSuccess}
                  onClick={() => setEdit(structuredClone(row))}
                >
                  {c("编辑", "Edit")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setError("");
                    setDeletion(row);
                  }}
                >
                  {c("移到回收站", "Move to bin")}
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
      <Dialog
        open={!!edit}
        onOpenChange={open => {
          if (!open && !busy) setEdit(undefined);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {papers
                ? c("试卷编辑", "Paper editor")
                : c("考试编辑", "Exam editor")}
            </DialogTitle>
            <DialogDescription>
              {papers
                ? c(
                    "每日试卷批量保存可能替换同一天的独立试卷，请留意最新记录。",
                    "Daily paper batch saves may replace standalone papers on the same day. Check the latest records."
                  )
                : c(
                    "安排考试日期或记录已有成绩。",
                    "Schedule exam dates or record results."
                  )}
            </DialogDescription>
          </DialogHeader>
          {edit && catalog.data && (
            <Editor
              key={`${papers}:${edit.id || "new"}`}
              initial={edit}
              papers={papers}
              studentId={id}
              catalog={catalog.data}
              onReload={refresh}
              onSaved={saved}
              onBusy={setBusy}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmAction
        open={!!deletion}
        title={c("移到回收站？", "Move to bin?")}
        description={c(
          "记录会从当前列表隐藏，可在保留期限内从回收站恢复。",
          "The record leaves this list and can be restored from the bin within the retention period."
        )}
        pending={deleting}
        error={error}
        onClose={() => setDeletion(undefined)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}

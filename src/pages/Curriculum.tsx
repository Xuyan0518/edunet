import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { queryKeys, sessionKey } from "@/app/queryKeys";
import { requestJson, ApiError } from "@/services/http";
import { AsyncState } from "@/components/shared/AsyncState";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import {
  allowedParents,
  flattenTopics,
  catalogPayload,
  catalogPath,
  CatalogKind,
  CatalogValues,
  Topic,
  Subject,
  Level,
  Hierarchy
} from "@/features/curriculum/contracts";
type Edit = {
  kind: CatalogKind;
  id?: string;
  values: CatalogValues;
  protected?: boolean;
};
type Deletion = { kind: CatalogKind; id: string; name: string };
function Editor({
  edit,
  levels,
  topics,
  subjectId,
  onSaved,
  onClose,
  onBusy
}: {
  edit: Edit;
  levels: Level[];
  topics: Topic[];
  subjectId?: string;
  onSaved: (kind: CatalogKind, id: string) => Promise<void>;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const c = useWebCopy();
  const [form, setForm] = useState(edit.values);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState(false);
  const labels: Record<string, string> = {
    code: c("代码", "Code"),
    name: c("名称", "Name"),
    description: c("描述", "Description"),
    chineseName: c("中文名", "Chinese name"),
    englishName: c("英文名", "English name"),
    title: c("章节名称", "Topic title"),
    orderIndex: c("章节排序（文本）", "Topic order (text)"),
    sortOrder: c("排序", "Sort order")
  };
  const fields =
    edit.kind === "level"
      ? ["name", "description", "sortOrder"]
      : edit.kind === "subject"
      ? ["code", "name", "chineseName", "englishName", "sortOrder"]
      : ["code", "title", "orderIndex"];
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending || unknown) return;
    let sent = false;
    setPending(true);
    onBusy(true);
    setError("");
    try {
      const payload = catalogPayload(edit.kind, form);
      sent = true;
      const saved = await requestJson<{ id: string }>(
        catalogPath(edit.kind, edit.id, subjectId),
        { method: edit.id ? "PUT" : "POST", body: payload }
      );
      await onSaved(edit.kind, saved.id);
      onClose();
    } catch (err) {
      const uncertain =
        sent && (!(err instanceof ApiError) || err.status >= 500);
      setUnknown(uncertain);
      setError(
        uncertain
          ? c(
              "保存结果不明确，请关闭并刷新目录核对后再操作，避免重复新增。",
              "Save outcome is unconfirmed. Close and refresh the catalog before another save to avoid duplicates."
            )
          : err instanceof Error
          ? err.message
          : c("保存失败", "Save failed")
      );
    } finally {
      setPending(false);
      onBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={pending || unknown} className="space-y-3">
        {fields.map(field => (
          <label className="web-field" key={field}>
            {labels[field]}
            <Input
              required={["code", "name", "title"].includes(field)}
              type={field === "sortOrder" ? "number" : "text"}
              step={field === "sortOrder" ? 1 : undefined}
              value={String(form[field] ?? "")}
              onChange={event =>
                setForm({
                  ...form,
                  [field]:
                    field === "sortOrder"
                      ? event.target.valueAsNumber
                      : event.target.value
                })
              }
            />
          </label>
        ))}
        {edit.kind === "subject" && (
          <>
            <label className="web-field">
              {c("层级", "Level")}
              <select
                value={String(form.levelId || "")}
                required
                onChange={event =>
                  setForm({ ...form, levelId: event.target.value })
                }
              >
                <option value="">{c("选择层级", "Choose level")}</option>
                {levels.map(level => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={form.isRequired === true}
                disabled={edit.protected}
                onChange={event =>
                  setForm({ ...form, isRequired: event.target.checked })
                }
              />
              {c("必修科目", "Required subject")}
            </label>
          </>
        )}
        {edit.kind === "topic" && (
          <label className="web-field">
            {c("上级章节", "Parent topic")}
            <select
              value={String(form.parentTopicId || "")}
              onChange={event =>
                setForm({ ...form, parentTopicId: event.target.value })
              }
            >
              <option value="">{c("顶层", "Top level")}</option>
              {allowedParents(topics, edit.id).map(topic => (
                <option key={topic.id} value={topic.id}>
                  {topic.code} · {topic.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {edit.kind !== "topic" && (edit.kind !== "level" || !!edit.id) && (
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              disabled={edit.protected}
              onChange={event =>
                setForm({ ...form, isActive: event.target.checked })
              }
            />
            {c("启用", "Active")}
          </label>
        )}
      </fieldset>
      {edit.kind === "level" && (
        <p className="text-sm">
          {c(
            "默认层级由服务器管理。停用层级将不再出现在当前目录中。",
            "The server manages the default level. Inactive levels leave the current catalog."
          )}
        </p>
      )}
      {edit.kind === "subject" && !edit.id && (
        <p className="text-sm">
          {c(
            "先保存科目，再逐个添加章节。使用停用科目的原代码会重新启用原科目。",
            "Save the subject first, then add topics individually. Reusing an inactive code reactivates its existing subject."
          )}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={pending || unknown}>
          {pending ? c("保存中…", "Saving…") : c("保存", "Save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
        >
          {c("取消", "Cancel")}
        </Button>
      </div>
    </form>
  );
}
export default function Curriculum() {
  const { user } = useAuth();
  const c = useWebCopy();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get("subject") || "";
  const [editorBusy, setEditorBusy] = useState(false);
  const [edit, setEdit] = useState<Edit>();
  const [deletion, setDeletion] = useState<Deletion>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: queryKeys.resource(user, "curriculum"),
    queryFn: async ({ signal }) => {
      const [levels, subjects, hierarchy] = await Promise.all([
        requestJson<Level[]>("subject-levels", { signal }),
        requestJson<Subject[]>("subjects?includeInactive=true", { signal }),
        requestJson<Hierarchy>("subjects/hierarchy", { signal })
      ]);
      return { levels, subjects, hierarchy };
    }
  });
  const subject = query.data?.subjects.find(subject => subject.id === selected);
  const topics = flattenTopics(
    query.data?.hierarchy.levels
      .flatMap(level => level.subjects || [])
      .find(subject => subject.id === selected)?.topics || []
  );
  const selectSubject = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("subject", id);
    setParams(next);
  };
  async function saved(kind: CatalogKind, id: string) {
    const reloaded = await query.refetch();
    if (reloaded.error) throw reloaded.error;
    await cache.invalidateQueries({ queryKey: sessionKey(user) });
    if (kind === "subject") selectSubject(id);
    setMessage(c("已保存并重新读取目录。", "Saved and reloaded the catalog."));
  }
  async function remove() {
    if (!deletion || pending) return;
    setPending(true);
    setError("");
    try {
      await requestJson(catalogPath(deletion.kind, deletion.id), {
        method: "DELETE"
      });
      await saved(deletion.kind, "");
      setDeletion(undefined);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status < 500
          ? err.message
          : c(
              "结果未确认，请刷新目录核对。",
              "Outcome is unconfirmed. Refresh the catalog to check."
            )
      );
    } finally {
      setPending(false);
    }
  }
  const values = (input: Level | Subject | Topic): CatalogValues =>
    Object.fromEntries(
      Object.entries(input).filter(([, value]) =>
        ["string", "number", "boolean"].includes(typeof value)
      )
    ) as CatalogValues;
  const requestDelete = (kind: CatalogKind, id: string, name: string) => {
    setError("");
    setDeletion({ kind, id, name });
  };
  return (
    <section className="web-content">
      <h1>{c("课程与章节", "Curriculum")}</h1>
      <p>
        {c(
          "共享课程目录；章节进度在学生档案中记录。",
          "Shared catalog. Record chapter progress in each student workspace."
        )}
      </p>
      <AsyncState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {message && <p role="status">{message}</p>}
      {query.data && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                setEdit({
                  kind: "level",
                  values: {
                    name: "",
                    description: "",
                    sortOrder: 0,
                    isActive: true
                  }
                })
              }
            >
              {c("添加层级", "Add level")}
            </Button>
            <Button
              onClick={() =>
                setEdit({
                  kind: "subject",
                  values: {
                    code: "",
                    name: "",
                    chineseName: "",
                    englishName: "",
                    sortOrder: 0,
                    isActive: true,
                    isRequired: false,
                    levelId: query.data.hierarchy.defaultLevelId
                  }
                })
              }
            >
              {c("添加科目", "Add subject")}
            </Button>
          </div>
          <div className="web-grid">
            <div className="web-card space-y-5">
              {query.data.levels.map(level => (
                <section key={level.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2>
                      {level.name}
                      {level.isDefault && c("（默认）", " (default)")}
                    </h2>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEdit({
                          kind: "level",
                          id: level.id,
                          values: values(level),
                          protected: level.isDefault
                        })
                      }
                    >
                      {c("编辑层级", "Edit level")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        level.isDefault ||
                        query.data.subjects.some(
                          subject => subject.levelId === level.id
                        )
                      }
                      onClick={() =>
                        requestDelete("level", level.id, level.name)
                      }
                    >
                      {c("删除层级", "Delete level")}
                    </Button>
                  </div>
                  {query.data.subjects
                    .filter(subject => subject.levelId === level.id)
                    .map(subject => (
                      <Button
                        key={subject.id}
                        variant={
                          selected === subject.id ? "default" : "outline"
                        }
                        className="my-1 w-full justify-start"
                        onClick={() => selectSubject(subject.id)}
                      >
                        {subject.name} · {subject.code}
                        {subject.isActive === false &&
                          c("（停用）", " (inactive)")}
                      </Button>
                    ))}
                </section>
              ))}
            </div>
            <div className="web-card space-y-4">
              {subject ? (
                <>
                  <h2>{subject.name}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setEdit({
                          kind: "subject",
                          id: subject.id,
                          values: values(subject),
                          protected: subject.code === "ENGLISH"
                        })
                      }
                    >
                      {c("编辑科目", "Edit subject")}
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={
                        subject.isRequired || subject.code === "ENGLISH"
                      }
                      onClick={() =>
                        requestDelete("subject", subject.id, subject.name)
                      }
                    >
                      {c("永久删除科目", "Permanently delete subject")}
                    </Button>
                    <Button
                      disabled={subject.isActive === false}
                      onClick={() =>
                        setEdit({
                          kind: "topic",
                          values: {
                            code: "",
                            title: "",
                            parentTopicId: "",
                            orderIndex: ""
                          }
                        })
                      }
                    >
                      {c("添加章节", "Add topic")}
                    </Button>
                  </div>
                  {subject.isActive === false ? (
                    <p>
                      {c(
                        "重新启用科目后管理章节。",
                        "Reactivate this subject to manage its topics."
                      )}
                    </p>
                  ) : topics.length ? (
                    topics.map(topic => (
                      <div
                        className="border rounded p-3 space-y-2"
                        key={topic.id}
                      >
                        <h3>
                          {topic.code} · {topic.title}
                        </h3>
                        <p className="text-sm">
                          {c("上级", "Parent")}:{" "}
                          {topics.find(
                            parent => parent.id === topic.parentTopicId
                          )?.title || c("顶层", "Top level")}{" "}
                          · {c("排序", "Order")}: {topic.orderIndex}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEdit({
                                kind: "topic",
                                id: topic.id,
                                values: values(topic)
                              })
                            }
                          >
                            {c("编辑章节", "Edit topic")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={topics.some(
                              child => child.parentTopicId === topic.id
                            )}
                            onClick={() =>
                              requestDelete("topic", topic.id, topic.title)
                            }
                          >
                            {c("删除章节", "Delete topic")}
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>{c("暂无章节。", "No topics yet.")}</p>
                  )}
                </>
              ) : (
                <p>
                  {c(
                    "选择科目查看章节。",
                    "Choose a subject to view its topics."
                  )}
                </p>
              )}
            </div>
          </div>
          <Dialog
            open={!!edit}
            onOpenChange={open => {
              if (!open && !editorBusy) setEdit(undefined);
            }}
          >
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {edit?.kind === "level"
                    ? c("层级设置", "Level settings")
                    : edit?.kind === "subject"
                    ? c("科目设置", "Subject settings")
                    : c("章节设置", "Topic settings")}
                </DialogTitle>
                <DialogDescription>
                  {c(
                    "保存到共享课程目录。",
                    "Save to the shared curriculum catalog."
                  )}
                </DialogDescription>
              </DialogHeader>
              {edit && (
                <Editor
                  key={`${edit.kind}:${edit.id || "new"}`}
                  edit={edit}
                  levels={query.data.levels}
                  topics={topics}
                  subjectId={selected}
                  onSaved={saved}
                  onBusy={setEditorBusy}
                  onClose={() => setEdit(undefined)}
                />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
      <ConfirmAction
        open={!!deletion}
        title={c(
          `永久删除 ${deletion?.name || ""}？`,
          `Permanently delete ${deletion?.name || ""}?`
        )}
        description={
          deletion?.kind === "subject"
            ? c(
                "将永久删除此科目、章节、学生章节进度、科目分配和试卷；不会进入回收站。",
                "Permanently deletes the subject, topics, student progress, assignments and papers. These do not enter the bin."
              )
            : deletion?.kind === "topic"
            ? c(
                "有子章节或已开始进度的章节不能删除。此操作不可恢复。",
                "Topics with children or started progress cannot be deleted. Deletion cannot be undone."
              )
            : c(
                "默认层级和仍有科目的层级不能删除。此操作不可恢复。",
                "Default and occupied levels cannot be deleted. Deletion cannot be undone."
              )
        }
        pending={pending}
        error={error}
        onClose={() => setDeletion(undefined)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}

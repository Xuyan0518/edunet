import { StudentSubjectSelect } from "@/components/shared/StudentSubjectSelect";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWebCopy } from "@/i18n/web";
import { requestJson, ApiError } from "@/services/http";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Paper, DictionaryRow } from "./contracts";
function Dictionary({
  label,
  endpoint,
  value,
  rows,
  onChange,
  onReload
}: {
  label: string;
  endpoint: string;
  value: string;
  rows: DictionaryRow[];
  onChange: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  const { user } = useAuth();
  const c = useWebCopy();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [existing, setExisting] = useState<DictionaryRow>();
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState(false);
  async function add() {
    setPending(true);
    setError("");
    try {
      const saved = await requestJson<DictionaryRow>(endpoint, {
        method: "POST",
        body: { name: name.trim() }
      });
      await onReload();
      onChange(saved.id);
      setName("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.details.data) {
        setExisting(err.details.data as DictionaryRow);
      } else {
        setUnknown(!(err instanceof ApiError) || err.status >= 500);
        setError(
          err instanceof Error ? err.message : c("新增失败", "Creation failed")
        );
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      <label className="web-field">
        {label}
        <select
          required
          value={value}
          onChange={event => onChange(event.target.value)}
        >
          <option value="">{c("请选择", "Choose")}</option>
          {!rows.some(row => row.id === value) && value && (
            <option value={value}>{c("历史选项", "Historical option")}</option>
          )}
          {rows.map(row => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      {["teacher", "admin"].includes(user.role) && !user.isReviewer && (
        <details className="dictionary-add">
          <summary>{c("添加新选项", "Add a new option")}</summary>
          <div className="flex flex-wrap gap-2 mt-2">
            <Input
              aria-label={c(`新增${label}`, `New ${label}`)}
              maxLength={120}
              value={name}
              disabled={pending || unknown}
              onChange={event => setName(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!name.trim() || pending || unknown}
              onClick={() => void add()}
            >
              {c("新增选项", "Add option")}
            </Button>
          </div>
        </details>
      )}
      {existing && (
        <p>
          {c(`已存在 ${existing.name}。`, `Already exists: ${existing.name}.`)}{" "}
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await onReload();
              onChange(existing.id);
              setExisting(undefined);
              setName("");
            }}
          >
            {c("使用已有选项", "Use existing option")}
          </Button>
        </p>
      )}
      {error && (
        <p role="alert">
          {error}
          {unknown &&
            c(
              " 请重新打开表单核对，避免重复新增。",
              " Reopen the form to reconcile before adding again."
            )}
        </p>
      )}
    </div>
  );
}
export function PaperFields({
  form,
  onChange,
  types,
  schools,
  subjects,
  onReload,
  fixedDate = false
}: {
  fixedDate?: boolean;
  form: Paper;
  onChange: (form: Paper) => void;
  types: DictionaryRow[];
  schools: DictionaryRow[];
  subjects: DictionaryRow[];
  onReload: () => Promise<void>;
}) {
  const c = useWebCopy();
  const update = (key: keyof Paper, value: Paper[keyof Paper]) =>
    onChange({ ...form, [key]: value });
  return (
    <div className="space-y-4">
      <div className="web-grid">
        <StudentSubjectSelect
          value={form}
          subjects={subjects}
          onChange={subject =>
            onChange({
              ...form,
              subjectId: subject.id,
              subjectName: subject.name
            })
          }
        />
        <label className="web-field">
          {c("日期", "Date")}
          <Input
            type="date"
            disabled={fixedDate}
            required
            min="2000-01-01"
            max="2100-12-31"
            value={form.date}
            onChange={event => update("date", event.target.value)}
          />
        </label>
      </div>
      <div className="web-grid">
        <Dictionary
          label={c("试卷类型", "Paper type")}
          endpoint="paper-types"
          rows={types}
          value={form.typeId}
          onChange={value => update("typeId", value)}
          onReload={onReload}
        />
        <Dictionary
          label={c("学校", "School")}
          endpoint="paper-schools"
          rows={schools}
          value={form.schoolId}
          onChange={value => update("schoolId", value)}
          onReload={onReload}
        />
      </div>
      <label className="web-field">
        {c("说明", "Description")}
        <Input
          maxLength={200}
          value={form.description || ""}
          onChange={event => update("description", event.target.value)}
        />
      </label>
      <div className="web-grid">
        {(["strengths", "improvements"] as const).map(field => (
          <label className="web-field" key={field}>
            {field === "strengths"
              ? c("优点", "Strengths")
              : c("改进方向", "Improvements")}
            <Textarea
              required
              maxLength={1000}
              value={form[field] || ""}
              onChange={event => update(field, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="web-grid">
        {(["score", "total"] as const).map(field => (
          <label className="web-field" key={field}>
            {field === "score"
              ? c("得分（可留空）", "Score (optional)")
              : c("总分（可留空）", "Total (optional)")}
            <Input
              type="number"
              step="1"
              min={field === "score" ? 0 : 1}
              max="500"
              value={form[field] ?? ""}
              onChange={event => update(field, event.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

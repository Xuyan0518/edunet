import { useWebCopy } from "@/i18n/web";
import {
  StudentSubject,
  SubjectReference,
  assignedSubject
} from "@/services/studentSubjects";
export function StudentSubjectSelect({
  value,
  subjects,
  onChange,
  label
}: {
  value: SubjectReference;
  subjects: StudentSubject[];
  onChange: (subject: StudentSubject) => void;
  label?: string;
}) {
  const c = useWebCopy();
  const selected = assignedSubject(value, subjects);
  const historical = String(
    value.subjectName || value.subject || value.name || ""
  );
  return (
    <label className="web-field">
      {label || c("科目", "Subject")}
      <select
        required
        value={selected?.id || (historical ? "__historical" : "")}
        onChange={event => {
          const next = subjects.find(
            subject => subject.id === event.target.value
          );
          if (next) onChange(next);
        }}
      >
        <option value="" disabled>
          {subjects.length
            ? c("选择已关联科目", "Choose an assigned subject")
            : c("请先关联科目", "Assign subjects first")}
        </option>
        {!selected && historical && (
          <option value="__historical" disabled>
            {historical} — {c("历史记录", "historical record")}
          </option>
        )}
        {subjects.map(subject => (
          <option value={subject.id} key={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>
      {!subjects.length && (
        <span className="text-xs text-muted-foreground">
          {c(
            "请在科目进度页面关联科目后再新增。",
            "Assign subjects in Subject progress before adding a record."
          )}
        </span>
      )}
    </label>
  );
}

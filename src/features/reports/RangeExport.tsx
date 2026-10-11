import { useState } from "react";
import { useWebCopy } from "@/i18n/web";
import { requestJson } from "@/services/http";
import { businessToday } from "@/domain/businessDates";
import { validReportRange } from "./contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TextPreview } from "@/components/shared/TextPreview";
export function RangeExport({ studentId }: { studentId: string }) {
  const c = useWebCopy();
  const today = businessToday();
  const [start, setStart] = useState(today.slice(0, 7) + "-01");
  const [end, setEnd] = useState(today);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<{
    content: string;
    fileName: string;
  } | null>(null);
  return (
    <section className="web-card space-y-3">
      <h2>{c("按日期导出学习记录", "Export learning records by date")}</h2>
      <p>
        {c(
          "汇总当前来源记录和章节进度，与已保存报告独立。",
          "Summarizes current source records and chapter progress independently of saved reports."
        )}
      </p>
      <div className="web-grid">
        <label className="web-field">
          {c("导出开始日期", "Export start date")}
          <Input
            type="date"
            value={start}
            onChange={event => {
              setStart(event.target.value);
              setFile(null);
            }}
          />
        </label>
        <label className="web-field">
          {c("导出结束日期", "Export end date")}
          <Input
            type="date"
            value={end}
            onChange={event => {
              setEnd(event.target.value);
              setFile(null);
            }}
          />
        </label>
      </div>
      <Button
        disabled={pending || !validReportRange(start, end, 370)}
        onClick={async () => {
          setPending(true);
          setMessage("");
          setFile(null);
          try {
            const result = await requestJson<{
              hasData: boolean;
              content: string;
              fileName: string;
              message?: string;
            }>(
              `students/${encodeURIComponent(
                studentId
              )}/report-export?startDate=${start}&endDate=${end}&format=markdown`
            );
            if (!result.hasData)
              setMessage(
                result.message || c("此范围暂无数据", "No data in this range")
              );
            else setFile(result);
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Export failed");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? c("准备中…", "Preparing…") : c("准备导出", "Prepare export")}
      </Button>
      {message && <p role="status">{message}</p>}
      {file && (
        <TextPreview
          title={`${start} — ${end}`}
          text={file.content}
          filename={file.fileName || `learning-${start}-${end}.md`}
        />
      )}
    </section>
  );
}

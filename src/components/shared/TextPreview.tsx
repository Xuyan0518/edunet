import { saveBlob } from "@/services/downloads";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWebCopy } from "@/i18n/web";
export function TextPreview({
  title,
  text,
  filename
}: {
  title: string;
  text: string;
  filename: string;
}) {
  const c = useWebCopy();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const dashboardUrl = new URL(
    `${import.meta.env.BASE_URL}dashboard`,
    window.location.origin
  ).href;
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {c("预览 / 复制", "Preview / copy")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {c(
                "当前内容的本地文本预览。",
                "Local text preview of the current content."
              )}
            </DialogDescription>
          </DialogHeader>
          <pre className="font-sans whitespace-pre-wrap break-words">
            {text}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setMessage(c("已复制", "Copied"));
                } catch {
                  setMessage(
                    c(
                      "无法访问剪贴板，请选择文本复制或下载。",
                      "Clipboard unavailable. Select the text or download it."
                    )
                  );
                }
              }}
            >
              {c("复制文本", "Copy text")}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                saveBlob(
                  new Blob([text], { type: "text/plain;charset=utf-8" }),
                  filename
                )
              }
            >
              {c("下载文本", "Download text")}
            </Button>
          </div>
          <label className="web-field text-sm">
            {c(
              "工作台链接（接收者需要登录，访问权限保持不变）",
              "Dashboard link (recipients must sign in; access remains unchanged)"
            )}
            <input
              className="rounded border p-2 min-w-0"
              readOnly
              value={dashboardUrl}
              onFocus={event => event.target.select()}
            />
          </label>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(dashboardUrl);
                setMessage(c("工作台链接已复制", "Dashboard link copied"));
              } catch {
                setMessage(
                  c(
                    "请选中上方链接手动复制",
                    "Select the link above to copy it manually"
                  )
                );
              }
            }}
          >
            {c("复制工作台链接", "Copy dashboard link")}
          </Button>
          {message && <p role="status">{message}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

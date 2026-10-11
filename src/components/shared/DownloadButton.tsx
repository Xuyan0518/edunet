import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requestDownload } from "@/services/http";
import { saveBlob } from "@/services/downloads";
import { useWebCopy } from "@/i18n/web";
export function DownloadButton({
  endpoint,
  label,
  disabled = false
}: {
  endpoint: string;
  label: string;
  disabled?: boolean;
}) {
  const c = useWebCopy();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant="outline"
        disabled={disabled || pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const file = await requestDownload(endpoint);
            saveBlob(file.blob, file.filename);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : c("下载失败", "Download failed")
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? c("下载中…", "Downloading…") : label}
      </Button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}

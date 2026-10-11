import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useWebCopy } from "@/i18n/web";
export function ConfirmAction({
  open,
  title,
  description,
  pending,
  error,
  onClose,
  onConfirm,
  destructive = true
}: {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  const c = useWebCopy();
  return (
    <AlertDialog
      open={open}
      onOpenChange={value => {
        if (!value && !pending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {c("取消", "Cancel")}
          </AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? c("处理中…", "Working…") : c("确认", "Confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

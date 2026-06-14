import { CheckCircle2, X, XCircle } from "lucide-react";

export type ActionResult = { ok: boolean; message: string };

export function ActionBanner({
  onDismiss,
  result,
}: {
  onDismiss: () => void;
  result: ActionResult;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        result.ok
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      }`}
    >
      {result.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0" />
      )}
      <span className="flex-1">{result.message}</span>
      <button
        aria-label="Dismiss"
        className="shrink-0 opacity-60 hover:opacity-100"
        onClick={onDismiss}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

import { CircleAlert, ClipboardPaste, Link2, LoaderCircle, Search, X } from "lucide-react";
import { Button, IconButton } from "./ui";

type UrlInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void; // Enter
  onPaste: () => void;
  loading: boolean;
  error: string | null;
};

export function UrlInput({ value, onChange, onSubmit, onPaste, loading, error }: UrlInputProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !loading) onSubmit();
      }}
    >
      <div
        className={`flex h-12 items-center gap-3 rounded-xl border-2 pr-2 pl-4 transition focus-within:border-fg ${
          error ? "border-dashed border-fg" : "border-line"
        }`}
      >
        <Link2 className="size-4 shrink-0 text-muted" />
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="paste a link and press Enter"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted"
        />
        {loading ? (
          <LoaderCircle className="mr-2 size-4 shrink-0 animate-spin text-muted" />
        ) : (
          value && <IconButton icon={X} label="Clear" onClick={() => onChange("")} />
        )}
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        {error ? (
          <p role="alert" className="flex min-w-0 items-center gap-1.5 pt-2 text-xs">
            <CircleAlert className="size-3.5 shrink-0" />
            <span className="truncate font-mono select-text" title={error}>
              {error}
            </span>
          </p>
        ) : (
          <p className="pt-2 text-xs text-muted">Yo bro, grab your videos!</p>
        )}

        <div className="flex gap-2">
          <Button onClick={onPaste} disabled={loading}>
            <ClipboardPaste className="size-4" />
            Paste
          </Button>
          {/* Same as pressing Enter: submits the form */}
          <Button type="submit" variant="primary" disabled={!value.trim() || loading}>
            <Search className="size-4" />
            Search
          </Button>
        </div>
      </div>
    </form>
  );
}

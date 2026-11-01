import { X } from "lucide-react";
import type { DownloadProgress } from "../types";
import { IconButton } from "./ui";
import { formatBytes, formatDuration } from "../format";

export type DownloadState =
  | { kind: "idle" }
  | { kind: "downloading"; id: string; progress: DownloadProgress | null } // null until the first event
  | { kind: "done"; filePath: string }
  | { kind: "error"; message: string }
  | { kind: "botCheck" };

export function DownloadError({ message }: { message: string }) {
  return (
    <p className="mt-3 rounded-lg border border-dashed border-fg px-3 py-2 font-mono text-xs select-text">{message}</p>
  );
}

// Same height as the Download button it replaces, so the layout doesn't jump
type ProgressBarProps = { progress: DownloadProgress | null; onCancel: () => void };

export function ProgressBar({ progress, onCancel }: ProgressBarProps) {
  // Video and audio are downloaded one after another, then merged by ffmpeg:
  // between the streams and at the end there is no percent to show
  const percent = progress?.status === "downloading" ? progress.percent : null;

  return (
    <div className="flex h-11 items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
          {percent === null ? (
            <div className="h-full w-full animate-pulse bg-muted" />
          ) : (
            <div className="h-full bg-fg transition-[width] duration-200" style={{ width: `${percent}%` }} />
          )}
        </div>
        <div className="flex justify-between font-mono text-xs text-muted">
          <span>{percent === null ? "Preparing…" : `${percent.toFixed(1)}%`}</span>
          <span>
            {progress?.speed ? `${formatBytes(progress.speed)}/s` : ""}
            {progress?.eta != null && percent !== null ? ` · ETA ${formatDuration(progress.eta)}` : ""}
          </span>
        </div>
      </div>
      <IconButton icon={X} label="Cancel download" onClick={onCancel} />
    </div>
  );
}

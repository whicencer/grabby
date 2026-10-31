import { useState } from "react";
import type { ReactNode } from "react";
import { Download, FolderOpen } from "lucide-react";
import type { DownloadChoice, QualityOption } from "../types";
import { Button, Select, Switch } from "./ui";

type DownloadOptionsProps = {
  videoQualities: QualityOption[]; // first option must be "best"
  audioQualities: QualityOption[];
  outputDir: string | null;
  onPickFolder: () => void;
  onDownload: (choice: DownloadChoice) => void;
  downloadLabel: string;
  disabled?: boolean;
  progress?: ReactNode; // shown instead of the Download button while downloading
};

// Shared bottom part of the video and playlist previews
export function DownloadOptions({
  videoQualities,
  audioQualities,
  outputDir,
  onPickFolder,
  onDownload,
  downloadLabel,
  disabled = false,
  progress,
}: DownloadOptionsProps) {
  const [audioOnly, setAudioOnly] = useState(false);
  const [quality, setQuality] = useState("best");
  const qualities = audioOnly ? audioQualities : videoQualities;

  function handleAudioOnly(next: boolean) {
    setAudioOnly(next);
    setQuality("best"); // format ids differ between the two lists
  }

  function handleDownload() {
    const isBest = quality === "best";

    const choice: DownloadChoice = audioOnly
      ? { kind: "audio", formatId: isBest ? null : quality }
      : { kind: "video", maxHeight: isBest ? null : Number(quality) };

    onDownload(choice);
  }

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3">
        <Switch checked={audioOnly} onChange={handleAudioOnly} label="Audio only" />
        <Select label="Quality" value={quality} options={qualities} onChange={setQuality} />
      </div>

      <div className="flex items-center gap-3">
        <FolderOpen className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={outputDir ?? "No folder selected"}>
          {outputDir ?? "No folder selected"}
        </span>
        <Button onClick={onPickFolder}>Choose</Button>
      </div>

      {progress ?? (
        <Button variant="primary" className="h-11 w-full" disabled={disabled} onClick={handleDownload}>
          <Download className="size-4" />
          {downloadLabel}
        </Button>
      )}
    </div>
  );
}

import { Clock } from "lucide-react";
import type { DownloadChoice, Format, QualityOption, VideoInfo } from "../types";
import { formatBytes, formatDuration } from "../format";
import { DownloadOptions } from "./DownloadOptions";
import { Thumb } from "./ui";
import { DownloadError, ProgressBar, type DownloadState } from "./DownloadStatus";

type VideoPreviewProps = {
  video: VideoInfo;
  outputDir: string | null;
  onPickFolder: () => void;
  onDownload: (choice: DownloadChoice) => void;
  downloadState: DownloadState;
};

export function VideoPreview({ video, outputDir, onPickFolder, onDownload, downloadState }: VideoPreviewProps) {
  return (
    <section className="mt-6 rounded-2xl border border-line p-4">
      <div className="flex gap-4">
        <Thumb src={video.thumbnail} className="aspect-video w-44" />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 leading-snug font-semibold select-text">{video.title}</h2>
          <p className="mt-1 truncate text-sm text-muted">{video.channel}</p>
          <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 font-mono text-xs">
            <Clock className="size-3" />
            {video.duration ? formatDuration(video.duration) : "unknown"}
          </p>
        </div>
      </div>

      <DownloadOptions
        videoQualities={videoQualities(video.formats)}
        audioQualities={audioQualities(video.formats)}
        outputDir={outputDir}
        onPickFolder={onPickFolder}
        downloadLabel="Download"
        onDownload={onDownload}
        disabled={outputDir === null}
        progress={downloadState.kind === "downloading" ? <ProgressBar progress={downloadState.progress} /> : null}
      />

      {downloadState.kind === "error" && <DownloadError message={downloadState.message} />}
    </section>
  );
}

function sizeSuffix(format: Format): string {
  return format.filesize ? ` · ${formatBytes(format.filesize)}` : "";
}

const isH264 = (codec: string | null) => codec?.startsWith("avc1") ?? false;
const isAac = (codec: string | null) => codec?.startsWith("mp4a") ?? false;

type HeightInfo = { fps: number; hasH264: boolean; hasAv1: boolean };

function videoQualities(formats: Format[]): QualityOption[] {
  const heights = new Map<number, HeightInfo>();

  for (const format of formats) {
    if (format.height === null || !format.hasVideo) continue;
    const info = heights.get(format.height) ?? { fps: 0, hasH264: false, hasAv1: false };
    heights.set(format.height, {
      fps: Math.max(info.fps, Math.round(format.fps ?? 0)),
      hasH264: info.hasH264 || isH264(format.vcodec),
      hasAv1: info.hasAv1 || (format.vcodec?.startsWith("av01") ?? false),
    });
  }

  const options = [...heights.entries()]
    .sort(([a], [b]) => b - a)
    .map(([height, { fps, hasH264, hasAv1 }]) => ({
      value: String(height),
      label: `${height}p${fps || ""}${hasH264 ? "" : ` · ${hasAv1 ? "AV1" : "VP9"}`}`,
    }));

  return [{ label: "Best", value: "best" }, ...options];
}

// Only AAC: it opens everywhere without conversion (Opus would open in a browser)
function audioQualities(formats: Format[]): QualityOption[] {
  const options = formats
    .filter((f) => f.hasAudio && !f.hasVideo && isAac(f.acodec))
    .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))
    .map((f) => ({ value: f.id, label: `m4a${f.abr ? ` · ${Math.round(f.abr)}k` : ""}${sizeSuffix(f)}` }));
  return [{ value: "best", label: "Best audio · m4a" }, ...options];
}

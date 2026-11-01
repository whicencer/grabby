import type { DownloadChoice, DownloadProgress } from "../types";

// Run with `pnpm tauri:mock`: fetchInfo / startDownload never touch the network.
// Folder picker, "Show in folder" and URL validation stay real.
// Put a keyword anywhere in the URL to pick a scenario:
export const SCENARIOS = {
  "info-fail": "preview fails with a normal error",
  "info-bot": "preview fails with the YouTube bot check",
  live: "non-YouTube video: no thumbnail, HLS formats",
  "dl-fail": "download breaks at 60%",
  "dl-bot": "download fails with the bot check",
} as const;

type Listener = (progress: DownloadProgress) => void;
const listeners = new Set<Listener>();

// Same contract as onDownloadProgress: resolves to an unlisten function
export function mockOnDownloadProgress(handler: Listener): Promise<() => void> {
  listeners.add(handler);
  return Promise.resolve(() => {
    listeners.delete(handler);
  });
}

const cancelled = new Set<string>();

export function mockCancelDownload(id: string): Promise<void> {
  cancelled.add(id);
  return Promise.resolve();
}

const emit = (progress: DownloadProgress) => listeners.forEach((listener) => listener(progress));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One stream from 0 to 100% in `seconds`, 4 events per second like the Rust throttle
async function stream(id: string, totalBytes: number, seconds: number, failAtPercent?: number) {
  const steps = seconds * 4;
  for (let step = 0; step <= steps; step++) {
    if (cancelled.delete(id)) throw { kind: "cancelled" };
    const percent = (step / steps) * 100;
    if (failAtPercent !== undefined && percent >= failAtPercent) {
      throw { kind: "failed", message: "ERROR: [download] Got error: Connection reset by peer" };
    }
    emit({ id, status: "downloading", percent, speed: totalBytes / seconds, eta: (steps - step) / 4 });
    await sleep(250);
  }
  emit({ id, status: "finished", percent: 100, speed: null, eta: null });
}

export async function mockStartDownload(
  id: string,
  url: string,
  choice: DownloadChoice,
  outputDir: string,
): Promise<string> {
  await sleep(600); // yt-dlp start-up: the UI shows "Preparing…"
  if (url.includes("dl-bot")) throw { kind: "botCheck" };

  const failAt = url.includes("dl-fail") ? 60 : undefined;
  if (choice.kind === "video") {
    await stream(id, 400_000_000, 5, failAt); // video track
    await stream(id, 30_000_000, 2); // audio track: the bar starts over, like in the real app
    await sleep(1000); // ffmpeg merge
  } else {
    await stream(id, 30_000_000, 3, failAt);
  }

  // A real folder, so "Show in folder" works
  return outputDir;
}

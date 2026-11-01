import { useEffect, useState } from "react";
import type { DownloadChoice, VideoInfo } from "../types";
import { APP_NAME } from "../constants";
import { UrlInput } from "./UrlInput";
import { VideoPreview } from "./VideoPreview";
import { Toast } from "./ui";
import { validateUrl, fetchInfo, startDownload, cancelDownload, onDownloadProgress } from "../api/commands";
import type { DownloadState } from "./DownloadStatus";
import { getErrorMessage } from "../shared/getErrorMessage";
import { isBotCheck, isCancelled } from "../api/errors";
import { BotCheckNotice } from "./BotCheckNotice";
import { open } from "@tauri-apps/plugin-dialog";
import { downloadDir } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "botCheck" }
  | { kind: "ready"; video: VideoInfo };

export function DownloadView() {
  const [url, setUrl] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "idle" });
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>({ kind: "idle" });

  useEffect(() => {
    downloadDir()
      .then(dir => setOutputDir((prev) => prev ?? dir))
      .catch(() => {});
  }, []);

  function changeUrl(value: string) {
    setUrl(value);
    if (fetchState.kind === "error" || fetchState.kind === "botCheck") setFetchState({ kind: "idle" });
  }

  async function check(target: string) {
    try {
      const validatedUrl = await validateUrl(target)
      setUrl(validatedUrl);
      
      setFetchState({
        kind: "loading"
      });
      setDownloadState({ kind: "idle" });
      
      const video = await fetchInfo(validatedUrl);
      setFetchState({
        kind: "ready",
        video
      });
    } catch (error) {
      setFetchState(isBotCheck(error) ? { kind: "botCheck" } : { kind: "error", message: getErrorMessage(error) });
    }
  }

  async function paste() {
    // TODO: switch to tauri-plugin-clipboard-manager if WebView asks for permission
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      setUrl(text);
      check(text); // pasted link is checked right away, no Enter needed
    } catch {
      // Clipboard denied: nothing to do
    }
  }

  async function pickFolder() {
    try {
      const folder = await open({
        directory: true,
        title: "Select Download Folder",
        defaultPath: outputDir ?? undefined
      });

      if (folder !== null) {
        setOutputDir(folder);
      }
    } catch (error) {
      // Dialog failed to open: keep the current folder
    }
  }

  async function download(choice: DownloadChoice) {
    if (outputDir === null || video === null) return;

    // Tags the progress events of this download
    const id = crypto.randomUUID();
    setDownloadState({ kind: "downloading", id, progress: null });

    // Subscribe before starting, so the first events aren't lost
    const unlisten = await onDownloadProgress((progress) => {
      if (progress.id === id) setDownloadState({ kind: "downloading", id, progress });
    });

    try {
      const filePath = await startDownload(id, video.url, choice, outputDir);
      setDownloadState({ kind: "done", filePath });
    } catch (error) {
      if (isCancelled(error)) setDownloadState({ kind: "idle" });
      else if (isBotCheck(error)) setDownloadState({ kind: "botCheck" });
      else setDownloadState({ kind: "error", message: getErrorMessage(error) });
    } finally {
      unlisten();
    }
  }

  function cancel() {
    if (downloadState.kind !== "downloading") return;
    // Rust kills yt-dlp; the pending startDownload then rejects with "cancelled"
    cancelDownload(downloadState.id).catch(() => {});
  }

  const video = fetchState.kind === "ready" ? fetchState.video : null;

  return (
    <div className={`mx-auto flex min-h-full max-w-150 flex-col px-6 ${video ? "py-14" : "justify-center pb-20"}`}>
      {!video && fetchState.kind !== "loading" && (
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <h1 className="text-2xl font-semibold tracking-tight lowercase">{APP_NAME}</h1>
          <p className="text-sm text-muted">Download any video — just paste a link</p>
        </div>
      )}

      <UrlInput
        value={url}
        onChange={changeUrl}
        onSubmit={() => check(url)}
        onPaste={paste}
        loading={fetchState.kind === "loading"}
        error={fetchState.kind === "error" ? fetchState.message : null}
      />

      {fetchState.kind === "loading" && <PreviewSkeleton />}
      {fetchState.kind === "botCheck" && <BotCheckNotice />}

      {video && (
        <VideoPreview
          key={video.id}
          video={video}
          outputDir={outputDir}
          onPickFolder={pickFolder}
          onDownload={download}
          downloadState={downloadState}
          onCancel={cancel}
        />
      )}

      {downloadState.kind === "done" && (
        <Toast
          title="Download complete"
          description={video?.title}
          action={{ label: "Show in folder", onClick: () => revealItemInDir(downloadState.filePath) }}
          onClose={() => setDownloadState({ kind: "idle" })}
        />
      )}
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="mt-6 flex animate-pulse gap-4 rounded-2xl border border-line p-4">
      <div className="aspect-video w-44 rounded-lg bg-surface" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-4 w-4/5 rounded bg-surface" />
        <div className="h-4 w-1/2 rounded bg-surface" />
        <div className="h-3 w-1/4 rounded bg-surface" />
      </div>
    </div>
  );
}

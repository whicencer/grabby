import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AppInfo } from "./AppInfo";
import { DownloadChoice, DownloadProgress, VideoInfo } from "../types";
import { mockFetchVideo } from "../mocks/media";
import { mockCancelDownload, mockOnDownloadProgress, mockStartDownload } from "../mocks/mockApi";

// `pnpm tauri:mock`: network commands are replaced by mocks, see src/mocks/mockApi.ts
export const IS_MOCK = import.meta.env.VITE_MOCK === "1";

export const Commands = {
  GET_APP_INFO: "get_app_info",
  VALIDATE_URL: "validate_url",
  FETCH_INFO: "fetch_info",
  START_DOWNLOAD: "start_download",
  CANCEL_DOWNLOAD: "cancel_download",
} as const;

export function getAppInfo() {
  return invoke<AppInfo>(Commands.GET_APP_INFO);
}

export function validateUrl(url: string) {
  return invoke<string>(Commands.VALIDATE_URL, { url });
}

export function fetchInfo(url: string) {
  if (IS_MOCK) return mockFetchVideo(url);
  return invoke<VideoInfo>(Commands.FETCH_INFO, { url });
}

export const Events = {
  DOWNLOAD_PROGRESS: "download-progress",
} as const;

// `id` tags the progress events of this download. Resolves with the saved file path
export function startDownload(id: string, url: string, choice: DownloadChoice, outputDir: string) {
  if (IS_MOCK) return mockStartDownload(id, url, choice, outputDir);
  return invoke<string>(Commands.START_DOWNLOAD, { id, url, choice, outputDir });
}

// The startDownload call with this id then rejects with { kind: "cancelled" }
export function cancelDownload(id: string) {
  if (IS_MOCK) return mockCancelDownload(id);
  return invoke<void>(Commands.CANCEL_DOWNLOAD, { id });
}

// Resolves to an unlisten function: call it when the download is over
export function onDownloadProgress(handler: (progress: DownloadProgress) => void) {
  if (IS_MOCK) return mockOnDownloadProgress(handler);
  return listen<DownloadProgress>(Events.DOWNLOAD_PROGRESS, (event) => handler(event.payload));
}
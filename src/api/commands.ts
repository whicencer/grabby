import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AppInfo } from "./AppInfo";
import { DownloadChoice, DownloadProgress, VideoInfo } from "../types";

export const Commands = {
  GET_APP_INFO: "get_app_info",
  VALIDATE_URL: "validate_url",
  FETCH_INFO: "fetch_info",
  START_DOWNLOAD: "start_download",
} as const;

export function getAppInfo() {
  return invoke<AppInfo>(Commands.GET_APP_INFO);
}

export function validateUrl(url: string) {
  return invoke<string>(Commands.VALIDATE_URL, { url });
}

export function fetchInfo(url: string) {
  return invoke<VideoInfo>(Commands.FETCH_INFO, { url });
}

export const Events = {
  DOWNLOAD_PROGRESS: "download-progress",
} as const;

// `id` tags the progress events of this download. Resolves with the saved file path
export function startDownload(id: string, url: string, choice: DownloadChoice, outputDir: string) {
  return invoke<string>(Commands.START_DOWNLOAD, { id, url, choice, outputDir });
}

// Resolves to an unlisten function: call it when the download is over
export function onDownloadProgress(handler: (progress: DownloadProgress) => void) {
  return listen<DownloadProgress>(Events.DOWNLOAD_PROGRESS, (event) => handler(event.payload));
}
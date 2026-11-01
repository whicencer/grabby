// Error of fetchInfo / startDownload: mirrors YtDlpError in src-tauri/src/lib.rs
export type YtDlpError = { kind: "botCheck" } | { kind: "cancelled" } | { kind: "failed"; message: string };

// YouTube has flagged the user's network as a bot: show the notice, not the raw error
export function isBotCheck(error: unknown): boolean {
  return typeof error === "object" && error !== null && "kind" in error && error.kind === "botCheck";
}

// The user cancelled the download: not an error to show
export function isCancelled(error: unknown): boolean {
  return typeof error === "object" && error !== null && "kind" in error && error.kind === "cancelled";
}

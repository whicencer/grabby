import { useEffect, useState } from "react";
import { ArrowUpCircle } from "lucide-react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getErrorMessage } from "../shared/getErrorMessage";
import { Button } from "./ui";

type UpdateState =
  | { kind: "none" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; percent: number | null }
  | { kind: "error"; message: string };

// Checks the GitHub release once per launch; the update is signed, Tauri verifies it
export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ kind: "none" });

  useEffect(() => {
    // A dev build would "update" itself to the published release
    if (import.meta.env.DEV) return;
    check()
      .then((update) => {
        if (update) setState({ kind: "available", update });
      })
      .catch(() => {
        // Offline or no release yet: we'll check again on the next launch
      });
  }, []);

  async function install(update: Update) {
    let total = 0;
    let downloaded = 0;
    setState({ kind: "installing", percent: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress" && total > 0) {
          downloaded += event.data.chunkLength;
          setState({ kind: "installing", percent: (downloaded / total) * 100 });
        }
      });
      // On Windows the installer has already closed the app by now
      await relaunch();
    } catch (error) {
      setState({ kind: "error", message: getErrorMessage(error) });
    }
  }

  if (state.kind === "none") return null;

  return (
    <div role="status" className="flex items-center gap-3 border-b border-line px-4 py-2 text-sm">
      <ArrowUpCircle className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {state.kind === "available" && `Grabby ${state.update.version} is available`}
        {state.kind === "installing" &&
          `Updating… ${state.percent === null ? "" : `${Math.round(state.percent)}%`}`}
        {state.kind === "error" && `Update failed: ${state.message}`}
      </span>
      {state.kind === "available" && (
        <Button variant="primary" onClick={() => install(state.update)}>
          Update & restart
        </Button>
      )}
      {state.kind === "error" && (
        <Button variant="ghost" onClick={() => setState({ kind: "none" })}>
          Dismiss
        </Button>
      )}
    </div>
  );
}

import { DownloadView } from "./components/DownloadView";
import { UpdateBanner } from "./components/UpdateBanner";
import { VersionLabel } from "./components/VersionLabel";
import { IS_MOCK } from "./api/commands";

function App() {
  return (
    <main className="flex h-screen flex-col bg-bg text-fg">
      <UpdateBanner />
      {/* Only the content scrolls: the update banner must not push it into a scroll */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <DownloadView />
      </div>
      <VersionLabel />
      {IS_MOCK && (
        <span className="fixed top-3 right-3 rounded-md bg-fg px-2 py-0.5 font-mono text-xs text-bg">MOCK</span>
      )}
    </main>
  );
}

export default App;

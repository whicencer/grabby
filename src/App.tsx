import { DownloadView } from "./components/DownloadView";
import { IS_MOCK } from "./api/commands";

function App() {
  return (
    <main className="h-screen overflow-y-auto bg-bg text-fg">
      <DownloadView />
      {IS_MOCK && (
        <span className="fixed top-3 right-3 rounded-md bg-fg px-2 py-0.5 font-mono text-xs text-bg">MOCK</span>
      )}
    </main>
  );
}

export default App;

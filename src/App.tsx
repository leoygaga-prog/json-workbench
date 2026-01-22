import { useEffect } from "react";
import { Code2 } from "lucide-react";
import SourcesPanel from "./components/sources/SourcesPanel";
import BatchPanel from "./components/batch/BatchPanel";
import DetailPanel from "./components/detail/DetailPanel";
import { useFileStore } from "./store/fileStore";
import "./styles/app.css";

export default function App() {
  const initDemoData = useFileStore((state) => state.initDemoData);
  const cacheReady = useFileStore((state) => state.cacheReady);
  const fileCount = useFileStore((state) => state.files.length);

  useEffect(() => {
    if (cacheReady && fileCount === 0) {
      initDemoData();
    }
  }, [cacheReady, fileCount, initDemoData]);

  return (
    <div className="app-shell">
      <header className="app-header">
        {/* Left: Brand */}
        <div className="app-header-brand">
          <div className="app-header-logo">
            <Code2 size={20} strokeWidth={2.5} />
          </div>
          <div className="app-header-brand-text">
            <h1 className="app-header-title">JSON Editor</h1>
            <span className="app-header-tagline">Workbench</span>
          </div>
        </div>

        {/* Right: Meta */}
        <div className="app-header-meta">
          <span className="app-header-credits">Crafted by E1</span>
        </div>
      </header>
      <main className="app-grid">
        <section className="app-column">
          <SourcesPanel />
        </section>
        <section className="app-column">
          <BatchPanel />
        </section>
        <section className="app-column">
          <DetailPanel />
        </section>
      </main>
    </div>
  );
}


import { useMemo } from "react";
import { extractDashboard, ProgressState } from "../lib/lonelog/dashboard";

interface DashboardPanelProps {
  body: string;
}

function ProgressRow({ item }: { item: ProgressState }) {
  const pct = item.total > 0 ? Math.min(100, Math.round((item.current / item.total) * 100)) : 0;
  return (
    <div className="dashboard-progress-row">
      <div className="dashboard-progress-label">
        <span>{item.name}</span>
        <span>{item.current}/{item.total}</span>
      </div>
      <div className="dashboard-progress-bar">
        <div className="dashboard-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPanel({ body }: DashboardPanelProps) {
  const dashboard = useMemo(() => extractDashboard(body), [body]);
  const openThreads = dashboard.threads.filter((t) => t.state.toLowerCase() !== "closed");
  const closedThreads = dashboard.threads.filter((t) => t.state.toLowerCase() === "closed");

  return (
    <div className="dashboard-panel">
      <div className="dashboard-section">
        <h4>Threads</h4>
        {dashboard.threads.length === 0 && <div className="dashboard-empty">No threads tagged yet.</div>}
        {openThreads.map((t) => (
          <div className="dashboard-thread-row" key={t.name}>
            <span className="dashboard-thread-name">{t.name}</span>
            <span className="dashboard-thread-state dashboard-thread-open">{t.state}</span>
          </div>
        ))}
        {closedThreads.length > 0 && (
          <details className="dashboard-closed-threads">
            <summary>{closedThreads.length} closed</summary>
            {closedThreads.map((t) => (
              <div className="dashboard-thread-row" key={t.name}>
                <span className="dashboard-thread-name">{t.name}</span>
                <span className="dashboard-thread-state dashboard-thread-closed">{t.state}</span>
              </div>
            ))}
          </details>
        )}
      </div>
      <div className="dashboard-section">
        <h4>Clocks</h4>
        {dashboard.clocks.length === 0 && <div className="dashboard-empty">No clocks tagged yet.</div>}
        {dashboard.clocks.map((c) => (
          <ProgressRow key={c.name} item={c} />
        ))}
      </div>
      <div className="dashboard-section">
        <h4>Tracks</h4>
        {dashboard.tracks.length === 0 && <div className="dashboard-empty">No tracks tagged yet.</div>}
        {dashboard.tracks.map((t) => (
          <ProgressRow key={t.name} item={t} />
        ))}
      </div>
    </div>
  );
}

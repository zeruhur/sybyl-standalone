import { ReactNode } from "react";

export type DrawerTab = "toolkit" | "dashboard" | "info";

export interface DrawerPane {
  id: DrawerTab;
  label: string;
  /** Null when the pane can't be shown right now (e.g. Dashboard with no note open). */
  content: ReactNode | null;
}

interface SideDrawerProps {
  open: boolean;
  tab: DrawerTab;
  panes: DrawerPane[];
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
}

/** Right-hand panel beside the editor (a bottom sheet on narrow viewports). Every available pane
 * stays mounted and is only hidden when inactive, so e.g. a Toolkit roll result survives a quick
 * look at the Dashboard. */
export default function SideDrawer({ open, tab, panes, onTabChange, onClose }: SideDrawerProps) {
  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="side-drawer" aria-label="Side panel">
        <div className="drawer-tabs" role="tablist">
          {panes.map((pane) => (
            <button
              key={pane.id}
              role="tab"
              aria-selected={tab === pane.id}
              className={`drawer-tab${tab === pane.id ? " active" : ""}`}
              disabled={pane.content === null}
              onClick={() => onTabChange(pane.id)}
            >
              {pane.label}
            </button>
          ))}
          <button className="drawer-close" onClick={onClose} title="Close panel">×</button>
        </div>
        <div className="drawer-body">
          {panes.map((pane) =>
            pane.content === null ? null : (
              <div key={pane.id} className="drawer-pane" role="tabpanel" hidden={tab !== pane.id}>
                {pane.content}
              </div>
            )
          )}
          {panes.find((p) => p.id === tab)?.content === null && (
            <div className="drawer-empty">Open a note to see this panel.</div>
          )}
        </div>
      </aside>
    </>
  );
}

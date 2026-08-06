import { useState } from "react";
import { NoteFrontMatter } from "../lib/types";

interface CampaignInfoPanelProps {
  fm: NoteFrontMatter;
}

const CAMPAIGN_INFO_FIELDS: { key: keyof NoteFrontMatter; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "player", label: "Player" },
  { key: "ruleset", label: "Ruleset" },
  { key: "genre", label: "Genre" },
  { key: "pcs", label: "PCs" },
  { key: "start_date", label: "Start date" },
  { key: "last_update", label: "Last update" },
  { key: "tools", label: "Tools" },
  { key: "themes", label: "Themes" },
  { key: "tone", label: "Tone" },
  { key: "notes", label: "Notes" }
];

export default function CampaignInfoPanel({ fm }: CampaignInfoPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="campaign-info-panel">
      <button className="campaign-info-toggle" onClick={() => setOpen((v) => !v)}>
        <span>{open ? "▾" : "▸"}</span> Campaign Info
      </button>
      {open && (
        <div className="campaign-info-grid">
          {CAMPAIGN_INFO_FIELDS.map(({ key, label }) => (
            <div className="campaign-info-row" key={key}>
              <span className="campaign-info-label">{label}</span>
              <span className="campaign-info-value">{fm[key] ? String(fm[key]) : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { NoteFrontMatter } from "../lib/types";

interface CampaignInfoPanelProps {
  fm: NoteFrontMatter;
  onEdit: () => void;
}

const CAMPAIGN_INFO_FIELDS: { key: keyof NoteFrontMatter; label: string; wide?: boolean }[] = [
  { key: "title", label: "Title" },
  { key: "session_type", label: "Type" },
  { key: "player", label: "Player" },
  { key: "ruleset", label: "Ruleset" },
  { key: "genre", label: "Genre" },
  { key: "pcs", label: "PCs" },
  { key: "start_date", label: "Start date" },
  { key: "last_update", label: "Last update" },
  { key: "tools", label: "Tools" },
  { key: "themes", label: "Themes" },
  { key: "tone", label: "Tone" },
  { key: "notes", label: "Notes" },
  { key: "game_context", label: "Game context", wide: true }
];

function displayValue(fm: NoteFrontMatter, key: keyof NoteFrontMatter): string {
  if (key === "session_type") return fm.session_type === "one_shot" ? "One-shot" : "Campaign";
  return fm[key] ? String(fm[key]) : "—";
}

export default function CampaignInfoPanel({ fm, onEdit }: CampaignInfoPanelProps) {
  return (
    <div className="campaign-info-panel">
      <div className="campaign-info-grid">
        {CAMPAIGN_INFO_FIELDS.map(({ key, label, wide }) => (
          <div className={`campaign-info-row${wide ? " campaign-info-row-wide" : ""}`} key={key}>
            <span className="campaign-info-label">{label}</span>
            <span className="campaign-info-value" title={fm[key] ? String(fm[key]) : undefined}>
              {displayValue(fm, key)}
            </span>
          </div>
        ))}
      </div>
      <button className="campaign-info-edit" onClick={onEdit}>Edit campaign info</button>
    </div>
  );
}

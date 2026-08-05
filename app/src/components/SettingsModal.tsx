import { useState } from "react";
import { ProviderID, SybylSettings } from "../lib/types";

interface SettingsModalProps {
  settings: SybylSettings;
  onSave: (settings: SybylSettings) => void;
  onClose: () => void;
}

const PROVIDER_LABELS: Record<ProviderID, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "OpenAI",
  gemini: "Gemini",
  ollama: "Ollama (local)"
};

export default function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [draft, setDraft] = useState<SybylSettings>(structuredClone(settings));

  function save() {
    onSave(draft);
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label className="modal-field">
          <span>Active provider</span>
          <select
            value={draft.activeProvider}
            onChange={(e) => setDraft({ ...draft, activeProvider: e.currentTarget.value as ProviderID })}
          >
            {(Object.keys(PROVIDER_LABELS) as ProviderID[]).map((id) => (
              <option key={id} value={id}>{PROVIDER_LABELS[id]}</option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Claude</legend>
          <label className="modal-field">
            <span>API key</span>
            <input
              type="password"
              value={draft.providers.anthropic.apiKey}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, anthropic: { ...draft.providers.anthropic, apiKey: e.currentTarget.value } }
                })
              }
            />
          </label>
          <label className="modal-field">
            <span>Model</span>
            <input
              value={draft.providers.anthropic.defaultModel}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, anthropic: { ...draft.providers.anthropic, defaultModel: e.currentTarget.value } }
                })
              }
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>OpenAI</legend>
          <label className="modal-field">
            <span>API key</span>
            <input
              type="password"
              value={draft.providers.openai.apiKey}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, openai: { ...draft.providers.openai, apiKey: e.currentTarget.value } }
                })
              }
            />
          </label>
          <label className="modal-field">
            <span>Model</span>
            <input
              value={draft.providers.openai.defaultModel}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, openai: { ...draft.providers.openai, defaultModel: e.currentTarget.value } }
                })
              }
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Gemini</legend>
          <label className="modal-field">
            <span>API key</span>
            <input
              type="password"
              value={draft.providers.gemini.apiKey}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, gemini: { ...draft.providers.gemini, apiKey: e.currentTarget.value } }
                })
              }
            />
          </label>
          <label className="modal-field">
            <span>Model</span>
            <input
              value={draft.providers.gemini.defaultModel}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, gemini: { ...draft.providers.gemini, defaultModel: e.currentTarget.value } }
                })
              }
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Ollama</legend>
          <label className="modal-field">
            <span>Base URL</span>
            <input
              value={draft.providers.ollama.baseUrl}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, ollama: { ...draft.providers.ollama, baseUrl: e.currentTarget.value } }
                })
              }
            />
          </label>
          <label className="modal-field">
            <span>Model</span>
            <input
              value={draft.providers.ollama.defaultModel}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, ollama: { ...draft.providers.ollama, defaultModel: e.currentTarget.value } }
                })
              }
            />
          </label>
        </fieldset>

        <p className="settings-note">
          API keys are stored locally in this device's app data folder. OS keychain integration is planned for a later pass.
        </p>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

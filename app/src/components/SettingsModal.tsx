import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
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
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  function save() {
    onSave(draft);
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Settings {version && <span className="version-tag">v{version}</span>}</h2>

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

        <label className="modal-field">
          <span>Default max output tokens</span>
          <input
            type="number"
            min={1}
            value={draft.defaultMaxOutputTokens}
            onChange={(e) => {
              const next = Number(e.currentTarget.value) || 1;
              setDraft((d) => ({ ...d, defaultMaxOutputTokens: next }));
            }}
          />
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
          API keys are stored in this device's OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service), not in plain text.
        </p>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

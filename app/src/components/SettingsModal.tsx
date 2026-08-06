import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ProviderID, SybylSettings } from "../lib/types";
import { getProvider } from "../lib/providers";

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

interface ModelFieldProps {
  providerId: ProviderID;
  value: string;
  models: string[];
  loading: boolean;
  onChange: (value: string) => void;
  onRefresh: () => void;
}

function ModelField({ providerId, value, models, loading, onChange, onRefresh }: ModelFieldProps) {
  const listId = `models-${providerId}`;
  return (
    <label className="modal-field">
      <span>Model</span>
      <div className="model-field-row">
        <input list={listId} value={value} onChange={(e) => onChange(e.currentTarget.value)} />
        <button type="button" onClick={onRefresh} disabled={loading} title="Fetch available models from the provider">
          {loading ? "..." : "Refresh"}
        </button>
      </div>
      <datalist id={listId}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </label>
  );
}

export default function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [draft, setDraft] = useState<SybylSettings>(structuredClone(settings));
  const [version, setVersion] = useState("");
  const [modelOptions, setModelOptions] = useState<Partial<Record<ProviderID, string[]>>>({});
  const [loadingModels, setLoadingModels] = useState<Partial<Record<ProviderID, boolean>>>({});

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  function save() {
    onSave(draft);
    onClose();
  }

  async function refreshModels(providerId: ProviderID) {
    setLoadingModels((prev) => ({ ...prev, [providerId]: true }));
    try {
      const models = await getProvider(draft, providerId).listModels();
      if (models.length > 0) {
        setModelOptions((prev) => ({ ...prev, [providerId]: models }));
      }
    } catch {
      // Silent fallback — the Model field stays free-text, matching the original plugin's behavior.
    } finally {
      setLoadingModels((prev) => ({ ...prev, [providerId]: false }));
    }
  }

  function setModel(providerId: ProviderID, value: string) {
    setDraft((d) => ({
      ...d,
      providers: { ...d.providers, [providerId]: { ...d.providers[providerId], defaultModel: value } }
    }));
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
          <ModelField
            providerId="anthropic"
            value={draft.providers.anthropic.defaultModel}
            models={modelOptions.anthropic ?? []}
            loading={loadingModels.anthropic ?? false}
            onChange={(v) => setModel("anthropic", v)}
            onRefresh={() => refreshModels("anthropic")}
          />
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
          <ModelField
            providerId="openai"
            value={draft.providers.openai.defaultModel}
            models={modelOptions.openai ?? []}
            loading={loadingModels.openai ?? false}
            onChange={(v) => setModel("openai", v)}
            onRefresh={() => refreshModels("openai")}
          />
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
          <ModelField
            providerId="gemini"
            value={draft.providers.gemini.defaultModel}
            models={modelOptions.gemini ?? []}
            loading={loadingModels.gemini ?? false}
            onChange={(v) => setModel("gemini", v)}
            onRefresh={() => refreshModels("gemini")}
          />
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
          <ModelField
            providerId="ollama"
            value={draft.providers.ollama.defaultModel}
            models={modelOptions.ollama ?? []}
            loading={loadingModels.ollama ?? false}
            onChange={(v) => setModel("ollama", v)}
            onRefresh={() => refreshModels("ollama")}
          />
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

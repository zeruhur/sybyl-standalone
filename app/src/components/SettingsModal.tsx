import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
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

const PROVIDER_KEY_LINKS: Record<ProviderID, { label: string; url: string }> = {
  anthropic: { label: "Get API key ↗", url: "https://console.anthropic.com/settings/keys" },
  openai: { label: "Get API key ↗", url: "https://platform.openai.com/api-keys" },
  gemini: { label: "Get API key ↗", url: "https://aistudio.google.com/apikey" },
  ollama: { label: "Ollama website ↗", url: "https://ollama.com" }
};

function ProviderLink({ providerId }: { providerId: ProviderID }) {
  const link = PROVIDER_KEY_LINKS[providerId];
  return (
    <button type="button" className="link-button provider-link" onClick={() => void openUrl(link.url)}>
      {link.label}
    </button>
  );
}

interface ModelFieldProps {
  providerId: ProviderID;
  value: string;
  models: string[];
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onRefresh: () => void;
}

// A plain <input list>/<datalist> combo is the more "standard" HTML pattern, but WebView2
// (what Tauri actually embeds on Windows) renders its dropdown affordance far less visibly than
// desktop Chrome does — confirmed by testing the same markup in both. A real <select> is
// unambiguous and reliably rendered as an actual dropdown across every webview, so it's the only
// control here — the current value is kept selectable even before a refresh (or if it's since
// fallen out of the provider's returned list) by injecting it into the option set.
function ModelField({ value, models, loading, error, onChange, onRefresh }: ModelFieldProps) {
  const options = value && !models.includes(value) ? [value, ...models] : models;
  return (
    <label className="modal-field">
      <span>Model</span>
      <div className="model-field-row">
        <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
          {options.length === 0 && <option value="">No model set — refresh to list options</option>}
          {options.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button type="button" onClick={onRefresh} disabled={loading} title="Fetch available models from the provider">
          {loading ? "..." : "Refresh"}
        </button>
      </div>
      {error && <p className="model-field-error">{error}</p>}
    </label>
  );
}

export default function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [draft, setDraft] = useState<SybylSettings>(structuredClone(settings));
  const [version, setVersion] = useState("");
  const [modelOptions, setModelOptions] = useState<Partial<Record<ProviderID, string[]>>>({});
  const [loadingModels, setLoadingModels] = useState<Partial<Record<ProviderID, boolean>>>({});
  const [modelErrors, setModelErrors] = useState<Partial<Record<ProviderID, string>>>({});

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  function save() {
    onSave(draft);
    onClose();
  }

  async function refreshModels(providerId: ProviderID) {
    setLoadingModels((prev) => ({ ...prev, [providerId]: true }));
    setModelErrors((prev) => ({ ...prev, [providerId]: undefined }));
    try {
      const models = await getProvider(draft, providerId).listModels();
      if (models.length > 0) {
        setModelOptions((prev) => ({ ...prev, [providerId]: models }));
      } else {
        setModelErrors((prev) => ({
          ...prev,
          [providerId]: "No models returned — check the API key and network connection."
        }));
      }
    } catch (error) {
      setModelErrors((prev) => ({
        ...prev,
        [providerId]: error instanceof Error ? error.message : "Failed to fetch models."
      }));
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
          <legend>Claude <ProviderLink providerId="anthropic" /></legend>
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
            error={modelErrors.anthropic ?? null}
            onChange={(v) => setModel("anthropic", v)}
            onRefresh={() => refreshModels("anthropic")}
          />
        </fieldset>

        <fieldset>
          <legend>OpenAI <ProviderLink providerId="openai" /></legend>
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
            error={modelErrors.openai ?? null}
            onChange={(v) => setModel("openai", v)}
            onRefresh={() => refreshModels("openai")}
          />
        </fieldset>

        <fieldset>
          <legend>Gemini <ProviderLink providerId="gemini" /></legend>
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
            error={modelErrors.gemini ?? null}
            onChange={(v) => setModel("gemini", v)}
            onRefresh={() => refreshModels("gemini")}
          />
        </fieldset>

        <fieldset>
          <legend>Ollama <ProviderLink providerId="ollama" /></legend>
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
            error={modelErrors.ollama ?? null}
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

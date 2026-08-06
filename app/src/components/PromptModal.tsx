import { useState } from "react";

export interface PromptField {
  key: string;
  label: string;
  placeholder?: string;
  optional?: boolean;
  defaultValue?: string;
}

interface PromptModalProps {
  title: string;
  fields: PromptField[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export default function PromptModal({ title, fields, onSubmit, onCancel }: PromptModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.filter((f) => f.defaultValue).map((f) => [f.key, f.defaultValue as string]))
  );
  const [invalidKeys, setInvalidKeys] = useState<Set<string>>(new Set());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = fields.filter((field) => !field.optional && !values[field.key]?.trim());
    if (missing.length > 0) {
      setInvalidKeys(new Set(missing.map((f) => f.key)));
      return;
    }
    setInvalidKeys(new Set());
    onSubmit(values);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <form onSubmit={handleSubmit}>
          {fields.map((field) => (
            <label className="modal-field" key={field.key}>
              <span>{field.label}{field.optional ? " (optional)" : ""}</span>
              <input
                autoFocus={field === fields[0]}
                placeholder={field.placeholder}
                value={values[field.key] ?? ""}
                className={invalidKeys.has(field.key) ? "field-invalid" : undefined}
                onChange={(e) => {
                  const next = e.target.value;
                  setValues((v) => ({ ...v, [field.key]: next }));
                  if (invalidKeys.has(field.key) && next.trim()) {
                    setInvalidKeys((prev) => {
                      const next = new Set(prev);
                      next.delete(field.key);
                      return next;
                    });
                  }
                }}
              />
              {invalidKeys.has(field.key) && <span className="field-error">Required</span>}
            </label>
          ))}
          <div className="modal-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="submit">Confirm</button>
          </div>
        </form>
      </div>
    </div>
  );
}

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const field of fields) {
      if (!field.optional && !values[field.key]?.trim()) {
        return;
      }
    }
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
                onChange={(e) => {
                  const next = e.target.value;
                  setValues((v) => ({ ...v, [field.key]: next }));
                }}
              />
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

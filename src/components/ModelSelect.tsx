import { groupModels } from '../providers';
import type { ModelInfo } from '../domain/types';

export type ModelChoice = { kind: 'auto' } | { kind: 'inherit' } | { kind: 'model'; id: string };

const AUTO = '__auto__';
const INHERIT = '__inherit__';

export const modelLabel = (m: ModelInfo | undefined, id: string) => (m?.label && m.label !== id ? `${m.label} (${id})` : id);

/**
 * Every model the key can call, grouped (recommended → cheap → strong → latest
 * aliases → previews → others → special-purpose), labelled like the provider's
 * own list: "Gemini 3.5 Flash (gemini-3.5-flash)". Nothing is hidden; the user
 * can always pick freely. Optional first entries: automatic choice, or inherit
 * the key's setting.
 */
export function ModelSelect({
  models,
  value,
  onChange,
  autoOption,
  inheritOption,
  className = 'input',
  disabled,
  id,
}: {
  models: ModelInfo[];
  /** Selected model id, or null when the auto/inherit option is selected. */
  value: string | null;
  onChange: (c: ModelChoice) => void;
  autoOption?: string;
  inheritOption?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}) {
  const byId = new Map(models.map((m) => [m.id, m]));
  const groups = groupModels(models.map((m) => m.id));
  const selected = value ?? (autoOption ? AUTO : INHERIT);
  return (
    <select
      id={id}
      className={className}
      value={selected}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === AUTO ? { kind: 'auto' } : v === INHERIT ? { kind: 'inherit' } : { kind: 'model', id: v });
      }}
    >
      {autoOption && <option value={AUTO}>{autoOption}</option>}
      {inheritOption && <option value={INHERIT}>{inheritOption}</option>}
      {value && !byId.has(value) && <option value={value}>{value} (tidak ada di daftar akun)</option>}
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.ids.map((id) => (
            <option key={id} value={id}>
              {modelLabel(byId.get(id), id)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

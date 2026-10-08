/**
 * Model selection that does not go stale: instead of hard-coding a model that
 * the provider may retire, we read the account's live model list and pick the
 * newest *stable* model of the right tier.
 */

export type ModelTier = 'recommended' | 'cheap' | 'strong';

export interface RankedModel {
  id: string;
  tier: ModelTier | 'other';
  stable: boolean;
  version: number[];
}

/** Non-text or special-purpose models that cannot write question sets. */
const NOT_TEXT = /(embed|tts|audio|realtime|live|image|imagen|veo|whisper|dall-?e|transcribe|search|moderation|computer|codex|instruct|aqa|gemma|learnlm|robotics|native|vision|guard|rerank|ocr|deep-research|chat-latest)/i;
/** Labels that mean "may change or disappear without notice". */
const UNSTABLE = /(preview|exp\b|experimental|-exp-|beta|alpha|thinking-exp)/i;

/** Strip an OpenRouter-style "vendor/" prefix and ":variant" suffix. */
const bare = (id: string) => id.replace(/^.*\//, '').replace(/:.*$/, '');

// Tier patterns per family. Version captured in group 1 (and 2 for Claude's "4-5").
const FAMILIES: { tier: ModelTier; re: RegExp }[] = [
  { tier: 'recommended', re: /^gemini-(\d+(?:\.\d+)?)-flash(?:-\d{3})?$/ },
  { tier: 'cheap', re: /^gemini-(\d+(?:\.\d+)?)-flash-lite(?:-\d{3})?$/ },
  { tier: 'strong', re: /^gemini-(\d+(?:\.\d+)?)-pro(?:-\d{3})?$/ },
  { tier: 'recommended', re: /^gpt-(\d+(?:\.\d+)?)-mini(?:-\d{4}-\d{2}-\d{2})?$/ },
  { tier: 'cheap', re: /^gpt-(\d+(?:\.\d+)?)-nano(?:-\d{4}-\d{2}-\d{2})?$/ },
  { tier: 'strong', re: /^gpt-(\d+(?:\.\d+)?)(?:-\d{4}-\d{2}-\d{2})?$/ },
  { tier: 'recommended', re: /^claude-sonnet-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/ },
  { tier: 'cheap', re: /^claude-haiku-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/ },
  { tier: 'strong', re: /^claude-opus-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/ },
];

/** Moving aliases that always point at a current model (used only as a last resort). */
const ALIASES: Record<ModelTier, RegExp> = {
  recommended: /^gemini-flash-latest$/,
  cheap: /^gemini-flash-lite-latest$/,
  strong: /^gemini-pro-latest$/,
};

const isDated = (id: string) => /-\d{8}$|-\d{4}-\d{2}-\d{2}$|-\d{3}$/.test(id);

export function rankModel(id: string): RankedModel {
  const b = bare(id);
  const stable = !UNSTABLE.test(b);
  if (NOT_TEXT.test(b)) return { id, tier: 'other', stable, version: [] };
  // "gemini-3-flash-preview-05-20" → "gemini-3-flash" so previews still land in their family.
  const core = b.replace(/-(preview|exp|experimental|beta|alpha)(-[\w.-]*)?$/i, '');
  for (const f of FAMILIES) {
    const m = core.match(f.re);
    if (m) {
      const version = m[1].includes('.') ? m[1].split('.').map(Number) : [Number(m[1]), Number(m[2] ?? 0)];
      return { id, tier: f.tier, stable, version };
    }
  }
  return { id, tier: 'other', stable, version: [] };
}

function cmpVersion(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Newest first; undated alias beats a dated snapshot of the same version. */
function newest(list: RankedModel[]): RankedModel[] {
  return [...list].sort((a, b) => cmpVersion(b.version, a.version) || Number(isDated(bare(a.id))) - Number(isDated(bare(b.id))) || a.id.localeCompare(b.id));
}

export function bestOfTier(ids: string[], tier: ModelTier, allowUnstable = false): string | undefined {
  const ranked = ids.map(rankModel).filter((m) => m.tier === tier && (allowUnstable || m.stable));
  return newest(ranked)[0]?.id;
}

/**
 * Pick the model to use for question generation:
 * newest stable "recommended" tier → newest stable cheap → newest stable strong
 * → a provider "latest" alias → newest preview of the recommended tier.
 */
export function pickRecommendedModel(ids: string[]): string | undefined {
  return (
    bestOfTier(ids, 'recommended') ??
    bestOfTier(ids, 'cheap') ??
    bestOfTier(ids, 'strong') ??
    ids.find((id) => ALIASES.recommended.test(bare(id))) ??
    bestOfTier(ids, 'recommended', true)
  );
}

export interface ModelGroup {
  label: string;
  ids: string[];
}

/** Group a provider's list for the model picker, newest first, junk hidden. */
export function groupModels(ids: string[]): ModelGroup[] {
  const ranked = ids.map(rankModel);
  const pick = (tier: ModelTier, stable: boolean) => newest(ranked.filter((m) => m.tier === tier && m.stable === stable)).map((m) => m.id);
  const aliases = ids.filter((id) => Object.values(ALIASES).some((re) => re.test(bare(id))));
  const groups: ModelGroup[] = [
    { label: 'Direkomendasikan (stabil, seimbang)', ids: pick('recommended', true) },
    { label: 'Hemat (stabil)', ids: pick('cheap', true) },
    { label: 'Paling kuat (stabil, lebih mahal)', ids: pick('strong', true) },
    { label: 'Alias "latest" (selalu terbaru, bisa berubah)', ids: aliases },
    {
      label: 'Preview (terbaru, bisa berubah atau dihentikan)',
      ids: newest(ranked.filter((m) => m.tier !== 'other' && !m.stable)).map((m) => m.id),
    },
    {
      label: 'Lainnya',
      ids: ranked
        .filter((m) => m.tier === 'other' && !NOT_TEXT.test(bare(m.id)) && !aliases.includes(m.id))
        .map((m) => m.id)
        .sort(),
    },
  ];
  return groups.filter((g) => g.ids.length);
}

/** Error text that means the configured model is gone or not available to this key. */
export function isModelUnavailable(status: number | undefined, message: string): boolean {
  if (status === 404) return true;
  return /(model[^.]*(not found|does not exist|no longer|deprecated|not supported|unavailable|not available))|(no longer available)/i.test(message);
}

/**
 * Providers often name the replacement in the retirement error, e.g. Gemini:
 * "...no longer available to new users. Please update your code to use models/gemini-3.8-flash".
 */
export function suggestedReplacement(message: string): string | undefined {
  const m = message.match(/\b(?:use|switch to|migrate to|upgrade to)\s+(?:the\s+)?(?:model\s+)?[`'"]?(?:models\/)?([a-z][a-z0-9.-]*\d[a-z0-9.-]*?)[`'".,;)]?(?:\s|$)/i);
  if (!m) return undefined;
  const id = m[1].replace(/[.-]+$/, '');
  return rankModel(id).tier === 'other' ? undefined : id;
}

/** Rough price per 1M tokens by model family, for models not in the price table. */
export function familyPrice(model: string): { input: number; output: number } | undefined {
  const id = bare(model);
  if (/flash-lite/.test(id)) return { input: 0.1, output: 0.4 };
  if (/flash/.test(id)) return { input: 0.5, output: 3 };
  if (/gemini.*pro/.test(id)) return { input: 2, output: 12 };
  if (/nano/.test(id)) return { input: 0.2, output: 1.25 };
  if (/gpt.*mini/.test(id)) return { input: 0.75, output: 4.5 };
  if (/^gpt-\d/.test(id)) return { input: 5, output: 30 };
  if (/haiku/.test(id)) return { input: 1, output: 5 };
  if (/sonnet/.test(id)) return { input: 2, output: 10 };
  if (/opus/.test(id)) return { input: 4, output: 20 };
  return undefined;
}

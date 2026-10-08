export type Subtest = 'TWK' | 'TIU' | 'TKP';
export const SUBTESTS: Subtest[] = ['TWK', 'TIU', 'TKP'];

export type Difficulty = 'mudah' | 'sedang' | 'sulit';
export type DifficultyChoice = Difficulty | 'campuran';

export type OptionLabel = 'A' | 'B' | 'C' | 'D' | 'E';
export const OPTION_LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];

/** Figural cell used by in-app SVG rendering for TIU figural questions. */
export type ShapeKind = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'arrow' | 'pentagon';
export type Fill = 'solid' | 'empty' | 'striped';
export interface FigureCell {
  shape: ShapeKind;
  fill: Fill;
  rotation: number; // degrees
  count: number; // 1-4 copies of the shape
}
export interface Figure {
  layout: 'series' | 'analogy';
  /** `null` marks the "?" cell. */
  cells: (FigureCell | null)[];
}

export interface QuestionOption {
  label: OptionLabel;
  text: string;
  /** TWK/TIU: 5 for the correct option, 0 otherwise. TKP: 1-5. */
  score: number;
  figure?: FigureCell;
}

export type FlagKind =
  | 'math-mismatch'
  | 'math-corrected'
  | 'tkp-spread'
  | 'twk-unverified'
  | 'low-confidence'
  | 'structure'
  | 'duplicate';

export interface Flag {
  kind: FlagKind;
  message: string;
  severity: 'info' | 'warn';
}

export interface Question {
  id: string;
  subtest: Subtest;
  topic: string;
  difficulty: Difficulty;
  stem: string;
  options: QuestionOption[];
  /** Correct label for TWK/TIU. Undefined for TKP. */
  answer?: OptionLabel;
  explanation: string;
  /** TWK: legal basis / historical reference. */
  reference?: string;
  confidence?: 'high' | 'low';
  /** TIU numerical: expression that mathjs evaluates to the correct answer. */
  mathExpression?: string;
  figure?: Figure;
  flags: Flag[];
  locked: boolean;
  starred: boolean;
  hash: string;
  originSetId?: string;
  source: 'ai' | 'procedural' | 'manual';
  createdAt: number;
  updatedAt: number;
}

export interface SectionSpec {
  subtest: Subtest;
  count: number;
  topics: string[];
  difficulty: DifficultyChoice;
}

export interface Blueprint {
  sections: SectionSpec[];
  durationMinutes: number;
  passing: Record<Subtest, number>;
}

export interface BatchItem {
  topic: string;
  difficulty: Difficulty;
}

export interface PlanBatch {
  id: string;
  subtest: Subtest;
  /** One entry per question to write; a batch may mix topics of the same sub-test. */
  items: BatchItem[];
  count: number;
  status: 'pending' | 'done' | 'failed';
  error?: string;
  /** Question IDs this batch should rewrite / mirror. */
  basedOn?: string[];
}

export type SetStatus = 'draft' | 'generating' | 'paused' | 'ready';

export interface QSet {
  id: string;
  name: string;
  blueprint: Blueprint;
  questionIds: string[];
  status: SetStatus;
  source: 'ai' | 'bank' | 'variant' | 'remedial';
  batches: PlanBatch[];
  keyId?: string;
  usage: { inputTokens: number; outputTokens: number; requests: number };
  createdAt: number;
  updatedAt: number;
}

export interface SubtestResult {
  subtest: Subtest;
  score: number;
  max: number;
  passing: number;
  passed: boolean;
  correct: number;
  answered: number;
  total: number;
}

export interface TopicResult {
  subtest: Subtest;
  topic: string;
  score: number;
  max: number;
  total: number;
}

export interface AttemptResult {
  perSubtest: SubtestResult[];
  topics: TopicResult[];
  total: number;
  maxTotal: number;
  passedAll: boolean;
}

export interface Attempt {
  id: string;
  setId: string;
  setName: string;
  questionIds: string[];
  startedAt: number;
  endsAt: number;
  finishedAt?: number;
  answers: Record<string, OptionLabel>;
  flagged: string[];
  timeSpent: Record<string, number>;
  currentIndex: number;
  passing: Record<Subtest, number>;
  result?: AttemptResult;
}

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'compat';

export interface ApiKeyRecord {
  id: string;
  provider: ProviderId;
  label: string;
  model: string;
  baseUrl?: string;
  cipher: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  isDefault: boolean;
  createdAt: number;
  /** Self-imposed rate limits matching the key's plan (0 = no limit). */
  limits?: KeyLimits;
  /** When true, the app keeps `model` on the newest stable recommended model. */
  autoModel?: boolean;
  modelCheckedAt?: number;
}

export interface KeyLimits {
  /** Requests per minute. */
  rpm: number;
  /** Input tokens per minute. */
  tpm: number;
  /** Requests per day. */
  rpd: number;
}

export interface RequestLog {
  id?: number;
  keyId: string;
  at: number;
  inputTokens: number;
}

export interface Settings {
  passing: Record<Subtest, number>;
  counts: Record<Subtest, number>;
  durationMinutes: number;
  /** Questions requested per AI call. Larger = fewer requests (better for free tiers). */
  questionsPerRequest: number;
  concurrency: number;
  brandName: string;
  brandLogo?: string;
  /** USD per 1M tokens, keyed by model id; fallback used when unknown. */
  priceOverrides: Record<string, { input: number; output: number }>;
}

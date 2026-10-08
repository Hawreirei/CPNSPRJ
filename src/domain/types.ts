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
  /**
   * series: a row of steps; analogy: a : b :: c : ?; matrix: 3×3, row by row; transform: a figure
   * and its rotated or mirrored result; odd-one-out: no stem figure, the five options are the puzzle.
   */
  layout: 'series' | 'analogy' | 'matrix' | 'transform' | 'odd-one-out';
  /** `null` marks the "?" cell. */
  cells: (FigureCell | null)[];
}

export interface Passage {
  id: string;
  title?: string;
  text: string;
  /** The group's questions in reading order; the database returns them in no particular order. */
  questionIds?: string[];
}

export interface DataSeries {
  name: string;
  values: number[];
}

/** Numbers drawn by the app for a data-analysis question. */
export interface DataFigure {
  kind: 'table' | 'bar' | 'line' | 'pie';
  title: string;
  /** Unit of the values ("ton", "orang"); a pie chart's values are percentages. */
  unit: string;
  /** Heading of the category column, e.g. "Tahun" or "Kecamatan". */
  category: string;
  labels: string[];
  /** Charts plot one series (one axis, no legend); a table may have several columns. */
  series: DataSeries[];
}

export interface QuestionOption {
  label: OptionLabel;
  text: string;
  /** TWK/TIU: 5 for the correct option, 0 otherwise. TKP: 1-5. */
  score: number;
  /** TKP: why this option earns its score (asked for on hard questions). */
  rationale?: string;
  figure?: FigureCell;
}

export type FlagKind =
  | 'math-mismatch'
  | 'math-corrected'
  | 'explanation-mismatch'
  | 'tkp-spread'
  | 'twk-unverified'
  | 'low-confidence'
  | 'structure'
  | 'duplicate'
  /** A second model, shown no key, picked another option. */
  | 'cross-check-mismatch'
  /** A second model, shown no key, picked the same option. */
  | 'cross-checked'
  /** Cross-check was on but could not run for this question (e.g. quota used up). */
  | 'cross-check-pending'
  /** The learner reported a problem; mirrors `Question.report` until they withdraw it. */
  | 'user-report';

export type ReportReason = 'kunci-salah' | 'ambigu' | 'usang' | 'typo' | 'lainnya';

export interface QuestionReport {
  reason: ReportReason;
  note?: string;
  at: number;
}

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
  /** TIU data analysis: the numbers the question is about, shown as a table or a chart. */
  data?: DataFigure;
  /**
   * A reading text shared by a group of questions. Each question in the group carries the same
   * passage (same id), so every view and export has it without a lookup.
   */
  passage?: Passage;
  flags: Flag[];
  locked: boolean;
  starred: boolean;
  hash: string;
  originSetId?: string;
  /** A problem the learner reported. Kept until they withdraw it; never cleared automatically. */
  report?: QuestionReport;
  /** The learner's 1–5 rating. Low-rated questions are picked last from the bank. */
  rating?: number;
  source: 'ai' | 'procedural' | 'manual';
  createdAt: number;
  updatedAt: number;
}

export interface SectionSpec {
  subtest: Subtest;
  count: number;
  topics: string[];
  difficulty: DifficultyChoice;
  /** Relative share per topic from the syllabus profile; missing means an even spread. */
  weights?: Record<string, number>;
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
  /** Model chosen for this set; overrides the key's model when set. */
  model?: string;
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

/** `exam`: CAT simulation, answers hidden until submit. `practice`: key and explanation shown after each answer. */
export type AttemptMode = 'exam' | 'practice';

export interface Attempt {
  id: string;
  setId: string;
  setName: string;
  /** Missing on attempts saved before practice mode existed; those are exams. */
  mode?: AttemptMode;
  questionIds: string[];
  startedAt: number;
  /** `UNTIMED` when the attempt has no time limit. */
  endsAt: number;
  finishedAt?: number;
  answers: Record<string, OptionLabel>;
  flagged: string[];
  timeSpent: Record<string, number>;
  currentIndex: number;
  passing: Record<Subtest, number>;
  result?: AttemptResult;
}

/** Self-assessment after seeing the explanation in a review. */
export type Grade = 'lupa' | 'sulit' | 'baik' | 'mudah';
export const GRADES: Grade[] = ['lupa', 'sulit', 'baik', 'mudah'];

/** Why a question went wrong, tagged by the learner (optional). */
export type ReasonTag = 'konsep' | 'hitung' | 'terburu' | 'tebakan' | 'paham-soal' | 'waktu';
export const REASON_TAGS: { id: ReasonTag; label: string }[] = [
  { id: 'konsep', label: 'Salah konsep' },
  { id: 'hitung', label: 'Salah hitung' },
  { id: 'terburu', label: 'Terburu-buru' },
  { id: 'tebakan', label: 'Tebakan' },
  { id: 'paham-soal', label: 'Tidak paham soal' },
  { id: 'waktu', label: 'Kehabisan waktu' },
];

/** One entry in the mistake notebook, scheduled with SM-2. Keyed by question. */
export interface ReviewItem {
  questionId: string;
  /** Local midnight of the day the item is due. */
  due: number;
  /** Days until the next review; 0 = never reviewed. */
  interval: number;
  ease: number;
  /** Successful reviews in a row. */
  reps: number;
  /** Times forgotten: graded "Lupa", or wrong again in a later attempt. */
  lapses: number;
  reasonTags: ReasonTag[];
  addedAt: number;
  lastReviewedAt?: number;
  lastGrade?: Grade;
  /** Attempt that first added the question. */
  sourceAttemptId?: string;
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
  /** Cached model list from the provider (with display names when the provider gives them). */
  models?: ModelInfo[];
  modelsFetchedAt?: number;
  /** When true, the app keeps `model` on the newest stable recommended model. */
  autoModel?: boolean;
  modelCheckedAt?: number;
}

export interface ModelInfo {
  id: string;
  /** Provider's display name, e.g. "Gemini 3.5 Flash". */
  label?: string;
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

/** The learner's own plan. Every field is optional: a plan without an exam date still sets daily targets. */
export interface StudyPlan {
  /** Local calendar date, YYYY-MM-DD. */
  examDate?: string;
  /** Target per sub-test on the full-length scale; missing ones default to the pass mark + 10%. */
  targets?: Partial<Record<Subtest, number>>;
  minutesPerDay?: number;
  /** Day of the weekly full simulation, 0 = Sunday … 6 = Saturday. */
  simulationDay?: number;
}

export interface KisiTopic {
  name: string;
  /** Relative share of questions; 1 when missing. */
  weight?: number;
}

/** The exam's shape a syllabus profile can carry; applied to Settings when the profile is chosen. */
export interface ExamNumbers {
  counts: Record<Subtest, number>;
  passing: Record<Subtest, number>;
  durationMinutes: number;
}

/** Topics per sub-test, and optionally the exam's numbers, as a shareable file. */
export interface KisiProfile {
  version: 1;
  id: string;
  name: string;
  /** Where the topics come from, e.g. an official decree, or "bawaan aplikasi". */
  source?: string;
  /** Date of the source, YYYY-MM-DD. */
  date?: string;
  topics: Record<Subtest, KisiTopic[]>;
  exam?: ExamNumbers;
}

export interface KisiSettings {
  activeId: string;
  custom: KisiProfile[];
}

export interface CrossCheckSettings {
  enabled: boolean;
  /** Key used for checking; defaults to the set's key. */
  keyId?: string;
  /** Model used for checking; defaults to the key's model. A different model catches more. */
  model?: string;
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
  /** Most reviews offered per day in the mistake notebook. */
  reviewDailyLimit: number;
  /** Absent until the learner creates a plan. */
  studyPlan?: StudyPlan;
  /** Second-opinion check of new questions by another model. Off unless enabled. */
  crossCheck?: CrossCheckSettings;
  /** Syllabus profiles the learner added, and which one is in use. Absent means the built-in one. */
  kisi?: KisiSettings;
  /** USD per 1M tokens, keyed by model id; fallback used when unknown. */
  priceOverrides: Record<string, { input: number; output: number }>;
}

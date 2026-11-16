/**
 * 公共层 —— 跨层阈值的统一出口（W3）。
 *
 * 提交消息行宽沿用 commit-limits.ts；type 白名单、审查 reason 长度与
 * 审查文件体积上限此前散落在 checker.ts 与提示词中，现集中在此，
 * 由校验器与提示词共同引用，scripts/check-rules.mjs 负责自动对账。
 */
export {
  MAX_BODY_BULLETS,
  MAX_BODY_LINE_LENGTH,
  MAX_HEADER_LENGTH,
} from "./commit-limits";

/** Conventional Commits 允许的 type（F04 A1）。 */
export const COMMIT_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
] as const;

/** 审查结论 reason 的字符上限（F04 之外的审查契约）。 */
export const REVIEW_REASON_MAX_LENGTH = 80;

/** 超过该字符数的非源码新增文件判为可疑（提示词与 wrapNewFiles 共用）。 */
export const REVIEW_MAX_FILE_CHARS = 20000;

/** 单次 LLM 请求超时；显式设置避免依赖 SDK 默认值。 */
export const LLM_DEFAULT_TIMEOUT_MS = 60_000;

/** SDK 内部重试次数设为 0，限流/5xx 统一由 infra/llm/retry 的退避循环处理。 */
export const LLM_DEFAULT_MAX_RETRIES = 0;

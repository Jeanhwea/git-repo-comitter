/**
 * 提交流程的公共数据契约。
 *
 * 独立成文件，供入口编排与内部阶段函数共同依赖；入口 re-export 这些类型，
 * 保持 \@/domain/commit-flow 的对外签名不变。
 */
import type { AppConfig } from "@/config/types";
import type { ReviewResult } from "@/domain/file-review/reviewer";
import type { GrcErrorCode } from "@/shared/errors";
import type { ProgressSink } from "@/shared/progress";

/** 提交成功的结果。 */
export interface CommitSuccess {
  committed: true;
  /** 写入 git 的提交信息。 */
  message: string;
  /** diff 被拆分处理的批次数（1 表示未分批）。 */
  batchCount: number;
  elapsedMs: number;
}

/** 未发生提交的结果（例如没有任何可提交的变更）。 */
export interface CommitSkipped {
  committed: false;
  /** 未提交的原因码，便于调用方分支处理。 */
  reason: GrcErrorCode;
  /** 面向人类/readme 的原因说明。 */
  detail: string;
  elapsedMs: number;
}

export type CommitOutcome = CommitSuccess | CommitSkipped;

export interface CommitRequest {
  /** 完整配置，必填：库不读取 ~/.grc，避免隐式全局副作用。 */
  config: AppConfig;
  /** 目标仓库路径，缺省为进程当前工作目录。 */
  repoPath?: string;
  /** true 时只提交已暂存的变更，不执行 git add。 */
  stagedOnly?: boolean;
  /** true 时给 git commit 追加 --no-verify，跳过 Git Hook（F09）。 */
  noVerify?: boolean;
  /** true 时启用审查门禁；库默认关闭，CLI 默认开启并可用 --no-review 关闭（Q4）。 */
  review?: boolean;
  /** 本次调用的进度输出槽；缺省沿用全局输出槽（未装配则静默）。 */
  onProgress?: ProgressSink;
  /**
   * 提交前审查门禁的裁决回调。
   * 未提供时不启用审查门禁（库默认非交互）；提供时若 LLM 审查判定可疑则回调裁决，
   * 返回 false 即中止提交并抛 USER_CANCELLED。
   */
  onReview?: (result: ReviewResult) => boolean | Promise<boolean>;
}

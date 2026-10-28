/**
 * 公共层 —— 错误类型。
 *
 * CliError 原先定义在 app/cli 目录下，却被领域层抛掷、又被 CLI 出口用于统一退出码，
 * 位置与职责不符（I06 的 P2）。错误类型是与业务无关的公共能力，故归入 shared 层，
 * 使 app 与 domain 都能正向依赖它，且不再产生 domain → app 的回边。
 *
 * F05：抽库后错误模型必须与进程退出解耦——
 * 库抛 GrcError（携带稳定的 code）交由调用方捕获，
 * 「code → 退出码」的翻译只发生在 CLI 适配层，库自身不调用 process.exit。
 */

/**
 * 稳定的错误码。
 * 库调用方应据此做分支处理，而不是依赖中文消息文本匹配。
 */
export type GrcErrorCode =
  | "CONFIG_MISSING" // 缺少 API Key 等必要配置
  | "NOT_GIT_REPO" // 目标路径不是 git 仓库
  | "NO_STAGED_CHANGES" // --staged-only 但暂存区为空
  | "NO_CHANGES" // 没有任何可提交的变更
  | "USER_CANCELLED" // 审查门禁被用户/调用方否决
  | "VALIDATION_FAILED" // 生成结果未通过格式校验且重试耗尽
  | "LLM_FAILED" // 大模型调用失败或返回空内容
  | "GIT_FAILED" // git 命令执行失败
  | "UNKNOWN";

export class GrcError extends Error {
  constructor(
    message: string,
    public readonly code: GrcErrorCode = "UNKNOWN",
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = "GrcError";
  }
}

/**
 * CLI 专用错误：文案面向终端用户。
 * 退出码由 CLI 适配层（app/cli/program）读取，领域层只负责抛出。
 */
export class CliError extends GrcError {
  constructor(
    message: string,
    code: GrcErrorCode = "UNKNOWN",
    exitCode = 1,
  ) {
    super(message, code, exitCode);
    this.name = "CliError";
  }
}

/**
 * 公共层 —— 错误类型。
 *
 * CliError 原先定义在 app/cli 目录下，却被领域层抛掷、又被 CLI 出口用于统一退出码，
 * 位置与职责不符（I06 的 P2）。错误类型是与业务无关的公共能力，故归入 shared 层，
 * 使 app 与 domain 都能正向依赖它，且不再产生 domain → app 的回边。
 */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}

/**
 * git 基础设施 —— 执行器端口（零 Node 依赖，F07）。
 *
 * 把「如何调用 git 进程」抽象为可注入的 GitExecutor：
 * - Node 入口（lib.ts）在加载时装配 child_process 实现；
 * - 浏览器 / WebView 等无 Node 环境由调用方通过 setGitExecutor 注入。
 *
 * 纯核（prompts、校验、生成、分批）只依赖本文件的 execGit，不感知具体实现，
 * 因此同一份代码可在 Node CLI 与浏览器端复用。
 */
import { GrcError } from "@/shared/errors";

/** execGit 的调用选项，与具体实现解耦。 */
export interface GitExecOptions {
  /** 命令失败时返回空串而不抛出（用于「有没有」这类探测式调用）。 */
  allowFailure?: boolean;
  /**
   * 目标仓库路径。
   * F05：库调用方通过 commit(\{ repoPath \}) 指定，避免依赖进程的当前工作目录；
   * 缺省时沿用具体实现的默认工作目录（Node 实现即 process.cwd()）。
   */
  cwd?: string;
}

/** git 执行器的统一契约：给定参数与选项，返回标准输出文本。 */
export interface GitExecutor {
  exec(args: string[], options?: GitExecOptions): string;
}

let current: GitExecutor | null = null;

/**
 * 注入全局 git 执行器。
 * Node 入口会自动装配；浏览器 / WebView 等环境须由调用方提供实现。
 * @param next - 目标执行器实现。
 */
export function setGitExecutor(next: GitExecutor): void {
  current = next;
}

/** 探测式 git 调用的结果：明确区分「命令失败」与「成功但没有输出」。 */
export interface GitExecResult {
  ok: boolean;
  stdout: string;
  stderr?: string;
}

/**
 * 执行 git 命令并显式区分失败与空结果。
 * 探测式调用（「有没有暂存变更」等）应使用本函数，不再依赖 allowFailure 返回空串。
 * @param args - git 参数数组。
 * @param options - 工作目录等选项。
 * @returns 成功与否、标准输出与失败原因。
 */
export function tryExecGit(
  args: string[],
  options: Omit<GitExecOptions, "allowFailure"> = {},
): GitExecResult {
  try {
    return {
      ok: true,
      stdout: execGit(args, { ...options, allowFailure: false }),
    };
  } catch (err) {
    return {
      ok: false,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 执行 git 命令：委托给已装配的执行器。
 *
 * 未装配时抛 GrcError(GIT_FAILED)，不静默失败（F07 R3）。
 * @param args - 传给 git 的参数（不含全局参数，由实现层添加）。
 * @param options - 允许失败 / 工作目录等选项。
 * @throws GrcError - 未装配执行器时抛出，code 为 GIT_FAILED。
 */
export function execGit(args: string[], options: GitExecOptions = {}): string {
  if (!current) {
    throw new GrcError(
      "git 执行器未装配：Node 入口会自动装配，其他环境请调用 setGitExecutor 注入实现",
      "GIT_FAILED",
    );
  }
  return current.exec(args, options);
}

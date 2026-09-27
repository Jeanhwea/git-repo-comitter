import { CliError } from "@/app/cli/errors";
import { generateCommitMessageBatched } from "@/domain/commit-message/batch";
import { runReviewGate } from "@/domain/file-review/gate";
import { loadConfig } from "@/infra/config/loader";
import type { AppConfig } from "@/infra/config/types";
import { getStagedDiff, hasChangesToStage, hasStagedChanges } from "@/infra/git/diff";
import { gitAddAll, gitCommit, isGitRepo } from "@/infra/git/runner";
import { formatElapsed } from "@/utils/format-time";
import { createLogger } from "@/utils/logger";

const log = createLogger("commit");

export interface CommitOptions {
  stagedOnly?: boolean;
}

async function ensureConfig(): Promise<AppConfig> {
  const config = await loadConfig();
  if (!config.apiKey) {
    throw new CliError("API Key 未设置，请运行 `grc init` 进行配置。");
  }
  return config;
}

function stageOrProceed(stagedOnly: boolean): void {
  if (stagedOnly) {
    if (!hasStagedChanges()) {
      throw new CliError("没有已暂存的变更，请先使用 git add 暂存文件。");
    }
    console.log("仅提交暂存变更...");
    return;
  }
  if (hasChangesToStage()) {
    console.log("暂存所有变更...");
    gitAddAll();
  }
}

export async function runCommit(options: CommitOptions = {}): Promise<void> {
  const startTime = performance.now();
  const step = (label: string): number => {
    log.debug(`步骤开始：${label}`);
    return performance.now();
  };
  const done = (label: string, t0: number): void => {
    log.debug(
      `步骤完成：${label}（耗时 ${formatElapsed(performance.now() - t0)}）`,
    );
  };

  let t = step("加载配置");
  const config = await ensureConfig();
  log.trace("已加载配置", {
    endpoint: config.endpoint,
    model: config.llm.model,
  });
  done("加载配置", t);

  t = step("校验 git 仓库");
  if (!isGitRepo()) {
    throw new CliError(
      "当前目录不是 git 仓库，请确保在 git 仓库中执行 grc 命令",
    );
  }
  done("校验 git 仓库", t);

  t = step("暂存变更");
  stageOrProceed(!!options.stagedOnly);
  done("暂存变更", t);

  t = step("文件审查门禁");
  await runReviewGate(config, !!options.stagedOnly);
  done("文件审查门禁", t);

  t = step("提取暂存 diff");
  const diff = getStagedDiff().trim() || null;
  if (!diff) {
    console.log("没有可提交的变更。");
    return;
  }
  log.trace(`暂存 diff 提取完成，长度 ${diff.length} 字符`);
  done("提取暂存 diff", t);

  console.log("正在生成提交信息...\n");
  t = step("生成提交信息");
  const { message, batchCount } = await generateCommitMessageBatched(
    diff,
    config,
  );
  done("生成提交信息", t);
  if (batchCount > 1) {
    console.log(`  (已将 diff 分为 ${batchCount} 批次处理并合并)\n`);
  }

  t = step("执行 git commit");
  gitCommit(message);
  done("执行 git commit", t);

  console.log(`提交信息：\n  ${message}\n`);
  const elapsed = performance.now() - startTime;
  log.debug(`全流程完成，总耗时 ${formatElapsed(elapsed)}`);
  console.log(`提交成功！耗时 ${formatElapsed(elapsed)}`);
}

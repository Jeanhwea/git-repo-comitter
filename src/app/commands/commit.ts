/**
 * 应用层 —— commit 命令：装配 CLI 所需的配置、输出与交互，流程委托给 domain/commit-flow。
 *
 * F05：本命令是库的「参考消费者」——只负责读全局配置、渲染进度与结果、把错误交给
 * CLI 出口翻译成退出码；生成与提交的实际编排在领域层，可被其他代码直接调用。
 */
import { createCliReviewHandler } from "@/app/steps/review";
import { loadConfig } from "@/config/loader";
import { executeCommit } from "@/domain/commit-flow";
import { CliError } from "@/shared/errors";
import { createLogger } from "@/shared/logger";
import { formatElapsed } from "@/shared/time";

const log = createLogger("commit");

export interface CommitOptions {
  stagedOnly?: boolean;
}

export async function runCommit(options: CommitOptions = {}): Promise<void> {
  const config = await loadConfig();
  log.trace("已加载配置", {
    endpoint: config.endpoint,
    model: config.llm.model,
  });

  if (!config.apiKey) {
    throw new CliError(
      "API Key 未设置，请运行 `grc init` 进行配置。",
      "CONFIG_MISSING",
    );
  }

  const outcome = await executeCommit({
    config,
    stagedOnly: options.stagedOnly ?? false,
    onProgress: (message) => console.log(message),
    onReview: createCliReviewHandler(),
  });

  if (!outcome.committed) {
    console.log(outcome.detail);
    return;
  }

  console.log(`提交信息：\n  ${outcome.message}\n`);
  console.log(`提交成功！耗时 ${formatElapsed(outcome.elapsedMs)}`);
}

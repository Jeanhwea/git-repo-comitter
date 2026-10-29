/**
 * 应用层 —— CLI 配置装载：读文件 + 超限告警 + 交互式修复。
 *
 * 配置层（config/loader）只提供数据与文件读写；「要不要告警、要不要写回修复」
 * 是面向终端用户的决定，属于 CLI 关注点，故收敛在本模块（架构 A5）。
 * 库调用方使用 config/loader 的 resolveConfig / loadDefaultConfig，不经过这里。
 */
import { question } from "@/app/cli/input";
import {
  DEFAULT_CONFIG,
  clampLlm,
  resolveConfig,
} from "@/config/loader";
import type { AppConfig } from "@/config/types";
import { loadUserConfigFile, saveUserConfig } from "@/config/user-file";

/**
 * 交互询问是否把超限的 maxOutputTokens 写回配置文件；拒绝时本次仍取上限值。
 * @param userValue - 配置文件中实际写出的超限数值。
 * @param limit - 当前模型允许的上限值，即询问后回写的目标值。
 */
async function offerRepair(userValue: number, limit: number): Promise<void> {
  console.warn(
    `\n⚠️  警告：配置中的 maxOutputTokens (${userValue}) 超过了当前模型的上限 (${limit})。`,
  );

  const answer = (
    await question(
      `  是否将配置文件的 maxOutputTokens 修复为 ${limit}？(Y/n): `,
    )
  )
    .trim()
    .toLowerCase();

  if (answer !== "" && answer !== "y" && answer !== "yes") {
    console.log(`  ℹ️  跳过修复，本次仍取较小值 ${limit}。`);
    return;
  }

  const userConfig = loadUserConfigFile();
  saveUserConfig({
    ...userConfig,
    llm: {
      ...DEFAULT_CONFIG.llm,
      ...(userConfig.llm || {}),
      maxOutputTokens: limit,
    },
  });
  console.log(`  ✅ 已修复，maxOutputTokens 已设为 ${limit}。`);
}

/**
 * CLI 专用配置装载：读取 ~/.grc/config.json，对超限项告警并交互式修复输出额度。
 *
 * 与库路径的区别仅在于「允许副作用」：读全局文件、终端告警与提问都发生在这里。
 * @throws 不抛配置相关错误；缺失字段由后续流程按错误码处理。
 */
export async function loadCliConfig(): Promise<AppConfig> {
  const userConfig = loadUserConfigFile();
  const { outputExceeded, inputExceeded } = clampLlm(userConfig.llm);

  if (inputExceeded) {
    console.warn(
      `\n⚠️  警告：配置中的 maxInputTokens (${inputExceeded.userValue}) 超过了当前模型的上限 (${inputExceeded.limit})，将自动取较小值 ${inputExceeded.limit}。`,
    );
  }
  if (outputExceeded) {
    await offerRepair(outputExceeded.userValue, outputExceeded.limit);
  }

  // resolveConfig 会再 clamp 一次（收敛幂等），返回收敛后的完整配置。
  return resolveConfig(userConfig);
}

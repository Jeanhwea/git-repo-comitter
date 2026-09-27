/**
 * 提示词管理模块的统一出口。
 * 业务代码优先通过 PromptDefinition（如 commitMessagePrompt / partialCommitPrompt / reviewPrompt）
 * 配合 buildMessages 使用；需要原始 system 文本的场景（如分批合并）可直接取 SYSTEM_PROMPT 等常量。
 */
export * from "./types";
export * from "./blocks/role";
export * from "./blocks/commit-types";
export * from "./blocks/format";
export * from "./blocks/safety";
export * from "./blocks/output";
export * from "./commit-message/system";
export * from "./commit-message/partial";
export * from "./commit-message/merge";
export * from "./commit-message/wrappers";
export * from "./file-review/system";
export * from "./file-review/wrappers";

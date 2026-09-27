/**
 * 提示词管理模块的统一出口（提示词资源层，叶子模块）。
 *
 * 业务代码优先通过 PromptDefinition（commitMessagePrompt / partialCommitPrompt /
 * mergeCommitPrompt / reviewPrompt）配合 buildMessages 使用。
 *
 * 本模块只依赖 openai 的类型定义，不依赖 domain / app / infra。
 */
export * from "./types";
export * from "./blocks/role";
export * from "./blocks/commit-types";
export * from "./blocks/format";
export * from "./blocks/safety";
export * from "./blocks/language";
export * from "./blocks/output";
export * from "./repair";
export * from "./commit-message/generate";
export * from "./commit-message/partial";
export * from "./commit-message/merge";
export * from "./commit-message/repair";
export * from "./commit-message/wrappers";
export * from "./file-review/review";
export * from "./file-review/repair";
export * from "./file-review/wrappers";

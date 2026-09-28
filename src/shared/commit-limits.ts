/**
 * 公共层 —— 提交信息的行宽上限（单一来源）。
 *
 * 提示词（prompts/*）与校验器（domain/commit-message/checker）必须共用同一组数字，
 * 否则会出现「提示词说 118、校验按 78 卡」这类规则与执行脱节的情况。
 * 归入 shared 是为了让 prompts 与 domain 都能正向依赖，不产生回边。
 */

/**
 * 标题行（第一行）最大字符数。
 * 对齐 git 的显示惯例：简短日志（git log --oneline）在 72~78 列内才不会被截断。
 */
export const MAX_HEADER_LENGTH = 78;

/**
 * 正文每行最大字符数（要点、脚注等）。
 * 比标题宽松：正文需要容纳文件名与模块名等定位信息，过窄会被迫截断上下文，
 * 且正文不参与 --oneline 展示，118 在常见终端与 GitHub 提交页下仍能完整显示。
 */
export const MAX_BODY_LINE_LENGTH = 118;

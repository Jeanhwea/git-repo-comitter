/**
 * 提交消息校验的共享模式与工具（checker 内部模块）。
 *
 * 只放 A~F 各规则组都要用的正则、常量与纯函数；具体规则判定在 header.ts /
 * body.ts。所有 [编号] 字面量仍留在判定模块里，供 scripts/check-rules.mjs 对账。
 */
import { COMMIT_TYPES } from "@/shared/limits";

const ALLOWED_TYPES: ReadonlySet<string> = new Set<string>(COMMIT_TYPES);

export const FULL_WIDTH_COLON = "：";

/** 松散标题行：只负责把字段切出来，空格写错等细节交由各条规则自行判定。 */
export const LOOSE_HEADER =
  /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^()]*)\))?(?<bang>!*)?:(?<space>[ \t]*)(?<description>.*)$/;

/** scope 形状：以小写字母开头，只允许小写字母、数字，分词只用连字符。 */
export const SCOPE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** git trailer 脚注：Token: value 或 Token #value，Token 允许含空格与连字符（如 BREAKING CHANGE）。 */
export const TRAILER_PATTERN = /^[A-Za-z][A-Za-z0-9 -]*(?:: | #)\S/;

/** 疑似脚注但写法不对（Refs:123 之类），单独按 D1 给原因而不是笼统的格式错误。 */
export const TRAILER_LIKE_PATTERN = /^[A-Za-z][A-Za-z0-9 -]*[:#]/;

/** 脚注行在冒号/井号后紧跟的值，用于 D2「同行并列」判定。 */
export const TRAILER_VALUE_PATTERN = /^[A-Za-z][A-Za-z0-9 -]*(?:: | #)(\S.*)$/;

/**
 * 拼接多条提交信息时残留的分隔线（如 ======= 、------ ）。
 * 提交信息正文里不存在合法用途，出现即判定为多条消息被并在一起。
 */
export const SEPARATOR_PATTERN = /^[=-]{3,}$/;

/** 候选序号前缀： "1. "、"2) "、"3、"。模型输出多个版本时的典型痕迹。 */
export const CANDIDATE_MARK_PATTERN = /^\d+[.、)]\s+/;

/** 要点前缀：半角连字符加一个半角空格。 */
export const BULLET_PREFIX = "- ";

/** emoji 与装饰性符号区段（emoji、箭头、 dingbats、杂项符号）。 */
export const EMOJI_PATTERN =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

export const CJK_PATTERN = /[\u4e00-\u9fff]/;

/** E3：中文紧贴标识符，说明专有名词被翻译或未与中文分隔。 */
export const TRANSLATED_IDENTIFIER =
  /[\u4e00-\u9fff][A-Za-z][A-Za-z0-9]*[\u4e00-\u9fff]/;
export const TRANSLATED_PATH = /[\u4e00-\u9fff]+\/[\u4e00-\u9fff]+/;

/** E4：繁体常用字与网络用语（L2 告警，不拦截）。 */
export const TRADITIONAL_CHARS = /[複實體網頁檔案檢視錄據點樣萬與優聯繫]/;
export const SLANG = /(?:yyds|u1s1|awsl|绝绝子|家人们|栓Q)/i;
export const HALF_WIDTH_IN_CJK = /[\u4e00-\u9fff][,.!?][\u4e00-\u9fff]/;

/** 解析出的标题字段。解析失败时为 undefined，此时只保留格式类命中项。 */
export interface HeaderFields {
  type: string;
  scope: string | undefined;
  breaking: boolean;
  description: string;
}

const MAX_REASON_SNIPPET = 40;

/**
 * 把长文本截成失败原因里的短摘要。
 * @param text - 原始文本。
 */
export function snippet(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_REASON_SNIPPET
    ? `${trimmed.slice(0, MAX_REASON_SNIPPET)}...`
    : trimmed;
}

/**
 * 判定一行是否为 Conventional Commits 标题行（type 必须取自允许列表）。
 * @param line - 待判定的正文行。
 */
export function isHeaderLine(line: string): boolean {
  const type = line.match(LOOSE_HEADER)?.groups?.type;
  return !!type && ALLOWED_TYPES.has(type);
}

/** 允许使用的 type 列表（供 A1 失败原因回显）。 */
export function allowedTypes(): string[] {
  return [...ALLOWED_TYPES];
}

/**
 * 判断 type 是否在允许列表中。
 * @param type - 标题解析出的 type 字段。
 */
export function isAllowedType(type: string): boolean {
  return ALLOWED_TYPES.has(type);
}

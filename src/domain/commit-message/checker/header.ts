/**
 * 提交消息校验：标题行（A 组规则）。
 *
 * 只判定第一行并返回解析字段，供 D3 / D4 联动使用。规则编号与 F04 的 A 组对应。
 */
import { MAX_HEADER_LENGTH } from "@/shared/limits";
import { displayWidth } from "@/shared/text";

import {
  allowedTypes,
  FULL_WIDTH_COLON,
  isAllowedType,
  LOOSE_HEADER,
  SCOPE_PATTERN,
  snippet,
  type HeaderFields,
} from "./patterns";

/**
 * 标题行校验：A 组规则。返回 fields 供 D3 / D4 联动判定使用。
 * @param header - 提交信息的第一行（标题行）。
 */
export function validateHeader(header: string): {
  reasons: string[];
  fields?: HeaderFields;
} {
  const reasons: string[] = [];

  if (!header.includes(":")) {
    reasons.push(
      header.includes(FULL_WIDTH_COLON)
        ? `[A4] type 与 description 之间必须使用半角冒号加一个半角空格，禁止使用全角冒号（当前标题："${snippet(header)}"）`
        : `[A4] 标题缺少 type 与 description 之间的半角冒号，必须形如 type[(scope)][!]: description（当前标题："${snippet(header)}"）`,
    );
    return { reasons };
  }

  const groups = header.match(LOOSE_HEADER)?.groups;
  if (!groups) {
    reasons.push(
      `[A1] 标题行必须形如 type[(scope)][!]: description，type 必须取自 ${allowedTypes().join(", ")}（当前标题："${snippet(header)}"）`,
    );
    return { reasons };
  }

  const { type = "", scope, bang = "", space = "", description = "" } = groups;

  if (!isAllowedType(type)) {
    reasons.push(
      `[A1] type 字段的值 "${type}" 不在允许的列表中 (${allowedTypes().join(", ")})`,
    );
  }

  if (bang.length > 1) {
    reasons.push(
      `[A2] 破坏性标记 ! 最多出现一次且必须紧贴冒号之前，当前出现 ${bang.length} 次`,
    );
  }

  if (scope !== undefined) {
    if (scope.trim() === "") {
      reasons.push("[A3] scope 为空时必须省略括号整段，禁止写成空括号 ()");
    } else if (!SCOPE_PATTERN.test(scope)) {
      reasons.push(
        `[A3] scope "${scope}" 必须是小写英文并以连字符分词，禁止包含空格、大写字母或右圆括号`,
      );
    }
  }

  if (space !== " ") {
    reasons.push(
      space === ""
        ? "[A4] 半角冒号后必须紧跟恰好一个半角空格，禁止直接接 description"
        : `[A4] 半角冒号后只能是恰好一个半角空格，当前为 ${space.length} 个空白字符`,
    );
  }

  const trimmedDescription = description.trim();
  if (bang && trimmedDescription === "") {
    reasons.push("[A5] 破坏性标记 ! 不能替代 description，标题仍须完整可读");
  }
  if (trimmedDescription === "") {
    reasons.push("[A6] description 不允许为空");
  } else if (/[。.]$/.test(trimmedDescription)) {
    reasons.push(
      `[A6] description 禁止以句号结尾（当前以 "${trimmedDescription.slice(-1)}" 结尾）`,
    );
  }

  if (displayWidth(header) > MAX_HEADER_LENGTH) {
    reasons.push(
      `[A8] 标题行超过 ${MAX_HEADER_LENGTH} 个半角字符宽度的限制 (当前 ${displayWidth(header)}，中文按 2 计)，请压缩 description，禁止直接截断`,
    );
  }

  return {
    reasons,
    fields: {
      type,
      scope,
      breaking: bang === "!",
      description: trimmedDescription,
    },
  };
}

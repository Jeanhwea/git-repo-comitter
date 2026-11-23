/**
 * 领域层 —— 兜底消息的推断步骤（W6 从 fallback.ts 拆出）。
 *
 * 只负责根据文件变更特征推断 type / scope / description，
 * 不接触消息组装与校验；相同变更集必须得到相同结果。
 */
import type { FileChange } from "@/infra/git/changes";

/**
 * 按优先级裁决 type。规则：
 *  1. 新增后缀为 .spec.ts / .test.ts / .test.tsx / .test.js → test
 *  2. 新增 .md / .txt 文档或 doc/ docs/ 目录 → docs
 *  3. 删除文件 → fix（删除通常是为修复问题清除旧代码）
 *  4. 修改 ci/ .github/ 或配置文件（.gitignore / .editorconfig 等）→ chore
 *  5. 新增文件 → feat
 *  6. 修改文件 → fix
 *  7. 新增/修改 .json / .yaml / .yml / config/ 配置相关 → build
 *  8. 路径含 refactor → refactor
 *  9. 子模块指针变更 → chore（指针移动多为依赖/子工程同步）
 * 10. 重命名且无增删改 → refactor（纯移动即为结构调整）
 * 11. 兜底 → chore
 * @param files - 文件变更列表，用于推断 type
 */
export function inferType(files: FileChange[]): string {
  const added = files.filter((f) => f.status === "added");
  const modified = files.filter((f) => f.status === "modified");
  const deleted = files.filter((f) => f.status === "deleted");
  const renamed = files.filter((f) => f.status === "renamed");
  const submodule = files.filter((f) => f.status === "submodule");
  const allFiles = files.map((f) => f.path);

  // 1. test
  if (added.some((f) => /\.(spec|test)\.(ts|tsx|js|jsx)$/i.test(f.path))) {
    return "test";
  }

  // 2. docs
  if (
    added.some((f) => /\.(md|mdx|txt)$/i.test(f.path)) ||
    added.some((f) => /^docs?\//.test(f.path))
  ) {
    return "docs";
  }

  // 3. delete files → fix
  if (deleted.length > 0) {
    return "fix";
  }

  // 4. chore: ci config / infra changes
  if (
    allFiles.some((p) => /^\.(github|gitlab|vscode)\//.test(p)) ||
    allFiles.some((p) => /^\.(gitignore|editorconfig|env|nvmrc)$/.test(p)) ||
    (added.length === 0 &&
      modified.length > 0 &&
      modified.every((f) => /\.(json|yaml|yml)$/i.test(f.path)))
  ) {
    return "chore";
  }

  // 5. new files → feat
  if (added.length > 0) {
    return "feat";
  }

  // 6. modified only → fix
  if (modified.length > 0 && added.length === 0) {
    return "fix";
  }

  // 7. config files (JSON/YAML) → build
  if (
    allFiles.some((p) => /^config\//.test(p)) ||
    allFiles.every((p) => /\.(json|yaml|yml)$/i.test(p))
  ) {
    return "build";
  }

  // 8. refactor hint in file names
  if (allFiles.some((p) => /refactor/i.test(p))) {
    return "refactor";
  }

  // 9. 子模块指针同步
  if (submodule.length > 0) {
    return "chore";
  }

  // 10. 纯重命名（无增删改）视作结构调整
  if (
    renamed.length > 0 &&
    added.length === 0 &&
    modified.length === 0 &&
    deleted.length === 0
  ) {
    return "refactor";
  }

  return "chore";
}

/** 与 checker 的 scope 规则一致。 */
const VALID_SCOPE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * 从出现次数最多的一级目录推断 scope；非法目录名直接省略，避免命中 A3。
 * @param files - 文件变更列表。
 */
export function inferScope(files: FileChange[]): string | undefined {
  const scopes = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    // 跳过根目录文件（无 scope）
    if (parts.length < 2) continue;
    const dir = parts[0] ?? "";
    // 跳过隐藏目录、node_modules、dist、build
    if (
      dir.startsWith(".") ||
      dir === "node_modules" ||
      dir === "dist" ||
      dir === "build" ||
      dir === "out"
    )
      continue;
    scopes.add(dir);
  }
  // 取出现次数最多的目录
  if (scopes.size === 0) return undefined;
  const counts = new Map<string, number>();
  for (const f of files) {
    const dir = f.path.split("/")[0];
    if (dir && scopes.has(dir)) {
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  let best = "";
  let bestCount = 0;
  for (const [dir, count] of counts) {
    if (count > bestCount) {
      best = dir;
      bestCount = count;
    }
  }
  // 一级目录可能含有大写、下划线或中文（如 I08、docs_zh），直接写入会被 A3 拦截。
  return VALID_SCOPE.test(best) ? best : undefined;
}

/**
 * 根据 type 与文件数量生成标题描述。
 * @param type - 已推断的 type。
 * @param files - 文件变更列表。
 */
export function buildDescription(type: string, files: FileChange[]): string {
  const added = files.filter((f) => f.status === "added");
  const modified = files.filter((f) => f.status === "modified");
  const deleted = files.filter((f) => f.status === "deleted");
  const renamed = files.filter((f) => f.status === "renamed");
  const submodule = files.filter((f) => f.status === "submodule");

  const count = files.length;
  const atoms: string[] = [];

  if (added.length > 0) atoms.push(`新增 ${added.length} 个文件`);
  if (modified.length > 0) atoms.push(`修改 ${modified.length} 个文件`);
  if (deleted.length > 0) atoms.push(`删除 ${deleted.length} 个文件`);
  if (renamed.length > 0) atoms.push(`重命名 ${renamed.length} 个文件`);
  if (submodule.length > 0) atoms.push(`同步 ${submodule.length} 个子模块`);

  const suffix = atoms.join("，") || `${count} 个文件变更`;

  switch (type) {
    case "feat":
      return `新增功能：${suffix}`;
    case "fix":
      return `修复问题：${suffix}`;
    case "docs":
      return `更新文档：${suffix}`;
    case "test":
      return `添加测试：${suffix}`;
    case "build":
      return `构建配置：${suffix}`;
    case "refactor":
      return `重构代码：${suffix}`;
    case "perf":
      return `性能优化：${suffix}`;
    default:
      return `日常维护：${suffix}`;
  }
}

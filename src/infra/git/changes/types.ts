/**
 * 变更采集的共享类型模型。
 *
 * 独立成文件供解析层、组装层、新内容清单层共同依赖，避免入口与子模块之间
 * 因类型产生环引用。
 */

/**
 * 单个文件的变更类型。
 * - added / deleted / modified：常规增删改。
 * - renamed：路径变化，原路径保存在 FileChange.oldPath。
 * - submodule：gitlink（mode 160000）指针变化，指针内容不是文本 diff。
 */
export type ChangeStatus =
  "added" | "modified" | "deleted" | "renamed" | "submodule";

export interface FileChange {
  /** 变更后路径；renamed 时为新路径。 */
  path: string;
  status: ChangeStatus;
  /** renamed 时的原路径；其他状态为 undefined。 */
  oldPath?: string;
  isBinary: boolean;
  additions: number;
  deletions: number;
}

export interface ChangeSet {
  /** 暂存区内的全部变更文件。 */
  files: FileChange[];
  /** 新增文件（status === "added"），供提交前审查使用。 */
  newFiles: FileChange[];
  /** 重命名文件（status === "renamed"），oldPath 指向原路径。 */
  renamedFiles: FileChange[];
  /** 删除的文件（status === "deleted"）。 */
  deletedFiles: FileChange[];
  /** 子模块指针变更（status === "submodule"）。 */
  submoduleFiles: FileChange[];
  /** 二进制文件（isBinary === true），diff 中需被排除。 */
  binaryFiles: FileChange[];
  /** 暂存区是否已有变更。 */
  hasStagedChanges: boolean;
  /** 是否还有未暂存的变更（含未跟踪的新文件），需要 git add 才会进入提交。 */
  hasUnstagedChanges: boolean;
}

/** 采集到的单个暂存文件统计（解析层与组装层之间的中间模型）。 */
export interface StagedFileStat {
  path: string;
  status: ChangeStatus;
  oldPath?: string;
  isBinary: boolean;
  additions: number;
  deletions: number;
}

/** 新内容清单的作用域：staged 为已暂存，unstaged 为工作区。 */
export type NewFileScope = "staged" | "unstaged";

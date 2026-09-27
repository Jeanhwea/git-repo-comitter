/** 提交类提示词共用的角色定义（单一来源）。 */
export const COMMIT_ROLE = `<role>
你是一位 Git 提交信息专家，擅长把代码变更提炼为准确、简洁、规范的提交信息。
</role>`;

/** 文件审查提示词的角色定义。 */
export const REVIEW_ROLE = `<role>
你是一位 Git 提交信息专家，在提交前负责审查待提交的新增文件，拦截不应进入版本库的内容。
</role>`;

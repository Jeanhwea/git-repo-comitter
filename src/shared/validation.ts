/**
 * 公共层 —— 校验结论（可辨识联合）。
 *
 * 类型参数 T 表示校验通过后携带的值类型；成功分支可附带 warnings（降级为告警而非拦截），
 * 失败分支携带 reason（面向模型回显，便于按编号逐条修正）。
 *
 * 原先定义在 infra/llm/retry，导致两处层级回边：
 * 纯领域校验器（domain 下各 checker）为了取这个类型而反向依赖 LLM 基础设施，
 * 连带把 openai 的类型卷进领域层——这也是抽库时公共类型打包失败的诱因。
 *
 * 归入 shared 后，domain 与 infra 各自正向依赖它，回边消失，
 * 领域校验不再与「怎么调大模型」产生编译期耦合。
 */
export type ValidationOutcome<T> =
  | { valid: true; value: T; warnings?: string[] }
  | { valid: false; reason?: string };

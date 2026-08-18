export const ADMIN_COPY = {
  actions: {
    create: "新建",
    add: "添加",
    edit: "编辑",
    modify: "修改",
    search: "搜索",
    filter: "筛选",
    reset: "重置",
    save: "保存",
    cancel: "取消",
    back: "返回",
    continue: "继续",
    submit: "提交",
    /** @deprecated 兼容待迁移业务表单；危险确认不得使用此项。 */
    confirm: "提交",
    retry: "重新加载",
    delete: "删除",
    moveToTrash: "移入回收站",
    restore: "恢复",
    permanentlyDelete: "永久删除",
    remove: "移除",
    enable: "启用",
    disable: "停用",
    publish: "发布",
    approve: "通过审核",
    reject: "审核不通过",
  },
  feedback: {
    /** @deprecated 兼容骨架屏；新页面使用 getAdminLoadingText(subject)。 */
    loading: "正在加载数据…",
    saving: "正在保存…",
    noData: "暂无数据",
    loadFailed: "数据加载失败",
    saveSuccess: "保存成功",
    updateSuccess: "更新成功",
    partialSuccess: (completed: number, total: number) =>
      `已完成 ${completed} 项，共 ${total} 项；未完成项请检查后重试。`,
  },
  status: {
    enabled: "已启用",
    disabled: "已停用",
  },
} as const;

export type AdminEmptyKind =
  | "initial"
  | "filtered"
  | "unauthorized"
  | "unconfigured";

export type AdminErrorContext = "load" | "submit";

export function getAdminLoadingText(subject = "数据") {
  return `正在加载${subject}…`;
}

export function getAdminLoadError(subject = "数据") {
  return {
    title: `${subject}加载失败`,
    description: `未能加载${subject}，请稍后重试。`,
  };
}

export function getAdminEmptyText(
  subject = "数据",
  kind: AdminEmptyKind | boolean = "initial",
) {
  const normalizedKind = typeof kind === "boolean" ? (kind ? "filtered" : "initial") : kind;

  switch (normalizedKind) {
    case "filtered":
      return `没有符合当前筛选条件的${subject}`;
    case "unauthorized":
      return `你没有查看${subject}的权限`;
    case "unconfigured":
      return `尚未配置${subject}`;
    default:
      return `暂无${subject}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSafeStatus(error: unknown) {
  if (!isRecord(error)) return undefined;
  if (typeof error.status === "number") return error.status;
  if (isRecord(error.response) && typeof error.response.status === "number") {
    return error.response.status;
  }
  return undefined;
}

/**
 * 保留页面针对具体对象编写的可执行兜底提示，同时统一处理登录、权限和并发冲突。
 * 不读取或透传服务端异常正文，避免把内部实现、第三方响应或敏感字段展示给用户。
 */
export function getSafeAdminErrorMessage(error: unknown, fallback: string) {
  const status = getSafeStatus(error);

  if (status === 401) return "登录状态已失效，请重新登录后继续。";
  if (status === 403) return "权限不足。如需执行此操作，请联系管理员。";
  if (status === 409) return "数据已被其他操作更新，请重新加载后再试。";
  return fallback;
}

/**
 * 只翻译可安全判断的状态码，不直接透传服务端异常、堆栈或内部字段。
 */
export function getSafeAdminError(
  error: unknown,
  {
    subject = "数据",
    context = "load",
    action = "保存",
  }: { subject?: string; context?: AdminErrorContext; action?: string } = {},
) {
  const status = getSafeStatus(error);

  if (status === 401) {
    return {
      title: "登录状态已失效",
      description: "请重新登录后继续。",
    };
  }
  if (status === 403) {
    return {
      title: "权限不足",
      description: "你没有执行此操作的权限。如需处理，请联系管理员。",
    };
  }
  if (status === 409) {
    return {
      title: "数据已更新",
      description: "当前数据已被其他操作更新，请重新加载后再试。",
    };
  }
  if (context === "submit") {
    return {
      title: `${subject}${action}失败`,
      description: `未能${action}${subject}，请检查填写内容后重试。`,
    };
  }
  return getAdminLoadError(subject);
}

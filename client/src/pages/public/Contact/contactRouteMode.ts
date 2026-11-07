/** 联系页的两个直达入口共用独立任务表单。 */
export function isContactRequestOnly(params: URLSearchParams) {
  return params.get("view") === "request" || params.get("type") === "privacy";
}

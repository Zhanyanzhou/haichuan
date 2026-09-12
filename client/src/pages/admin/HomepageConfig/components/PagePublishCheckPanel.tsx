import {
  CloseOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { RefObject } from "react";
import { useNavigate } from "react-router-dom";
import type {
  PagePublishIssueTarget,
  PublishValidationIssue,
  PublishValidationStatus,
} from "@/page-builder/inspector/publishValidation";

const DEVICE_LABEL = {
  desktop: "桌面端",
  mobile: "移动端",
  shared: "桌面端与移动端",
} as const;

export default function PagePublishCheckPanel({
  issues,
  targets,
  currentKey,
  validationStatus,
  publishAttemptFailed,
  reviewRef,
  onLocate,
  onClose,
  onRetry,
  onRetryPublish,
}: {
  issues: PublishValidationIssue[];
  targets: PagePublishIssueTarget[];
  currentKey: string | null;
  validationStatus: PublishValidationStatus;
  publishAttemptFailed: boolean;
  reviewRef: RefObject<HTMLElement>;
  onLocate: (target: PagePublishIssueTarget) => void;
  onClose: () => void;
  onRetry: () => void;
  onRetryPublish: () => void;
}) {
  const navigate = useNavigate();
  const currentIndex = Math.max(0, targets.findIndex((target) => target.key === currentKey));
  const currentTarget = targets[currentIndex];
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const publishConflict = issues.some((issue) => issue.code === "publish-request-conflict");
  const permissionChanged = issues.some((issue) => issue.code === "publish-permission-changed");

  return (
    <section
      ref={reviewRef}
      className="homepage-editor__page-publish-review"
      role="region"
      aria-label="本次发布检查"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="homepage-editor__page-publish-review-head">
        <div>
          <strong>{publishAttemptFailed ? "本次发布失败" : "本次发布检查"}</strong>
          <span>{publishConflict
            ? "本地修改仍保留，请明确选择恢复方式"
            : permissionChanged
              ? "草稿仍完整保留，请先恢复发布权限"
              : publishAttemptFailed
                ? "草稿仍完整保留，可明确重试"
            : errorCount > 0
              ? `${errorCount} 项错误待处理`
              : "已满足发布门禁"}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭本次发布检查">
          <CloseOutlined />
        </button>
      </header>

      {publishConflict ? (
        <div className="homepage-editor__page-publish-review-clear" role="alert">
          <strong>远端草稿已发生变化</strong>
          <span>系统不会自动覆盖本地或远端内容。保留本地可继续核对；重新加载远端草稿前会再次确认。</span>
        </div>
      ) : targets.length > 0 ? (
        <>
          <div className="homepage-editor__page-publish-review-nav">
            <span aria-live="polite">当前 {currentIndex + 1} / {targets.length}</span>
            <div>
              <button
                type="button"
                disabled={currentIndex <= 0}
                onClick={() => onLocate(targets[currentIndex - 1])}
              >
                <LeftOutlined /> 上一个问题
              </button>
              <button
                type="button"
                disabled={currentIndex >= targets.length - 1}
                onClick={() => onLocate(targets[currentIndex + 1])}
              >
                下一个问题 <RightOutlined />
              </button>
            </div>
          </div>

          <ol className="homepage-editor__page-publish-review-list">
            {targets.map((target, index) => {
              const issue = issues[index];
              const selected = target.key === currentTarget?.key;
              const retriesPublish = issue?.path === "lifecycle.publish";
              const locate = () => {
                if (target.destination === "site-settings") {
                  // 使用既有路由离开保护，不能为跳转偷偷保存或丢弃当前草稿。
                  navigate(`/admin/site-content${target.field ? `?field=${encodeURIComponent(target.field)}` : ""}`);
                } else if (retriesPublish) {
                  onRetryPublish();
                } else {
                  onLocate(target);
                }
              };
              return (
                <li
                  key={target.key}
                  data-page-publish-issue-key={target.key}
                  data-page-publish-block={target.blockId}
                  data-page-publish-object={target.objectId}
                  data-page-publish-device={target.device}
                  data-page-publish-group={target.group}
                  data-page-publish-field={target.field}
                  data-page-publish-destination={target.destination}
                  aria-current={selected ? "step" : undefined}
                >
                  <button
                    type="button"
                    className="homepage-editor__page-publish-review-issue"
                    onClick={locate}
                  >
                    <span className="homepage-editor__page-publish-review-path">
                      {target.blockLabel} / {target.objectLabel} / {target.destination === "site-settings" ? "全站共用" : DEVICE_LABEL[target.device]}
                    </span>
                    <strong>{issue?.message ?? target.fieldLabel}</strong>
                    <span>{target.groupLabel} / {target.fieldLabel}</span>
                    {target.reason ? <small>{target.reason}</small> : null}
                  </button>
                  <button
                    type="button"
                    onClick={locate}
                  >
                    {retriesPublish
                      ? "重新发布"
                      : target.destination === "retry-validation"
                        ? "重新检查"
                        : target.destination === "site-settings"
                          ? "去店铺资料填写"
                          : "定位"}
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      ) : validationStatus === "unavailable" ? (
        <div className="homepage-editor__page-publish-review-clear" role="alert">
          <strong>暂时无法确认发布资格</strong>
          <span>草稿和上一轮问题状态仍保留。请重新检查；系统不会自动保存或发布。</span>
        </div>
      ) : (
        <div className="homepage-editor__page-publish-review-clear" role="status">
          <strong>当前问题已全部解决</strong>
          <span>页面不会自动保存或发布。请再次点击“发布”，以当前草稿执行新的发布检查。</span>
        </div>
      )}

      {publishConflict ? (
        <footer>
          <button type="button" onClick={onClose}>保留本地修改</button>
          <button type="button" onClick={onRetry}>
            <ReloadOutlined /> 重新加载远端草稿
          </button>
        </footer>
      ) : (
        <footer>
          <span>
            {permissionChanged
              ? "请重新登录后再试，或联系管理员确认发布权限。"
              : publishAttemptFailed
                ? "自动检查只更新发布资格，不会把本次失败改成成功。"
                : validationStatus === "validating"
                  ? "正在检查当前草稿…"
                  : "修改草稿后会自动重验，仅清除已解决的问题。"}
          </span>
          <button
            type="button"
            onClick={publishAttemptFailed ? onRetryPublish : onRetry}
            disabled={!publishAttemptFailed && validationStatus === "validating"}
          >
            <ReloadOutlined /> {publishAttemptFailed ? "重新发布" : "重新检查"}
          </button>
        </footer>
      )}
    </section>
  );
}

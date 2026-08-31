/**
 * RevisionDrawer.tsx — 发布版本历史抽屉。
 * 展示最近 20 条发布快照，支持恢复到草稿；
 * 存在未发布草稿时置顶展示草稿条目，可一键“编辑草稿”继续编辑。
 * 每个版本都标注发布状态（已发布 / 当前线上版本 / 未发布草稿）。
 */
import { Button, Drawer, Spin, Tag } from "antd";
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import type {
  PageDocumentRevision,
  PageDraftSnapshot,
} from "../editor-store";
import { formatEditorTime } from "../editor-utils";

export default function RevisionDrawer({
  open,
  revisions,
  loading,
  restoringVersion,
  rollingBackRevisionId,
  canRollback,
  draft,
  error,
  retryLabel,
  onClose,
  onRetry,
  onRestore,
  onRollback,
  onEditDraft,
}: {
  open: boolean;
  revisions: PageDocumentRevision[];
  loading: boolean;
  restoringVersion: number | null;
  rollingBackRevisionId: number | null;
  canRollback: boolean;
  draft: PageDraftSnapshot | null;
  error: string | null;
  retryLabel: string;
  onClose: () => void;
  onRetry: () => void;
  onRestore: (revision: PageDocumentRevision) => void;
  onRollback: (revision: PageDocumentRevision) => void;
  onEditDraft: () => void;
}) {
  const hasDraft = Boolean(draft);
  return (
    <Drawer
      title="发布版本"
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      className="homepage-editor__revision-drawer"
    >
      {loading ? (
        <div className="homepage-editor__revision-loading">
          <Spin />
        </div>
      ) : (
        <div className="homepage-editor__revision-scroll">
          {error ? (
            <div className="homepage-editor__revision-error" role="alert">
              <ExclamationCircleOutlined aria-hidden="true" />
              <div>
                <strong>版本操作未完成</strong>
                <span>{error}</span>
              </div>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={onRetry}
              >
                {retryLabel}
              </Button>
            </div>
          ) : null}

          {hasDraft ? (
            <article className="homepage-editor__revision-item is-draft">
              <div>
                <strong>
                  <FileTextOutlined />
                  未发布草稿
                </strong>
                <span className="homepage-editor__revision-time">
                  <ClockCircleOutlined />
                  {formatEditorTime(draft?.updatedAt)}
                </span>
                <span className="homepage-editor__revision-status-row">
                  <Tag
                    className="homepage-editor__revision-status is-draft"
                    bordered={false}
                  >
                    未发布
                  </Tag>
                </span>
              </div>
              <Button
                size="small"
                type="primary"
                ghost
                icon={<EditOutlined />}
                onClick={onEditDraft}
              >
                编辑草稿
              </Button>
            </article>
          ) : null}

          {revisions.length > 0 ? (
            <div className="homepage-editor__revision-list">
              {revisions.map((revision) => (
                <article
                  key={revision.id}
                  className={`homepage-editor__revision-item${
                    revision.isPublished ? " is-current" : ""
                  }`}
                >
                  <div>
                    <strong>版本 {revision.version}</strong>
                    <span className="homepage-editor__revision-time">
                      <ClockCircleOutlined />
                      {formatEditorTime(
                        revision.publishedAt || revision.createdAt,
                      )}
                    </span>
                    <span className="homepage-editor__revision-status-row">
                      <Tag
                        className="homepage-editor__revision-status is-published"
                        bordered={false}
                        icon={<CheckCircleFilled />}
                      >
                        发布成功
                      </Tag>
                      {revision.isPublished ? (
                        <Tag
                          className="homepage-editor__revision-status is-live"
                          bordered={false}
                        >
                          当前线上版本
                        </Tag>
                      ) : null}
                    </span>
                  </div>
                  <div className="homepage-editor__revision-actions">
                    <Button
                      size="small"
                      icon={<RollbackOutlined />}
                      loading={restoringVersion === revision.version}
                      onClick={() => onRestore(revision)}
                    >
                      恢复到草稿
                    </Button>
                    {canRollback && !revision.isPublished ? (
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        loading={rollingBackRevisionId === revision.id}
                        onClick={() => onRollback(revision)}
                      >
                        回滚线上到此版本
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {!error && !hasDraft && revisions.length === 0 ? (
            <div className="homepage-editor__revision-empty">
              还没有发布版本。发布首页后，这里会保留可回滚的快照。
            </div>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

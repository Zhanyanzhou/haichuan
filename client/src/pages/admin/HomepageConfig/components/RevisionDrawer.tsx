/** 页面发布历史：摘要分页、可信单版本预览、双基线比较与内存草稿恢复。 */
import { Alert, Button, Drawer, Empty, Spin, Tag } from "antd";
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import PuckDocumentRenderer from "@/page-builder/runtime/PuckDocumentRenderer";
import type { PuckDocument } from "@/page-builder/types";
import type {
  PageDocumentRevisionDetail,
  PageDocumentRevisionSummary,
  PageDraftSnapshot,
} from "../editor-store";
import { formatEditorTime, summarizePageHistoryDiff } from "../editor-utils";

type ComparisonSnapshot = {
  puckData: unknown;
  metadata?: Record<string, unknown>;
};

function RevisionDifference({
  title,
  revision,
  comparison,
}: {
  title: string;
  revision: PageDocumentRevisionDetail;
  comparison: ComparisonSnapshot | null;
}) {
  if (!comparison) {
    return <div className="homepage-editor__revision-diff"><strong>{title}</strong><span>当前内容不可用</span></div>;
  }
  const diff = summarizePageHistoryDiff(comparison, revision);
  return (
    <div className="homepage-editor__revision-diff">
      <strong>{title}</strong>
      {diff.unchanged ? (
        <Tag bordered={false}>内容一致</Tag>
      ) : (
        <span>
          区块 {diff.blockCountBefore} → {diff.blockCountAfter}
          {diff.rootChanged ? "；根设置有变化" : ""}
          {diff.changedMetadataKeys.length > 0
            ? `；页面设置 ${diff.changedMetadataKeys.length} 项变化`
            : ""}
        </span>
      )}
    </div>
  );
}

export default function RevisionDrawer({
  open,
  revisions,
  loading,
  loadingMore,
  nextBeforeVersion,
  selectedVersion,
  selectedRevision,
  detailLoading,
  detailError,
  rollingBackRevisionId,
  canRollback,
  draft,
  draftComparison,
  publishedComparison,
  error,
  onClose,
  onRetry,
  onLoadMore,
  onSelect,
  onStageRestore,
  onRollback,
  onEditDraft,
}: {
  open: boolean;
  revisions: PageDocumentRevisionSummary[];
  loading: boolean;
  loadingMore: boolean;
  nextBeforeVersion: number | null;
  selectedVersion: number | null;
  selectedRevision: PageDocumentRevisionDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  rollingBackRevisionId: number | null;
  canRollback: boolean;
  draft: PageDraftSnapshot | null;
  draftComparison: ComparisonSnapshot;
  publishedComparison: ComparisonSnapshot | null;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onSelect: (revision: PageDocumentRevisionSummary) => void;
  onStageRestore: (revision: PageDocumentRevisionDetail) => void;
  onRollback: (revision: PageDocumentRevisionSummary) => void;
  onEditDraft: () => void;
}) {
  return (
    <Drawer
      title="页面发布历史"
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      className="homepage-editor__revision-drawer"
    >
      {loading ? (
        <div className="homepage-editor__revision-loading"><Spin /><span>正在加载版本历史</span></div>
      ) : (
        <div className="homepage-editor__revision-layout">
          <div className="homepage-editor__revision-scroll" aria-label="页面版本列表">
            {error ? (
              <div className="homepage-editor__revision-error" role="alert">
                <ExclamationCircleOutlined aria-hidden="true" />
                <div><strong>版本列表未加载</strong><span>{error}</span></div>
                <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>重新加载</Button>
              </div>
            ) : null}

            {draft ? (
              <article className="homepage-editor__revision-item is-draft">
                <div>
                  <strong><FileTextOutlined /> 未发布草稿</strong>
                  <span className="homepage-editor__revision-time"><ClockCircleOutlined />{formatEditorTime(draft.updatedAt)}</span>
                  <Tag className="homepage-editor__revision-status is-draft" bordered={false}>未发布</Tag>
                </div>
                <Button size="small" type="primary" ghost icon={<EditOutlined />} onClick={onEditDraft}>编辑草稿</Button>
              </article>
            ) : null}

            <div className="homepage-editor__revision-list">
              {revisions.map((revision) => (
                <article
                  key={revision.id}
                  className={`homepage-editor__revision-item${revision.isPublished ? " is-current" : ""}${selectedVersion === revision.version ? " is-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="homepage-editor__revision-select"
                    aria-pressed={selectedVersion === revision.version}
                    onClick={() => onSelect(revision)}
                  >
                    <strong>版本 {revision.version}</strong>
                    <span className="homepage-editor__revision-time"><ClockCircleOutlined />{formatEditorTime(revision.publishedAt || revision.createdAt)}</span>
                    <span className="homepage-editor__revision-status-row">
                      <Tag className="homepage-editor__revision-status is-published" bordered={false} icon={<CheckCircleFilled />}>发布成功</Tag>
                      {revision.isPublished ? <Tag className="homepage-editor__revision-status is-live" bordered={false}>当前线上版本</Tag> : null}
                    </span>
                  </button>
                  {canRollback && !revision.isPublished ? (
                    <Button
                      size="small"
                      type="link"
                      loading={rollingBackRevisionId === revision.id}
                      onClick={() => onRollback(revision)}
                    >
                      回滚线上
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
            {!error && revisions.length === 0 ? <Empty description="还没有发布版本" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
            {nextBeforeVersion !== null ? (
              <Button block loading={loadingMore} onClick={onLoadMore}>加载更早版本</Button>
            ) : null}
          </div>

          <section className="homepage-editor__revision-detail" aria-label="页面版本详情">
            {detailLoading ? <div className="homepage-editor__revision-loading"><Spin /><span>正在核验版本正文</span></div> : null}
            {detailError ? (
              <Alert
                type="error"
                showIcon
                message="版本详情无法使用"
                description={detailError}
                action={selectedVersion !== null ? (
                  <Button size="small" onClick={() => {
                    const summary = revisions.find((item) => item.version === selectedVersion);
                    if (summary) onSelect(summary);
                  }}>重试</Button>
                ) : undefined}
              />
            ) : null}
            {!detailLoading && !detailError && !selectedRevision ? (
              <Empty description="选择一个版本后查看预览和差异" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : null}
            {selectedRevision ? (
              <>
                <div className="homepage-editor__revision-detail-header">
                  <div><strong>版本 {selectedRevision.version}</strong><span>可信单版本只读预览</span></div>
                  <Button type="primary" icon={<RollbackOutlined />} onClick={() => onStageRestore(selectedRevision)}>
                    载入当前草稿
                  </Button>
                </div>
                <Alert type="info" showIcon message="载入后仅形成未保存草稿，不会自动保存或发布。" />
                <div className="homepage-editor__revision-preview" aria-label={`版本 ${selectedRevision.version} 预览`}>
                  <PuckDocumentRenderer data={selectedRevision.puckData as PuckDocument} mode="preview" />
                </div>
                <div className="homepage-editor__revision-differences">
                  <RevisionDifference title="相对当前内存草稿" revision={selectedRevision} comparison={draftComparison} />
                  <RevisionDifference title="相对当前线上版本" revision={selectedRevision} comparison={publishedComparison} />
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
    </Drawer>
  );
}

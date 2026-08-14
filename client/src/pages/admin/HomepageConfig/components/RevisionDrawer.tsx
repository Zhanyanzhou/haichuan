/**
 * RevisionDrawer.tsx — 发布版本历史抽屉。
 * 展示最近 20 条发布快照，支持恢复到草稿。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { Button, Drawer, Spin } from "antd";
import { ClockCircleOutlined, RollbackOutlined } from "@ant-design/icons";
import type { PageDocumentRevision } from "../editor-store";
import { formatEditorTime } from "../editor-utils";

export default function RevisionDrawer({
  open,
  revisions,
  loading,
  restoringVersion,
  onClose,
  onRestore,
}: {
  open: boolean;
  revisions: PageDocumentRevision[];
  loading: boolean;
  restoringVersion: number | null;
  onClose: () => void;
  onRestore: (revision: PageDocumentRevision) => void;
}) {
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
      ) : revisions.length > 0 ? (
        <div className="homepage-editor__revision-list">
          {revisions.map((revision) => (
            <article
              key={revision.id}
              className="homepage-editor__revision-item"
            >
              <div>
                <strong>版本 {revision.version}</strong>
                <span>
                  <ClockCircleOutlined />
                  {formatEditorTime(revision.publishedAt || revision.createdAt)}
                </span>
              </div>
              <Button
                size="small"
                icon={<RollbackOutlined />}
                loading={restoringVersion === revision.version}
                onClick={() => onRestore(revision)}
              >
                恢复到草稿
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <div className="homepage-editor__revision-empty">
          还没有发布版本。发布首页后，这里会保留可回滚的快照。
        </div>
      )}
    </Drawer>
  );
}

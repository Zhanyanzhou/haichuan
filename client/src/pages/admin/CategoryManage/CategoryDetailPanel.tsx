import {
  Button,
  Popconfirm,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PictureOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { ADMIN_COPY } from "@/constants/adminCopy";
import {
  catIcon,
  countProductsRecursive,
  getParentName,
  type CatTreeNode,
} from "./categoryManageModel";

type CategoryDetailPanelProps = {
  node: CatTreeNode;
  tree: CatTreeNode[];
  reordering: boolean;
  onEdit: () => void;
  onCreateSub: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onViewProducts: () => void;
};

function Field({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="cat-detail__field">
      <span className="cat-detail__field-label">{label}</span>
      <span className="cat-detail__field-value">{value || "—"}</span>
    </div>
  );
}

export default function CategoryDetailPanel({
  node,
  tree,
  reordering,
  onEdit,
  onCreateSub,
  onDisable,
  onEnable,
  onViewProducts,
}: Readonly<CategoryDetailPanelProps>) {
  const parentName = getParentName(tree, node.parentId);
  const productCount =
    node.level === 1
      ? countProductsRecursive(node)
      : (node._count?.products ?? 0);
  const childCount =
    node.level === 1
      ? (node.children?.length ?? 0)
      : (node._count?.children ?? 0);
  const enabled = node.isActive !== false;
  const hasDependencies =
    node.level === 1
      ? childCount > 0 || productCount > 0
      : productCount > 0;

  return (
    <div className="cat-detail">
      <div className="cat-detail__head">
        <span className="cat-tree-title__icon" style={{ fontSize: 18 }}>
          {catIcon(node)}
        </span>
        <div>
          <div className="cat-detail__name">{node.name}</div>
          <div className="cat-detail__meta">
            {node.level === 1 ? "一级分类" : "二级分类"} · {node.slug}
          </div>
        </div>
        <div className="cat-detail__actions">
          {node.level === 1 && (
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={onCreateSub}
              disabled={reordering}
            >
              新建二级分类
            </Button>
          )}
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={onEdit}
            disabled={reordering}
          >
            编辑
          </Button>
          {enabled ? (
            hasDependencies ? (
              <Tooltip
                title={
                  node.level === 1
                    ? "该分类下还有二级分类或商品，请先处理关联项。"
                    : "该分类包含商品，请先处理关联商品。"
                }
              >
                <span>
                  <Button size="small" danger disabled>
                    停用
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Popconfirm
                title="停用分类"
                description="停用后该分类在后台与前台均不再展示。"
                okText="停用分类"
                cancelText={ADMIN_COPY.actions.cancel}
                onConfirm={onDisable}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  停用
                </Button>
              </Popconfirm>
            )
          ) : (
            <Button size="small" onClick={onEnable}>
              启用
            </Button>
          )}
        </div>
      </div>

      <section className="cat-detail__section">
        <div className="cat-detail__section-title">基础信息</div>
        <div className="cat-detail__grid">
          <Field label="分类名称" value={node.name} />
          <Field label="分类编码" value={node.slug} />
          <Field label="所属分类" value={parentName} />
          <Field label="排序" value={String(node.sortOrder)} />
          <div className="cat-detail__field">
            <span className="cat-detail__field-label">状态</span>
            <Tag
              color={enabled ? "success" : "default"}
              style={{ width: "fit-content" }}
            >
              {enabled ? ADMIN_COPY.status.enabled : ADMIN_COPY.status.disabled}
            </Tag>
          </div>
        </div>
      </section>

      <section className="cat-detail__section">
        <div className="cat-detail__section-title">商品信息</div>
        <div className="cat-detail__products">
          <div className="cat-detail__products-count">{productCount}</div>
          <div className="cat-detail__products-label">
            关联商品数量
            {node.level === 1 && childCount > 0
              ? ` · 含 ${childCount} 个二级分类`
              : ""}
          </div>
          <Button
            size="small"
            type="link"
            icon={<RightOutlined />}
            onClick={onViewProducts}
            disabled={productCount === 0}
          >
            查看商品列表
          </Button>
        </div>
      </section>

      <section className="cat-detail__section">
        <div className="cat-detail__section-title">展示设置</div>
        <div className="cat-detail__cover">
          {node.coverImage ? (
            <img
              src={node.coverImage}
              alt={node.name}
              className="cat-detail__cover-img"
            />
          ) : (
            <div className="cat-detail__cover-empty">
              <PictureOutlined />
            </div>
          )}
          <div className="cat-detail__products-label">
            分类图片{node.coverImage ? "" : "（未设置）"}，可在编辑分类弹窗中上传。
          </div>
        </div>
        <div className="cat-detail__switches">
          <div className="cat-detail__switch-row">
            <Switch
              checked={enabled}
              disabled
              onChange={enabled ? onDisable : onEnable}
            />
            <span>前台显示/导航显示</span>
            <span className="cat-detail__switch-tip">
              （当前共用同一开关；关闭后该分类在后台导航与前台均不展示）
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

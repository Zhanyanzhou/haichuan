import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Tree,
  Upload,
  message,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  PictureOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { TreeDataNode } from "antd";
import ScifiButton from "@/components/ui/ScifiButton";
import { categoryApi, uploadApi } from "@/services/api";
import type { Category, CategoryInput, CategorySortItem } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import "./CategoryManage.css";

/* ═══════════════════════════════════════════════
   类型与辅助函数
   ═══════════════════════════════════════════════ */

interface CatTreeNode extends Category {
  children?: CatTreeNode[];
}

interface CatTreeDataNode extends TreeDataNode {
  node?: CatTreeNode;
}

/** 分类图标:优先取自定义 icon,否则按层级给默认符号。 */
function catIcon(node: CatTreeNode): string {
  if (node.icon) return node.icon;
  return node.level === 1 ? "◆" : "·";
}

/** 一级分类的关联商品数 = 子树所有 _count.products 求和(原始树含三级数据)。 */
function countProductsRecursive(node: CatTreeNode): number {
  const self = node._count?.products ?? 0;
  const childSum = (node.children ?? []).reduce(
    (sum, c) => sum + countProductsRecursive(c),
    0,
  );
  return self + childSum;
}

/** 构建所有节点 → 父 id 的映射,供 onDrop 判同级。 */
function buildParentMap(
  nodes: CatTreeNode[],
  parent: number | null = null,
  out = new Map<number, number | null>(),
): Map<number, number | null> {
  for (const n of nodes) {
    out.set(n.id, parent);
    if (n.children?.length) buildParentMap(n.children, n.id, out);
  }
  return out;
}

/** 构造 AntD Tree 数据。仅渲染到二级:一级下钻,二级不再展开三级。 */
function buildTreeData(nodes: CatTreeNode[]): CatTreeDataNode[] {
  return nodes.map((n) => ({
    key: n.id,
    node: n,
    children:
      n.level === 1 && n.children?.length ? buildTreeData(n.children) : undefined,
  }));
}

function findNode(nodes: CatTreeNode[], id: number): CatTreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function getSiblings(tree: CatTreeNode[], parent: number | null): CatTreeNode[] {
  if (parent === null) return tree;
  return findNode(tree, parent)?.children ?? [];
}

function getParentName(tree: CatTreeNode[], parentId?: number | null): string {
  if (!parentId) return "—";
  return findNode(tree, parentId)?.name ?? "—";
}

/** 不可变更新:把 parent 下兄弟段整体替换并写回递增的 sortOrder。 */
function applySiblingOrder(
  tree: CatTreeNode[],
  parent: number | null,
  newSiblings: CatTreeNode[],
): CatTreeNode[] {
  if (parent === null) {
    return newSiblings.map((s, i) => ({ ...s, sortOrder: i + 1 }));
  }
  const walk = (nodes: CatTreeNode[]): CatTreeNode[] =>
    nodes.map((n) => {
      if (n.id === parent) {
        return { ...n, children: newSiblings.map((s, i) => ({ ...s, sortOrder: i + 1 })) };
      }
      if (n.children?.length) return { ...n, children: walk(n.children) };
      return n;
    });
  return walk(tree);
}

/** 关键词过滤:匹配 name/slug,保留命中节点及其祖先路径。 */
function filterTree(nodes: CatTreeNode[], query: string): CatTreeNode[] {
  if (!query) return nodes;
  const q = query.toLowerCase();
  const walk = (list: CatTreeNode[]): CatTreeNode[] => {
    const result: CatTreeNode[] = [];
    for (const n of list) {
      const selfMatch =
        n.name.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q);
      const filteredChildren = n.children?.length ? walk(n.children) : [];
      if (selfMatch || filteredChildren.length) {
        // 命中时保留其原有子树,方便用户看到完整上下文
        result.push({ ...n, children: selfMatch ? n.children : filteredChildren });
      }
    }
    return result;
  };
  return walk(nodes);
}

/* ═══════════════════════════════════════════════
   子组件
   ═══════════════════════════════════════════════ */

function TreeTitle({
  node,
  selected,
  busy,
}: Readonly<{
  node: CatTreeNode;
  selected: boolean;
  busy: boolean;
}>) {
  const inactive = node.isActive === false;
  const count =
    node.level === 1 ? countProductsRecursive(node) : node._count?.products ?? 0;
  return (
    <div
      className={`cat-tree-title${selected ? " is-selected" : ""}${inactive ? " is-inactive" : ""}${busy ? " is-busy" : ""}`}
    >
      <span className="cat-tree-title__icon">{catIcon(node)}</span>
      <span className={`cat-tree-title__name cat-tree-title__name--l${node.level}`}>
        {node.name}
      </span>
      {inactive && <span className="cat-tree-title__dot" title="已停用" />}
      <span className="cat-tree-title__count">{count}</span>
    </div>
  );
}

function CategoryImageUpload({
  value,
  onChange,
}: Readonly<{ value?: string; onChange?: (url: string) => void }>) {
  const beforeUpload = async (file: File) => {
    try {
      const result = await uploadApi.uploadImage(file);
      onChange?.(unwrapResponse<{ url: string }>(result).url);
      message.success("分类图片上传成功");
    } catch (err) {
      console.error("分类图片上传失败:", err);
      message.error("分类图片上传失败,请重试");
    }
    return false;
  };
  return (
    <Space wrap>
      {value ? (
        <img
          src={value}
          alt="分类图片预览"
          style={{ width: 72, height: 72, borderRadius: 4, objectFit: "cover", border: "1px solid var(--adm-line)" }}
        />
      ) : null}
      <Upload accept="image/*" showUploadList={false} beforeUpload={beforeUpload as any}>
        <ScifiButton variant="outline" size="sm">
          <PictureOutlined /> {value ? "更换图片" : "上传图片"}
        </ScifiButton>
      </Upload>
    </Space>
  );
}

/* ═══════════════════════════════════════════════
   主组件
   ═══════════════════════════════════════════════ */

export default function CategoryManage() {
  const navigate = useNavigate();
  const [tree, setTree] = useState<CatTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [keyword, setKeyword] = useState("");
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatTreeNode | null>(null);
  const [form] = Form.useForm();
  const prevTreeRef = useRef<CatTreeNode[] | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await categoryApi.getManageTree();
      const data = unwrapResponse<CatTreeNode[]>(res);
      setTree(data);
      // 首次加载默认展开全部一级;后续刷新保留用户已展开状态
      setExpandedKeys((prev) =>
        prev.length
          ? prev
          : data.filter((n) => n.level === 1).map((n) => n.id),
      );
    } catch (err) {
      console.error("分类树加载失败:", err);
      setTree([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const parentMap = useMemo(() => buildParentMap(tree), [tree]);
  const filteredTree = useMemo(() => filterTree(tree, keyword.trim()), [tree, keyword]);
  const treeData = useMemo(() => buildTreeData(filteredTree), [filteredTree]);
  const primaryCategories = useMemo(
    () => tree.filter((c) => c.level === 1),
    [tree],
  );

  // 搜索命中:把命中节点及其祖先并入 expandedKeys
  useEffect(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return;
    const matched = new Set<number>();
    const collect = (nodes: CatTreeNode[], ancestors: number[]) => {
      for (const n of nodes) {
        const self = n.name.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q);
        if (self) {
          ancestors.forEach((a) => matched.add(a));
          matched.add(n.id);
        }
        if (n.children?.length) collect(n.children, [...ancestors, n.id]);
      }
    };
    collect(tree, []);
    if (matched.size) {
      setExpandedKeys((prev) => Array.from(new Set([...prev, ...matched])));
    }
  }, [keyword, tree]);

  const selectedNode = useMemo(
    () => (selectedKeys[0] != null ? findNode(tree, selectedKeys[0]) : undefined),
    [tree, selectedKeys],
  );

  /* ───── 拖拽排序 ───── */
  const handleDrop = (info: any) => {
    // 1) 拒绝"成为某节点子级"的放置
    if (!info.dropToGap) {
      message.warning("仅支持同级节点之间排序,不能改变层级");
      return;
    }
    const dragKey = Number(info.dragNode.key);
    const dropKey = Number(info.node.key);
    const dragParent = parentMap.get(dragKey) ?? null;
    const dropParent = parentMap.get(dropKey) ?? null;
    // 2) 同级校验
    if (dragParent !== dropParent) {
      message.warning("不能跨级移动分类");
      return;
    }
    // 3) 相对位置:-1 前置,1 后置(dropToGap 时 0 极少出现,并入后置)
    const posArr = String(info.node.pos || "").split("-");
    const rel = info.dropPosition - Number(posArr[posArr.length - 1]);
    // 4) 兄弟段(按 sortOrder)+ 插入
    const siblings = getSiblings(tree, dragParent)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const dragNode = siblings.find((s) => s.id === dragKey);
    if (!dragNode) return;
    const withoutDrag = siblings.filter((s) => s.id !== dragKey);
    const dropIdx = withoutDrag.findIndex((s) => s.id === dropKey);
    if (dropIdx < 0) return;
    const insertAt = rel < 0 ? dropIdx : dropIdx + 1;
    withoutDrag.splice(insertAt, 0, dragNode);
    const payload: CategorySortItem[] = withoutDrag.map((s, i) => ({
      id: s.id,
      sortOrder: i + 1,
    }));

    // 5) 乐观更新 + 调接口 + 失败回滚
    prevTreeRef.current = tree;
    setTree(applySiblingOrder(tree, dragParent, withoutDrag));
    void commitReorder(payload);
  };

  const commitReorder = async (payload: CategorySortItem[]) => {
    setReordering(true);
    try {
      await categoryApi.reorder(payload);
      // 乐观更新已生效,不强制 refresh(以本地为准,减少请求)
    } catch (err: any) {
      console.error("排序更新失败:", err);
      message.error(err?.message || "排序更新失败,已还原");
      if (prevTreeRef.current) setTree(prevTreeRef.current);
    } finally {
      setReordering(false);
      prevTreeRef.current = null;
    }
  };

  /* ───── 新增 / 编辑 ───── */
  const openCreate = (parentId?: number | null) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      parentId: parentId ?? null,
      sortOrder: 0,
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEdit = (node: CatTreeNode) => {
    setEditing(node);
    form.setFieldsValue({ ...node, parentId: node.parentId ?? null });
    setModalOpen(true);
  };

  const handleSave = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const payload: CategoryInput = {
      name: values.name,
      slug: values.slug,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
      icon: values.icon,
      coverImage: values.coverImage,
    };
    setSaving(true);
    try {
      if (editing) {
        // 编辑:仅非一级才允许带 parentId(一级不支持改归属)
        if (editing.level !== 1 && values.parentId != null) {
          payload.parentId = values.parentId;
        }
        await categoryApi.update(editing.id, payload);
        message.success("分类已更新");
      } else {
        // 新增:parentId 为 null → 一级;否则二级
        if (values.parentId != null) payload.parentId = values.parentId;
        const res = await categoryApi.create(payload);
        const created = unwrapResponse<Category>(res);
        message.success("分类已创建");
        if (created?.id) setSelectedKeys([created.id]);
      }
      setModalOpen(false);
      await refresh();
    } catch (err: any) {
      console.error("保存分类失败:", err);
      message.error(err?.message || "保存失败,请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  /* ───── 启用 / 停用(停用走 delete 接口,自带关联保护) ───── */
  const handleDisable = async (node: CatTreeNode) => {
    try {
      await categoryApi.delete(node.id);
      message.success("已停用");
      await refresh();
    } catch (err: any) {
      console.error("停用失败:", err);
      message.error(err?.message || "停用失败,请先处理关联项");
    }
  };

  const handleEnable = async (node: CatTreeNode) => {
    try {
      await categoryApi.update(node.id, { isActive: true });
      message.success("已启用");
      await refresh();
    } catch (err: any) {
      console.error("启用失败:", err);
      message.error(err?.message || "启用失败,请稍后重试");
    }
  };

  const handleSelect: (keys: React.Key[]) => void = (keys) => {
    setSelectedKeys(keys.map(Number));
  };

  /* ───── 渲染 ───── */
  if (loading) {
    return (
      <div className="cat-manage" style={{ alignItems: "center", justifyContent: "center" }}>
        <Spin tip="正在加载分类…" />
      </div>
    );
  }

  return (
    <div className="cat-manage">
      <header className="cat-manage__header">
        <div className="cat-manage__title">
          <h1>分类管理</h1>
          <p>维护一、二级分类;拖拽同级节点可调整前后台展示顺序。</p>
        </div>
        <ScifiButton variant="gold" size="sm" onClick={() => openCreate(null)}>
          <PlusOutlined /> 新增一级分类
        </ScifiButton>
      </header>

      <div className="cat-manage__body">
        {/* ───── 左侧树 ───── */}
        <aside className="cat-manage__tree">
          <div className="cat-manage__search">
            <Input.Search
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索分类名称或 Slug"
              size="middle"
            />
          </div>
          <div className="cat-manage__tree-widget">
            {loadError ? (
              <Empty description="分类加载失败" style={{ margin: "32px 0" }}>
                <ScifiButton variant="outline" size="sm" onClick={() => void refresh()}>
                  重新加载
                </ScifiButton>
              </Empty>
            ) : treeData.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={keyword ? "没有匹配的分类" : "暂无分类"}
                style={{ margin: "32px 0" }}
              />
            ) : (
              <>
                {reordering && (
                  <Alert
                    type="info"
                    showIcon
                    message="正在保存排序…"
                    style={{ margin: "0 4px 8px" }}
                  />
                )}
                <Tree
                  treeData={treeData as TreeDataNode[]}
                  draggable
                  blockNode
                  selectedKeys={selectedKeys}
                  expandedKeys={expandedKeys}
                  onExpand={(keys) => setExpandedKeys(keys.map(Number))}
                  onSelect={handleSelect}
                  onDrop={handleDrop}
                  titleRender={(dataNode: TreeDataNode) => {
                    const n = (dataNode as CatTreeDataNode).node;
                    if (!n) return null;
                    return (
                      <TreeTitle
                        node={n}
                        selected={selectedKeys[0] === n.id}
                        busy={reordering}
                      />
                    );
                  }}
                />
              </>
            )}
          </div>
        </aside>

        {/* ───── 右侧详情 ───── */}
        <section className="cat-manage__detail">
          {!selectedNode ? (
            <div className="cat-manage__detail-empty">
              <FolderOpenOutlined />
              <span>从左侧选择分类查看详情</span>
            </div>
          ) : (
            <DetailPanel
              key={selectedNode.id}
              node={selectedNode}
              tree={tree}
              reordering={reordering}
              onEdit={() => openEdit(selectedNode)}
              onCreateSub={() => openCreate(selectedNode.id)}
              onDisable={() => void handleDisable(selectedNode)}
              onEnable={() => void handleEnable(selectedNode)}
              onViewProducts={() =>
                navigate(`/admin/products?categoryId=${selectedNode.id}`)
              }
            />
          )}
        </section>
      </div>

      {/* ───── 新增 / 编辑弹窗 ───── */}
      <Modal
        className="cat-modal"
        destroyOnClose
        title={editing ? "编辑分类" : "新增分类"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSave()}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 20 }}>
          {/* parentId 可为 null(表示"作为一级分类"),不能设 required,否则一级分类的新增/编辑都会被校验拦住 */}
          <Form.Item name="parentId" label="父级分类">
            <Select
              options={[
                { value: null, label: "—— 作为一级分类 ——" },
                ...primaryCategories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="name"
              label="分类名称"
              rules={[
                { required: true, whitespace: true, message: "请填写分类名称" },
              ]}
            >
              <Input placeholder="例如:吊坠" />
            </Form.Item>
            <Form.Item
              name="slug"
              label="分类编码 Slug"
              rules={[
                { required: true, whitespace: true, message: "请填写 Slug" },
                {
                  pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                  message: "仅支持小写字母、数字和连字符",
                },
              ]}
            >
              <Input placeholder="例如:pendant" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="sortOrder" label="排序">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="icon" label="图标(可选 emoji)">
              <Input maxLength={20} placeholder="例如:◆" />
            </Form.Item>
          </div>

          <Form.Item name="coverImage" label="分类图片(可选)">
            <CategoryImageUpload />
          </Form.Item>

          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   详情面板
   ═══════════════════════════════════════════════ */

function DetailPanel({
  node,
  tree,
  reordering,
  onEdit,
  onCreateSub,
  onDisable,
  onEnable,
  onViewProducts,
}: Readonly<{
  node: CatTreeNode;
  tree: CatTreeNode[];
  reordering: boolean;
  onEdit: () => void;
  onCreateSub: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onViewProducts: () => void;
}>) {
  const parentName = getParentName(tree, node.parentId);
  const productCount =
    node.level === 1 ? countProductsRecursive(node) : node._count?.products ?? 0;
  const childCount =
    node.level === 1 ? node.children?.length ?? 0 : node._count?.children ?? 0;
  const enabled = node.isActive !== false;
  // 是否可停用:一级有二级子类或关联商品 → 禁止;二级有商品 → 禁止
  const hasDependencies = node.level === 1 ? childCount > 0 || productCount > 0 : productCount > 0;

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
            <Button size="small" icon={<PlusOutlined />} onClick={onCreateSub} disabled={reordering}>
              新增二级
            </Button>
          )}
          <Button size="small" icon={<EditOutlined />} onClick={onEdit} disabled={reordering}>
            编辑
          </Button>
          {enabled ? (
            hasDependencies ? (
              <Tooltip
                title={
                  node.level === 1
                    ? "该分类下还有二级分类或商品,请先处理关联项"
                    : "该分类包含商品,请先处理关联商品"
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
                okText="确认停用"
                cancelText="取消"
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

      {/* 基础信息 */}
      <section className="cat-detail__section">
        <div className="cat-detail__section-title">基础信息</div>
        <div className="cat-detail__grid">
          <Field label="分类名称" value={node.name} />
          <Field label="分类编码" value={node.slug} />
          <Field label="所属分类" value={parentName} />
          <Field label="排序" value={String(node.sortOrder)} />
          <div className="cat-detail__field">
            <span className="cat-detail__field-label">状态</span>
            <Tag color={enabled ? "success" : "default"} style={{ width: "fit-content" }}>
              {enabled ? "启用" : "已停用"}
            </Tag>
          </div>
        </div>
      </section>

      {/* 商品信息 */}
      <section className="cat-detail__section">
        <div className="cat-detail__section-title">商品信息</div>
        <div className="cat-detail__products">
          <div className="cat-detail__products-count">{productCount}</div>
          <div className="cat-detail__products-label">
            关联商品数量
            {node.level === 1 && childCount > 0 ? ` · 含 ${childCount} 个二级分类` : ""}
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

      {/* 展示设置 */}
      <section className="cat-detail__section">
        <div className="cat-detail__section-title">展示设置</div>
        <div className="cat-detail__cover">
          {node.coverImage ? (
            <img src={node.coverImage} alt={node.name} className="cat-detail__cover-img" />
          ) : (
            <div className="cat-detail__cover-empty">
              <PictureOutlined />
            </div>
          )}
          <div className="cat-detail__products-label">
            分类图片{node.coverImage ? "" : "(未设置)"},在弹窗中编辑上传。
          </div>
        </div>
        <div className="cat-detail__switches">
          <div className="cat-detail__switch-row">
            <Switch checked={enabled} disabled onChange={enabled ? onDisable : onEnable} />
            <span>前台显示 / 导航显示</span>
            <span className="cat-detail__switch-tip">
              (当前共用同一开关:关闭后该分类在后台导航与前台均不展示)
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="cat-detail__field">
      <span className="cat-detail__field-label">{label}</span>
      <span className="cat-detail__field-value">{value || "—"}</span>
    </div>
  );
}

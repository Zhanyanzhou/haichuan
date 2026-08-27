import { useEffect, useMemo, useRef, useState } from "react";
import type { Key } from "react";
import { useNavigate } from "react-router-dom";
import { App as AntdApp, Button, Form } from "antd";
import { FolderOpenOutlined, PlusOutlined } from "@ant-design/icons";
import { categoryApi } from "@/services/api";
import type { Category, CategoryInput, CategorySortItem } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { AdminLoadingState } from "@/components/common/AdminDataStates";
import CategoryDetailPanel from "./CategoryDetailPanel";
import CategoryFormModal from "./CategoryFormModal";
import CategoryTreePanel from "./CategoryTreePanel";
import {
  applySiblingOrder,
  buildParentMap,
  buildTreeData,
  filterTree,
  findNode,
  getSiblings,
  type CatTreeNode,
  type CategoryDropInfo,
} from "./categoryManageModel";
import "./CategoryManage.css";

export default function CategoryManage() {
  const { message } = AntdApp.useApp();
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
  const [form] = Form.useForm<CategoryInput>();
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
  const handleDrop = (info: CategoryDropInfo) => {
    // 1) 拒绝"成为某节点子级"的放置
    if (!info.dropToGap) {
      message.warning("仅支持同级节点之间排序，不能改变层级。");
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
    } catch (err: unknown) {
      console.error("排序更新失败:", err);
      message.error(getSafeAdminErrorMessage(err, "分类排序更新失败，页面已还原原顺序，请重试。"));
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
      parentId: parentId ?? 0,
      sortOrder: 0,
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEdit = (node: CatTreeNode) => {
    setEditing(node);
    form.setFieldsValue({ ...node, parentId: node.parentId ?? 0 });
    setModalOpen(true);
  };

  const handleSave = async () => {
    let values: CategoryInput;
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
        if (editing.level !== 1 && Number(values.parentId) > 0) {
          payload.parentId = values.parentId;
        }
        await categoryApi.update(editing.id, payload);
        message.success("分类已更新");
      } else {
        // 新增:parentId 为 0 → 一级;正整数为二级
        if (Number(values.parentId) > 0) payload.parentId = values.parentId;
        const res = await categoryApi.create(payload);
        const created = unwrapResponse<Category>(res);
        message.success("分类已创建");
        if (created?.id) setSelectedKeys([created.id]);
      }
      setModalOpen(false);
      await refresh();
    } catch (err: unknown) {
      console.error("保存分类失败:", err);
      message.error(getSafeAdminErrorMessage(err, "分类保存失败，请检查填写内容后重试。"));
    } finally {
      setSaving(false);
    }
  };

  /* ───── 启用 / 停用(停用走 delete 接口,自带关联保护) ───── */
  const handleDisable = async (node: CatTreeNode) => {
    try {
      await categoryApi.delete(node.id);
      message.success("分类已停用");
      await refresh();
    } catch (err: unknown) {
      console.error("停用失败:", err);
      message.error(getSafeAdminErrorMessage(err, "分类停用失败，请检查关联商品后重试。"));
    }
  };

  const handleEnable = async (node: CatTreeNode) => {
    try {
      await categoryApi.update(node.id, { isActive: true });
      message.success("分类已启用");
      await refresh();
    } catch (err: unknown) {
      console.error("启用失败:", err);
      message.error(getSafeAdminErrorMessage(err, "分类启用失败，请重新加载后重试。"));
    }
  };

  const handleSelect = (keys: Key[]) => {
    setSelectedKeys(keys.map(Number));
  };

  /* ───── 渲染 ───── */
  if (loading) {
    return (
      <div className="cat-manage" style={{ alignItems: "center", justifyContent: "center" }}>
        <AdminLoadingState subject="分类" />
      </div>
    );
  }

  return (
    <div className="cat-manage">
      <header className="cat-manage__header">
        <div className="cat-manage__title">
          <h1>分类管理</h1>
          <p>维护一、二级分类；拖拽同级节点可调整前后台展示顺序。</p>
        </div>
        <Button type="primary" size="small" onClick={() => openCreate(null)}>
          <PlusOutlined /> 新建一级分类
        </Button>
      </header>

      <div className="cat-manage__body">
        <CategoryTreePanel
          treeData={treeData}
          keyword={keyword}
          selectedKeys={selectedKeys}
          expandedKeys={expandedKeys}
          reordering={reordering}
          loadError={loadError}
          onKeywordChange={setKeyword}
          onRefresh={refresh}
          onSelect={handleSelect}
          onExpand={(keys) => setExpandedKeys(keys.map(Number))}
          onDrop={handleDrop}
        />

        {/* ───── 右侧详情 ───── */}
        <section className="cat-manage__detail">
          {!selectedNode ? (
            <div className="cat-manage__detail-empty">
              <FolderOpenOutlined />
              <span>从左侧选择分类查看详情</span>
            </div>
          ) : (
            <CategoryDetailPanel
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

      <CategoryFormModal
        open={modalOpen}
        editing={editing}
        form={form}
        saving={saving}
        primaryCategories={primaryCategories}
        onCancel={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}

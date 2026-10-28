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
  categorySlugFromName,
  collectSlugs,
  findNode,
  nextSortOrder,
  orderedSiblings,
  removeNode,
  withoutRetiredEmpty,
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
  const [createParentId, setCreateParentId] = useState<number | null>(null);
  const [form] = Form.useForm<CategoryInput>();
  const prevTreeRef = useRef<CatTreeNode[] | null>(null);

  const refresh = async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const res = await categoryApi.getManageTree();
      const data = unwrapResponse<CatTreeNode[]>(res);
      setTree(data);
      setSelectedKeys((current) => {
        const selectedId = current[0];
        if (selectedId != null && findNode(data, selectedId)) return current;
        return data[0] ? [data[0].id] : [];
      });
      // 首次加载默认展开全部一级;后续刷新保留用户已展开状态
      setExpandedKeys((prev) =>
        prev.length
          ? prev
          : data.filter((n) => n.level === 1).map((n) => n.id),
      );
    } catch (err) {
      console.error("分类树加载失败:", err);
      if (silent) {
        message.error("分类列表刷新失败，请重新加载。");
      } else {
        setTree([]);
        setLoadError(true);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const parentMap = useMemo(() => buildParentMap(tree), [tree]);
  const visibleTree = useMemo(() => withoutRetiredEmpty(tree), [tree]);
  const filteredTree = useMemo(
    () => filterTree(visibleTree, keyword.trim()),
    [visibleTree, keyword],
  );
  const treeData = useMemo(() => buildTreeData(filteredTree), [filteredTree]);

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
    () => (selectedKeys[0] != null ? findNode(visibleTree, selectedKeys[0]) : undefined),
    [visibleTree, selectedKeys],
  );

  useEffect(() => {
    const selectedId = selectedKeys[0];
    if (selectedId == null || findNode(visibleTree, selectedId) || !visibleTree[0]) return;
    setSelectedKeys([visibleTree[0].id]);
  }, [visibleTree, selectedKeys]);

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
    const siblings = orderedSiblings(tree, dragParent);
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
    const parent = parentId && parentId > 0 ? parentId : null;
    setCreateParentId(parent);
    form.resetFields();
    setModalOpen(true);
  };

  const createCategory = async (parentId: number | null, rawName: string) => {
    const name = rawName.trim();
    if (!name) return false;
    const payload: CategoryInput = {
      name,
      slug: categorySlugFromName(name, collectSlugs(tree)),
      sortOrder: nextSortOrder(tree, parentId),
    };
    if (parentId) payload.parentId = parentId;
    setSaving(true);
    try {
      const res = await categoryApi.create(payload);
      const created = unwrapResponse<Category>(res);
      message.success(parentId ? "款式已添加" : "品类已创建");
      if (created?.id) {
        setSelectedKeys([created.id]);
        if (parentId) {
          setExpandedKeys((current) => Array.from(new Set([...current, parentId])));
        }
      }
      await refresh(true);
      return true;
    } catch (err: unknown) {
      console.error("保存分类失败:", err);
      message.error(getSafeAdminErrorMessage(err, "分类保存失败，请检查填写内容后重试。"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    let values: CategoryInput;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const created = await createCategory(createParentId, values.name ?? "");
    if (created) setModalOpen(false);
  };

  const handleShift = (node: CatTreeNode, direction: -1 | 1) => {
    const parentId = node.parentId ?? null;
    const siblings = orderedSiblings(tree, parentId);
    const index = siblings.findIndex((item) => item.id === node.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const next = siblings.slice();
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    const payload: CategorySortItem[] = next.map((item, position) => ({
      id: item.id,
      sortOrder: position + 1,
    }));
    prevTreeRef.current = tree;
    setTree(applySiblingOrder(tree, parentId, next));
    void commitReorder(payload);
  };

  const handleDelete = async (node: CatTreeNode, moveTo?: number) => {
    const snapshot = tree;
    const snapshotSelection = selectedKeys;
    setSaving(true);
    setTree((current) => removeNode(current, node.id));
    setSelectedKeys((current) => current.filter((id) => id !== node.id));
    try {
      await categoryApi.delete(node.id, moveTo);
      message.success(moveTo ? "分类已删除，商品已改到所选分类" : "分类已删除");
      await refresh(true);
      setTree((current) => removeNode(current, node.id));
    } catch (err: unknown) {
      console.error("删除分类失败:", err);
      setTree(snapshot);
      setSelectedKeys(snapshotSelection);
      message.error(
        getSafeAdminErrorMessage(
          err,
          "分类还在。有商品时请先选择要改去的分类，再删除。",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (node: CatTreeNode, name: string) => {
    setSaving(true);
    try {
      await categoryApi.update(node.id, { name });
      message.success("分类名称已更新");
      await refresh(true);
    } catch (err: unknown) {
      console.error("更新分类名称失败:", err);
      message.error(getSafeAdminErrorMessage(err, "分类名称保存失败，请重试。"));
    } finally {
      setSaving(false);
    }
  };

  const handleCoverChange = async (node: CatTreeNode, coverImage: string) => {
    setSaving(true);
    try {
      await categoryApi.update(node.id, { coverImage });
      message.success("分类封面已更新");
      await refresh(true);
    } catch (err: unknown) {
      console.error("更新分类封面失败:", err);
      message.error(getSafeAdminErrorMessage(err, "分类封面保存失败，请重试。"));
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (node: CatTreeNode, parentId: number) => {
    if (!parentId || node.parentId === parentId) return;
    setSaving(true);
    try {
      await categoryApi.update(node.id, {
        parentId,
        sortOrder: nextSortOrder(tree, parentId),
      });
      message.success("已改到新的品类下");
      setExpandedKeys((current) => Array.from(new Set([...current, parentId])));
      await refresh(true);
    } catch (err: unknown) {
      console.error("调整所属品类失败:", err);
      message.error(getSafeAdminErrorMessage(err, "所属品类修改失败，请重试。"));
    } finally {
      setSaving(false);
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
          <p>品类下面是款式。左侧顺序就是前台顺序。商品在商品资料里选择分类。</p>
        </div>
        <Button type="primary" onClick={() => openCreate(null)}>
          <PlusOutlined /> 新建品类
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
              <span>还没有品类。用右上角的「新建品类」开始。</span>
            </div>
          ) : (
            <CategoryDetailPanel
              key={selectedNode.id}
              node={selectedNode}
              tree={visibleTree}
              keyword={keyword}
              reordering={reordering}
              saving={saving}
              onAddStyle={(name) => createCategory(selectedNode.id, name)}
              onDelete={(moveTo) => void handleDelete(selectedNode, moveTo)}
              onMove={(parentId) => void handleMove(selectedNode, parentId)}
              onOpen={(id) => setSelectedKeys([id])}
              onShift={(direction) => handleShift(selectedNode, direction)}
              onRename={(name) => void handleRename(selectedNode, name)}
              onCoverChange={(url) => void handleCoverChange(selectedNode, url)}
              onViewProducts={() => {
                const params = new URLSearchParams({
                  categoryId: String(selectedNode.id),
                });
                if (selectedNode.level === 1) {
                  params.set("includeDescendants", "1");
                }
                navigate(`/admin/products?${params.toString()}`);
              }}
            />
          )}
        </section>
      </div>

      <CategoryFormModal
        open={modalOpen}
        form={form}
        saving={saving}
        onCancel={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}

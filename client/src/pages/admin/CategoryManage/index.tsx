import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App as AntdApp, Form } from "antd";
import { categoryApi } from "@/services/api";
import type { CategoryDeleteResult } from "@/services/clients/categoryClient";
import type { CategoryInput, CategorySortItem } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { AdminLoadingState, AdminErrorState } from "@/components/common/AdminDataStates";
import CategoryDetailPanel from "./CategoryDetailPanel";
import CategoryFormModal, { type CategoryCreateValues } from "./CategoryFormModal";
import CategoryProductPreview from "./CategoryProductPreview";
import CategorySelectedProduct from "./CategorySelectedProduct";
import CategoryTreePanel from "./CategoryTreePanel";
import {
  applySiblingOrder,
  categorySlugFromName,
  collectSlugs,
  findNode,
  hasUnclassifiedProducts,
  nextSortOrder,
  orderedSiblings,
  withoutRetiredEmpty,
  type CatTreeNode,
} from "./categoryManageModel";
import "./CategoryManage.css";

export default function CategoryManage() {
  const { message, modal } = AntdApp.useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = Number(searchParams.get("categoryId"));
  const requestedProductId = Number(searchParams.get("productId"));
  const requestedUnclassified = searchParams.get("scope") === "unclassified";
  const previewTitle = useRef<HTMLHeadingElement>(null);
  const pendingPreviewFocus = useRef(false);
  const previewOrigin = useRef<{ categoryId: number; unclassified: boolean }>();
  const batchSelectionCount = useRef<number>(null);
  const [tree, setTree] = useState<CatTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [saving, setSaving] = useState(false);
  const [batchMoving, setBatchMoving] = useState(false);
  const [draft, setDraft] = useState<CatTreeNode[] | null>(null);
  const [editingId, setEditingId] = useState<number>();
  const [create, setCreate] = useState(false);
  const [form] = Form.useForm<CategoryCreateValues>();
  const visibleTree = useMemo(() => withoutRetiredEmpty(tree), [tree]);
  const editing = editingId === undefined ? undefined : findNode(visibleTree, editingId);
  const selected = findNode(visibleTree, requestedId) ?? orderedSiblings(visibleTree, null)[0];
  const selectedId = selected?.id;
  const selectedUnclassified = !!selected && selectedId === requestedId && requestedUnclassified && hasUnclassifiedProducts(selected);
  const hiddenUncategorizedSelected = selectedId !== requestedId
    && tree.some((node) => node.isUncategorized && node.id === requestedId);
  const selectedProductId = selectedId === requestedId && Number.isSafeInteger(requestedProductId) && requestedProductId > 0
    ? requestedProductId
    : undefined;

  useEffect(() => {
    if (loading || loadError || (!hiddenUncategorizedSelected && (!requestedUnclassified || selectedUnclassified))) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (selectedId === undefined) next.delete("categoryId");
      else next.set("categoryId", String(selectedId));
      next.delete("scope");
      if (hiddenUncategorizedSelected) next.delete("productId");
      return next;
    }, { replace: true });
  }, [hiddenUncategorizedSelected, loadError, loading, requestedUnclassified, selectedId, selectedUnclassified, setSearchParams]);

  useEffect(() => {
    if (!pendingPreviewFocus.current) return;
    pendingPreviewFocus.current = false;
    previewTitle.current?.focus();
  }, [selectedId, selectedProductId, selectedUnclassified]);

  const refresh = useCallback(async (mode: "initial" | "after-write" | "background" = "initial", signal?: AbortSignal) => {
    if (mode === "initial") setLoading(true);
    if (mode !== "background") setLoadError(false);
    try {
      const res = await categoryApi.getManageTree(signal);
      if (signal?.aborted) return;
      const data = unwrapResponse<CatTreeNode[]>(res);
      setTree(data);
    } catch {
      if (signal?.aborted || mode === "background") return;
      setLoadError(true);
      setEditingId(undefined);
      if (mode === "after-write") message.warning("操作已保存，分类列表刷新失败。请重新加载。");
    } finally {
      if (mode === "initial") setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (loading || loadError || saving || batchMoving || draft || create || editingId !== undefined) return;
    let pending: AbortController | undefined;
    const refreshOnReturn = () => {
      if (pending || document.visibilityState !== "visible") return;
      const controller = new AbortController();
      pending = controller;
      void refresh("background", controller.signal).finally(() => { pending = undefined; });
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      pending?.abort();
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [loading, loadError, saving, batchMoving, draft, create, editingId, refresh]);

  const mutate = async <T,>(action: () => Promise<T>, success: string | ((response: T) => string), fallback: string) => {
    setSaving(true);
    try {
      const response = await action();
      message.success(typeof success === "string" ? success : success(response));
      await refresh("after-write");
      return true;
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, fallback));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    form.resetFields();
    setCreate(true);
  };

  const openPreview = (categoryId: number, productId?: number, focus = false, unclassified = false) => {
    if (batchMoving) return;
    if (focus) {
      if (categoryId === selectedId && productId === selectedProductId && unclassified === selectedUnclassified) previewTitle.current?.focus();
      else pendingPreviewFocus.current = true;
    }
    const params = { categoryId: String(categoryId), ...(productId ? { productId: String(productId) } : {}),
      ...(unclassified ? { scope: "unclassified" } : {}) };
    setSearchParams(params, { replace: true });
  };

  const selectCategory = (node: CatTreeNode, unclassified = false) => {
    if (batchMoving) return;
    const switchCategory = () => {
      previewOrigin.current = undefined;
      openPreview(node.id, undefined, window.matchMedia("(max-width: 900px)").matches, unclassified);
    };
    const selectedCount = batchSelectionCount.current;
    if (!selectedCount || (node.id === selectedId && unclassified === selectedUnclassified)) {
      switchCategory();
      return;
    }
    let switchAfterClose = false;
    modal.confirm({
      title: "切换分类并清空选择？",
      content: `已选 ${selectedCount} 件商品。切换后将清空本次选择。`,
      okText: "清空并切换",
      cancelText: "保留当前选择",
      autoFocusButton: "cancel",
      onOk: () => { switchAfterClose = true; },
      afterClose: () => { if (switchAfterClose) switchCategory(); },
    });
  };

  const saveCreate = async (values: CategoryCreateValues) => {
    if (!create || saving) return;
    const name = values.name.trim();
    const parentId = values.kind === "style" ? values.parentId ?? null : null;
    if (!name || (values.kind === "style" && !parentId)) return;
    const payload: CategoryInput = {
      name,
      slug: categorySlugFromName(name, collectSlugs(tree)),
      sortOrder: nextSortOrder(tree, parentId),
      ...(parentId ? { parentId } : {}),
    };
    if (await mutate(
      () => categoryApi.create(payload),
      parentId ? "款式已添加" : "品类已创建",
      "分类保存失败，请检查填写内容后重试。",
    )) {
      setCreate(false);
      setKeyword("");
    }
  };

  const moveInDraft = (node: CatTreeNode, targetIndex: number) => {
    if (saving || batchMoving || create || editingId !== undefined || keyword.trim() || node.isUncategorized) return;
    setDraft((current) => {
      const source = current ?? visibleTree;
      const parentId = node.parentId ?? null;
      const siblings = orderedSiblings(source, parentId).filter((sibling) => !sibling.isUncategorized);
      const index = siblings.findIndex((sibling) => sibling.id === node.id);
      if (index < 0 || index === targetIndex || targetIndex < 0 || targetIndex >= siblings.length) {
        return current;
      }
      const [moved] = siblings.splice(index, 1);
      siblings.splice(targetIndex, 0, moved);
      const reordered = applySiblingOrder(source, parentId, siblings);
      return parentId === null ? [...reordered, ...source.filter((root) => root.isUncategorized)] : reordered;
    });
  };

  const saveOrder = async () => {
    if (!draft || saving || batchMoving) return false;
    const items: CategorySortItem[] = [];
    const collect = (parentId: number | null) => {
      const before = orderedSiblings(visibleTree, parentId).filter((node) => !node.isUncategorized);
      const after = orderedSiblings(draft, parentId).filter((node) => !node.isUncategorized);
      if (after.some((node, index) => node.id !== before[index]?.id)) {
        items.push(...after.map((node) => ({ id: node.id, sortOrder: node.sortOrder })));
      }
      for (const node of after) {
        if (node.children?.length) collect(node.id);
      }
    };
    collect(null);
    if (!items.length || await mutate(
      () => categoryApi.reorder(items),
      "选款中心顺序已保存",
      "顺序保存失败，已保留本次调整，请重试。",
    )) {
      setDraft(null);
      return true;
    }
    return false;
  };

  return (
    <div className="cat-manage">
      {loading || loadError ? <h1 className="cat-manage__fallback-title">分类管理</h1> : null}
      {loading ? <AdminLoadingState subject="分类" /> : loadError ? (
        <AdminErrorState subject="分类" onRetry={() => void refresh()} />
      ) : (
        <div className={`cat-workspace${!selected ? " cat-workspace--single" : ""}`}>
          <CategoryTreePanel
            tree={draft ?? visibleTree}
            keyword={keyword}
            hasPendingOrder={!!draft}
            saving={saving || batchMoving}
            selectedId={selectedId}
            selectedUnclassified={selectedUnclassified}
            onKeywordChange={setKeyword}
            onCreate={openCreate}
            onCancelSort={() => setDraft(null)}
            onSaveSort={saveOrder}
            onMove={moveInDraft}
            onEdit={(node) => setEditingId(node.id)}
            onSelect={selectCategory}
          />
          {selected ? (
            selectedProductId ? <CategorySelectedProduct
              key={`${selected.id}:${selectedProductId}`}
              category={selected}
              tree={visibleTree}
              productId={selectedProductId}
              unclassified={selectedUnclassified}
              titleRef={previewTitle}
              onBack={() => openPreview(
                findNode(visibleTree, previewOrigin.current?.categoryId ?? selected.id)?.id ?? selected.id,
                undefined,
                true,
                previewOrigin.current?.unclassified ?? selectedUnclassified,
              )}
            /> : <CategoryProductPreview
              key={`${selected.id}:${selectedUnclassified}`}
              category={selected}
              unclassified={selectedUnclassified}
              tree={visibleTree}
              titleRef={previewTitle}
              saving={saving || batchMoving || !!draft}
              batchSelectionCountRef={batchSelectionCount}
              onBatchBusyChange={setBatchMoving}
              onBatchRefresh={() => refresh("after-write")}
              onViewProduct={(product) => {
                const productCategory = findNode(visibleTree, product.categoryId);
                if (!productCategory) {
                  const returnTo = encodeURIComponent(`/admin/categories?categoryId=${selected.id}`);
                  navigate(`/admin/products/${product.id}/edit?returnTo=${returnTo}`);
                  return;
                }
                previewOrigin.current = { categoryId: selected.id, unclassified: selectedUnclassified };
                openPreview(product.categoryId, product.id, true, hasUnclassifiedProducts(productCategory));
              }}
            />
          ) : null}
        </div>
      )}

      <CategoryFormModal
        open={create}
        parentCategories={orderedSiblings(visibleTree, null).filter((node) => node.level === 1 && !node.isUncategorized)}
        form={form}
        saving={saving}
        onCancel={() => setCreate(false)}
        onSave={saveCreate}
      />
      {editing && !editing.isUncategorized ? (
        <CategoryDetailPanel
          key={editing.id}
          node={editing}
          tree={visibleTree}
          saving={saving}
          onClose={() => setEditingId(undefined)}
          onRename={(name) => mutate(
            () => categoryApi.update(editing.id, { name }),
            "分类名称已更新",
            "分类名称保存失败，请重试。",
          )}
          onCoverChange={(coverImage) => mutate(
            () => categoryApi.update(editing.id, { coverImage }),
            "分类封面已更新",
            "分类封面保存失败，请重试。",
          )}
          onMove={async (parentId) => {
            const moved = await mutate(
              () => categoryApi.update(editing.id, { parentId, sortOrder: nextSortOrder(tree, parentId) }),
              "已改到新的品类下",
              "所属品类修改失败，请重试。",
            );
            return moved;
          }}
          onDelete={async () => {
            let destination: number | undefined;
            if (await mutate(
              () => categoryApi.delete(editing.id),
              (response) => {
                const result = unwrapResponse<CategoryDeleteResult>(response);
                destination = result?.uncategorizedCategoryId;
                const moved = result?.movedProductCount ?? 0;
                return moved ? `分类已删除，${moved} 件商品已移入「未分类」` : "分类已删除";
              },
              "分类删除失败，请重试。",
            )) {
              setEditingId(undefined);
              if (destination !== undefined) {
                setKeyword("");
                previewOrigin.current = undefined;
                openPreview(destination, undefined, true);
              }
            }
          }}
        />
      ) : null}
    </div>
  );
}

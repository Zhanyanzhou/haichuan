import { useRef, useState } from "react";
import { Button, Drawer, Input, Select, Space, type InputRef } from "antd";
import { CategoryImageUpload } from "./CategoryFormModal";
import {
  countProductsRecursive,
  findNode,
  orderedSiblings,
  type CatTreeNode,
} from "./categoryManageModel";

type CategoryDetailPanelProps = {
  node: CatTreeNode;
  tree: CatTreeNode[];
  saving: boolean;
  onClose: () => void;
  onRename: (name: string) => Promise<boolean>;
  onCoverChange: (url: string) => Promise<boolean>;
  onMove: (parentId: number) => Promise<boolean>;
  onDelete: () => void;
};

export default function CategoryDetailPanel({
  node, tree, saving, onClose, onRename, onCoverChange, onMove, onDelete,
}: Readonly<CategoryDetailPanelProps>) {
  const [name, setName] = useState<string>();
  const nameInput = useRef<InputRef>(null);
  const [uploading, setUploading] = useState(false);
  const [operation, setOperation] = useState<"edit" | "delete" | "move">("edit");
  const [destination, setDestination] = useState<number>();
  const parent = node.parentId ? findNode(tree, node.parentId) : undefined;
  const nameToSave = (name ?? node.name).trim();
  const busy = uploading || saving;
  const rootOptions = orderedSiblings(tree, null).filter((root) => !root.isUncategorized).map((root, index, roots) => ({
    value: root.id,
    label: roots.some((peer) => peer.id !== root.id && peer.name === root.name)
      ? `${root.name}（第 ${index + 1} 位）`
      : root.name,
  }));
  const productsInScope = countProductsRecursive(node);
  const moveTarget = rootOptions.find((option) => option.value === destination);
  const title = operation === "delete" ? `删除「${node.name}」？`
    : operation === "move" ? `更改「${node.name}」的所属品类`
    : node.level === 1 ? "编辑品类" : "编辑款式";

  function cancel() {
    if (busy) return;
    if (operation === "edit") onClose();
    else setOperation("edit");
  }

  async function saveName() {
    if (!nameToSave || nameToSave === node.name || busy) return;
    if (await onRename(nameToSave)) setName(undefined);
    requestAnimationFrame(() => nameInput.current?.focus());
  }

  return (
    <Drawer
      open
      title={title}
      placement="left"
      width="min(440px, 100vw)"
      afterOpenChange={(open) => { if (open) nameInput.current?.focus(); }}
      onClose={cancel}
      closable={!busy}
      keyboard={!busy}
      maskClosable={!busy}
    >
      <div className="cat-editor">
        {operation === "delete" ? (
          <>
            <p>此分类{node.children?.length ? "及下列分类" : ""}将被永久删除。</p>
            {node.children?.length ? (
              <ul>{node.children.map((child) => <li key={child.id}>{child.name}</li>)}</ul>
            ) : null}
            {productsInScope > 0 ? (
              <p>{productsInScope} 件关联商品将自动移入「未分类」，包括回收站和已删除的记录。商品及其状态会保留。</p>
            ) : <p>此分类及其下级没有关联商品。</p>}
            <Space wrap>
              <Button disabled={busy} onClick={cancel}>取消</Button>
              <Button
                danger type="primary" loading={saving}
                disabled={busy}
                onClick={onDelete}
              >删除分类</Button>
            </Space>
          </>
        ) : operation === "move" ? (
          <>
            <p>将款式改到「{moveTarget?.label}」下。关联商品仍属于这个款式。</p>
            <Space wrap>
              <Button disabled={busy} onClick={cancel}>取消</Button>
              <Button type="primary" loading={saving} onClick={async () => {
                if (destination === undefined) return;
                if (await onMove(destination)) setOperation("edit");
              }}>改到这个品类</Button>
            </Space>
          </>
        ) : (
          <>
            <p className="cat-row__meta">{parent ? `所属品类 · ${parent.name}` : "一级分类 · 选款中心"}</p>
            <label className="cat-editor__field">
              分类名称
              <Input ref={nameInput} maxLength={100} value={name ?? node.name} disabled={busy}
                onChange={(event) => setName(event.target.value)}
                onPressEnter={(event) => { if (!event.nativeEvent.isComposing) void saveName(); }} />
            </label>
            <div>
              <Button type="primary" disabled={!nameToSave || nameToSave === node.name || busy} onClick={() => void saveName()}>保存名称</Button>
            </div>

            {parent ? (
              <label className="cat-editor__field">
                所属品类
                <Select
                  aria-label="所属品类"
                  value={node.parentId}
                  disabled={busy}
                  options={rootOptions}
                  onChange={(value) => {
                    setDestination(value);
                    setOperation("move");
                  }}
                />
              </label>
            ) : null}

            <section className="cat-editor__section" aria-label="首页专题封面">
              <h2>首页专题封面</h2>
              <p>{node.coverImage ? "首页专题会使用这张图。" : "尚未设置封面。选款中心导航和关联商品仍可使用。"}</p>
              <Space wrap>
                <CategoryImageUpload
                  value={node.coverImage || undefined}
                  disabled={busy}
                  onUploadingChange={setUploading}
                  onChange={onCoverChange}
                />
                {node.coverImage ? <Button disabled={busy} onClick={() => void onCoverChange("")}>移除封面</Button> : null}
              </Space>
            </section>

            <section className="cat-editor__section" aria-label="删除分类">
              <Button danger disabled={busy} onClick={() => setOperation("delete")}>删除分类</Button>
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}

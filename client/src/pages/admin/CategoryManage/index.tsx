import {
  Alert,
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
  Upload,
  message,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  LockOutlined,
  PictureOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import ScifiButton from "@/components/ui/ScifiButton";
import { categoryApi, uploadApi } from "@/services/api";
import type { Category } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";

interface CategoryTreeNode extends Category {
  children?: CategoryTreeNode[];
}

const categoryIcons: Record<string, string> = {
  手镯: "⭕",
  吊坠: "💎",
  戒指: "💍",
  耳饰: "✨",
  平安扣: "🪙",
  葫芦: "🏺",
  锁包: "🔒",
  佛公: "🧘",
  花戒: "🌸",
  耳钉: "📌",
  耳环: "⭕",
  耳坠: "💧",
};

function flattenTree(nodes: CategoryTreeNode[]): Category[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children || [])]);
}

function CategoryImageUpload({
  value,
  onChange,
}: Readonly<{ value?: string; onChange?: (url: string) => void }>) {
  const beforeUpload = async (file: File) => {
    try {
      const result = await uploadApi.uploadImage(file);
      onChange?.(unwrapResponse<{ url: string }>(result).url);
      message.success("图标上传成功");
    } catch (err) {
      console.error("图标上传失败:", err);
      message.error("图标上传失败，请重试");
    }
    return false;
  };

  return (
    <Space wrap>
      {value ? (
        <img
          src={value}
          alt="二级类目图标预览"
          style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover" }}
        />
      ) : null}
      <Upload
        accept="image/*"
        showUploadList={false}
        beforeUpload={beforeUpload as any}
      >
        <ScifiButton variant="outline" size="sm">
          <PictureOutlined /> {value ? "更换图标" : "上传图标"}
        </ScifiButton>
      </Upload>
    </Space>
  );
}

export default function CategoryManage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [form] = Form.useForm();

  const refresh = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await categoryApi.getManageTree();
      setCategories(flattenTree(unwrapResponse<CategoryTreeNode[]>(response)));
    } catch (err) {
      console.error("分类树加载失败:", err);
      setCategories([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const primaryCategories = useMemo(
    () => categories.filter((category) => category.level === 1),
    [categories],
  );
  const secondaryCount = categories.filter(
    (category) => category.level === 2,
  ).length;
  const getSecondaryCategories = (parentId: number) =>
    categories
      .filter(
        (category) => category.level === 2 && category.parentId === parentId,
      )
      .filter((category) => {
        const query = keyword.trim().toLowerCase();
        const matchesKeyword =
          !query ||
          category.name.toLowerCase().includes(query) ||
          category.slug.toLowerCase().includes(query);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && category.isActive !== false) ||
          (statusFilter === "inactive" && category.isActive === false);
        return matchesKeyword && matchesStatus;
      })
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"),
      );
  const visiblePrimaryCategories = primaryCategories.filter(
    (category) =>
      (!keyword && statusFilter === "all") ||
      getSecondaryCategories(category.id).length > 0,
  );

  const openCreate = (parentId: number) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ parentId, sortOrder: 0, isActive: true });
    setModalOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    form.setFieldsValue(category);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await categoryApi.update(editing.id, values);
      } else {
        await categoryApi.create(values);
      }
      message.success(editing ? "二级类目已更新" : "二级类目已创建");
      setModalOpen(false);
      await refresh();
    } catch (error: any) {
      console.error("保存分类失败:", error);
      message.error(error?.message || "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (category: Category, isActive: boolean) => {
    try {
      await categoryApi.update(category.id, { isActive });
      message.success(isActive ? "二级类目已启用" : "二级类目已停用");
      await refresh();
    } catch (error: any) {
      console.error("停用/启用分类失败:", error);
      message.error(error?.message || "停用失败，请稍后重试");
    }
  };

  const moveSecondary = async (category: Category, direction: -1 | 1) => {
    const siblings = categories
      .filter((item) => item.level === 2 && item.parentId === category.parentId)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"),
      );
    const currentIndex = siblings.findIndex((item) => item.id === category.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
      console.warn(
        "moveSecondary: 索引越界，跳过排序操作",
        { categoryId: category.id, currentIndex, targetIndex, siblingsCount: siblings.length },
      );
      return;
    }

    const reordered = [...siblings];
    [reordered[currentIndex], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[currentIndex],
    ];
    setMovingId(category.id);
    try {
      await Promise.all(
        reordered.map((item, index) =>
          categoryApi.update(item.id, { sortOrder: index + 1 }),
        ),
      );
      await refresh();
    } catch (error: any) {
      console.error("排序更新失败:", error);
      message.error(error?.message || "排序更新失败，请稍后重试");
    } finally {
      setMovingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 56, textAlign: "center" }}>
        <Spin tip="正在加载分类…" />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1400 }}>
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{ fontSize: 20, fontWeight: 600, color: "#1F1F1F", margin: 0 }}
        >
          分类管理
        </h1>
        <p style={{ fontSize: 13, color: "#8C8C8C", margin: "4px 0 0" }}>
          一级类目已固定，共 {primaryCategories.length} 个；可按归属维护{" "}
          {secondaryCount} 个二级类目。
        </p>
      </div>

      <Alert
        showIcon
        type="info"
        icon={<LockOutlined />}
        message="一级类目已锁定"
        description="请从对应的一级类目中新增、编辑、排序或停用二级类目；一级类目不会被新增、修改或删除。"
        style={{ marginBottom: 16 }}
      />

      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
      >
        <Input.Search
          allowClear
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索二级类目名称或 Slug"
          style={{ width: 280 }}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 130 }}
          options={[
            { value: "all", label: "全部状态" },
            { value: "active", label: "仅启用" },
            { value: "inactive", label: "仅停用" },
          ]}
        />
      </div>

      {loadError ? (
        <Empty description="分类加载失败">
          <ScifiButton variant="outline" onClick={() => void refresh()}>
            重新加载
          </ScifiButton>
        </Empty>
      ) : primaryCategories.length === 0 ? (
        <Empty description="暂无一级类目，无法维护二级类目" />
      ) : visiblePrimaryCategories.length === 0 ? (
        <Empty description="没有匹配的二级类目">
          <ScifiButton
            variant="outline"
            onClick={() => {
              setKeyword("");
              setStatusFilter("all");
            }}
          >
            清除筛选
          </ScifiButton>
        </Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {visiblePrimaryCategories.map((primary) => {
            const secondaryCategories = getSecondaryCategories(primary.id);
            return (
              <section
                key={primary.id}
                style={{
                  background: "#fff",
                  border: "1px solid #f0f0f0",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "16px 20px",
                    background: "#FAF8F5",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  <span style={{ fontSize: 30 }}>
                    {primary.icon || categoryIcons[primary.name] || "📁"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <strong style={{ color: "#2C2C2C" }}>
                        {primary.name}
                      </strong>
                      <Tag
                        icon={<LockOutlined />}
                        color="default"
                        style={{ margin: 0 }}
                      >
                        一级类目 · 已固定
                      </Tag>
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#8c8c8c", marginTop: 3 }}
                    >
                      {primary.slug} · {secondaryCategories.length} 个二级类目
                    </div>
                  </div>
                  <ScifiButton
                    variant="gold"
                    size="sm"
                    onClick={() => openCreate(primary.id)}
                  >
                    <PlusOutlined /> 新增二级类目
                  </ScifiButton>
                </div>

                {secondaryCategories.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无二级类目"
                    style={{ margin: "18px 0" }}
                  />
                ) : (
                  <div style={{ padding: "8px 20px 16px" }}>
                    {secondaryCategories.map((secondary, index) => {
                      const lowerLevelCount =
                        secondary._count?.children ??
                        categories.filter(
                          (category) => category.parentId === secondary.id,
                        ).length;
                      const productCount = secondary._count?.products ?? 0;
                      const enabled = secondary.isActive !== false;
                      const hasDependencies =
                        lowerLevelCount > 0 || productCount > 0;
                      return (
                        <div
                          key={secondary.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "12px 0",
                            borderBottom: "1px solid #f5f5f5",
                          }}
                        >
                          <span style={{ fontSize: 20 }}>
                            {secondary.icon ||
                              categoryIcons[secondary.name] ||
                              "📁"}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: "#2C2C2C", fontWeight: 500 }}>
                              {secondary.name}
                            </div>
                            <div
                              style={{
                                color: "#8c8c8c",
                                fontSize: 12,
                                marginTop: 2,
                              }}
                            >
                              {secondary.slug} · 排序 {secondary.sortOrder}
                              {productCount > 0
                                ? ` · 关联 ${productCount} 件商品`
                                : ""}
                              {lowerLevelCount > 0
                                ? ` · 关联 ${lowerLevelCount} 个下级分类`
                                : ""}
                            </div>
                          </div>
                          <Tag
                            color={enabled ? "green" : "default"}
                            style={{ margin: 0 }}
                          >
                            {enabled ? "启用" : "已停用"}
                          </Tag>
                          <Space size={4}>
                            <Tooltip title="上移">
                              <ScifiButton
                                variant="outline"
                                size="sm"
                                disabled={
                                  index === 0 || movingId === secondary.id
                                }
                                onClick={() =>
                                  void moveSecondary(secondary, -1)
                                }
                              >
                                <ArrowUpOutlined />
                              </ScifiButton>
                            </Tooltip>
                            <Tooltip title="下移">
                              <ScifiButton
                                variant="outline"
                                size="sm"
                                disabled={
                                  index === secondaryCategories.length - 1 ||
                                  movingId === secondary.id
                                }
                                onClick={() => void moveSecondary(secondary, 1)}
                              >
                                <ArrowDownOutlined />
                              </ScifiButton>
                            </Tooltip>
                            <ScifiButton
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(secondary)}
                            >
                              <EditOutlined /> 编辑
                            </ScifiButton>
                            {enabled ? (
                              hasDependencies ? (
                                <Tooltip title="请先处理关联的商品或下级分类">
                                  <span>
                                    <ScifiButton
                                      variant="outline"
                                      size="sm"
                                      disabled
                                    >
                                      有关联
                                    </ScifiButton>
                                  </span>
                                </Tooltip>
                              ) : (
                                <Popconfirm
                                  title="停用二级类目"
                                  description="停用后该类目将不会返回给前台分类导航。"
                                  okText="确认停用"
                                  cancelText="取消"
                                  onConfirm={() =>
                                    void handleSetActive(secondary, false)
                                  }
                                >
                                  <ScifiButton
                                    variant="outline"
                                    size="sm"
                                    className="!border-red-200 !text-red-600"
                                  >
                                    <DeleteOutlined /> 停用
                                  </ScifiButton>
                                </Popconfirm>
                              )
                            ) : (
                              <ScifiButton
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void handleSetActive(secondary, true)
                                }
                              >
                                启用
                              </ScifiButton>
                            )}
                          </Space>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Modal
        destroyOnClose
        title={editing ? "编辑二级类目" : "新增二级类目"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSave()}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={560}
        okButtonProps={{
          style: { background: "#B8944E", borderColor: "#B8944E" },
        }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 20 }}>
          {editing &&
          ((editing._count?.children ?? 0) > 0 ||
            (editing._count?.products ?? 0) > 0) ? (
            <Alert
              type="warning"
              showIcon
              message="该类目已有业务关联"
              description={`当前关联 ${editing._count?.products ?? 0} 件商品、${editing._count?.children ?? 0} 个下级分类；调整归属会同步改变它们在分类树中的一级上下文。`}
              style={{ marginBottom: 16 }}
            />
          ) : null}
          <Form.Item
            name="parentId"
            label="归属一级类目"
            rules={[{ required: true, message: "请选择一级类目" }]}
          >
            <Select
              options={primaryCategories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="name"
              label="二级类目名称"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: "请填写二级类目名称",
                },
              ]}
            >
              <Input placeholder="例如：平安扣" />
            </Form.Item>
            <Form.Item
              name="slug"
              label="Slug"
              rules={[
                { required: true, whitespace: true, message: "请填写 Slug" },
                {
                  pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                  message: "仅支持小写字母、数字和连字符",
                },
              ]}
            >
              <Input placeholder="例如：pingan-kou" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="sortOrder" label="排序">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="icon" label="图标（可选）">
              <Input maxLength={20} placeholder="例如：🪙" />
            </Form.Item>
          </div>
          <Form.Item name="coverImage" label="封面图（可选）">
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

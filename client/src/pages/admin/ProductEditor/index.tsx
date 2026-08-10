import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Checkbox,
  Divider,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Result,
  Select,
  Space,
  Spin,
  Switch,
  Upload,
  message,
} from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  PictureOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { categoryApi, productApi, uploadApi } from "@/services/api";
import { getMaterialLabel } from "@/utils/material";
import type { Category, Product, ProductImage, ProductStatus } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";

const { TextArea } = Input;

const materials = [
  "GOLD_999",
  "GOLD_9999",
  "AU750",
  "PT950",
  "S925",
  "DIAMOND",
  "JADE",
  "PEARL",
  "COLOR_GEM",
];
const statuses: ProductStatus[] = ["PUBLISHED", "OFFLINE", "DRAFT", "ARCHIVED"];
const shippingOptions = [
  "今日发",
  "24小时内发货",
  "48小时内发货",
  "大于48小时发货",
];

function generateCode() {
  return `HC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 18,
      }}
    >
      <h2
        style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#262626" }}
      >
        {title}
      </h2>
      {hint && <span style={{ color: "#8c8c8c", fontSize: 12 }}>{hint}</span>}
    </div>
  );
}

function UploadCell({
  image,
  label,
  ratio,
  onUpload,
  onSetCover,
  onRemove,
  disabled,
}: {
  image?: ProductImage;
  label: string;
  ratio: string;
  onUpload: (file: File) => Promise<typeof Upload.LIST_IGNORE>;
  onSetCover?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ width: ratio === "3 / 4" ? 112 : 96 }}>
      <Upload
        accept="image/*"
        showUploadList={false}
        beforeUpload={onUpload as any}
        disabled={disabled}
      >
        <div
          style={{
            aspectRatio: ratio,
            border: image ? "1px solid #d9d9d9" : "1px dashed #cfd6df",
            borderRadius: 6,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fff",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {image ? (
            <img
              src={image.url}
              alt={label}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Space
              direction="vertical"
              size={3}
              align="center"
              style={{ color: "#8c8c8c", fontSize: 12 }}
            >
              <PictureOutlined style={{ fontSize: 18 }} />
              <span>上传图片</span>
            </Space>
          )}
        </div>
      </Upload>
      {image && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 5,
            fontSize: 12,
          }}
        >
          {onSetCover ? (
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              onClick={onSetCover}
            >
              设为主图
            </Button>
          ) : (
            <span style={{ color: "#1677ff" }}>商品主图</span>
          )}
          {onRemove && (
            <Popconfirm title="确定删除此图片？" onConfirm={onRemove}>
              <Button
                type="link"
                size="small"
                danger
                style={{ padding: 0 }}
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editingId = id ? Number(id) : undefined;
  const isCreating = !editingId;
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(!isCreating);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showRequiredOnly, setShowRequiredOnly] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<
    { value: number; label: string }[]
  >([]);

  const mainImages = useMemo(
    () => images.filter((image) => !image.isVideo).slice(0, 5),
    [images],
  );
  const detailImages = useMemo(
    () => images.filter((image) => !image.isVideo).slice(5, 10),
    [images],
  );

  const loadCategories = useCallback(async () => {
    try {
      const result = await categoryApi.getTree();
      const options: { value: number; label: string }[] = [];
      const walk = (nodes: Category[], prefix = "") =>
        nodes.forEach((node) => {
          const label = prefix ? `${prefix} / ${node.name}` : node.name;
          options.push({ value: node.id, label });
          if (node.children?.length) walk(node.children, label);
        });
      walk(unwrapResponse<Category[]>(result) || []);
      setCategoryOptions(options);
    } catch {
      setCategoryOptions([]);
    }
  }, []);

  const fillProduct = useCallback(
    (item: Product) => {
      form.setFieldsValue({
        code: item.code,
        name: item.name,
        categoryId: item.categoryId,
        materialType: item.materialType,
        shortDescription: item.shortDescription,
        description: item.description,
        goldWeight: item.goldWeight,
        weight: item.weight,
        size: item.size,
        price: item.price,
        craftFee: item.craftFee,
        sortOrder: item.sortOrder || 0,
        salesMode: item.salesMode || "DISPLAY_ONLY",
        status: item.status,
        isHot: item.isHot,
        isNew: item.isNew,
        isRecommended: item.isRecommended,
        isLimited: item.isLimited,
        isCustom: item.isCustom,
      });
    },
    [form],
  );

  const loadProduct = useCallback(
    async (productId: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await productApi.getById(productId);
        const item = unwrapResponse<Product>(result);
        if (!item) throw new Error("商品不存在");
        setProduct(item);
        setImages(item.images || []);
        fillProduct(item);
      } catch (error: any) {
        setLoadError(error?.message || "商品加载失败");
      } finally {
        setLoading(false);
      }
    },
    [fillProduct],
  );

  useEffect(() => {
    void loadCategories();
    if (editingId) {
      void loadProduct(editingId);
    } else {
      form.setFieldsValue({
        code: generateCode(),
        materialType: "GOLD_999",
        goldWeight: 0,
        weight: 0,
        price: 0,
        craftFee: 0,
        sortOrder: 0,
        salesMode: "DISPLAY_ONLY",
        status: "DRAFT",
        isHot: false,
        isNew: false,
        isRecommended: false,
        isLimited: false,
        isCustom: false,
      });
    }
  }, [editingId, form, loadCategories, loadProduct]);

  const refreshImages = async (productId: number) => {
    const result = await productApi.getById(productId);
    const item = unwrapResponse<Product>(result);
    setProduct(item);
    setImages(item?.images || []);
  };

  const save = async (asDraft = false) => {
    const values = await form.validateFields(
      asDraft
        ? ["name", "code", "categoryId"]
        : ["name", "code", "categoryId", "price"],
    );
    setSaving(true);
    try {
      const payload = {
        name: values.name,
        categoryId: values.categoryId,
        materialType: values.materialType,
        shortDescription: values.shortDescription || "",
        description: values.description || "",
        goldWeight: values.goldWeight ?? 0,
        weight: values.weight ?? 0,
        size: values.size || "",
        price: values.price ?? 0,
        craftFee: values.craftFee ?? 0,
        sortOrder: values.sortOrder ?? 0,
        salesMode: values.salesMode || "DISPLAY_ONLY",
        status: asDraft ? "DRAFT" : values.status || "DRAFT",
        isHot: values.isHot ?? false,
        isNew: values.isNew ?? false,
        isRecommended: values.isRecommended ?? false,
        isLimited: values.isLimited ?? false,
        isCustom: values.isCustom ?? false,
      };
      if (editingId) {
        await productApi.update(editingId, payload);
        await loadProduct(editingId);
        message.success(asDraft ? "草稿已保存" : "商品基础资料已保存");
      } else {
        const result = await productApi.create({
          ...payload,
          code: values.code,
        });
        const created = unwrapResponse<Product>(result);
        message.success(
          asDraft ? "草稿已创建，可继续补充素材" : "商品已创建，可继续上传素材",
        );
        navigate(`/admin/products/${created.id}/edit`, { replace: true });
      }
    } catch (error: any) {
      message.error(error?.message || "保存失败，请检查必填信息");
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!editingId) {
      message.warning("请先保存基础信息，再上传图片");
      return Upload.LIST_IGNORE;
    }
    setUploading(true);
    try {
      const uploaded = unwrapResponse<{ url: string }>(
        await uploadApi.uploadImage(file),
      );
      await productApi.addImage(editingId, {
        url: uploaded.url,
        sortOrder: images.length,
      });
      await refreshImages(editingId);
      message.success("图片已上传");
    } catch {
      message.error("图片上传失败");
    } finally {
      setUploading(false);
    }
    return Upload.LIST_IGNORE;
  };

  const setCover = async (imageId: number) => {
    if (!editingId) return;
    await productApi.setCoverImage(editingId, imageId);
    await refreshImages(editingId);
  };

  const removeImage = async (imageId: number) => {
    if (!editingId) return;
    await productApi.deleteImage(editingId, imageId);
    await refreshImages(editingId);
  };

  const goTo =
    (hash: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      document
        .getElementById(hash)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${hash}`);
    };

  if (loading)
    return (
      <div style={{ padding: 72, textAlign: "center" }}>
        <Spin />
        <div style={{ marginTop: 12, color: "#8c8c8c" }}>正在加载商品</div>
      </div>
    );
  if (loadError)
    return (
      <Result
        status="error"
        title="商品加载失败"
        subTitle={loadError}
        extra={
          <Button onClick={() => editingId && void loadProduct(editingId)}>
            重新加载
          </Button>
        }
      />
    );

  const sectionStyle = {
    background: "#fff",
    border: "1px solid #f0f0f0",
    borderRadius: 8,
    padding: "24px 28px",
    scrollMarginTop: 114,
  };
  const attributeStyle = {
    background: "#fafafa",
    borderRadius: 6,
    padding: "18px 14px 2px",
  };

  return (
    <div
      style={{ minHeight: "100%", background: "#f6f7fb", paddingBottom: 88 }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 4,
          background: "#fff",
          borderBottom: "1px solid #e8e8e8",
        }}
      >
        <div
          style={{
            maxWidth: 1480,
            margin: "0 auto",
            padding: "0 28px",
            height: 58,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <Space size={12}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate("/admin/products")}
            >
              返回商品管理
            </Button>
            <span style={{ color: "#d9d9d9" }}>|</span>
            <strong>
              {isCreating ? "新增商品" : `编辑商品 · ${product?.name || ""}`}
            </strong>
          </Space>
          <Space>
            <Switch checked={showRequiredOnly} onChange={setShowRequiredOnly} />
            <span style={{ fontSize: 12 }}>只看必填</span>
            {editingId && (
              <Button href={`/products/${editingId}`} target="_blank">
                前台预览
              </Button>
            )}
            <Button loading={saving} onClick={() => void save(true)}>
              保存草稿
            </Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              提交商品信息
            </Button>
          </Space>
        </div>
        <nav
          style={{
            maxWidth: 1480,
            margin: "0 auto",
            padding: "0 28px",
            display: "flex",
            gap: 30,
            height: 42,
            alignItems: "center",
          }}
        >
          {[
            { hash: "description", label: "图文描述" },
            { hash: "basic", label: "基础信息" },
            { hash: "sales", label: "销售信息" },
            { hash: "logistics", label: "物流服务" },
          ].map((item) => (
            <a
              key={item.hash}
              href={`#${item.hash}`}
              onClick={goTo(item.hash)}
              style={{ color: "#262626", fontSize: 14, textDecoration: "none" }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <div
        style={{
          maxWidth: 1480,
          margin: "20px auto",
          padding: "0 28px",
          display: "grid",
          gridTemplateColumns: "190px minmax(0, 1fr)",
          gap: 18,
        }}
      >
        <aside
          style={{
            position: "sticky",
            top: 116,
            alignSelf: "start",
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #edf0f5",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              background: "#3f5bf6",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            填写助手
          </div>
          <div
            style={{
              padding: 16,
              fontSize: 13,
              lineHeight: 1.8,
              color: "#595959",
            }}
          >
            <strong
              style={{ color: "#262626", display: "block", marginBottom: 8 }}
            >
              当前填写重点
            </strong>
            <p style={{ margin: 0 }}>
              主图建议使用 1:1 高清商品图，首张将作为封面。
            </p>
            <p style={{ margin: "10px 0 0" }}>
              商品属性、SKU、发货时效会影响商品展示与履约。
            </p>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, marginTop: 8 }}
              onClick={() =>
                document
                  .getElementById("basic")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              查看必填属性
            </Button>
          </div>
        </aside>

        <Form form={form} layout="vertical">
          <section id="description" style={sectionStyle}>
            <SectionTitle
              title="图文描述"
              hint="素材最多各 5 张，可在上传后设定封面"
            />
            <div
              style={{
                background: "#f7f8fa",
                padding: "13px 16px",
                borderRadius: 6,
                fontWeight: 600,
                marginBottom: 18,
              }}
            >
              基础素材
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "116px 1fr",
                gap: 16,
                alignItems: "start",
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>
                  1:1 主图 <span style={{ color: "#ff4d4f" }}>*</span>
                </div>
              </div>
              <div>
                <div
                  style={{ color: "#8c8c8c", fontSize: 12, marginBottom: 10 }}
                >
                  比例为 1:1，建议尺寸 1440×1440 及以上；至多可上传 5 张。
                </div>
                <Space size={12} wrap>
                  {Array.from({ length: 5 }, (_, index) => {
                    const image = mainImages[index];
                    return (
                      <UploadCell
                        key={image?.id || index}
                        image={image}
                        label={`主图 ${index + 1}`}
                        ratio="1 / 1"
                        disabled={!editingId || uploading}
                        onUpload={uploadImage}
                        onSetCover={
                          index === 0
                            ? undefined
                            : image
                              ? () => void setCover(image.id)
                              : undefined
                        }
                        onRemove={
                          image ? () => void removeImage(image.id) : undefined
                        }
                      />
                    );
                  })}
                </Space>
              </div>
            </div>
            <Divider />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "116px 1fr",
                gap: 16,
                alignItems: "start",
              }}
            >
              <div style={{ fontWeight: 500 }}>3:4 主图</div>
              <div>
                <div
                  style={{ color: "#8c8c8c", fontSize: 12, marginBottom: 10 }}
                >
                  宽高比为 3:4，建议尺寸 1440×1920 及以上。
                </div>
                <Space size={12} wrap>
                  {Array.from({ length: 5 }, (_, index) => {
                    const image = detailImages[index];
                    return (
                      <UploadCell
                        key={image?.id || index}
                        image={image}
                        label={`竖图 ${index + 1}`}
                        ratio="3 / 4"
                        disabled={!editingId || uploading}
                        onUpload={uploadImage}
                        onSetCover={
                          image ? () => void setCover(image.id) : undefined
                        }
                        onRemove={
                          image ? () => void removeImage(image.id) : undefined
                        }
                      />
                    );
                  })}
                </Space>
              </div>
            </div>
            <Divider />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "116px 1fr",
                gap: 16,
                alignItems: "start",
              }}
            >
              <div style={{ fontWeight: 500 }}>商品视频</div>
              <div>
                <div
                  style={{ color: "#8c8c8c", fontSize: 12, marginBottom: 10 }}
                >
                  建议时长 5 秒–5 分钟，支持 1:1、3:4、9:16 比例。
                </div>
                <Button
                  icon={<PlayCircleOutlined />}
                  onClick={() =>
                    message.info("视频上传接口待接入，已保留商品视频入口")
                  }
                >
                  上传视频
                </Button>
              </div>
            </div>
            <div
              style={{
                background: "#f7f8fa",
                padding: "13px 16px",
                borderRadius: 6,
                fontWeight: 600,
                margin: "24px 0 18px",
              }}
            >
              导购素材
            </div>
            <Form.Item
              name="description"
              label="商品详情描述"
              style={{ marginBottom: 0 }}
            >
              <TextArea
                rows={6}
                maxLength={5000}
                showCount
                placeholder="介绍商品的工艺、材质、寓意和佩戴建议"
              />
            </Form.Item>
          </section>

          <section id="basic" style={{ ...sectionStyle, marginTop: 20 }}>
            <SectionTitle title="基础信息" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "116px 1fr",
                gap: 16,
              }}
            >
            </div>
            <div style={{ marginLeft: 132 }}>
              <Form.Item
                name="name"
                label="宝贝标题"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: "请输入商品标题",
                  },
                ]}
              >
                <Input
                  maxLength={60}
                  showCount
                  placeholder="品牌 + 适用性别 + 款式 + 风格 + 材质 + 亮点"
                />
              </Form.Item>
              <Form.Item
                name="shortDescription"
                label="导购标题"
                extra="建议用一句话表达核心卖点，例如工艺、材质、寓意或适用场景。"
              >
                <Input
                  maxLength={30}
                  showCount
                  placeholder="最多输入 30 个字符"
                />
              </Form.Item>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "116px 1fr",
                gap: 16,
              }}
            >
              <div style={{ paddingTop: 6, fontWeight: 500 }}>
                商品属性 <span style={{ color: "#ff4d4f" }}>*</span>
              </div>
              <div>
                <div style={attributeStyle}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: "0 16px",
                    }}
                  >
                    <Form.Item
                      name="materialType"
                      label="材质"
                      rules={[{ required: true, message: "请选择材质" }]}
                    >
                      <Select
                        options={materials.map((material) => ({
                          value: material,
                          label: getMaterialLabel(material),
                        }))}
                      />
                    </Form.Item>
                    <Form.Item
                      name="categoryId"
                      label="商品类目"
                      rules={[{ required: true, message: "请选择商品类目" }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        options={categoryOptions}
                        placeholder="选择三级商品类目"
                      />
                    </Form.Item>
                    <Form.Item name="size" label="尺寸规格">
                      <Input placeholder="例如：直径 23mm / 圈口 14" />
                    </Form.Item>
                    <Form.Item name="goldWeight" label="金重（g）">
                      <InputNumber
                        min={0}
                        step={0.01}
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="sales" style={{ ...sectionStyle, marginTop: 20 }}>
            <SectionTitle title="销售信息" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "116px 1fr",
                gap: 16,
              }}
            >
              <div style={{ paddingTop: 6, fontWeight: 500 }}>
                销售属性 <InfoCircleOutlined style={{ color: "#8c8c8c" }} />
              </div>
              <div style={attributeStyle}>
              </div>
            </div>
            <div
              style={{
                marginLeft: 132,
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 18px",
              }}
            >
              <Form.Item
                name="price"
                label="一口价"
                rules={[{ required: true, message: "请输入一口价" }]}
              >
                <InputNumber
                  min={0}
                  precision={2}
                  suffix="元"
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item
                name="code"
                label="商家编码"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: "请输入商家编码",
                  },
                ]}
              >
                <Input disabled={!isCreating} maxLength={64} />
              </Form.Item>
              <Form.Item name="salesMode" label="销售方式">
                <Radio.Group
                  options={[
                    { value: "DISPLAY_ONLY", label: "仅展示" },
                    { value: "SELECTION", label: "选款咨询" },
                    { value: "APPOINTMENT", label: "预约到店" },
                    { value: "CUSTOM_INQUIRY", label: "定制咨询" },
                  ]}
                />
              </Form.Item>
            </div>
            <div
              style={{
                marginLeft: 132,
                padding: 14,
                border: "1px solid #edf0f5",
                borderRadius: 6,
              }}
            >
              <Space align="start">
                <Form.Item name="multiDiscount" valuePropName="checked" noStyle>
                  <Checkbox>启用多件优惠</Checkbox>
                </Form.Item>
                <span style={{ color: "#8c8c8c", fontSize: 12 }}>
                  满 2 件起折，折扣力度 5.0–9.9 折；可在商品详情和购物车展示。
                </span>
              </Space>
            </div>
            <div style={{ marginLeft: 132, marginTop: 18 }}>
            </div>
            {!showRequiredOnly && (
              <div style={{ marginLeft: 132 }}>
                <Space wrap>
                  <Form.Item name="isHot" valuePropName="checked" noStyle>
                    <Checkbox>热卖</Checkbox>
                  </Form.Item>
                  <Form.Item name="isNew" valuePropName="checked" noStyle>
                    <Checkbox>新品</Checkbox>
                  </Form.Item>
                  <Form.Item
                    name="isRecommended"
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox>推荐</Checkbox>
                  </Form.Item>
                  <Form.Item name="isLimited" valuePropName="checked" noStyle>
                    <Checkbox>限量</Checkbox>
                  </Form.Item>
                  <Form.Item name="isCustom" valuePropName="checked" noStyle>
                    <Checkbox>支持定制</Checkbox>
                  </Form.Item>
                </Space>
              </div>
            )}
          </section>
        </Form>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 3,
          background: "rgba(255,255,255,.97)",
          borderTop: "1px solid #e8e8e8",
          padding: "14px 28px",
          display: "flex",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <Button loading={saving} onClick={() => void save(true)}>
          保存草稿
        </Button>
        <Button type="primary" loading={saving} onClick={() => void save()}>
          提交商品信息
        </Button>
      </div>
    </div>
  );
}

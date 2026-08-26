import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileImageOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Upload,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminErrorState } from "@/components/common/AdminDataStates";
import { SecureImage } from "@/components/common/SecureImage";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { categoryApi, productApi, shippingTemplateApi, uploadApi } from "@/services/api";
import { useCommerceEnabled } from "@/store/featureFlags";
import type { InventoryPolicy, MaterialType, ProductDetailBlock, ProductImage, ProductSKU, ProductStatus, SalesMode, ShippingTemplate } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import UnsavedChangesGuard from "../HomepageConfig/components/UnsavedChangesGuard";
import "./ProfessionalProductEditor.css";

type DetailDraft = ProductDetailBlock & { key: string; pendingMediaKey?: string };
type PendingMedia = { key: string; file: File; preview: string };
type MediaChoice = { key: string; label: string; src?: string; imageId?: number; pending?: boolean };
class EditorUserError extends Error {}

type EditorRequestError = Error & { status?: number; response?: { status?: number } };
type ProductSubmitFailure = { message: string; field?: string };

function getProductSubmitFailure(error: unknown): ProductSubmitFailure {
  const requestError = error as EditorRequestError | undefined;
  const status = requestError?.status ?? requestError?.response?.status;
  const serverMessage = requestError?.message?.trim() || "";

  if (status === 409 && serverMessage.includes("商品货号")) {
    return { message: "该商品货号已存在，请更换货号后重试。", field: "code" };
  }
  if (status === 400 && serverMessage.includes("商品分类不存在")) {
    return { message: "所选商品分类不存在，请重新选择。", field: "categoryId" };
  }
  if (status === 400 && serverMessage.includes("运费模板不存在或已停用")) {
    return { message: "所选运费模板不存在或已停用，请重新选择。", field: "shippingTemplateId" };
  }
  if (status === 400 && serverMessage.includes("定时上架时间必须晚于当前时间")) {
    return { message: "定时上架时间必须晚于当前时间，请重新选择。", field: "scheduledPublishAt" };
  }
  if ((status === 400 || status === 422) && serverMessage.startsWith("发布前请补全")) {
    const missing = serverMessage.replace(/^发布前请补全[:：]?\s*/, "");
    return { message: `商品未达到发布条件：${missing || "请按服务端提示补全资料"}。` };
  }
  if (status === 409 && serverMessage.includes("一物一件商品")) {
    return { message: `${serverMessage}。请调整有效 SKU 或库存后重试。` };
  }
  if (status === 409 && serverMessage.startsWith("已发布商品更新后不满足发布条件")) {
    return { message: `${serverMessage}。请按提示修正后重试。` };
  }
  if (status === 400 && serverMessage.includes("请填写商品名称")) {
    return { message: "请填写商品标题后重试。", field: "name" };
  }
  if (status === 400 && serverMessage.includes("请填写商品货号")) {
    return { message: "请填写商品货号后重试。", field: "code" };
  }
  if (status === 400 && serverMessage.includes("请选择") && serverMessage.includes("商品分类")) {
    return { message: "请选择有效的商品分类后重试。", field: "categoryId" };
  }
  return { message: getSafeAdminErrorMessage(error, "商品保存失败，请检查填写内容后重试。") };
}

function getSkuSubmitFailure(error: unknown): ProductSubmitFailure {
  const requestError = error as EditorRequestError | undefined;
  const status = requestError?.status ?? requestError?.response?.status;
  const serverMessage = requestError?.message?.trim() || "";
  if (status === 409 && serverMessage.replace(/\s/g, "").includes("SKU编码已存在")) {
    return { message: "该 SKU 编码已存在，请更换编码后重试。", field: "skuCode" };
  }
  if (status === 409 && serverMessage.includes("一物一件商品")) {
    return { message: `${serverMessage}。请保留一个有效 SKU，并到库存管理确认总量为 0 或 1。` };
  }
  if (status === 409 && serverMessage.startsWith("已发布商品更新后不满足发布条件")) {
    return { message: `${serverMessage}。请按提示修正后重试。` };
  }
  return { message: getSafeAdminErrorMessage(error, "SKU 保存失败，请检查规格信息后重试。") };
}
const materials = [
  ["GOLD_999", "足金999"], ["GOLD_9999", "足金9999"], ["AU750", "18K金"],
  ["PT950", "铂金PT950"], ["S925", "S925银"], ["DIAMOND", "钻石"],
  ["JADE", "翡翠玉石"], ["PEARL", "珍珠"], ["COLOR_GEM", "彩色宝石"], ["OTHER", "其他"],
].map(([value, label]) => ({ value, label }));

const statusMeta: Record<ProductStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "default" },
  PUBLISHED: { label: "已上架", color: "green" },
  OFFLINE: { label: "仓库中", color: "orange" },
  ARCHIVED: { label: "回收站", color: "red" },
};

const salesModeLabelsForPreview: Record<SalesMode, string> = {
  DISPLAY_ONLY: "仅展示",
  SELECTION: "选款咨询",
  APPOINTMENT: "预约到店",
  DIRECT_PURCHASE: "直接购买",
  CUSTOM_INQUIRY: "定制咨询",
};

const defaultValues = {
  condition: "NEW",
  materialType: "GOLD_999",
  visibility: "MEMBER",
  salesMode: "DISPLAY_ONLY",
  inventoryPolicy: "STANDARD",
  purchaseRegion: "MAINLAND",
  publishMode: "WAREHOUSE",
  fulfillmentType: "IN_STOCK",
  dispatchTime: "WITHIN_48_HOURS",
  deliveryMethods: ["EXPRESS"],
  requiresInsuredShipping: true,
  requiresSignature: true,
  includesCertificate: true,
  packageType: "品牌礼盒",
};

function flattenCategories(nodes: any[], prefix = ""): { value: number; label: string }[] {
  return (nodes || []).flatMap((node) => {
    const label = `${prefix}${node.name}`;
    return [{ value: node.id, label }, ...flattenCategories(node.children || [], `${label} / `)];
  });
}

export default function ProfessionalProductEditor() {
  const { message: messageApi, modal } = AntdApp.useApp();
  const { id } = useParams();
  const parsedEditingId = Number(id);
  const editingId = id && Number.isInteger(parsedEditingId) && parsedEditingId > 0 ? parsedEditingId : null;
  const navigate = useNavigate();
  const commerceEnabled = useCommerceEnabled();
  const [form] = Form.useForm();
  const [active, setActive] = useState("media");
  const [requiredOnly, setRequiredOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [templateSaving, setTemplateSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string>();
  const [currentStatus, setCurrentStatus] = useState<ProductStatus>("DRAFT");
  const [categories, setCategories] = useState<{ value: number; label: string }[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [primaryImageId, setPrimaryImageId] = useState<number | null>(null);
  const [mediaActionId, setMediaActionId] = useState<number | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [detail, setDetail] = useState<DetailDraft[]>([]);
  const [templates, setTemplates] = useState<ShippingTemplate[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState<any>({});
  const [templateForm] = Form.useForm();
  const [skuForm] = Form.useForm();
  const [skus, setSkus] = useState<ProductSKU[]>([]);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<ProductSKU | null>(null);
  const [skuSaving, setSkuSaving] = useState(false);
  const [skuActionId, setSkuActionId] = useState<number | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const savingRef = useRef(false);
  const pendingMediaRef = useRef<PendingMedia[]>([]);
  const [currentProductId, setCurrentProductId] = useState<number | null>(editingId);

  const mediaChoices = useMemo<MediaChoice[]>(() => [
    ...images.filter((item) => !item.isVideo).map((item) => ({
      key: `saved-${item.id}`,
      imageId: item.id,
      label: `已上传图片 #${item.id}`,
      src: (item as any).mediaUrl || item.url,
    })),
    ...pendingMedia.map((item, index) => ({ key: item.key, label: `待上传图片 ${index + 1}`, src: item.preview, pending: true })),
  ], [images, pendingMedia]);
  const selectedCategoryId = Form.useWatch("categoryId", form);
  const selectedPublishMode = Form.useWatch("publishMode", form) || "WAREHOUSE";
  const selectedSalesMode = (Form.useWatch("salesMode", form) || "DISPLAY_ONLY") as SalesMode;
  const selectedInventoryPolicy = (Form.useWatch("inventoryPolicy", form) || "STANDARD") as InventoryPolicy;
  const selectedCategoryLabel = categories.find((item) => item.value === selectedCategoryId)?.label;

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(undefined);
    setSubmitError(undefined);
    setCurrentProductId(editingId);
    setCurrentStatus("DRAFT");
    setPrimaryImageId(null);
    setSkus([]);
    setSavedAt(undefined);

    if (id && !editingId) {
      setLoadError("商品地址无效。请返回商品列表后重新进入编辑页面。");
      setLoading(false);
      return () => { mounted = false; };
    }

    const productRequest = editingId ? productApi.getById(editingId) : Promise.resolve(null);
    Promise.all([categoryApi.getManageTree(), shippingTemplateApi.list(), productRequest])
      .then(([categoryRes, templateRes, productRes]) => {
        if (!mounted) return;
        const loadedTemplates = unwrapResponse<ShippingTemplate[]>(templateRes);
        setCategories(flattenCategories(unwrapResponse<any[]>(categoryRes)));
        setTemplates(loadedTemplates);
        if (!editingId) {
          const preferred = loadedTemplates.find((item) => item.isDefault) || loadedTemplates[0];
          if (preferred) form.setFieldValue("shippingTemplateId", preferred.id);
        } else if (productRes) {
          const product = unwrapResponse<any>(productRes);
          const loadedStatus = (product.status || "DRAFT") as ProductStatus;
          setCurrentStatus(loadedStatus);
          setImages(product.images || []);
          setPrimaryImageId(product.primaryImageId ?? product.primaryImage?.id ?? null);
          setSkus(product.skus || []);
          setDetail((product.detailContent || []).map((block: ProductDetailBlock, index: number) => ({ ...block, key: `detail-${index}-${Date.now()}` })));
          form.setFieldsValue({
            ...defaultValues,
            ...product,
            derivedPrice: product.price,
            initialSkuPrice: undefined,
            price: undefined,
            publishMode: loadedStatus === "PUBLISHED" ? "IMMEDIATE" : product.publishMode || "WAREHOUSE",
            scheduledPublishAt: product.scheduledPublishAt ? dayjs(product.scheduledPublishAt) : null,
            gemType: product.gemInfo?.type,
            gemCarat: product.gemInfo?.carat,
            gemClarity: product.gemInfo?.clarity,
            gemColor: product.gemInfo?.color,
            gemCut: product.gemInfo?.cut,
            gemQuantity: product.gemInfo?.quantity,
            certificateAuthority: product.gemInfo?.certificateAuthority,
            certificateNumber: product.gemInfo?.certificateNumber,
            certificateQueryUrl: product.gemInfo?.certificateQueryUrl,
            brand: product.gemInfo?.brand,
            collection: product.gemInfo?.collection,
            style: product.gemInfo?.style,
            occasion: product.gemInfo?.occasion,
            condition: product.gemInfo?.condition || "NEW",
            craftTechnique: Array.isArray(product.craftTechnique) ? product.craftTechnique : [],
          });
        }
        setDirty(false);
        setLoading(false);
      }).catch((error) => {
        if (!mounted) return;
        setLoadError(getSafeAdminErrorMessage(error, editingId
          ? "商品信息加载失败。请重新加载后重试。"
          : "商品编辑所需的类目或物流模板加载失败。请重新加载后重试。"));
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [editingId, form, id, loadAttempt]);

  useEffect(() => {
    pendingMediaRef.current = pendingMedia;
  }, [pendingMedia]);

  useEffect(() => () => {
    pendingMediaRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
  }, []);

  useEffect(() => {
    if (!dirty || saving) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, saving]);

  const markDirty = () => setDirty(true);
  const addPendingMedia = (file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      messageApi.error("仅支持 JPG、PNG 或 WebP 格式的图片");
      return Upload.LIST_IGNORE;
    }
    if (file.size / 1024 / 1024 > 5) {
      messageApi.error("单张图片不能超过 5MB");
      return Upload.LIST_IGNORE;
    }
    if (images.length + pendingMedia.length >= 5) {
      messageApi.warning("主图最多上传 5 张，请先移除不需要的图片");
      return Upload.LIST_IGNORE;
    }
    if (pendingMedia.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) {
      messageApi.warning("这张图片已经在待上传列表中");
      return Upload.LIST_IGNORE;
    }
    setPendingMedia((prev) => [...prev, { key: `pending-${Date.now()}-${file.name}`, file, preview: URL.createObjectURL(file) }]);
    markDirty();
    return false;
  };

  const removePendingMedia = (key: string) => {
    setPendingMedia((prev) => {
      const target = prev.find((item) => item.key === key);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((item) => item.key !== key);
    });
    setDetail((prev) => prev.map((block) => block.pendingMediaKey === key
      ? { ...block, pendingMediaKey: undefined, imageId: undefined }
      : block));
    markDirty();
  };

  const uploadPending = async (productId: number) => {
    const idMap = new Map<string, number>();
    const mediaToUpload = [...pendingMedia];
    for (let index = 0; index < mediaToUpload.length; index += 1) {
      const media = mediaToUpload[index];
      const uploaded = unwrapResponse<any[]>(await uploadApi.uploadProductImage(media.file))[0];
      if (!uploaded?.storageKey) throw new EditorUserError("图片上传失败，请重新选择图片后重试");
      const created = unwrapResponse<any>(await productApi.addImage(productId, {
        storageKey: uploaded.storageKey,
        url: uploaded.url,
        type: index === 0 && images.length === 0 ? "FRONT" : "DETAIL",
        sortOrder: images.length + index,
        width: uploaded.width,
        height: uploaded.height,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
      }));
      if (!created?.id) throw new EditorUserError("图片关联失败，请重新加载后重试");
      idMap.set(media.key, created.id);
      setPendingMedia((prev) => prev.filter((item) => item.key !== media.key));
      setImages((prev) => [...prev, created]);
      setDetail((prev) => prev.map((block) => block.pendingMediaKey === media.key
        ? { ...block, pendingMediaKey: undefined, imageId: created.id }
        : block));
      URL.revokeObjectURL(media.preview);
    }
    return idMap;
  };

  const buildContentPayload = (values: any) => ({
    name: values.name?.trim() || `未命名商品-${values.code}`,
    code: values.code,
    categoryId: values.categoryId,
    shortDescription: values.shortDescription || null,
    description: values.description || null,
    materialType: values.materialType,
    goldWeight: values.goldWeight ?? 0,
    craftFee: values.craftFee ?? 0,
    weight: values.weight ?? 0,
    size: values.size || null,
    gemInfo: {
      type: values.gemType, carat: values.gemCarat, clarity: values.gemClarity,
      color: values.gemColor, cut: values.gemCut, quantity: values.gemQuantity,
      brand: values.brand, collection: values.collection, style: values.style, occasion: values.occasion,
      condition: values.condition,
      certificateAuthority: values.certificateAuthority,
      certificateNumber: values.certificateNumber,
      certificateQueryUrl: values.certificateQueryUrl,
    },
    craftTechnique: values.craftTechnique || [],
    visibility: values.visibility,
    salesMode: values.salesMode,
    inventoryPolicy: values.inventoryPolicy,
    purchaseRegion: values.purchaseRegion,
    fulfillmentType: values.fulfillmentType,
    dispatchTime: values.dispatchTime,
    shippingTemplateId: values.deliveryMethods?.includes("EXPRESS") ? values.shippingTemplateId || null : null,
    deliveryMethods: values.deliveryMethods || [],
    requiresInsuredShipping: values.requiresInsuredShipping,
    requiresSignature: values.requiresSignature,
    includesCertificate: values.includesCertificate,
    packageType: values.packageType || null,
    customLeadTime: values.customLeadTime || null,
    isHot: values.isHot || false,
    isNew: values.isNew || false,
    isRecommended: values.isRecommended || false,
    isLimited: values.isLimited || false,
    isCustom: values.isCustom || false,
  });

  const refreshProduct = async (productId: number) => {
    const refreshed = unwrapResponse<any>(await productApi.getById(productId));
    setCurrentStatus((refreshed.status || "DRAFT") as ProductStatus);
    setImages(refreshed.images || []);
    setPrimaryImageId(refreshed.primaryImageId ?? refreshed.primaryImage?.id ?? null);
    setSkus(refreshed.skus || []);
    setDetail((refreshed.detailContent || []).map((block: ProductDetailBlock, index: number) => ({
      ...block,
      key: `detail-${index}-${Date.now()}`,
    })));
    form.setFieldsValue({
      publishMode: refreshed.status === "PUBLISHED" ? "IMMEDIATE" : refreshed.publishMode || "WAREHOUSE",
      scheduledPublishAt: refreshed.scheduledPublishAt ? dayjs(refreshed.scheduledPublishAt) : null,
      derivedPrice: refreshed.price,
    });
    return refreshed;
  };

  const setPrimaryImage = async (imageId: number) => {
    if (!currentProductId || mediaActionId !== null) return;
    if (dirty) {
      messageApi.warning("请先保存当前修改，再设置商品主图");
      return;
    }
    try {
      setMediaActionId(imageId);
      await productApi.setCoverImage(currentProductId, imageId);
      await refreshProduct(currentProductId);
      messageApi.success("商品主图已更新");
    } catch (error) {
      messageApi.error(getSafeAdminErrorMessage(error, "商品主图更新失败，请重新加载后重试。"));
    } finally {
      setMediaActionId(null);
    }
  };

  const confirmDeleteImage = (imageId: number) => {
    if (!currentProductId || mediaActionId !== null) return;
    if (dirty) {
      messageApi.warning("请先保存当前修改，再删除已上传图片");
      return;
    }
    if (detail.some((block) => block.imageId === imageId)) {
      messageApi.warning("这张图片正在商品详情中使用，请先移除对应详情模块并保存");
      return;
    }
    modal.confirm({
      title: "确认删除这张商品图片？",
      content: primaryImageId === imageId
        ? "这是当前商品主图。删除后请重新选择主图，避免影响商品展示。"
        : "删除后无法在当前商品中继续使用这张图片。",
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          setMediaActionId(imageId);
          await productApi.deleteImage(currentProductId, imageId);
          await refreshProduct(currentProductId);
          messageApi.success("商品图片已删除");
        } catch (error) {
          messageApi.error(getSafeAdminErrorMessage(error, "商品图片删除失败，请重新加载后重试。"));
          throw error;
        } finally {
          setMediaActionId(null);
        }
      },
    });
  };

  const save = async (intent: "draft" | "primary" = "draft") => {
    if (savingRef.current) return false;
    savingRef.current = true;
    let productId = currentProductId;
    const requiresFullValidation = intent === "primary" || currentStatus === "PUBLISHED";
    try {
      setSubmitError(undefined);
      await form.validateFields(requiresFullValidation ? undefined : ["code", "categoryId"]);
      setSaving(true);
      const values = form.getFieldsValue(true);
      const contentPayload = buildContentPayload(values);
      if (!productId) {
        const hasInitialSkuPrice = values.initialSkuPrice !== undefined
          && values.initialSkuPrice !== null
          && values.initialSkuPrice !== "";
        const created = unwrapResponse<any>(await productApi.create({
          ...contentPayload,
          ...(hasInitialSkuPrice ? {
            skus: [{
              skuCode: `${values.code}-DEFAULT`,
              material: values.materialType,
              size: values.size || undefined,
              goldWeight: values.goldWeight ?? 0,
              price: Number(values.initialSkuPrice),
              isActive: true,
            }],
          } : {}),
          status: "DRAFT",
          publishMode: "WAREHOUSE",
          scheduledPublishAt: null,
        }));
        productId = created.id;
        setCurrentProductId(productId);
        // 先把地址替换为已创建草稿，后续上传或更新失败时刷新/重试也不会再次创建商品。
        window.history.replaceState(window.history.state, "", `/admin/products/${productId}/edit`);
      }
      if (!productId) throw new EditorUserError("商品创建失败，未返回商品标识");
      const idMap = await uploadPending(productId);
      const detailContent = detail.map(({ key: _key, pendingMediaKey, ...block }) => ({
        ...block,
        imageId: pendingMediaKey ? idMap.get(pendingMediaKey) : block.imageId,
      })).filter((block) => block.type === "TEXT" ? Boolean(block.text?.trim()) : Boolean(block.imageId));
      const updatePayload: any = { ...contentPayload, detailContent };
      delete updatePayload.code;
      await productApi.update(productId, updatePayload);
      if (currentStatus === "PUBLISHED") {
        // 对已上架商品重新执行发布门禁，但不改变其业务状态。
        await productApi.updateStatus(productId, "PUBLISHED");
      } else if (intent === "primary" && values.publishMode === "IMMEDIATE") {
        await productApi.updateStatus(productId, "PUBLISHED");
      } else if (intent === "primary" && values.publishMode === "SCHEDULED") {
        await productApi.update(productId, {
          publishMode: "SCHEDULED",
          scheduledPublishAt: values.scheduledPublishAt.toISOString(),
        });
      } else if (intent === "primary" && values.publishMode === "WAREHOUSE" && currentStatus !== "OFFLINE") {
        await productApi.updateStatus(productId, "OFFLINE");
      }
      setPendingMedia([]);
      const refreshed = await refreshProduct(productId);
      setDirty(false);
      setSavedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
      const successMessage = intent === "draft"
        ? currentStatus === "PUBLISHED" ? "已保存商品更改" : "草稿已保存"
        : refreshed.status === "PUBLISHED"
          ? currentStatus === "PUBLISHED" ? "已保存商品更改" : "商品已上架"
          : values.publishMode === "SCHEDULED"
          ? "已保存定时上架计划"
          : "商品已保存至仓库";
      messageApi.success(successMessage);
      if (!editingId) navigate(`/admin/products/${productId}/edit`, { replace: true });
      return true;
    } catch (error: any) {
      if (Array.isArray(error?.errorFields)) {
        const firstField = error.errorFields[0]?.name;
        messageApi.warning(requiresFullValidation ? "请检查并修正标红字段" : "保存草稿至少需要选择类目并填写货号");
        if (firstField) {
          form.scrollToField(firstField, { behavior: "smooth", block: "center" });
          window.setTimeout(() => form.getFieldInstance(firstField)?.focus?.(), 0);
        }
        return false;
      }
      if (error instanceof EditorUserError) {
        messageApi.warning(error.message);
        return false;
      }
      const failure = getProductSubmitFailure(error);
      if (failure.field) form.setFields([{ name: failure.field, errors: [failure.message] }]);
      setSubmitError(failure.message);
      messageApi.error(failure.message);
      return false;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };
  saveRef.current = () => save("draft");

  const refreshSkus = async () => {
    if (!currentProductId) return;
    const result = unwrapResponse<any>(await productApi.getById(currentProductId));
    setSkus(result.skus || []);
    form.setFieldValue("derivedPrice", result.price);
  };

  const openSkuModal = (sku?: ProductSKU) => {
    setEditingSku(sku || null);
    if (sku) {
      skuForm.setFieldsValue({
        skuCode: sku.skuCode,
        material: sku.material,
        size: sku.size,
        goldWeight: sku.goldWeight,
        price: sku.price,
        isActive: sku.isActive,
      });
    } else {
      skuForm.resetFields();
      skuForm.setFieldsValue({ material: "GOLD_999", price: 0, isActive: true });
    }
    setSkuModalOpen(true);
  };

  const saveSku = async () => {
    if (!currentProductId || skuSaving) return;
    try {
      const values = await skuForm.validateFields();
      setSkuSaving(true);
      if (editingSku) await productApi.updateSku(currentProductId, editingSku.id, values);
      else await productApi.createSku(currentProductId, values);
      await refreshSkus();
      setSkuModalOpen(false);
      setEditingSku(null);
      messageApi.success(editingSku ? "SKU 已更新" : "SKU 已创建");
    } catch (error: any) {
      if (!Array.isArray(error?.errorFields)) {
        const failure = getSkuSubmitFailure(error);
        if (failure.field) skuForm.setFields([{ name: failure.field, errors: [failure.message] }]);
        messageApi.error(failure.message);
      }
    } finally {
      setSkuSaving(false);
    }
  };

  const toggleSkuActive = async (sku: ProductSKU) => {
    if (!currentProductId || skuActionId !== null) return;
    try {
      setSkuActionId(sku.id);
      await productApi.updateSku(currentProductId, sku.id, { isActive: !sku.isActive });
      await refreshSkus();
      messageApi.success(sku.isActive ? "SKU 已停用" : "SKU 已启用");
    } catch (error) {
      messageApi.error(getSafeAdminErrorMessage(error, "SKU 状态更新失败，请重新加载后重试。"));
    } finally {
      setSkuActionId(null);
    }
  };

  const confirmOffline = () => {
    if (!currentProductId) return;
    if (dirty) {
      messageApi.warning("请先保存当前修改，再执行下架操作");
      return;
    }
    modal.confirm({
      title: "确认下架这个商品？",
      content: "下架后商品将进入仓库，不再对客户展示；商品资料和 SKU 会保留。",
      okText: "确认下架",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await productApi.updateStatus(currentProductId, "OFFLINE");
          await refreshProduct(currentProductId);
          messageApi.success("商品已下架并移入仓库");
        } catch (error) {
          messageApi.error(getSafeAdminErrorMessage(error, "商品下架失败，请刷新后重试。"));
          throw error;
        }
      },
    });
  };

  const addTextBlock = () => {
    setDetail((prev) => [...prev, { key: `text-${Date.now()}`, type: "TEXT", text: "" }]);
    markDirty();
  };
  const addImageBlock = () => {
    setDetail((prev) => [...prev, { key: `image-${Date.now()}`, type: "IMAGE" }]);
    markDirty();
  };
  const moveBlock = (index: number, direction: -1 | 1) => {
    setDetail((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    markDirty();
  };

  const saveTemplate = async () => {
    if (templateSaving) return;
    try {
      const values = await templateForm.validateFields();
      setTemplateSaving(true);
      const created = unwrapResponse<ShippingTemplate>(await shippingTemplateApi.create(values));
      setTemplates((prev) => [created, ...prev]);
      form.setFieldValue("shippingTemplateId", created.id);
      setTemplateOpen(false);
      templateForm.resetFields();
      markDirty();
      messageApi.success("运费模板已创建并选中");
    } catch (error: any) {
      if (!Array.isArray(error?.errorFields)) {
        messageApi.error(getSafeAdminErrorMessage(error, "运费模板保存失败，请检查填写内容后重试。"));
      }
    } finally {
      setTemplateSaving(false);
    }
  };

  const tabs = [
    ["media", "图文描述"], ["basic", "基础信息"], ["sales", "销售信息"], ["delivery", "物流服务"],
  ];
  const primaryActionLabel = currentStatus === "PUBLISHED"
    ? "保存更改"
    : selectedPublishMode === "IMMEDIATE"
      ? currentStatus === "OFFLINE" ? "重新上架" : "上架商品"
      : selectedPublishMode === "SCHEDULED"
        ? "保存定时计划"
        : currentStatus === "OFFLINE" ? "保存更改" : "保存到仓库";
  const savedStatusText = saving
    ? "正在保存…"
    : dirty
      ? "有未保存的修改"
      : savedAt
        ? `最后保存于 ${savedAt}`
        : currentProductId
          ? `当前状态：${statusMeta[currentStatus].label}`
          : "尚未保存";
  const activeSkuCount = skus.filter((sku) => sku.isActive).length;
  // derivedPrice 由服务端按有效 SKU 派生，不对应可编辑控件；preserve 让 Form 仍能监听该只读字段。
  const derivedPrice = Number(Form.useWatch("derivedPrice", { form, preserve: true }) || 0);
  const inventoryPolicyMessage = selectedInventoryPolicy === "SINGLE_UNIT"
    ? "一物一件：必须且只能保留 1 个有效 SKU；库存总量只能为 0 或 1；每次购买数量上限为 1。库存为 0 时仍可上架，但会显示售罄且不能加入购物车。"
    : "标准库存：可维护多个有效 SKU；库存为 0 时仍可上架，但直接购买商品会显示售罄且不能加入购物车。";
  const salesModeMessage = selectedSalesMode === "DIRECT_PURCHASE"
    ? `${!commerceEnabled ? "当前交易功能未启用；仍可维护直购商品事实，公开端不会开放加购或支付。" : ""}直接购买由服务端核对：基础商品内容、至少一张可读取的非视频图片，以及所有有效 SKU 的交易价格、库存记录、配送方式和库存策略。`
    : "当前销售方式发布时不要求交易价格、SKU 或正库存；服务端仍会核对基础商品内容、有效类目和至少一张可读取的非视频图片。";

  if (loading) {
    return (
      <div className="pro-editor__loading" role="status" aria-live="polite">
        <Spin />
        <span>正在加载商品信息…</span>
      </div>
    );
  }
  if (loadError) return <div className="pro-editor__load-error"><AdminErrorState subject="商品信息" message={loadError} onRetry={() => setLoadAttempt((value) => value + 1)} /></div>;

  return (
    <div className="pro-editor">
      <h1 className="pro-editor__sr-only">{editingId ? "编辑商品" : "新建商品"}</h1>
      <header className="pro-editor__tabs">
        <nav aria-label="商品编辑步骤">{tabs.map(([key, label]) => <button key={key} aria-current={active === key ? "step" : undefined} className={active === key ? "is-active" : ""} onClick={() => { setActive(key); document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{label}</button>)}</nav>
        <label className="pro-editor__required"><Switch checked={requiredOnly} onChange={setRequiredOnly} /> 只看核心字段</label>
      </header>

      <Form name="product-editor-main" form={form} initialValues={defaultValues} layout="vertical" disabled={saving} onValuesChange={() => { markDirty(); setSubmitError(undefined); }} className="pro-editor__form">
        <Alert className="pro-editor__notice" type="info" showIcon message="完整、准确的珠宝信息有助于提升客户信任与商品转化；库存统一按下单预占、确认收款后扣减。" />
        {submitError && <Alert className="pro-editor__submit-error" type="error" showIcon message="商品保存未完成" description={submitError} closable onClose={() => setSubmitError(undefined)} />}
        <div className="pro-editor__category"><strong>当前类目 <i>*</i></strong><span>{selectedCategoryLabel || "珠宝 / 请选择具体类目"}</span><Tag color={statusMeta[currentStatus].color}>{statusMeta[currentStatus].label}</Tag><button type="button" onClick={() => { setActive("basic"); document.getElementById("basic")?.scrollIntoView({ behavior: "smooth" }); }}>切换类目</button></div>

        <section id="media" className="pro-editor__card">
          <h2>图文描述</h2>
          <div className="pro-editor__row-label"><strong>1:1 主图 <i>*</i></strong><span>推荐 1440×1440 以上，最多 5 张，按上传顺序展示</span></div>
          <div className="pro-editor__uploads">
            {mediaChoices.map((item) => <div className="pro-editor__upload-item" key={item.key}>
              <SecureImage src={item.src} alt={item.label} tokenKind="staff" />
              <span>{item.imageId === primaryImageId ? "当前主图" : item.label}</span>
              {"pending" in item && item.pending && <button type="button" className="pro-editor__upload-remove" aria-label={`移除${item.label}`} onClick={() => removePendingMedia(item.key)}><DeleteOutlined /></button>}
              {item.imageId && <div className="pro-editor__upload-actions">
                <Button type="link" size="small" disabled={item.imageId === primaryImageId || mediaActionId !== null} loading={mediaActionId === item.imageId} onClick={() => void setPrimaryImage(item.imageId!)}>{item.imageId === primaryImageId ? "已设主图" : "设为主图"}</Button>
                <Button type="link" size="small" danger disabled={mediaActionId !== null} onClick={() => confirmDeleteImage(item.imageId!)}>删除</Button>
              </div>}
            </div>)}
            {Array.from({ length: Math.max(0, 5 - mediaChoices.length) }).map((_, index) => <Upload key={`empty-upload-${index}`} accept="image/jpeg,image/png,image/webp" showUploadList={false} disabled={saving} beforeUpload={addPendingMedia}><button type="button" disabled={saving} aria-label={`上传第 ${mediaChoices.length + index + 1} 张主图`} className="pro-editor__upload"><FileImageOutlined /><span>上传图片</span></button></Upload>)}
          </div>
          <div className="pro-editor__detail-head"><div><strong>商品详情</strong><span>使用上下按钮调整阅读顺序，桌面端与移动端共用同一内容源</span></div><Space><Button onClick={addImageBlock}>添加图片</Button><Button onClick={addTextBlock}>添加文字</Button></Space></div>
          <div className="pro-editor__detail-tip">详情图片建议宽度不低于 1440 像素；文字与图片将按模块顺序呈现，移动端自动适配。</div>
          <div className="pro-editor__detail-grid">
            <aside><b>添加</b><Button icon={<FileImageOutlined />} onClick={addImageBlock}>图片</Button><Button onClick={addTextBlock}>文字</Button></aside>
            <div className="pro-editor__blocks">
              {detail.length === 0 && <div className="pro-editor__empty">尚未添加详情模块</div>}
              {detail.map((block, index) => <div className="pro-editor__block" key={block.key}>
                <div className="pro-editor__block-tools"><Tag>{block.type === "TEXT" ? "文字" : "图片"}</Tag><Button aria-label={`上移${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => moveBlock(index, -1)} /><Button aria-label={`下移${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" icon={<ArrowDownOutlined />} disabled={index === detail.length - 1} onClick={() => moveBlock(index, 1)} /><Button aria-label={`删除${block.type === "TEXT" ? "文字" : "图片"}模块`} size="small" danger icon={<DeleteOutlined />} onClick={() => { setDetail((prev) => prev.filter((item) => item.key !== block.key)); markDirty(); }} /></div>
                {block.type === "TEXT" ? <Input.TextArea rows={4} value={block.text} placeholder="输入商品工艺、设计寓意或佩戴说明" onChange={(event) => { setDetail((prev) => prev.map((item) => item.key === block.key ? { ...item, text: event.target.value } : item)); markDirty(); }} /> : <Select value={block.imageId ? `saved-${block.imageId}` : block.pendingMediaKey} placeholder="选择已上传的商品图片" options={mediaChoices.map((item) => ({ value: item.key, label: item.label }))} onChange={(value) => { const saved = value.startsWith("saved-"); setDetail((prev) => prev.map((item) => item.key === block.key ? { ...item, imageId: saved ? Number(value.replace("saved-", "")) : undefined, pendingMediaKey: saved ? undefined : value } : item)); markDirty(); }} />}
              </div>)}
            </div>
            <div className="pro-editor__preview"><div className="pro-editor__phone-tabs"><span>商品</span><span>评价</span><b>详情</b><span>推荐</span></div>{detail.length === 0 ? <div className="pro-editor__preview-empty"><FileImageOutlined /><span>详情内容将在这里预览</span></div> : detail.map((block) => block.type === "TEXT" ? <p key={block.key}>{block.text || "文字内容"}</p> : <SecureImage key={block.key} src={mediaChoices.find((item) => item.key === (block.pendingMediaKey || `saved-${block.imageId}`))?.src} alt={block.alt || "商品详情"} tokenKind="staff" />)}</div>
          </div>
        </section>

        <section id="basic" className="pro-editor__card">
          <div className="pro-editor__title-row"><h2>基础信息</h2></div>
          <Form.Item name="condition" label="商品类型" className="pro-editor__horizontal-field"><Radio.Group><Radio value="NEW">全新</Radio><Radio value="SECOND_HAND">二手</Radio></Radio.Group></Form.Item>
          <Form.Item name="name" label="商品标题" className="pro-editor__horizontal-field" rules={[{ required: true, message: "请输入商品标题" }]}><Input maxLength={60} showCount /></Form.Item>
          <Form.Item
            name="shortDescription"
            label="商品简介"
            className="pro-editor__horizontal-field"
            extra="公开商品至少需要 8 个有效字符。"
            rules={[
              { required: true, message: "请输入商品简介" },
              { min: 8, message: "商品简介至少需要 8 个字符" },
              { max: 500, message: "商品简介不能超过 500 个字符" },
            ]}
          >
            <Input maxLength={500} showCount placeholder="概括商品的材质、设计和佩戴特点" />
          </Form.Item>
          <Form.Item
            name="description"
            label="商品说明"
            className="pro-editor__horizontal-field"
            extra="公开商品至少需要 20 个有效字符。"
            rules={[
              { required: true, message: "请输入商品说明" },
              { min: 20, message: "商品说明至少需要 20 个字符" },
            ]}
          >
            <Input.TextArea rows={4} maxLength={5000} showCount placeholder="介绍商品材质、设计、工艺与佩戴建议" />
          </Form.Item>
          <Form.Item name="categoryId" label="当前类目" className="pro-editor__horizontal-field" rules={[{ required: true, message: "请选择珠宝类目" }]}><Select showSearch optionFilterProp="label" options={categories} placeholder="请选择珠宝类目" /></Form.Item>
          <div className="pro-editor__attribute-banner"><b>商品属性</b><span>已仅保留珠宝类目需要的结构化字段</span></div>
          <div className="pro-editor__attributes">
            {!requiredOnly && <Form.Item name="brand" label="品牌"><Input placeholder="请输入品牌" /></Form.Item>}
            {!requiredOnly && <Form.Item name="collection" label="系列"><Input placeholder="请输入系列" /></Form.Item>}
            <Form.Item name="code" label="货号" rules={[{ required: true, message: "请输入货号" }]}><Input disabled={Boolean(currentProductId)} maxLength={50} /></Form.Item>
            <Form.Item name="materialType" label="主要材质"><Select options={materials} /></Form.Item>
            {!requiredOnly && <>
              <Form.Item name="style" label="风格"><Select allowClear options={["经典","简约","复古","东方","轻奢","艺术"].map((value) => ({ value }))} /></Form.Item>
              <Form.Item name="occasion" label="适用场景"><Select allowClear options={["日常佩戴","婚嫁","纪念日","商务","收藏","送礼"].map((value) => ({ value }))} /></Form.Item>
              <Form.Item name="size" label="尺寸/圈口"><Input placeholder="如：圈口 14" /></Form.Item>
              <Form.Item name="goldWeight" label="金重（g）"><InputNumber min={0} precision={2} /></Form.Item>
              <Form.Item name="weight" label="总重（g）"><InputNumber min={0} precision={2} /></Form.Item>
              <Form.Item name="craftTechnique" label="制作工艺"><Select mode="multiple" options={["古法","花丝","錾刻","抛光","喷砂","镶嵌","珐琅","拉丝"].map((value) => ({ value }))} /></Form.Item>
              <Form.Item name="gemType" label="主石种类"><Select allowClear options={["钻石","红宝石","蓝宝石","祖母绿","翡翠","珍珠","彩色宝石","无主石"].map((value) => ({ value }))} /></Form.Item>
              <Form.Item name="gemCarat" label="主石重量（ct）"><InputNumber min={0} precision={3} /></Form.Item>
              <Form.Item name="gemQuantity" label="宝石数量"><InputNumber min={0} precision={0} /></Form.Item>
              <Form.Item name="gemColor" label="颜色等级"><Input placeholder="如：D / vivid red" /></Form.Item>
              <Form.Item name="gemClarity" label="净度"><Input placeholder="如：VS1" /></Form.Item>
              <Form.Item name="gemCut" label="切工"><Select allowClear options={["EX","VG","G","F","不适用"].map((value) => ({ value }))} /></Form.Item>
              <Form.Item name="certificateAuthority" label="证书机构"><Input placeholder="如：GIA / NGTC" /></Form.Item>
              <Form.Item name="certificateNumber" label="证书编号"><Input maxLength={100} /></Form.Item>
              <Form.Item name="certificateQueryUrl" label="证书查验链接" rules={[{ type: "url", message: "请输入完整的证书查验链接" }]}><Input placeholder="https://" /></Form.Item>
            </>}
            <Form.Item name="purchaseRegion" label="采购地区" className="pro-editor__span-3"><Radio.Group><Radio value="MAINLAND">中国内地（大陆）</Radio><Radio value="CROSS_BORDER">中国港澳台地区及其他国家和地区</Radio></Radio.Group></Form.Item>
          </div>
        </section>

        <section id="sales" className="pro-editor__card">
          <div className="pro-editor__title-row"><h2>销售信息</h2></div>
          <div className="pro-editor__sales-grid">
            <Form.Item name="salesMode" label="销售方式" extra={!commerceEnabled ? "交易功能未启用；可维护“直接购买”商品事实，但不会开放加购、结算或支付。" : undefined}><Radio.Group><Radio value="DISPLAY_ONLY">仅展示</Radio><Radio value="SELECTION">选款咨询</Radio><Radio value="APPOINTMENT">预约到店</Radio><Radio value="DIRECT_PURCHASE">直接购买</Radio><Radio value="CUSTOM_INQUIRY">定制咨询</Radio></Radio.Group></Form.Item>
            <Form.Item label="SKU 派生最低价" className="pro-editor__money-field" extra="系统按已启用且价格大于 0 的 SKU 自动派生；交易价格请在 SKU 中维护。"><div className="pro-editor__derived-price">{currentProductId ? (derivedPrice > 0 ? `¥ ${derivedPrice.toFixed(2)}` : "—") : "保存商品后显示"}</div></Form.Item>
            {!currentProductId && selectedSalesMode === "DIRECT_PURCHASE" && <Form.Item name="initialSkuPrice" label="默认 SKU 直购价" className="pro-editor__money-field" extra="首次保存时创建默认 SKU；之后请在 SKU 列表中维护价格。"><InputNumber min={0} precision={2} suffix="元" /></Form.Item>}
            {!requiredOnly && <Form.Item name="craftFee" label="工费" className="pro-editor__money-field"><InputNumber min={0} precision={2} suffix="元" /></Form.Item>}
            <Form.Item label="库存策略"><Form.Item name="inventoryPolicy" noStyle><Radio.Group><Radio value="STANDARD">标准库存</Radio><Radio value="SINGLE_UNIT">一物一件</Radio></Radio.Group></Form.Item><span className="pro-editor__hint">{inventoryPolicyMessage}</span></Form.Item>
            <Form.Item label="库存扣减方式"><Radio checked>下单预占库存，确认收款后扣减</Radio><span className="pro-editor__hint">库存事实由库存模块统一管理，不在商品资料中直接修改。</span></Form.Item>
            <Alert className="pro-editor__inventory-alert" type={selectedSalesMode === "DIRECT_PURCHASE" ? "warning" : "info"} showIcon message={salesModeMessage} action={selectedSalesMode === "DIRECT_PURCHASE" ? <Button size="small" onClick={() => navigate("/admin/inventory")}>前往库存管理</Button> : undefined} />
            {selectedInventoryPolicy === "SINGLE_UNIT" && currentProductId && activeSkuCount !== 1 && <Alert className="pro-editor__inventory-alert" type="error" showIcon message={`当前有 ${activeSkuCount} 个有效 SKU；一物一件必须且只能保留 1 个。保存时以服务端 409 校验结果为准。`} />}
            <Form.Item name="publishMode" label="上架时间"><Radio.Group><Radio value="IMMEDIATE">立刻上架</Radio><Radio value="SCHEDULED">定时上架</Radio><Radio value="WAREHOUSE">放入仓库</Radio></Radio.Group></Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.publishMode !== next.publishMode}>{({ getFieldValue }) => getFieldValue("publishMode") === "SCHEDULED" ? <Form.Item name="scheduledPublishAt" label="定时上架时间" rules={[{ required: true }]}><DatePicker showTime disabledDate={(date) => date.isBefore(dayjs(), "day")} /></Form.Item> : null}</Form.Item>
            <Form.Item name="visibility" label="可见范围"><Select options={[{ value: "PUBLIC", label: "公开宣传款（游客可见）" }, { value: "MEMBER", label: "登录会员可见" }, { value: "PARTNER", label: "合作商家专属" }, { value: "INTERNAL", label: "仅内部可见" }]} /></Form.Item>
            {!requiredOnly && <Form.Item label="商品标识"><Space wrap><Form.Item name="isHot" valuePropName="checked" noStyle><Checkbox>热卖</Checkbox></Form.Item><Form.Item name="isNew" valuePropName="checked" noStyle><Checkbox>新品</Checkbox></Form.Item><Form.Item name="isRecommended" valuePropName="checked" noStyle><Checkbox>推荐</Checkbox></Form.Item><Form.Item name="isLimited" valuePropName="checked" noStyle><Checkbox>限量</Checkbox></Form.Item><Form.Item name="isCustom" valuePropName="checked" noStyle><Checkbox>支持定制</Checkbox></Form.Item></Space></Form.Item>}
          </div>
          <div className="pro-editor__sku-panel">
            <div className="pro-editor__title-row">
              <div><h3>SKU 规格与交易价格</h3><span>{currentProductId ? `${activeSkuCount} 个有效 SKU；SKU 价格是直购成交价，库存数量请在库存管理维护` : "保存商品后可继续配置 SKU；非直购模式不要求价格或正库存"}</span></div>
              <Button icon={<PlusOutlined />} disabled={!currentProductId || skuActionId !== null || (selectedInventoryPolicy === "SINGLE_UNIT" && activeSkuCount >= 1)} onClick={() => openSkuModal()}>添加 SKU</Button>
            </div>
            <Table<ProductSKU>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={skus}
              locale={{ emptyText: currentProductId ? "暂无 SKU" : "保存草稿后可管理 SKU" }}
              columns={[
                { title: "SKU 编码", dataIndex: "skuCode" },
                { title: "材质", dataIndex: "material", render: (value: MaterialType) => materials.find((item) => item.value === value)?.label || value },
                { title: "规格", dataIndex: "size", render: (value?: string) => value || "—" },
                { title: "金重(g)", dataIndex: "goldWeight", render: (value?: number) => value ?? "—" },
                { title: "直购成交价", dataIndex: "price", render: (value: number) => Number(value) > 0 ? `¥ ${Number(value).toFixed(2)}` : "—" },
                { title: "状态", dataIndex: "isActive", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
                { title: "操作", render: (_value: unknown, sku: ProductSKU) => <Space size={4}><Button type="link" size="small" disabled={skuActionId !== null} onClick={() => openSkuModal(sku)}>编辑</Button><Button type="link" size="small" loading={skuActionId === sku.id} disabled={skuActionId !== null && skuActionId !== sku.id} onClick={() => void toggleSkuActive(sku)}>{sku.isActive ? "停用" : "启用"}</Button></Space> },
              ]}
              scroll={{ x: 760 }}
            />
          </div>
        </section>

        <section id="delivery" className="pro-editor__card">
          <div className="pro-editor__title-row"><h2>物流服务</h2></div>
          <div className="pro-editor__delivery-grid">
            <Form.Item name="fulfillmentType" label="备货类型"><Radio.Group><Radio value="IN_STOCK">现货</Radio><Radio value="PREORDER">预售</Radio><Radio value="CUSTOM">定制</Radio></Radio.Group></Form.Item>
            <Form.Item name="dispatchTime" label="发货时间"><Radio.Group><Radio value="SAME_DAY">今日发</Radio><Radio value="WITHIN_24_HOURS">24小时内</Radio><Radio value="WITHIN_48_HOURS">48小时内</Radio><Radio value="OVER_48_HOURS">大于48小时</Radio><Radio value="CUSTOM">按约定</Radio></Radio.Group></Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.dispatchTime !== next.dispatchTime}>{({ getFieldValue }) => getFieldValue("dispatchTime") === "CUSTOM" ? <Form.Item name="customLeadTime" label="约定备货时间"><Input placeholder="如：确认款式后 15 个工作日" /></Form.Item> : null}</Form.Item>
            <Form.Item name="deliveryMethods" label="提取方式"><Checkbox.Group options={[{ value: "EXPRESS", label: "物流配送" }, { value: "STORE_PICKUP", label: "到店自提" }, { value: "DEDICATED", label: "专人配送" }]} /></Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.deliveryMethods !== next.deliveryMethods || prev.shippingTemplateId !== next.shippingTemplateId}>{({ getFieldValue }) => {
              const usesExpress = (getFieldValue("deliveryMethods") || []).includes("EXPRESS");
              if (!usesExpress) return <Alert className="pro-editor__pickup-alert" type="info" showIcon message="当前未选择物流配送，无需设置运费模板。" />;
              return <>
                <Form.Item label="运费模板"><div className="pro-editor__template-line"><Form.Item name="shippingTemplateId" noStyle><Select allowClear placeholder="可选；未选择则不关联运费模板" options={templates.map((item) => ({ value: item.id, label: `${item.name}${item.isDefault ? "（默认）" : ""}` }))} /></Form.Item><Button icon={<PlusOutlined />} onClick={() => setTemplateOpen(true)}>新建</Button></div></Form.Item>
                <div className="pro-editor__template-card"><b>{templates.find((item) => item.id === getFieldValue("shippingTemplateId"))?.name || "选择模板后显示配送规则"}</b><p>高价值珠宝建议启用顺丰保价、本人签收；偏远与不可配送地区以模板配置为准。</p><Space wrap><Form.Item name="requiresInsuredShipping" valuePropName="checked" noStyle><Checkbox>保价运输</Checkbox></Form.Item><Form.Item name="requiresSignature" valuePropName="checked" noStyle><Checkbox>本人签收</Checkbox></Form.Item><Form.Item name="includesCertificate" valuePropName="checked" noStyle><Checkbox>随附鉴定证书</Checkbox></Form.Item></Space></div>
              </>;
            }}</Form.Item>
            {!requiredOnly && <Form.Item name="packageType" label="包装类型"><Select options={["品牌礼盒","收藏级礼盒","婚嫁礼盒","简约环保包装"].map((value) => ({ value }))} /></Form.Item>}
          </div>
        </section>
      </Form>

      <footer className="pro-editor__footer"><div><Button type="primary" loading={saving} onClick={() => void save("primary")}>{primaryActionLabel}</Button>{currentStatus === "PUBLISHED" ? <Button danger disabled={saving} onClick={confirmOffline}>下架</Button> : (currentStatus !== "OFFLINE" || selectedPublishMode !== "WAREHOUSE") ? <Button icon={<SaveOutlined />} loading={saving} onClick={() => void save("draft")}>{currentStatus === "OFFLINE" ? "保存内容" : "保存草稿"}</Button> : null}<Button icon={<EyeOutlined />} disabled={saving} onClick={() => { setPreviewValues(form.getFieldsValue(true)); setPreviewOpen(true); }}>预览</Button><span role="status" aria-live="polite" className={dirty ? "is-dirty" : ""}>{savedStatusText}</span></div></footer>

      <Modal rootClassName="pro-editor-modal" title="新建运费模板" open={templateOpen} forceRender confirmLoading={templateSaving} onCancel={() => setTemplateOpen(false)} onOk={() => void saveTemplate()} okText="保存模板" cancelText="取消">
        <Form name="shipping-template-form" form={templateForm} layout="vertical" initialValues={{ feeMode: "FREE", baseFee: 0, remoteSurcharge: 0, insured: true, signatureRequired: true }}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}><Input placeholder="如：珠宝顺丰保价模板" /></Form.Item>
          <Form.Item name="carrier" label="承运商"><Input placeholder="顺丰速运" /></Form.Item>
          <Form.Item name="feeMode" label="计费方式"><Radio.Group><Radio value="FREE">包邮</Radio><Radio value="FIXED">固定运费</Radio><Radio value="CONDITIONAL">满额包邮</Radio></Radio.Group></Form.Item>
          <Form.Item name="baseFee" label="基础运费"><InputNumber min={0} precision={2} suffix="元" /></Form.Item>
          <Space><Form.Item name="insured" valuePropName="checked"><Checkbox>默认保价</Checkbox></Form.Item><Form.Item name="signatureRequired" valuePropName="checked"><Checkbox>要求本人签收</Checkbox></Form.Item></Space>
        </Form>
      </Modal>
      <Modal rootClassName="pro-editor-modal" title="商品预览" width={760} open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null}>
        <div className="pro-editor__preview-dialog">
          <div className="pro-editor__preview-hero">
            {mediaChoices[0]?.src ? <SecureImage src={mediaChoices[0].src} alt={previewValues.name || "商品主图"} tokenKind="staff" /> : <div className="pro-editor__preview-placeholder"><FileImageOutlined /><span>尚未上传主图</span></div>}
            <div><Tag>{selectedCategoryLabel || "珠宝"}</Tag><h3>{previewValues.name || "未命名商品"}</h3><strong>{previewValues.salesMode === "DIRECT_PURCHASE" ? (Number(previewValues.derivedPrice || previewValues.initialSkuPrice) > 0 ? `¥ ${Number(previewValues.derivedPrice || previewValues.initialSkuPrice).toFixed(2)}` : "价格待配置") : (salesModeLabelsForPreview[previewValues.salesMode as SalesMode] || "非直购商品")}</strong><p>{previewValues.brand || previewValues.materialType || "商品信息待完善"}</p></div>
          </div>
          <div className="pro-editor__preview-detail">
            <h4>商品详情</h4>
            {detail.length === 0 && <div className="pro-editor__preview-dialog-empty">尚未添加详情内容</div>}
            {detail.map((block) => block.type === "TEXT" ? <p key={block.key}>{block.text || "文字内容待完善"}</p> : <SecureImage key={block.key} src={mediaChoices.find((item) => item.key === (block.pendingMediaKey || `saved-${block.imageId}`))?.src} alt={block.alt || "商品详情图片"} tokenKind="staff" />)}
          </div>
        </div>
      </Modal>
      <Modal rootClassName="pro-editor-modal" title={editingSku ? "编辑 SKU" : "新建 SKU"} open={skuModalOpen} forceRender confirmLoading={skuSaving} onCancel={() => { setSkuModalOpen(false); setEditingSku(null); }} onOk={() => void saveSku()} okText="保存 SKU" cancelText="取消">
        <Form name="product-sku-form" form={skuForm} layout="vertical">
          <div className="pro-editor__sku-form-grid">
            <Form.Item name="skuCode" label="SKU 编码" rules={[{ required: true, message: "请输入 SKU 编码" }]}><Input maxLength={100} placeholder="HC-001-18K" /></Form.Item>
            <Form.Item name="material" label="材质" rules={[{ required: true, message: "请选择材质" }]}><Select options={materials} /></Form.Item>
            <Form.Item name="size" label="规格"><Input maxLength={50} placeholder="如：圈口 14" /></Form.Item>
            <Form.Item name="goldWeight" label="金重（g）"><InputNumber min={0} precision={2} /></Form.Item>
            <Form.Item name="price" label="价格" rules={[{ required: true, message: "请输入价格" }]}><InputNumber min={0} precision={2} suffix="元" /></Form.Item>
            <Form.Item name="isActive" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
          </div>
          <Alert type="info" showIcon message="SKU 库存不在这里直接修改，请到库存管理维护实际可售数量。" />
        </Form>
      </Modal>
      <UnsavedChangesGuard hasUnsavedChanges={dirty} disabled={saving} subject="商品信息" rootClassName="pro-editor-unsaved-modal" onSaveAndLeave={() => saveRef.current()} />
    </div>
  );
}

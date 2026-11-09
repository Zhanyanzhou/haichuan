import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, DatePicker, Form, Input, List, Modal, Select, Tag, Upload } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { productApi, uploadApi } from "@/services/api";
import type { Certificate } from "@/types/catalog";
import { CERTIFICATE_NUMBER_CONTENT, isPublishableCertificate } from "@/utils/productCertificate";
import { unwrapResponse } from "@/utils/unwrap";

const CERTIFICATE_TYPE_LABELS: Record<Certificate["certType"], string> = {
  NATIONAL: "国检证书",
  PROVINCIAL: "省检证书",
  GIA: "GIA 证书",
  OTHER: "其他证书",
};

const CERTIFICATE_TYPES = Object.entries(CERTIFICATE_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

type CertificateFormValues = {
  certType: Certificate["certType"];
  certNumber: string;
  expireDate?: Dayjs | null;
};

type ProductCertificateEditorProps = {
  productId: number | null;
  certificates: Certificate[];
  disabled: boolean;
  required: boolean;
  published?: boolean;
  onChange: (certificates: Certificate[]) => void;
  onBusyChange?: (busy: boolean) => void;
};

const PUBLISHED_CHANGE = "证书变更后，顾客将暂时看不到这件商品。请保存商品更改，重新核验后恢复公开。";

export default function ProductCertificateEditor({
  productId,
  certificates,
  disabled,
  required,
  published,
  onChange,
  onBusyChange,
}: ProductCertificateEditorProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<CertificateFormValues>();
  const [editing, setEditing] = useState<Certificate | null>();
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>();
  const [imageRemoved, setImageRemoved] = useState(false);
  const requestInFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const validCount = certificates.filter(isPublishableCertificate).length;

  function openEditor(certificate: Certificate | null) {
    form.resetFields();
    if (certificate) {
      const expiry = dayjs(certificate.expireDate);
      form.setFieldsValue({
        certType: certificate.certType,
        certNumber: certificate.certNumber,
        expireDate: certificate.expireDate && expiry.isValid() ? expiry : null,
      });
    }
    setImageUrl(certificate?.certImage);
    setImageFile(null);
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return undefined;
    });
    setImageRemoved(false);
    setEditing(certificate);
  }

  async function mutate(action: () => Promise<void>, fallback: string) {
    if (requestInFlight.current || disabled) return;
    requestInFlight.current = true;
    setBusy(true);
    onBusyChange?.(true);
    try {
      await action();
    } catch (error) {
      if (mounted.current) message.error(getSafeAdminErrorMessage(error, fallback));
    } finally {
      requestInFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }

  async function save(values: CertificateFormValues) {
    if (!productId || editing === undefined || requestInFlight.current || disabled) return;
    const certNumber = values.certNumber.trim();
    if (certificates.some((certificate) =>
      certificate.id !== editing?.id
      && certificate.certType === values.certType
      && certificate.certNumber.trim().toUpperCase() === certNumber.toUpperCase()
    )) {
      form.setFields([{ name: "certNumber", errors: ["已录入同类型、同编号的证书"] }]);
      return;
    }

    const expiry = values.expireDate;
    const expiryUnchanged = (!expiry && !editing?.expireDate)
      || Boolean(expiry && editing?.expireDate && expiry.isSame(dayjs(editing.expireDate), "day"));
    const imageUnchanged = !imageFile && !imageRemoved && imageUrl === editing?.certImage;
    if (editing && editing.certType === values.certType && editing.certNumber === certNumber && expiryUnchanged && imageUnchanged) {
      setEditing(undefined);
      return;
    }

    const data = {
      certType: values.certType,
      certNumber,
      ...(!expiryUnchanged ? { expireDate: expiry?.endOf("day").toISOString() ?? "" } : {}),
    };
    const draftCertificate = { certNumber, expireDate: data.expireDate ?? editing?.expireDate };
    if (published && required && editing && isPublishableCertificate(editing) && validCount === 1
      && !isPublishableCertificate({ ...editing, ...draftCertificate })) {
      form.setFields([{ name: "expireDate", errors: ["这是当前唯一有效的证书，请先添加另一份有效证书"] }]);
      return;
    }

    await mutate(async () => {
      let certImage = imageRemoved ? "" : imageUrl;
      if (imageFile) {
        const uploaded = unwrapResponse<Array<{ url?: string }>>(await uploadApi.uploadProductImage(imageFile))[0];
        if (!uploaded?.url) throw new Error("证书图片没有返回可保存的地址");
        certImage = uploaded.url;
      }
      const payload = {
        ...data,
        ...((imageFile || imageRemoved || certImage !== editing?.certImage) && certImage !== undefined ? { certImage } : {}),
      };
      const response = editing
        ? await productApi.updateCertificate(productId, editing.id, payload)
        : await productApi.addCertificate(productId, payload);
      const certificate = unwrapResponse<Certificate>(response);
      if (!Number.isInteger(certificate?.id) || certificate.productId !== productId) {
        throw new Error("证书写入结果缺少有效的证书记录");
      }
      if (!mounted.current) return;
      onChange(editing
        ? certificates.map((item) => item.id === editing.id ? certificate : item)
        : [...certificates, certificate]);
      setEditing(undefined);
      message.success(published ? "证书已保存，请重新保存商品更改" : "证书已保存");
    }, "证书保存结果无法确认，请重新打开商品核对证书后再试");
  }

  function confirmRemove(certificate: Certificate) {
    if (!productId || disabled || requestInFlight.current) return;
    modal.confirm({
      title: `删除证书“${certificate.certNumber || CERTIFICATE_TYPE_LABELS[certificate.certType]}”？`,
      content: published ? `证书记录将被删除。${PUBLISHED_CHANGE}` : "删除后无法恢复这条证书记录。",
      okText: "确认删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => mutate(async () => {
        await productApi.deleteCertificate(productId, certificate.id);
        if (!mounted.current) return;
        onChange(certificates.filter((item) => item.id !== certificate.id));
        message.success(published ? "证书已删除，请重新保存商品更改" : "证书已删除");
      }, "证书删除结果无法确认，请重新打开商品核对证书后再试"),
    });
  }

  return (
    <section id="product-certificates" className="pro-editor__sku-panel" aria-labelledby="product-certificates-title">
      <div className="pro-editor__title-row">
        <div>
          <h3 id="product-certificates-title">鉴定证书</h3>
          <span>{required ? "公开前需要至少一份有效证书。" : "按实物所附的证书填写。有效证书会在商品详情中展示。"}</span>
        </div>
        <Button disabled={disabled || busy || !productId} onClick={() => openEditor(null)}>添加证书</Button>
      </div>
      {!productId ? <p className="pro-editor__hint">请先保存商品草稿，再添加证书。</p> : null}
      {productId && certificates.length === 0 ? <p className="pro-editor__hint">还没有证书记录。</p> : null}
      {certificates.length > 0 ? <List
        size="small"
        rowKey="id"
        dataSource={certificates}
        renderItem={(certificate) => {
          const valid = isPublishableCertificate(certificate);
          const lastRequired = Boolean(published && required && valid && validCount === 1);
          const expiry = dayjs(certificate.expireDate);
          const label = `${CERTIFICATE_TYPE_LABELS[certificate.certType]} · ${certificate.certNumber.trim() || "未填写编号"}`;
          return (
            <List.Item actions={[
              <Button key="edit" type="link" size="small" aria-label={`编辑 ${label}`} disabled={disabled || busy} onClick={() => openEditor(certificate)}>编辑</Button>,
              <Button key="remove" type="link" danger size="small" aria-label={`删除 ${label}`} disabled={disabled || busy || lastRequired} onClick={() => confirmRemove(certificate)}>删除</Button>,
            ]}>
              <List.Item.Meta
                title={label}
                description={<>
                  <Tag color={valid ? "green" : undefined}>{valid ? "资料有效" : "待补正"}</Tag>
                  {certificate.expireDate && expiry.isValid() ? `有效期至 ${expiry.format("YYYY-MM-DD")}` : "未设置有效期"}
                  {certificate.certImage && /^(https?:|\/)/.test(certificate.certImage) ? <a href={certificate.certImage} target="_blank" rel="noreferrer">查看证书图片</a> : null}
                  {lastRequired ? <span className="pro-editor__hint">请先添加另一份有效证书，再删除此证书。</span> : null}
                </>}
              />
            </List.Item>
          );
        }}
      /> : null}
      <Modal
        rootClassName="pro-editor-modal"
        open={editing !== undefined}
        forceRender
        title={editing ? "编辑鉴定证书" : "添加鉴定证书"}
        okText="保存证书"
        cancelText="取消"
        confirmLoading={busy}
        okButtonProps={{ disabled: disabled || busy }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        keyboard={!busy}
        maskClosable={!busy}
        onCancel={() => { if (!requestInFlight.current) setEditing(undefined); }}
        onOk={() => form.submit()}
      >
        {published ? <Alert type="warning" showIcon message={PUBLISHED_CHANGE} /> : null}
        <Form name="product-certificate-form" form={form} layout="vertical" onFinish={(values) => void save(values)} disabled={disabled || busy}>
          <Form.Item name="certType" label="证书类型" rules={[{ required: true, message: "请选择证书类型" }]}>
            <Select options={CERTIFICATE_TYPES} />
          </Form.Item>
          <Form.Item name="certNumber" label="证书编号" rules={[
            { required: true, whitespace: true, message: "请输入证书上的编号" },
            { pattern: CERTIFICATE_NUMBER_CONTENT, message: "证书编号须包含数字或文字" },
          ]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="expireDate" label="有效期至" extra="证书未标注有效期时，可留空。">
            <DatePicker format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item label="证书图片" extra="支持 JPG、PNG、WebP、GIF，沿用商品图片上传。当前上传服务不接收 PDF。">
            <Upload
              accept="image/jpeg,image/png,image/webp,image/gif"
              showUploadList={false}
              beforeUpload={(file) => {
                setImagePreview((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return URL.createObjectURL(file);
                });
                setImageFile(file);
                setImageRemoved(false);
                return false;
              }}
            >
              <Button htmlType="button">上传证书图片</Button>
            </Upload>
            {!imageRemoved && (imagePreview || (imageUrl && /^(https?:|\/)/.test(imageUrl))) ? (
              <a href={imagePreview || imageUrl} target="_blank" rel="noreferrer">预览当前证书图片</a>
            ) : <span>还没有证书图片。</span>}
            <Button
              htmlType="button"
              type="link"
              disabled={!imageFile && !imageUrl}
              onClick={() => {
                setImagePreview((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return undefined;
                });
                setImageFile(null);
                setImageUrl(undefined);
                setImageRemoved(true);
              }}
            >
              移除图片
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}

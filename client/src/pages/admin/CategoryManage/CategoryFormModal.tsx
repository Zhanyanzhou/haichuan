import {
  App as AntdApp,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Upload,
  type FormInstance,
  type UploadProps,
} from "antd";
import { PictureOutlined } from "@ant-design/icons";
import ScifiButton from "@/components/ui/ScifiButton";
import { ADMIN_COPY } from "@/constants/adminCopy";
import { uploadApi } from "@/services/api";
import type { Category } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";

export type CategoryCreateValues = {
  kind: "category" | "style";
  name: string;
  parentId?: number;
};

type CategoryFormModalProps = {
  open: boolean;
  parentCategories: Pick<Category, "id" | "name">[];
  form: FormInstance<CategoryCreateValues>;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: CategoryCreateValues) => void | Promise<void>;
};

export function CategoryImageUpload({
  value,
  onChange,
  disabled,
  onUploadingChange,
}: Readonly<{
  value?: string;
  onChange: (url: string) => Promise<boolean>;
  disabled: boolean;
  onUploadingChange: (uploading: boolean) => void;
}>) {
  const { message } = AntdApp.useApp();
  const beforeUpload: NonNullable<UploadProps["beforeUpload"]> = async (
    file,
  ) => {
    if (disabled) return false;
    onUploadingChange(true);
    try {
      const result = await uploadApi.uploadImage(file);
      await onChange(unwrapResponse<{ url: string }>(result).url);
    } catch (error) {
      console.error("分类图片上传失败:", error);
      message.error("分类图片上传失败，请重试。");
    } finally {
      onUploadingChange(false);
    }
    return false;
  };

  return (
    <Space wrap>
      {value ? (
        <img
          src={value}
          alt="分类图片预览"
          style={{
            width: 72,
            height: 72,
            borderRadius: 4,
            objectFit: "cover",
            border: "1px solid var(--adm-line)",
          }}
        />
      ) : null}
      <Upload
        accept="image/*"
        disabled={disabled}
        showUploadList={false}
        beforeUpload={beforeUpload}
      >
        <ScifiButton variant="outline" size="sm" disabled={disabled}>
          <PictureOutlined /> {value ? "更换图片" : "上传图片"}
        </ScifiButton>
      </Upload>
    </Space>
  );
}

export default function CategoryFormModal({
  open,
  parentCategories,
  form,
  saving,
  onCancel,
  onSave,
}: CategoryFormModalProps) {
  const isStyle = Form.useWatch("kind", form) === "style";
  const nameLabel = isStyle ? "款式名称" : "品类名称";
  const parentOptions = parentCategories.map((category, index) => ({
    value: category.id,
    label: parentCategories.some((peer) => peer.id !== category.id && peer.name === category.name)
      ? `${category.name}（第 ${index + 1} 位）`
      : category.name,
  }));

  return (
    <Modal
      className="cat-create-modal"
      forceRender
      centered
      title="新建分类"
      open={open}
      onCancel={() => { if (!saving) onCancel(); }}
      onOk={() => form.submit()}
      okText={ADMIN_COPY.actions.save}
      cancelText={ADMIN_COPY.actions.cancel}
      confirmLoading={saving}
      maskClosable={false}
      okButtonProps={{ size: "large" }}
      cancelButtonProps={{ size: "large", disabled: saving }}
      width={600}
    >
      <Form form={form} layout="vertical" initialValues={{ kind: "category" }} disabled={saving}
        onFinish={(values) => void onSave(values)}>
        <Form.Item name="kind" label="分类类型"
          extra={parentOptions.length === 0 ? "新建款式前，请先创建一个品类。"
            : isStyle ? "款式显示在所选品类下。" : "品类显示在分类目录的第一层。"}>
          <Radio.Group className="cat-create-modal__types" aria-label="分类类型" size="large">
            <Radio.Button value="category">新建品类</Radio.Button>
            <Radio.Button value="style" disabled={!parentOptions.length}>新建款式</Radio.Button>
          </Radio.Group>
        </Form.Item>
        {isStyle ? (
          <Form.Item name="parentId" label="所属品类" rules={[{ required: true, message: "请选择所属品类" }]}>
            <Select size="large" showSearch optionFilterProp="label"
              placeholder="搜索或选择所属品类" options={parentOptions} />
          </Form.Item>
        ) : null}
        <Form.Item
          name="name"
          label={nameLabel}
          rules={[
            { required: true, whitespace: true, message: `请填写${nameLabel}` },
          ]}
        >
          <Input size="large" placeholder={isStyle ? "例如：闭口镯" : "例如：手镯"} maxLength={100} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

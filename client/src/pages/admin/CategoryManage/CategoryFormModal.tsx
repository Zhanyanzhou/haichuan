import {
  App as AntdApp,
  Form,
  Input,
  Modal,
  Space,
  Upload,
  type FormInstance,
  type UploadProps,
} from "antd";
import { PictureOutlined } from "@ant-design/icons";
import ScifiButton from "@/components/ui/ScifiButton";
import { ADMIN_COPY } from "@/constants/adminCopy";
import { uploadApi } from "@/services/api";
import type { CategoryInput } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";

type CategoryFormModalProps = {
  open: boolean;
  form: FormInstance<CategoryInput>;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
};

export function CategoryImageUpload({
  value,
  onChange,
  announce = true,
  preview = true,
}: Readonly<{
  value?: string;
  onChange?: (url: string) => void;
  announce?: boolean;
  preview?: boolean;
}>) {
  const { message } = AntdApp.useApp();
  const beforeUpload: NonNullable<UploadProps["beforeUpload"]> = async (
    file,
  ) => {
    try {
      const result = await uploadApi.uploadImage(file);
      onChange?.(unwrapResponse<{ url: string }>(result).url);
      if (announce) message.success("分类图片已上传");
    } catch (error) {
      console.error("分类图片上传失败:", error);
      message.error("分类图片上传失败，请重试。");
    }
    return false;
  };

  return (
    <Space wrap>
      {preview && value ? (
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
        showUploadList={false}
        beforeUpload={beforeUpload}
      >
        <ScifiButton variant="outline" size="sm">
          <PictureOutlined /> {value ? "更换图片" : "上传图片"}
        </ScifiButton>
      </Upload>
    </Space>
  );
}

export default function CategoryFormModal({
  open,
  form,
  saving,
  onCancel,
  onSave,
}: CategoryFormModalProps) {
  return (
    <Modal
      className="cat-modal"
      forceRender
      title="新建品类"
      open={open}
      onCancel={onCancel}
      onOk={() => void onSave()}
      okText={ADMIN_COPY.actions.save}
      cancelText={ADMIN_COPY.actions.cancel}
      confirmLoading={saving}
      width={420}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <p className="cat-detail__products-label" style={{ marginBottom: 12 }}>
          例如吊坠、手镯。款式在这个品类里继续添加。
        </p>
        <Form.Item
          name="name"
          label="分类名称"
          rules={[
            { required: true, whitespace: true, message: "请填写分类名称" },
          ]}
        >
          <Input placeholder="例如：吊坠" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}

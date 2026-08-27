import {
  App as AntdApp,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
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
import type { CatTreeNode } from "./categoryManageModel";

type CategoryFormModalProps = {
  open: boolean;
  editing: CatTreeNode | null;
  form: FormInstance<CategoryInput>;
  saving: boolean;
  primaryCategories: CatTreeNode[];
  onCancel: () => void;
  onSave: () => void | Promise<void>;
};

function CategoryImageUpload({
  value,
  onChange,
}: Readonly<{ value?: string; onChange?: (url: string) => void }>) {
  const { message } = AntdApp.useApp();
  const beforeUpload: NonNullable<UploadProps["beforeUpload"]> = async (
    file,
  ) => {
    try {
      const result = await uploadApi.uploadImage(file);
      onChange?.(unwrapResponse<{ url: string }>(result).url);
      message.success("分类图片上传成功");
    } catch (error) {
      console.error("分类图片上传失败:", error);
      message.error("分类图片上传失败，请重试。");
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
  editing,
  form,
  saving,
  primaryCategories,
  onCancel,
  onSave,
}: CategoryFormModalProps) {
  return (
    <Modal
      className="cat-modal"
      forceRender
      title={editing ? "编辑分类" : "新建分类"}
      open={open}
      onCancel={onCancel}
      onOk={() => void onSave()}
      okText={ADMIN_COPY.actions.save}
      cancelText={ADMIN_COPY.actions.cancel}
      confirmLoading={saving}
      width={560}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 20 }}>
        <Form.Item name="parentId" label="父级分类">
          <Select
            options={[
              { value: 0, label: "—— 作为一级分类 ——" },
              ...primaryCategories.map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
          />
        </Form.Item>

        <div className="grid grid-cols-2 gap-4">
          <Form.Item
            name="name"
            label="分类名称"
            rules={[
              { required: true, whitespace: true, message: "请填写分类名称" },
            ]}
          >
            <Input placeholder="例如：吊坠" />
          </Form.Item>
          <Form.Item
            name="slug"
            label="分类编码（Slug）"
            rules={[
              { required: true, whitespace: true, message: "请填写 Slug" },
              {
                pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                message: "仅支持小写字母、数字和连字符",
              },
            ]}
          >
            <Input placeholder="例如：pendant" />
          </Form.Item>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Form.Item name="sortOrder" label="排序">
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item name="icon" label="图标（可选 Emoji）">
            <Input maxLength={20} placeholder="例如：◆" />
          </Form.Item>
        </div>

        <Form.Item name="coverImage" label="分类图片（可选）">
          <CategoryImageUpload />
        </Form.Item>

        <Form.Item name="isActive" label="启用" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

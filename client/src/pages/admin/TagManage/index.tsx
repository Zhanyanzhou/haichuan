import { useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  App as AntdApp,
  Space,
} from "antd";
import { PlusOutlined, ReloadOutlined, EditOutlined } from "@ant-design/icons";
import { tagApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import { AdminLoadingState, AdminEmptyState, AdminErrorState } from "@/components/common/AdminDataStates";

type TagRow = {
  id: number;
  name: string;
  slug: string;
  group?: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { productTags: number };
};

export default function TagManage() {
  const { message } = AntdApp.useApp();
  const [list, setList] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await tagApi.list();
      const data = unwrapResponse<unknown>(res);
      const list = Array.isArray(data)
        ? data as TagRow[]
        : typeof data === "object" && data !== null && Array.isArray((data as { list?: unknown }).list)
          ? (data as { list: TagRow[] }).list
          : [];
      setList(list);
    } catch (error: unknown) {
      setError(getSafeAdminErrorMessage(error, "标签字典加载失败，请稍后重新加载。"));
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: TagRow) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      group: record.group || undefined,
      sortOrder: record.sortOrder,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await tagApi.update(editing.id, values);
        message.success("标签已更新");
      } else {
        await tagApi.create(values);
        message.success("标签已创建");
      }
      setModalOpen(false);
      void load();
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "标签保存失败，请检查名称和标识后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (record: TagRow, isActive: boolean) => {
    try {
      await tagApi.update(record.id, { isActive });
      message.success(isActive ? "标签已启用" : "标签已停用");
      void load();
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "标签状态更新失败，请重新加载后重试。"));
    }
  };

  return (
    <div>
      <AdminPageHeader title="标签字典" subtitle="统一管理商品标签（工艺/寓意/场景等分组），商品编辑器可从字典选择" />
      <Card style={{ borderRadius: 10, border: "1px solid var(--adm-line)", boxShadow: "0 6px 20px rgba(24,26,27,0.035)" }}>
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建标签
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
        </div>

        {loading ? (
          <AdminLoadingState subject="标签字典" />
        ) : error ? (
          <AdminErrorState message={error} onRetry={() => void load()} />
        ) : list.length === 0 ? (
          <AdminEmptyState message="暂无标签，新建后可在商品编辑器中选择" />
        ) : (
          <Table
            dataSource={list}
            rowKey="id"
            size="middle"
            pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个标签` }}
            columns={[
              { title: "ID", dataIndex: "id", width: 60 },
              { title: "标签名称", dataIndex: "name", render: (v: string) => <strong>{v}</strong> },
              { title: "分组", dataIndex: "group", width: 120, render: (v: string) => (v ? <Tag>{v}</Tag> : "—") },
              { title: "排序", dataIndex: "sortOrder", width: 70 },
              {
                title: "引用商品数",
                dataIndex: "_count",
                width: 100,
                render: (c: { productTags: number } | undefined) => c?.productTags ?? 0,
              },
              {
                title: "状态",
                dataIndex: "isActive",
                width: 90,
                render: (v: boolean, r: TagRow) => (
                  <Switch
                    checked={v}
                    size="small"
                    onChange={(checked) => toggleActive(r, checked)}
                    checkedChildren="启"
                    unCheckedChildren="停"
                  />
                ),
              },
              {
                title: "操作",
                width: 90,
                render: (_: unknown, r: TagRow) => (
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        forceRender
        title={editing ? "编辑标签" : "新建标签"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="标签名称" rules={[{ required: true, message: "请输入标签名称" }]}>
            <Input maxLength={50} placeholder="例如：古法工艺" />
          </Form.Item>
          <Form.Item name="group" label="分组（选填）">
            <Input maxLength={50} placeholder="例如：工艺 / 寓意 / 场景" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" initialValue={0}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

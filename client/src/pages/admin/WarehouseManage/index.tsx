import { useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  message,
  Space,
} from "antd";
import { PlusOutlined, ReloadOutlined, EditOutlined } from "@ant-design/icons";
import { warehouseApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import { AdminLoadingState, AdminEmptyState, AdminErrorState } from "@/components/common/AdminDataStates";

const TYPE_META: Record<string, { label: string; color: string }> = {
  SHOWROOM: { label: "展厅", color: "gold" },
  FACTORY: { label: "工厂", color: "blue" },
  STORE: { label: "门店", color: "green" },
};

type WarehouseRow = {
  id: number;
  name: string;
  type: string;
  address?: string | null;
  contact?: string | null;
  phone?: string | null;
  isActive: boolean;
  _count?: { inventories: number };
};

export default function WarehouseManage() {
  const [list, setList] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await warehouseApi.list();
      const data = unwrapResponse<WarehouseRow[]>(res);
      setList(Array.isArray(data) ? data : (data as any)?.list || []);
    } catch (e: any) {
      setError(getSafeAdminErrorMessage(e, "仓库列表加载失败，请稍后重新加载。"));
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

  const openEdit = (record: WarehouseRow) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      type: record.type,
      address: record.address || undefined,
      contact: record.contact || undefined,
      phone: record.phone || undefined,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await warehouseApi.update(editing.id, values);
        message.success("仓库已更新");
      } else {
        await warehouseApi.create(values);
        message.success("仓库已创建");
      }
      setModalOpen(false);
      void load();
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, "仓库保存失败，请检查填写内容后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (record: WarehouseRow, isActive: boolean) => {
    try {
      await warehouseApi.update(record.id, { isActive });
      message.success(isActive ? "仓库已启用" : "仓库已停用");
      void load();
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, "仓库状态更新失败，请重新加载后重试。"));
    }
  };

  return (
    <div>
      <AdminPageHeader title="仓库管理" subtitle="管理多仓（展厅/工厂/门店），库存按仓库维度维护" />
      <Card style={{ borderRadius: 10, border: "1px solid var(--adm-line)", boxShadow: "0 6px 20px rgba(24,26,27,0.035)" }}>
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建仓库
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
        </div>

        {loading ? (
          <AdminLoadingState subject="仓库列表" />
        ) : error ? (
          <AdminErrorState message={error} onRetry={() => void load()} />
        ) : list.length === 0 ? (
          <AdminEmptyState message="暂无仓库，新建后可将商品 SKU 库存关联到对应仓库" />
        ) : (
          <Table
            dataSource={list}
            rowKey="id"
            size="middle"
            pagination={false}
            columns={[
              { title: "ID", dataIndex: "id", width: 60 },
              { title: "仓库名称", dataIndex: "name", render: (v: string) => <strong>{v}</strong> },
              {
                title: "类型",
                dataIndex: "type",
                width: 90,
                render: (v: string) => {
                  const meta = TYPE_META[v] || { label: v, color: "default" };
                  return <Tag color={meta.color as any}>{meta.label}</Tag>;
                },
              },
              { title: "地址", dataIndex: "address", ellipsis: true, render: (v: string) => v || "—" },
              { title: "联系人", dataIndex: "contact", width: 100, render: (v: string) => v || "—" },
              { title: "电话", dataIndex: "phone", width: 130, render: (v: string) => v || "—" },
              {
                title: "库存记录数",
                dataIndex: "_count",
                width: 100,
                render: (c: { inventories: number } | undefined) => c?.inventories ?? 0,
              },
              {
                title: "状态",
                dataIndex: "isActive",
                width: 90,
                render: (v: boolean, r: WarehouseRow) => (
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
                render: (_: unknown, r: WarehouseRow) => (
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        title={editing ? "编辑仓库" : "新建仓库"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="仓库名称" rules={[{ required: true, message: "请输入仓库名称" }]}>
            <Input maxLength={100} placeholder="例如：深圳展厅" />
          </Form.Item>
          <Form.Item name="type" label="仓库类型" rules={[{ required: true, message: "请选择类型" }]} initialValue="SHOWROOM">
            <Select
              options={[
                { value: "SHOWROOM", label: "展厅" },
                { value: "FACTORY", label: "工厂" },
                { value: "STORE", label: "门店" },
              ]}
            />
          </Form.Item>
          <Form.Item name="address" label="地址（选填）">
            <Input maxLength={300} placeholder="仓库/展厅详细地址" />
          </Form.Item>
          <Form.Item name="contact" label="联系人（选填）">
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="phone" label="联系电话（选填）">
            <Input maxLength={20} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

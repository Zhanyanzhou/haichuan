import { useState, useEffect, useCallback } from "react";
import {
  Table,
  Button,
  Card,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Space,
  message,
  Popconfirm,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { attributeApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";

interface AttrValue {
  id: number;
  value: string;
  sortOrder: number;
  isActive: boolean;
}

interface Attr {
  id: number;
  key: string;
  name: string;
  sortOrder: number;
  isFilterable: boolean;
  isActive: boolean;
  values: AttrValue[];
}

export default function AttributeManage() {
  const [list, setList] = useState<Attr[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Attr | null>(null);
  const [attrModalOpen, setAttrModalOpen] = useState(false);
  const [valueModalOpen, setValueModalOpen] = useState(false);
  const [currentAttrId, setCurrentAttrId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<AttrValue | null>(null);
  const [form] = Form.useForm();
  const [valueForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await attributeApi.getAll();
      setList(unwrapResponse<Attr[]>(res) || []);
    } catch {
      message.error("属性加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreateAttr = () => {
    setEditing(null);
    form.resetFields();
    setAttrModalOpen(true);
  };

  const openEditAttr = (a: Attr) => {
    setEditing(a);
    form.setFieldsValue(a);
    setAttrModalOpen(true);
  };

  const submitAttr = async () => {
    const values = await form.validateFields();
    try {
      if (editing) await attributeApi.update(editing.id, values);
      else await attributeApi.create(values);
      message.success("属性已保存");
      setAttrModalOpen(false);
      load();
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, "属性保存失败，请检查填写内容后重试。"));
    }
  };

  const removeAttr = async (id: number) => {
    try {
      await attributeApi.remove(id);
      message.success("属性已停用");
      load();
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, "属性停用失败，请重新加载后重试。"));
    }
  };

  const openAddValue = (attrId: number) => {
    setCurrentAttrId(attrId);
    setEditingValue(null);
    valueForm.resetFields();
    setValueModalOpen(true);
  };

  const openEditValue = (attrId: number, v: AttrValue) => {
    setCurrentAttrId(attrId);
    setEditingValue(v);
    valueForm.setFieldsValue({ value: v.value, sortOrder: v.sortOrder });
    setValueModalOpen(true);
  };

  const submitValue = async () => {
    const values = await valueForm.validateFields();
    try {
      if (editingValue) {
        await attributeApi.updateValue(editingValue.id, values);
        message.success("已更新属性值");
      } else {
        await attributeApi.addValue(currentAttrId as number, values);
        message.success("已添加属性值");
      }
      setValueModalOpen(false);
      load();
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, "属性值保存失败，请检查填写内容后重试。"));
    }
  };

  const removeValue = async (valueId: number) => {
    try {
      await attributeApi.removeValue(valueId);
      message.success("已停用属性值");
      load();
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, "属性值停用失败，请重新加载后重试。"));
    }
  };

  const columns = [
    { title: "属性名", dataIndex: "name", width: 140 },
    {
      title: "稳定键",
      dataIndex: "key",
      width: 140,
      render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
    },
    {
      title: "可筛选",
      dataIndex: "isFilterable",
      width: 90,
      render: (v: boolean) => (v ? <Tag>是</Tag> : <Tag>否</Tag>),
    },
    { title: "排序", dataIndex: "sortOrder", width: 70 },
    {
      title: "状态",
      dataIndex: "isActive",
      width: 90,
      render: (v: boolean) =>
        v ? <Tag color="success">启用</Tag> : <Tag color="default">停用</Tag>,
    },
    {
      title: "操作",
      width: 180,
      render: (_: any, r: Attr) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditAttr(r)}
          >
            编辑
          </Button>
          <Popconfirm title="停用该属性？" onConfirm={() => removeAttr(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              停用
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="属性字典"
        subtitle="统一管理商品筛选维度（材质、工艺、尺寸、场景等），前台筛选器按此字典动态生成"
      />
      <Card
        style={{ borderRadius: 10, border: "1px solid #E7E6E2" }}
        title={
          <Space>
            <span>属性列表</span>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={openCreateAttr}
            >
              新建属性
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={list}
          columns={columns}
          pagination={false}
          expandable={{
            expandedRowRender: (attr: Attr) => (
              <div style={{ paddingLeft: 24 }}>
                <div style={{ marginBottom: 12 }}>
                  <Button
                    size="small"
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => openAddValue(attr.id)}
                  >
                    新建属性值
                  </Button>
                </div>
                {attr.values.length === 0 ? (
                  <span style={{ color: "var(--adm-muted)" }}>暂无属性值</span>
                ) : (
                  <Space size={[8, 8]} wrap>
                    {attr.values.map((v) => (
                      <Tag
                        key={v.id}
                        color="default"
                        style={{ opacity: v.isActive ? 1 : 0.5 }}
                      >
                        {v.value}
                        <EditOutlined
                          style={{ marginLeft: 6, cursor: "pointer", color: "var(--adm-action)" }}
                          onClick={() => openEditValue(attr.id, v)}
                        />
                        {v.isActive ? (
                          <Popconfirm
                            title="停用该属性值？"
                            onConfirm={() => removeValue(v.id)}
                          >
                            <DeleteOutlined
                              style={{
                                marginLeft: 6,
                                cursor: "pointer",
                                color: "var(--adm-error)",
                              }}
                            />
                          </Popconfirm>
                        ) : null}
                      </Tag>
                    ))}
                  </Space>
                )}
              </div>
            ),
          }}
        />
      </Card>

      <Modal
        title={editing ? "编辑属性" : "新建属性"}
        open={attrModalOpen}
        onOk={submitAttr}
        onCancel={() => setAttrModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="属性名"
            rules={[{ required: true, message: "请输入属性名" }]}
          >
            <Input placeholder="如：材质" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="key"
            label="稳定键"
            rules={[
              { required: true, message: "请输入稳定键" },
              {
                pattern: /^[a-z][a-z0-9_-]*$/,
                message: "仅支持小写字母、数字、下划线与连字符，且以字母开头",
              },
            ]}
          >
            <Input
              placeholder="如：material"
              disabled={!!editing}
              maxLength={50}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" initialValue={0}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="isFilterable"
            label="前台可筛选"
            valuePropName="checked"
            initialValue
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingValue ? "编辑属性值" : "新建属性值"}
        open={valueModalOpen}
        onOk={submitValue}
        onCancel={() => setValueModalOpen(false)}
        destroyOnClose
      >
        <Form form={valueForm} layout="vertical">
          <Form.Item
            name="value"
            label="属性值"
            rules={[{ required: true, message: "请输入属性值" }]}
          >
            <Input placeholder="如：足金999" maxLength={100} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" initialValue={0}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

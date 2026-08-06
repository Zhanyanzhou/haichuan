import { Card, Table, Tag, Space, Modal, Form, Input, InputNumber, Select, Switch, TreeSelect, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import ScifiButton from '@/components/ui/ScifiButton';
import { categoryApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { Category } from '@/types';

interface CategoryTreeNode extends Category {
  children?: CategoryTreeNode[];
}

function buildTree(list: Category[]): CategoryTreeNode[] {
  const map = new Map<number, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];
  for (const item of list) {
    map.set(item.id, { ...item, children: [] });
  }
  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children!.push(item);
    } else {
      roots.push(item);
    }
  }
  return roots;
}

export default function CategoryManage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form] = Form.useForm();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await categoryApi.getTree();
      const data = unwrapResponse(res);
      // flatten tree to list for table display
      const flat: Category[] = [];
      const walk = (nodes: any[], parentId?: number) => {
        for (const n of nodes) {
          flat.push({ ...n, parentId: parentId ?? n.parentId });
          if (n.children?.length) walk(n.children, n.id);
        }
      };
      walk(Array.isArray(data) ? data : []);
      setCats(flat);
    } catch { setCats([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const tree = buildTree(cats);

  const openCreate = (parentId?: number) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ level: parentId ? 2 : 1, sortOrder: 0, isActive: true, parentId: parentId || undefined });
    setModalOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    form.setFieldsValue(c);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await categoryApi.update(editing.id, values);
      } else {
        await categoryApi.create(values);
      }
      message.success(editing ? '已更新' : '已创建');
      setModalOpen(false);
      refresh();
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await categoryApi.delete(id);
      message.success('已删除');
      refresh();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const treeSelectData = tree.map((c) => ({
    value: c.id,
    title: c.name,
    children: c.children?.length ? c.children.map((ch) => ({
      value: ch.id,
      title: ch.name,
      children: ch.children?.length ? ch.children.map((gch) => ({
        value: gch.id,
        title: gch.name,
      })) : undefined,
    })) : undefined,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-brand-text">分类管理</h1>
          <p className="text-sm text-brand-muted mt-1">四级分类树 · 共 {cats.length} 个分类</p>
        </div>
        <ScifiButton variant="gold" onClick={() => openCreate()}><PlusOutlined /> 新增分类</ScifiButton>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(l => (
          <div key={l} className="bg-white border border-brand-line p-4">
            <p className="text-2xl font-sans font-bold text-brand-gold">{cats.filter(c => c.level === l).length}</p>
            <p className="text-xs text-brand-muted mt-1">第{l}级分类</p>
          </div>
        ))}
      </div>

      <Card className="!bg-white !border-brand-line">
        <Table dataSource={cats} rowKey="id" loading={loading} pagination={false} size="middle"
          columns={[
            { title: '名称', dataIndex: 'name', width: 250, render: (n: string, r: Category) => <span style={{ paddingLeft: (r.level - 1) * 24 }}>{n}</span> },
            { title: 'Slug', dataIndex: 'slug', width: 140, render: (v: string) => <code className="text-xs text-brand-gold">{v}</code> },
            { title: '层级', dataIndex: 'level', width: 70, render: (v: number) => <Tag>{v}级</Tag> },
            { title: '排序', dataIndex: 'sortOrder', width: 70 },
            { title: '状态', key: 'active', width: 70, render: (_: any, r: Category) => {
              const active = (r as any).isActive !== false;
              return <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>;
            }},
            { title: '操作', width: 140,
              render: (_: any, r: Category) => (
                <Space>
                  <button className="text-xs text-brand-gold hover:underline" onClick={() => openEdit(r)}><EditOutlined /> 编辑</button>
                  <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
                    <button className="text-xs text-red-500 hover:underline"><DeleteOutlined /> 删除</button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]} />
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        title={editing ? '编辑分类' : '新增分类'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        width={520}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ style: { background: '#B8944E', borderColor: '#B8944E' } }}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="name" label="分类名称" rules={[{ required: true }]}>
              <Input placeholder="如：手镯" />
            </Form.Item>
            <Form.Item name="slug" label="Slug" rules={[{ required: true }]}>
              <Input placeholder="如：bracelet" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="level" label="层级" rules={[{ required: true }]}>
              <Select options={[1, 2, 3, 4].map(l => ({ value: l, label: `第${l}级` }))} />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
          </div>
          {!editing && (
            <Form.Item name="parentId" label="父级分类">
              <TreeSelect placeholder="留空为顶级分类" treeData={treeSelectData} allowClear />
            </Form.Item>
          )}
          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

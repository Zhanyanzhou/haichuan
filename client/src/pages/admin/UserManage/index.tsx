import { useState, useEffect } from 'react';
import { Card, Table, Button, Tag, Space, Modal, Form, Input, Select, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, LockOutlined, DeleteOutlined } from '@ant-design/icons';
import ScifiButton from '@/components/ui/ScifiButton';
import { userApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { User, PaginatedResult } from '@/types';

const rm: Record<string, { c: string; t: string }> = {
  SUPER_ADMIN: { c: 'red', t: '超级管理员' }, ADMIN: { c: 'blue', t: '管理员' },
  EDITOR: { c: 'green', t: '编辑' }, CUSTOMER_SERVICE: { c: 'gold', t: '客服' }, WAREHOUSE: { c: 'purple', t: '仓库管理' },
  SALES_CONSULTANT: { c: 'cyan', t: '销售顾问' }, FINANCE: { c: 'magenta', t: '财务' },
};

export default function UserManage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [resetPwdForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await userApi.getList({ pageSize: 50 });
      const data = unwrapResponse<PaginatedResult<User>>(res);
      setUsers(data?.list || []);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: 'ADMIN', status: 'ACTIVE' });
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    form.setFieldsValue(u);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await userApi.update(editing.id, values);
      } else {
        await userApi.create(values);
      }
      message.success(editing ? '已更新' : '已创建');
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await userApi.delete(id);
      message.success('已删除');
      load();
    } catch (e: any) { message.error(e?.message || '删除失败'); }
  };

  const handleResetPwd = async () => {
    const values = await resetPwdForm.validateFields();
    if (!resetPwdUser) return;
    try {
      await userApi.update(resetPwdUser.id, { password: values.newPassword });
      message.success('密码已重置');
      setResetPwdOpen(false);
      setResetPwdUser(null);
      resetPwdForm.resetFields();
    } catch (e: any) { message.error(e?.message || '重置失败'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-display font-semibold text-brand-text">用户管理</h1><p className="text-sm text-brand-muted mt-1">RBAC 七角色权限</p></div>
        <ScifiButton variant="gold" onClick={openCreate}><PlusOutlined /> 新增用户</ScifiButton></div>
      <div className="grid grid-cols-7 gap-3">
        {Object.entries(rm).map(([k, v]) => (
          <div key={k} className="bg-white border border-brand-line p-3 text-center"><p className="text-lg font-sans font-bold" style={{ color: v.c }}>{users.filter(u => u.role === k).length}</p><p className="text-[10px] text-brand-muted mt-1">{v.t}</p></div>
        ))}
      </div>
      <Card className="!bg-white !border-brand-line">
        <Table dataSource={users} rowKey="id" loading={loading} pagination={false} size="middle"
          columns={[
            { title: '用户名', dataIndex: 'username', render: (v: string) => <code className="text-brand-gold">{v}</code> },
            { title: '姓名', dataIndex: 'realName' },
            { title: '角色', dataIndex: 'role', render: (v: string) => { const r = rm[v]; return <Tag color={r?.c}>{r?.t}</Tag>; } },
            { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'red'}>{v === 'ACTIVE' ? '正常' : '禁用'}</Tag> },
            { title: '操作', render: (_: any, r: User) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} type="text" onClick={() => openEdit(r)}>编辑</Button>
                <Button size="small" icon={<LockOutlined />} type="text" onClick={() => { setResetPwdUser(r); resetPwdForm.resetFields(); setResetPwdOpen(true); }}>重置密码</Button>
                <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
                  <Button size="small" icon={<DeleteOutlined />} type="text" danger>删除</Button>
                </Popconfirm>
              </Space>
            ) },
          ]} />
      </Card>

      <Modal title={editing ? '编辑用户' : '新增用户'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}
        okText="保存" cancelText="取消" okButtonProps={{ style: { background: '#B8944E', borderColor: '#B8944E' } }}>
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input placeholder="用户名" /></Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="realName" label="姓名"><Input placeholder="真实姓名" /></Form.Item>
            <Form.Item name="phone" label="手机号"><Input placeholder="手机号" /></Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="role" label="角色" rules={[{ required: true }]}>
              <Select options={Object.entries(rm).map(([k, v]) => ({ value: k, label: v.t }))} />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select options={[{ value: 'ACTIVE', label: '正常' }, { value: 'DISABLED', label: '禁用' }]} />
            </Form.Item>
          </div>
          {!editing && <Form.Item name="password" label="密码"><Input.Password placeholder="登录密码" /></Form.Item>}
        </Form>
      </Modal>
      <Modal title={`重置密码 — ${resetPwdUser?.realName || ''}`} open={resetPwdOpen} onOk={handleResetPwd} onCancel={() => { setResetPwdOpen(false); setResetPwdUser(null); }} okText="确认重置">
        <Form form={resetPwdForm} layout="vertical">
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '至少6位' }]}>
            <Input.Password placeholder="输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

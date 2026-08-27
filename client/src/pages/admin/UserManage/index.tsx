import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  App as AntdApp,
  Popconfirm,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  LockOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { userApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/common/AdminDataStates";
import type { User } from "@/types";
import { useAuthStore } from "@/store/authStore";

const rm: Record<string, { c: string; t: string }> = {
  SUPER_ADMIN: { c: "red", t: "超级管理员" },
  ADMIN: { c: "blue", t: "管理员" },
  EDITOR: { c: "green", t: "内容编辑" },
  CUSTOMER_SERVICE: { c: "gold", t: "客服" },
  WAREHOUSE: { c: "purple", t: "仓库管理" },
  SALES_CONSULTANT: { c: "cyan", t: "销售顾问" },
  FINANCE: { c: "magenta", t: "财务" },
};

export default function UserManage() {
  const { message } = AntdApp.useApp();
  const role = useAuthStore((state) => state.user?.role);
  const isSuperAdmin = role === "SUPER_ADMIN";
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [resetPwdForm] = Form.useForm();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await userApi.getList({ page, pageSize, keyword: keyword || undefined });
      const data = unwrapResponse<{
        list: User[];
        total: number;
        roleCounts?: Record<string, number>;
      }>(res);
      if (!data || !Array.isArray(data.list) || !Number.isFinite(Number(data.total))) {
        throw new Error("Invalid user response");
      }
      if (requestId !== requestIdRef.current) return;
      setUsers(data.list);
      setTotal(Number(data.total));
      setRoleCounts(data.roleCounts || {});
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setError(
        getSafeAdminErrorMessage(
          loadError,
          "后台员工数据加载失败，请稍后重新加载。",
        ),
      );
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [keyword, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    if (!isSuperAdmin) return;
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: "ADMIN", status: "ACTIVE" });
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
        const editableValues = { ...values };
        delete editableValues.username;
        delete editableValues.password;
        const payload = isSuperAdmin
          ? editableValues
          : {
              realName: values.realName,
              phone: values.phone,
              email: values.email,
            };
        await userApi.update(editing.id, payload);
      } else {
        if (!isSuperAdmin) return;
        await userApi.create(values);
      }
      message.success(editing ? "后台员工信息已更新" : "后台员工已创建");
      setModalOpen(false);
      void load();
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, "后台员工信息保存失败，请检查填写内容后重试。"));
    }
  };

  const handleDisable = async (id: number) => {
    if (!isSuperAdmin) return;
    try {
      await userApi.delete(id);
      message.success("后台员工已禁用");
      void load();
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, "后台员工禁用失败，请重新加载后确认当前状态。"));
    }
  };

  const handleResetPwd = async () => {
    const values = await resetPwdForm.validateFields();
    if (!resetPwdUser) return;
    try {
      await userApi.update(resetPwdUser.id, { password: values.newPassword });
      message.success("密码已重置");
      setResetPwdOpen(false);
      setResetPwdUser(null);
      resetPwdForm.resetFields();
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, "密码重置失败，请确认权限后重试。"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-brand-text">
            后台员工
          </h1>
          <p className="text-sm text-brand-muted mt-1">RBAC 七角色权限</p>
        </div>
        {isSuperAdmin && (
          <Button type="primary" onClick={openCreate}>
            <PlusOutlined /> 新建员工
          </Button>
        )}
      </div>
      {loading ? (
        <AdminLoadingState subject="后台员工数据" />
      ) : error ? (
        <AdminErrorState subject="后台员工数据" message={error} onRetry={() => void load()} />
      ) : users.length === 0 ? (
        <Card className="!bg-white !border-brand-line">
          <AdminEmptyState subject="后台员工" kind={keyword ? "filtered" : "initial"} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-3">
            {Object.entries(rm).map(([k, v]) => (
              <div
                key={k}
                className="bg-white border border-brand-line p-3 text-center"
              >
                <p className="text-lg font-sans font-bold" style={{ color: "var(--adm-ink)" }}>
                  {roleCounts[k] ?? "—"}
                </p>
                <p className="text-xs leading-[18px] text-brand-muted mt-1">{v.t}</p>
              </div>
            ))}
          </div>
          <Card className="!bg-white !border-brand-line">
        <div style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="搜索用户名 / 姓名 / 手机号"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
            style={{ width: 280 }}
          />
        </div>
            <Table
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 人`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          size="middle"
          columns={[
            {
              title: "用户名",
              dataIndex: "username",
              render: (v: string) => (
                <code style={{ color: "var(--adm-text-strong)" }}>{v}</code>
              ),
            },
            { title: "姓名", dataIndex: "realName" },
            {
              title: "角色",
              dataIndex: "role",
              render: (v: string) => {
                const r = rm[v];
                return <Tag color={r?.c}>{r?.t}</Tag>;
              },
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (v: string) => (
                <Tag color={v === "ACTIVE" ? "green" : "red"}>
                  {v === "ACTIVE" ? "正常" : "禁用"}
                </Tag>
              ),
            },
            {
              title: "操作",
              render: (_: unknown, r: User) => (
                <Space>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    type="text"
                    onClick={() => openEdit(r)}
                  >
                    编辑
                  </Button>
                  {isSuperAdmin && (
                    <>
                      <Button
                        size="small"
                        icon={<LockOutlined />}
                        type="text"
                        onClick={() => {
                          setResetPwdUser(r);
                          resetPwdForm.resetFields();
                          setResetPwdOpen(true);
                        }}
                      >
                        重置密码
                      </Button>
                      {r.status !== "DISABLED" && (
                        <Popconfirm
                          title="禁用该后台员工？"
                          description="禁用后该员工将无法继续登录后台，账号资料仍会保留。"
                          okText="确认禁用"
                          cancelText="取消"
                          onConfirm={() => handleDisable(r.id)}
                        >
                          <Button
                            size="small"
                            icon={<StopOutlined />}
                            type="text"
                            danger
                          >
                            禁用
                          </Button>
                        </Popconfirm>
                      )}
                    </>
                  )}
                </Space>
              ),
            },
          ]}
            />
          </Card>
        </>
      )}

      <Modal
        forceRender
        title={editing ? "编辑后台员工" : "新建后台员工"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true }]}
          >
            <Input
              placeholder="用户名"
              readOnly={Boolean(editing)}
              aria-readonly={Boolean(editing)}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="realName" label="姓名">
              <Input placeholder="真实姓名" />
            </Form.Item>
            <Form.Item name="phone" label="手机号">
              <Input placeholder="手机号" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="role" label="角色" rules={[{ required: true }]}>
              <Select
                disabled={!isSuperAdmin}
                options={Object.entries(rm).map(([k, v]) => ({
                  value: k,
                  label: v.t,
                }))}
              />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select
                disabled={!isSuperAdmin}
                options={[
                  { value: "ACTIVE", label: "正常" },
                  { value: "DISABLED", label: "禁用" },
                ]}
              />
            </Form.Item>
          </div>
          {!editing && (
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: "请输入登录密码" },
                { min: 12, max: 128, message: "密码需为 12–128 位" },
                { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,128}$/, message: "密码需包含大小写字母、数字和符号" },
              ]}
            >
              <Input.Password placeholder="登录密码" />
            </Form.Item>
          )}
        </Form>
      </Modal>
      <Modal
        forceRender
        title={`重置密码 — ${resetPwdUser?.realName || ""}`}
        open={resetPwdOpen}
        onOk={handleResetPwd}
        onCancel={() => {
          setResetPwdOpen(false);
          setResetPwdUser(null);
        }}
        okText="重置密码"
      >
        <Form form={resetPwdForm} layout="vertical">
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 12, max: 128, message: "密码需为 12–128 位" },
              { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,128}$/, message: "密码需包含大小写字母、数字和符号" },
            ]}
          >
            <Input.Password placeholder="输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

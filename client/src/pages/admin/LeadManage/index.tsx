import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Table,
  Tag,
  Select,
  Input,
  Button,
  Drawer,
  Descriptions,
  Space,
  Card,
  Timeline,
  App as AntdApp,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  SearchOutlined,
  EyeOutlined,
  PhoneOutlined,
  MailOutlined,
} from "@ant-design/icons";
import api from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import { unwrapResponse } from "@/utils/unwrap";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import {
  AdminLoadingState,
  AdminEmptyState,
  AdminErrorState,
} from "@/components/common/AdminDataStates";
import { SecureImage } from "@/components/common/SecureImage";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import type { PaginatedResult } from "@/types";

type LeadType = "inquiry" | "selection";

interface LeadListRow {
  id: number;
  leadType: LeadType;
  leadTypeLabel: string;
  customerName: string;
  phone?: string | null;
  email?: string | null;
  relatedProducts: number;
  status: string;
  assigneeName?: string | null;
  nextFollowUpAt?: string | null;
  createdAt: string;
}

interface LeadItem {
  id: number;
  productNameSnapshot: string;
  productSkuSnapshot?: string | null;
  productImageSnapshot?: string | null;
}

interface LeadFollowUp {
  id: number;
  content: string;
  createdAt: string;
  creator?: { realName?: string | null } | null;
}

interface LeadDetail extends Partial<LeadListRow> {
  id: number;
  leadType: LeadType;
  leadTypeLabel: string;
  customerName: string;
  status: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  product?: { id: number; name: string; code?: string | null } | null;
  assignee?: { realName?: string | null } | null;
  handler?: { realName?: string | null } | null;
  message?: string | null;
  reply?: string | null;
  internalNote?: string | null;
  items?: LeadItem[];
  followUps?: LeadFollowUp[];
}

interface AssignableStaff {
  id: number;
  name: string;
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  PENDING: { color: "warning", label: "待处理" },
  CONTACTED: { color: "processing", label: "已联系" },
  FOLLOWING: { color: "processing", label: "跟进中" },
  COMPLETED: { color: "success", label: "已完成" },
  INVALID: { color: "default", label: "无效" },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONTACTED", "INVALID"],
  CONTACTED: ["FOLLOWING", "COMPLETED", "INVALID"],
  FOLLOWING: ["COMPLETED", "INVALID"],
  COMPLETED: [],
  INVALID: [],
};

export default function LeadManage() {
  const { message } = AntdApp.useApp();
  const [searchParams] = useSearchParams();
  const [list, setList] = useState<LeadListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [leadType, setLeadType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailId, setDetailId] = useState<{ type: LeadType; id: number } | null>(
    null,
  );
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<AssignableStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [assignTo, setAssignTo] = useState<number | undefined>(undefined);
  const [assigning, setAssigning] = useState(false);
  const role = useAuthStore((s) => s.user?.role);
  const canAssign =
    role === "SUPER_ADMIN" || role === "ADMIN" || role === "CUSTOMER_SERVICE";
  const requestedStatus = searchParams.get("status") || "";
  const requestedType = searchParams.get("type") || "";

  useEffect(() => {
    setStatus(
      Object.prototype.hasOwnProperty.call(STATUS_MAP, requestedStatus)
        ? requestedStatus
        : "",
    );
    setPage(1);
  }, [requestedStatus]);

  useEffect(() => {
    setLeadType(
      requestedType === "inquiry" || requestedType === "selection"
        ? requestedType
        : "",
    );
    setPage(1);
  }, [requestedType]);

  const pageSize = 15;

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get("/leads", {
        params: {
          page,
          pageSize,
          status: status || undefined,
          type: leadType || undefined,
          keyword: keyword || undefined,
        },
      });
      const data = unwrapResponse<PaginatedResult<LeadListRow>>(res);
      setList(data.list ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [keyword, leadType, page, pageSize, status]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const openDetail = async (type: LeadType, id: number) => {
    setDetailId({ type, id });
    setDetailError(false);
    setDetail(null);
    try {
      const res = await api.get(`/leads/${type}/${id}`);
      setDetail(unwrapResponse<LeadDetail>(res));
    } catch {
      // P1-39：详情加载失败标记错误态，避免抽屉永久 loading 无法区分加载中/失败
      setDetailError(true);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!detailId) return;
    setSaving(true);
    try {
      await api.put(`/leads/${detailId.type}/${detailId.id}`, {
        status: newStatus,
      });
      message.success("状态已更新");
      openDetail(detailId.type, detailId.id);
      fetchList();
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "线索状态更新失败，请重新加载后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!detailId) return;
    setSaving(true);
    try {
      await api.put(`/leads/${detailId.type}/${detailId.id}`, {
        internalNote: noteText,
      });
      message.success("备注已保存");
      openDetail(detailId.type, detailId.id);
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "内部备注保存失败，请检查内容后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const addFollowUp = async () => {
    if (!detailId || !noteText) return;
    setSaving(true);
    try {
      await api.post(`/leads/${detailId.type}/${detailId.id}/follow-up`, {
        content: noteText,
        contactMethod: "other",
      });
      message.success("跟进已添加");
      setNoteText("");
      openDetail(detailId.type, detailId.id);
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "跟进记录添加失败，请检查内容后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const res = await api.get("/users/assignable");
      setStaff(unwrapResponse<AssignableStaff[]>(res) || []);
    } catch (error) {
      setStaff([]);
      message.error(getSafeAdminErrorMessage(error, "人员列表加载失败，请刷新后重试。"));
    } finally {
      setStaffLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!detailId || !assignTo) return;
    setAssigning(true);
    try {
      await api.put(`/leads/${detailId.type}/${detailId.id}`, {
        assignedTo: assignTo,
      });
      message.success("已指派");
      setAssignTo(undefined);
      openDetail(detailId.type, detailId.id);
      fetchList();
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "线索指派失败，请重新加载人员列表后重试。"));
    } finally {
      setAssigning(false);
    }
  };

  const columns: TableColumnsType<LeadListRow> = [
    { title: "客户", dataIndex: "customerName", width: 100 },
    {
      title: "类型",
      dataIndex: "leadTypeLabel",
      width: 80,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: "联系方式",
      width: 130,
      render: (_, row) => (
        <Space>
          {row.phone && (
            <>
              <PhoneOutlined />
              {row.phone}
            </>
          )}
          {row.email && (
            <>
              <MailOutlined />
              {row.email}
            </>
          )}
        </Space>
      ),
    },
    {
      title: "相关商品",
      width: 80,
      render: (_, row) => row.relatedProducts || 0,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 80,
      render: (s: string) => (
        <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label || s}</Tag>
      ),
    },
    {
      title: "负责人",
      dataIndex: "assigneeName",
      width: 80,
      render: (v: string) => v || "-",
    },
    {
      title: "下次跟进",
      dataIndex: "nextFollowUpAt",
      width: 100,
      render: (v: string) =>
        v ? new Date(v).toLocaleDateString("zh-CN") : "-",
    },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      width: 150,
      render: (v: string) => (v ? new Date(v).toLocaleString("zh-CN") : "-"),
    },
    {
      title: "操作",
      width: 60,
      render: (_, row) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => openDetail(row.leadType, row.id)}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="客户线索"
        subtitle="统一管理预约咨询、选款咨询与定制咨询"
      />
      <Card
        style={{
          borderRadius: 10,
          border: "1px solid var(--adm-line)",
          marginBottom: 16,
        }}
      >
        <Space wrap>
          <Input
            placeholder="客户姓名/电话"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={fetchList}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="线索类型"
            value={leadType || undefined}
            onChange={(v) => {
              setLeadType(v || "");
              setPage(1);
            }}
            allowClear
            style={{ width: 120 }}
          >
            <Select.Option value="inquiry">预约咨询</Select.Option>
            <Select.Option value="selection">选款咨询</Select.Option>
          </Select>
          <Select
            placeholder="状态筛选"
            value={status || undefined}
            onChange={(v) => {
              setStatus(v || "");
              setPage(1);
            }}
            allowClear
            style={{ width: 120 }}
          >
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <Select.Option key={k} value={k}>
                {v.label}
              </Select.Option>
            ))}
          </Select>
          <Button
            type="primary"
            onClick={fetchList}
          >
            搜索
          </Button>
        </Space>
      </Card>

      {error ? (
        <AdminErrorState onRetry={fetchList} />
      ) : (
        <Table
          columns={columns}
          dataSource={list}
          rowKey={(r) => `${r.leadType}-${r.id}`}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showTotal: (t: number) => `共 ${t} 条`,
          }}
          locale={{ emptyText: <AdminEmptyState description="暂无客户线索" /> }}
          scroll={{ x: 1000 }}
        />
      )}

      <Drawer
        title={`线索详情`}
        open={detailId !== null}
        onClose={() => {
          setDetailId(null);
          setDetail(null);
        }}
        width={640}
      >
        {detail ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="客户">
                {detail.customerName}
              </Descriptions.Item>
              <Descriptions.Item label="电话">
                {detail.phone || detail.customerPhone || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="邮箱">
                {detail.email || detail.customerEmail || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag>{detail.leadTypeLabel}</Tag>
              </Descriptions.Item>
              {detail.leadType === "inquiry" && detail.product && (
                <Descriptions.Item label="来源作品">
                  <Space direction="vertical" size={0}>
                    <span>{detail.product.name}</span>
                    <span style={{ color: "var(--adm-muted)", fontSize: 12 }}>
                      货号：{detail.product.code || "历史记录未保留货号"}
                    </span>
                  </Space>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[detail.status]?.color}>
                  {STATUS_MAP[detail.status]?.label || detail.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="负责人">
                {detail.assignee?.realName || detail.handler?.realName || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="提交内容">
                {detail.message || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="客户可见回复">
                {detail.reply || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="内部备注">
                {detail.internalNote || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="提交时间">
                {detail.createdAt
                  ? new Date(detail.createdAt).toLocaleString("zh-CN")
                  : "-"}
              </Descriptions.Item>
            </Descriptions>

            {detail.items && detail.items.length > 0 && (
              <>
                <h4 style={{ marginTop: 16 }}>
                  选款商品（{detail.items.length}）
                </h4>
                {detail.items.map((item) => (
                  <Card key={item.id} size="small" style={{ marginBottom: 8 }}>
                    <Space>
                      {item.productImageSnapshot && (
                        <SecureImage
                          src={item.productImageSnapshot}
                          alt=""
                          style={{
                            width: 48,
                            height: 48,
                            objectFit: "cover",
                            borderRadius: 4,
                          }}
                          tokenKind="staff"
                        />
                      )}
                      <div>
                        <strong>{item.productNameSnapshot}</strong>
                        <div style={{ color: "var(--adm-muted)", fontSize: 12 }}>
                          {item.productSkuSnapshot}
                        </div>
                      </div>
                    </Space>
                  </Card>
                ))}
              </>
            )}

            <h4 style={{ marginTop: 16 }}>跟进记录</h4>
            {(detail.followUps?.length ?? 0) > 0 ? (
              <Timeline
                items={(detail.followUps ?? []).map((followUp) => ({
                  children: (
                    <div>
                      <div>{followUp.content}</div>
                      <small style={{ color: "var(--adm-muted)" }}>
                        {followUp.creator?.realName || "系统"} ·{" "}
                        {new Date(followUp.createdAt).toLocaleString("zh-CN")}
                      </small>
                    </div>
                  ),
                }))}
              />
            ) : (
              <AdminEmptyState description="暂无跟进记录" />
            )}

            <div style={{ marginTop: 16 }}>
              <Input.TextArea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="添加内部备注或跟进记录..."
              />
              <Space style={{ marginTop: 8 }}>
                <Button onClick={saveNote} loading={saving}>
                  保存备注
                </Button>
                <Button
                  onClick={addFollowUp}
                  loading={saving}
                  type="primary"
                >
                  添加跟进
                </Button>
              </Space>
            </div>

            {canAssign && detailId && (
              <div style={{ marginTop: 16 }}>
                <Space>
                  <span>指派负责人：</span>
                  <Select
                    style={{ minWidth: 180 }}
                    placeholder="选择员工"
                    value={assignTo}
                    onChange={setAssignTo}
                    loading={staffLoading}
                    options={staff.map((user) => ({
                      value: user.id,
                      label: user.name,
                    }))}
                    onOpenChange={(open) => {
                      if (open && staff.length === 0) void loadStaff();
                    }}
                  />
                  <Button
                    type="primary"
                    size="small"
                    onClick={handleAssign}
                    loading={assigning}
                  >
                    指派
                  </Button>
                </Space>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <Space>
                <span>状态流转：</span>
                {(STATUS_TRANSITIONS[detail.status] ?? []).map((nextStatus) => (
                  <Button
                    key={nextStatus}
                    size="small"
                    danger={nextStatus === "INVALID"}
                    loading={saving}
                    onClick={() => updateStatus(nextStatus)}
                  >
                    {nextStatus === "INVALID"
                      ? "标记无效"
                      : STATUS_MAP[nextStatus].label}
                  </Button>
                ))}
              </Space>
            </div>
          </>
        ) : detailError ? (
          <AdminErrorState
            onRetry={() => {
              if (detailId) void openDetail(detailId.type, detailId.id);
            }}
          />
        ) : (
          <AdminLoadingState subject="线索详情" />
        )}
      </Drawer>
    </div>
  );
}

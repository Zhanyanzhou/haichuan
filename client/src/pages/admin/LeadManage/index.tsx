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
  message,
} from "antd";
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

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  PENDING: { color: "gold", label: "待处理" },
  PROCESSING: { color: "blue", label: "处理中" },
  REPLIED: { color: "processing", label: "已回复" },
  CLOSED: { color: "#999", label: "已关闭" },
};

const LEAD_TYPES = { inquiry: "预约咨询", selection: "选款咨询" } as const;

export default function LeadManage() {
  const [searchParams] = useSearchParams();
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [leadType, setLeadType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailId, setDetailId] = useState<{ type: string; id: number } | null>(
    null,
  );
  const [detail, setDetail] = useState<any>(null);
  const [detailError, setDetailError] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<any[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [assignTo, setAssignTo] = useState<number | undefined>(undefined);
  const [assigning, setAssigning] = useState(false);
  // 指派仅对管理员开放：客服无 GET /users 权限（最小权限，零服务端改动）
  const role = useAuthStore((s) => s.user?.role);
  const canAssign = role === "SUPER_ADMIN" || role === "ADMIN";
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
      const data = unwrapResponse<any>(res);
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

  const openDetail = async (type: string, id: number) => {
    setDetailId({ type, id });
    setDetailError(false);
    setDetail(null);
    try {
      const res = await api.get(`/leads/${type}/${id}`);
      setDetail(unwrapResponse<any>(res));
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
    } catch {
      message.error("更新失败");
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
    } catch {
      message.error("保存失败");
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
    } catch {
      message.error("添加失败");
    } finally {
      setSaving(false);
    }
  };

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const res = await api.get("/users", { params: { pageSize: 200 } });
      const data = unwrapResponse<{ list: any[] }>(res);
      setStaff((data?.list || []).filter((u: any) => u.status === "ACTIVE"));
    } catch {
      setStaff([]);
    } finally {
      setStaffLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!detailId || !assignTo) return;
    setAssigning(true);
    try {
      await api.put(`/inquiries/${detailId.id}/assign`, {
        assignedTo: assignTo,
      });
      message.success("已指派");
      setAssignTo(undefined);
      openDetail(detailId.type, detailId.id);
      fetchList();
    } catch {
      message.error("指派失败");
    } finally {
      setAssigning(false);
    }
  };

  const columns = [
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
      render: (_: any, r: any) => (
        <Space>
          {r.phone && (
            <>
              <PhoneOutlined />
              {r.phone}
            </>
          )}
          {r.email && (
            <>
              <MailOutlined />
              {r.email}
            </>
          )}
        </Space>
      ),
    },
    {
      title: "相关商品",
      width: 80,
      render: (_: any, r: any) => r.relatedProducts || 0,
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
      render: (_: any, r: any) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => openDetail(r.leadType, r.id)}
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
          border: "1px solid #E7E6E2",
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
            style={{ background: "#B69052", borderColor: "#B69052" }}
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
                {detail.items.map((item: any) => (
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
                        <div style={{ color: "#999", fontSize: 12 }}>
                          {item.productSkuSnapshot}
                        </div>
                      </div>
                    </Space>
                  </Card>
                ))}
              </>
            )}

            <h4 style={{ marginTop: 16 }}>跟进记录</h4>
            {detail.followUps?.length > 0 ? (
              <Timeline
                items={detail.followUps.map((f: any) => ({
                  children: (
                    <div>
                      <div>{f.content}</div>
                      <small style={{ color: "#999" }}>
                        {f.creator?.realName || "系统"} ·{" "}
                        {new Date(f.createdAt).toLocaleString("zh-CN")}
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
                  style={{ background: "#B69052", borderColor: "#B69052" }}
                >
                  添加跟进
                </Button>
              </Space>
            </div>

            {canAssign && detailId?.type === "inquiry" && (
              <div style={{ marginTop: 16 }}>
                <Space>
                  <span>指派负责人：</span>
                  <Select
                    style={{ minWidth: 180 }}
                    placeholder="选择员工"
                    value={assignTo}
                    onChange={setAssignTo}
                    loading={staffLoading}
                    options={staff.map((u: any) => ({
                      value: u.id,
                      label: u.realName || u.username,
                    }))}
                    onDropdownVisibleChange={(open) => {
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
                {["PENDING", "CONTACTED", "FOLLOWING", "COMPLETED"].map(
                  (s) =>
                    detail.status !== s && (
                      <Button
                        key={s}
                        size="small"
                        loading={saving}
                        onClick={() => updateStatus(s)}
                      >
                        {STATUS_MAP[s].label}
                      </Button>
                    ),
                )}
                {detail.status !== "INVALID" && (
                  <Button
                    size="small"
                    danger
                    loading={saving}
                    onClick={() => updateStatus("INVALID")}
                  >
                    标记无效
                  </Button>
                )}
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
          <AdminLoadingState />
        )}
      </Drawer>
    </div>
  );
}

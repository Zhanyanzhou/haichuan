import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Card,
  Input,
  Select,
  Button,
  Tag,
  Drawer,
  Descriptions,
  Form,
  Modal,
  message,
  Space,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { partnerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "待审核", color: "processing" },
  { value: "NEEDS_SUPPLEMENT", label: "需补充", color: "warning" },
  { value: "APPROVED", label: "已通过", color: "success" },
  { value: "REJECTED", label: "已驳回", color: "error" },
  { value: "SUSPENDED", label: "已暂停", color: "default" },
];

const STATUS_META: Record<string, { label: string; color: string }> =
  Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o]));

/** 手机号掩码：138****1234（列表中不必要暴露完整号码） */
function maskPhone(phone?: string | null): string {
  if (!phone || phone.length < 7) return phone || "-";
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

interface ApplicationRow {
  id: number;
  customerId: number;
  applicantName: string;
  applicantPhone: string;
  companyName?: string | null;
  city?: string | null;
  businessType?: string | null;
  channelType?: string | null;
  businessDescription?: string | null;
  expectedPurchaseRange?: string | null;
  contactWechat?: string | null;
  status: string;
  reviewNote?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  createdAt: string;
  customer?: { id: number; phone: string; name?: string | null; partnerStatus: string };
  reviewer?: { id: number; username: string; realName?: string | null } | null;
}

export default function PartnerApplications() {
  const [data, setData] = useState<ApplicationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ApplicationRow | null>(null);
  const [reviewing, setReviewing] = useState<ApplicationRow | null>(null);
  const [reviewForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = unwrapResponse(
        await partnerApi.adminGetList({
          page,
          pageSize,
          status: statusFilter,
          keyword,
        }),
      );
      setData((res?.list as ApplicationRow[]) || []);
      setTotal(res?.total || 0);
    } catch (e: any) {
      message.error(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, keyword]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row: ApplicationRow) => {
    try {
      const full = unwrapResponse(await partnerApi.adminGetById(row.id));
      setDetail(full as ApplicationRow);
      setDetailOpen(true);
    } catch (e: any) {
      message.error(e.message || "加载详情失败");
    }
  };

  const submitReview = async () => {
    if (!reviewing) return;
    const values = await reviewForm.validateFields();
    setSubmitting(true);
    try {
      await partnerApi.adminReview(reviewing.id, values);
      message.success("审核已提交");
      setReviewing(null);
      reviewForm.resetFields();
      await load();
    } catch (e: any) {
      message.error(e.message || "审核失败");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<ApplicationRow> = [
    { title: "ID", dataIndex: "id", width: 70 },
    { title: "申请人", dataIndex: "applicantName", width: 110 },
    {
      title: "手机号",
      dataIndex: "applicantPhone",
      width: 140,
      render: (_, r) => maskPhone(r.applicantPhone),
    },
    { title: "公司", dataIndex: "companyName", ellipsis: true },
    { title: "渠道", dataIndex: "channelType", width: 120 },
    { title: "申请时间", dataIndex: "createdAt", width: 160, render: (v) => v?.slice(0, 16).replace("T", " ") },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (s) => {
        const meta = STATUS_META[s] || { label: s, color: "default" };
        return <Tag color={meta.color as any}>{meta.label}</Tag>;
      },
    },
    {
      title: "审核人",
      dataIndex: "reviewer",
      width: 110,
      render: (r) => (r ? r.realName || r.username : "-"),
    },
    {
      title: "操作",
      width: 160,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => openDetail(r)}>
            详情
          </Button>
          <Button
            size="small"
            type="primary"
            disabled={r.status === "APPROVED" || r.status === "REJECTED"}
            onClick={() => {
              setReviewing(r);
              reviewForm.resetFields();
            }}
          >
            审核
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold mr-4">合作商家申请</h1>
          <Select
            allowClear
            placeholder="按状态筛选"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
          />
          <Input.Search
            allowClear
            placeholder="搜索申请人 / 手机号 / 公司"
            style={{ width: 260 }}
            onSearch={(v) => {
              setKeyword(v);
              setPage(1);
            }}
          />
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      <Drawer
        title="申请详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={560}
      >
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="状态">
              <Tag color={(STATUS_META[detail.status]?.color as any) || "default"}>
                {STATUS_META[detail.status]?.label || detail.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="申请人">{detail.applicantName}</Descriptions.Item>
            <Descriptions.Item label="手机号">{detail.applicantPhone}</Descriptions.Item>
            <Descriptions.Item label="公司">{detail.companyName || "-"}</Descriptions.Item>
            <Descriptions.Item label="城市">{detail.city || "-"}</Descriptions.Item>
            <Descriptions.Item label="经营类型">{detail.businessType || "-"}</Descriptions.Item>
            <Descriptions.Item label="主要渠道">{detail.channelType || "-"}</Descriptions.Item>
            <Descriptions.Item label="预计采购规模">{detail.expectedPurchaseRange || "-"}</Descriptions.Item>
            <Descriptions.Item label="微信">{detail.contactWechat || "-"}</Descriptions.Item>
            <Descriptions.Item label="业务简介">{detail.businessDescription || "-"}</Descriptions.Item>
            <Descriptions.Item label="申请时间">{detail.submittedAt?.replace("T", " ").slice(0, 19)}</Descriptions.Item>
            <Descriptions.Item label="审核人">
              {detail.reviewer ? detail.reviewer.realName || detail.reviewer.username : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="审核说明">{detail.reviewNote || "-"}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      <Modal
        title={`审核申请 #${reviewing?.id || ""}`}
        open={!!reviewing}
        onCancel={() => setReviewing(null)}
        onOk={submitReview}
        confirmLoading={submitting}
        okText="提交审核"
        cancelText="取消"
      >
        <Form form={reviewForm} layout="vertical" initialValues={{ action: "APPROVED" }}>
          <Form.Item
            name="action"
            label="审核动作"
            rules={[{ required: true, message: "请选择审核动作" }]}
          >
            <Select
              options={[
                { value: "APPROVED", label: "通过（授予合作权限）" },
                { value: "NEEDS_SUPPLEMENT", label: "要求补充资料" },
                { value: "REJECTED", label: "驳回" },
                { value: "SUSPENDED", label: "暂停（仅管理员）" },
              ]}
            />
          </Form.Item>
          <Form.Item name="reviewNote" label="审核说明">
            <Input.TextArea rows={4} maxLength={2000} placeholder="审核说明将展示给客户" />
          </Form.Item>
          <div className="text-xs text-gray-400">
            通过后客户立即获得 PARTNER 商品访问权；暂停后即便旧令牌未过期也会立即失去权限。
          </div>
        </Form>
      </Modal>
    </div>
  );
}

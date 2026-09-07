import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Pagination,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { HeartOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { customerAdminApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import {
  AdminErrorState,
  AdminLoadingState,
} from "@/components/common/AdminDataStates";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";

/**
 * 客户档案管理（只读运营视图）
 *
 * 背景：此前客户数据散落在订单/咨询/线索中，后台无统一客户视图，客户资产无法运营。
 * 本页为批次 C-1 只读版：列表 + 360° 详情（档案/消费聚合/最近订单/收藏）。
 * 写操作（改状态/代客操作）不在本批范围。
 */

interface AdminCustomerRow {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
  status: "ACTIVE" | "DISABLED";
  accountType: "MEMBER" | "PARTNER";
  partnerStatus: string;
  lastOrderAt: string | null;
  createdAt: string;
  _count: { orders: number; favorites: number; inquiries: number };
}

interface AdminCustomerDetail {
  customer: Omit<AdminCustomerRow, "_count"> & {
    updatedAt: string;
    _count: { inquiries: number; selectionInquiries: number; reviews: number };
  };
  stats: {
    orderCount: number;
    totalSpent: string;
    totalPaid: string;
    totalRefunded: string;
  };
  recentOrders: Array<{
    id: number;
    orderNo: string;
    status: string;
    orderType: string;
    finalAmount: string;
    paidAmount: string;
    createdAt: string;
    shippedAt: string | null;
  }>;
  favorites: Array<{
    createdAt: string;
    product: {
      id: number;
      name: string;
      status: string;
      deletedAt: string | null;
    };
  }>;
  addressCount: number;
}

const CUSTOMER_STATUS_TEXT: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "正常", color: "green" },
  DISABLED: { label: "已停用", color: "red" },
};

const ACCOUNT_TYPE_TEXT: Record<string, string> = {
  MEMBER: "会员",
  PARTNER: "合作商家",
};

const PARTNER_STATUS_TEXT: Record<string, { label: string; color: string }> = {
  NONE: { label: "未申请", color: "default" },
  PENDING: { label: "待审核", color: "gold" },
  NEEDS_SUPPLEMENT: { label: "需补充资料", color: "orange" },
  APPROVED: { label: "已通过", color: "green" },
  REJECTED: { label: "已驳回", color: "red" },
  SUSPENDED: { label: "已暂停", color: "red" },
};

const ORDER_STATUS_TEXT: Record<string, { label: string; color: string }> = {
  PENDING_PAYMENT: { label: "待付款", color: "orange" },
  PENDING_SHIP: { label: "待发货", color: "gold" },
  SHIPPED: { label: "已发货", color: "blue" },
  COMPLETED: { label: "已完成", color: "green" },
  CANCELLED: { label: "已取消", color: "default" },
};

const ORDER_TYPE_TEXT: Record<string, string> = {
  SPOT: "现货",
  CUSTOM: "定制",
};

function formatAmount(value: string | null | undefined): string {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "—";
  return `¥${num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function CustomerManage() {
  const [rows, setRows] = useState<AdminCustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [inputKeyword, setInputKeyword] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await customerAdminApi.list({
        page,
        pageSize,
        keyword: keyword.trim() || undefined,
        status: status === "ALL" ? undefined : status,
      });
      const data = unwrapResponse<{ list: AdminCustomerRow[]; total: number }>(res);
      setRows(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } catch (error: unknown) {
      setError(
        getSafeAdminErrorMessage(
          error,
          "客户档案加载失败，请稍后重新加载。",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, status]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const openDetail = async (id: number) => {
    setDetailOpen(true);
    // 记录当前查看的客户 ID：详情加载失败时据此提供重试入口
    setDetailId(id);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const res = await customerAdminApi.detail(id);
      setDetail(unwrapResponse<AdminCustomerDetail>(res));
    } catch (error: unknown) {
      setDetailError(
        getSafeAdminErrorMessage(
          error,
          "客户详情加载失败，请稍后重新加载。",
        ),
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", width: 64 },
    {
      title: "客户",
      key: "customer",
      width: 180,
      render: (_: unknown, row: AdminCustomerRow) => (
        <div>
          <div className="text-brand-text">{row.name || "未命名"}</div>
          <div className="text-xs text-brand-muted">
            {ACCOUNT_TYPE_TEXT[row.accountType] ?? row.accountType}
            {row.partnerStatus && row.partnerStatus !== "NONE" && (
              <>
                {" · "}
                <span style={{ color: undefined }}>
                  {PARTNER_STATUS_TEXT[row.partnerStatus]?.label ?? row.partnerStatus}
                </span>
              </>
            )}
          </div>
        </div>
      ),
    },
    { title: "手机号", dataIndex: "phone", width: 130 },
    {
      title: "邮箱",
      dataIndex: "email",
      width: 200,
      render: (v: string | null) => <span className="text-brand-muted">{v || "—"}</span>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (v: string) => {
        const s = CUSTOMER_STATUS_TEXT[v];
        return <Tag color={s?.color}>{s?.label ?? v}</Tag>;
      },
    },
    {
      title: "订单",
      key: "orders",
      width: 80,
      align: "right" as const,
      render: (_: unknown, row: AdminCustomerRow) => row._count?.orders ?? 0,
    },
    {
      title: "收藏",
      key: "favorites",
      width: 80,
      align: "right" as const,
      render: (_: unknown, row: AdminCustomerRow) => row._count?.favorites ?? 0,
    },
    {
      title: "最近下单",
      dataIndex: "lastOrderAt",
      width: 160,
      render: (v: string | null) => <span className="text-brand-muted">{v ? formatTime(v) : "从未下单"}</span>,
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      width: 160,
      render: (v: string) => <span className="text-brand-muted">{formatTime(v)}</span>,
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      render: (_: unknown, row: AdminCustomerRow) => (
        <Button type="link" size="small" onClick={() => void openDetail(row.id)}>
          查看档案
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="客户管理"
        subtitle="只读查看注册客户档案与消费概览；联系与跟进请前往订单中心或客户线索。"
        extra={(
          <Button icon={<ReloadOutlined />} onClick={() => void fetchList()} loading={loading}>
            刷新
          </Button>
        )}
      />

      <Card size="small" className="border-brand-line">
        <Space wrap size="middle">
          <Input
            allowClear
            prefix={<SearchOutlined className="text-brand-muted" />}
            placeholder="搜索手机号 / 姓名 / 邮箱（回车应用）"
            style={{ width: 260 }}
            value={inputKeyword}
            onChange={(e) => {
              setInputKeyword(e.target.value);
              // allowClear 清空时同步重置已应用的关键词
              if (e.target.value === "" && keyword) {
                setKeyword("");
                setPage(1);
              }
            }}
            onPressEnter={() => {
              setKeyword(inputKeyword);
              setPage(1);
            }}
          />
          <Segmented
            value={status}
            onChange={(v) => {
              setStatus(v as string);
              setPage(1);
            }}
            options={[
              { label: "全部", value: "ALL" },
              { label: "正常", value: "ACTIVE" },
              { label: "已停用", value: "DISABLED" },
            ]}
          />
          <span className="text-xs text-brand-muted">共 {total} 位客户</span>
        </Space>

        <div className="mt-3">
          {error ? (
            <AdminErrorState
              subject="客户档案"
              message={error}
              onRetry={() => void fetchList()}
            />
          ) : loading && rows.length === 0 ? (
            <AdminLoadingState subject="客户档案" compact />
          ) : (
            <Table
              rowKey="id"
              size="middle"
              loading={loading}
              dataSource={rows}
              columns={columns}
              pagination={false}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      keyword || status !== "ALL"
                        ? "没有符合当前筛选条件的客户"
                        : "暂无注册客户"
                    }
                  />
                ),
              }}
              scroll={{ x: 1100 }}
            />
          )}
          {!error && total > 0 && (
            <div className="flex justify-end mt-3">
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger
                showTotal={(t) => `共 ${t} 条`}
                onChange={(p, s) => {
                  setPage(p);
                  setPageSize(s);
                }}
              />
            </div>
          )}
        </div>
      </Card>

      <Drawer
        title={`客户档案 #${detail?.customer.id ?? ""}`}
        placement="right"
        width="min(640px, calc(100vw - 16px))"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {detailLoading ? (
          <div className="py-20 text-center">
            <AdminLoadingState subject="客户详情" compact />
          </div>
        ) : detailError ? (
          <AdminErrorState
            subject="客户详情"
            message={detailError}
            onRetry={detailId == null ? undefined : () => void openDetail(detailId)}
          />
        ) : detail ? (
          <div className="space-y-6">
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2 }}
              bordered
              items={[
                {
                  key: "name",
                  label: "姓名",
                  children: detail.customer.name || "未命名",
                },
                {
                  key: "phone",
                  label: "手机号",
                  children: detail.customer.phone,
                },
                {
                  key: "email",
                  label: "邮箱",
                  children: detail.customer.email || "—",
                },
                {
                  key: "status",
                  label: "状态",
                  children: (
                    <Tag color={CUSTOMER_STATUS_TEXT[detail.customer.status]?.color}>
                      {CUSTOMER_STATUS_TEXT[detail.customer.status]?.label ?? detail.customer.status}
                    </Tag>
                  ),
                },
                {
                  key: "accountType",
                  label: "账户类型",
                  children:
                    ACCOUNT_TYPE_TEXT[detail.customer.accountType] ?? detail.customer.accountType,
                },
                {
                  key: "partner",
                  label: "合作状态",
                  children:
                    PARTNER_STATUS_TEXT[detail.customer.partnerStatus]?.label ??
                    detail.customer.partnerStatus,
                },
                {
                  key: "createdAt",
                  label: "注册时间",
                  children: formatTime(detail.customer.createdAt),
                },
                {
                  key: "lastOrderAt",
                  label: "最近下单",
                  children: detail.customer.lastOrderAt
                    ? formatTime(detail.customer.lastOrderAt)
                    : "从未下单",
                },
              ]}
            />

            <div>
              <Typography.Text strong className="block mb-2">
                消费概览
              </Typography.Text>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[
                  { label: "有效订单", value: `${detail.stats.orderCount}` },
                  { label: "累计成交", value: formatAmount(detail.stats.totalSpent) },
                  { label: "累计已收", value: formatAmount(detail.stats.totalPaid) },
                  { label: "累计退款", value: formatAmount(detail.stats.totalRefunded) },
                ].map((item) => (
                  <div key={item.label} className="border border-brand-line p-3">
                    <div className="text-xs text-brand-muted">{item.label}</div>
                    <div className="text-brand-text font-medium mt-1">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-brand-muted mt-2">
                统计口径：不含已取消订单；咨询 {detail.customer._count?.inquiries ?? 0} 条 · 选款{" "}
                {detail.customer._count?.selectionInquiries ?? 0} 条 · 评价{" "}
                {detail.customer._count?.reviews ?? 0} 条 · 地址 {detail.addressCount} 份
              </div>
            </div>

            <div>
              <Typography.Text strong className="block mb-2">
                最近订单（前 10）
              </Typography.Text>
              {detail.recentOrders.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无订单" />
              ) : (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 560 }}
                  dataSource={detail.recentOrders}
                  columns={[
                    { title: "订单号", dataIndex: "orderNo", width: 150 },
                    {
                      title: "状态",
                      dataIndex: "status",
                      width: 90,
                      render: (v: string) => {
                        const s = ORDER_STATUS_TEXT[v];
                        return <Tag color={s?.color}>{s?.label ?? v}</Tag>;
                      },
                    },
                    {
                      title: "类型",
                      dataIndex: "orderType",
                      width: 70,
                      render: (v: string) => ORDER_TYPE_TEXT[v] ?? v,
                    },
                    {
                      title: "应收",
                      dataIndex: "finalAmount",
                      width: 110,
                      align: "right" as const,
                      render: (v: string) => formatAmount(v),
                    },
                    {
                      title: "下单时间",
                      dataIndex: "createdAt",
                      render: (v: string) => (
                        <span className="text-brand-muted">{formatTime(v)}</span>
                      ),
                    },
                  ]}
                />
              )}
            </div>

            <div>
              <Typography.Text strong className="block mb-2">
                收藏的作品（前 20）
              </Typography.Text>
              {detail.favorites.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无收藏" />
              ) : (
                <ul className="space-y-1">
                  {detail.favorites.map((fav, i) => {
                    const unavailable =
                      fav.product.deletedAt != null || fav.product.status !== "PUBLISHED";
                    return (
                      <li
                        key={`${fav.product.id}-${i}`}
                        className="flex items-center justify-between text-sm border-b border-brand-line/50 py-1"
                      >
                        <span className={unavailable ? "text-brand-muted" : "text-brand-text"}>
                          <HeartOutlined className="mr-2 text-xs text-brand-gold" />
                          {fav.product.name}
                          {unavailable && (
                            <span className="text-xs text-brand-muted">（已下架/移除）</span>
                          )}
                        </span>
                        <span className="text-xs text-brand-muted">{formatTime(fav.createdAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未选择客户" />
        )}
      </Drawer>
    </div>
  );
}

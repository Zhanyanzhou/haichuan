import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Select,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType, TagProps } from "antd";
import { ReloadOutlined, UndoOutlined } from "@ant-design/icons";
import { settingsApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/common/AdminDataStates";
import type { PaginatedResult } from "@/types";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import "./AuditLogs.css";

interface AuditLogRow {
  id: number;
  createdAt: string;
  action: string;
  module: string;
  targetId: number | null;
  detail: string | null;
  ip?: string | null;
  user?: { username?: string | null; realName?: string | null } | null;
}

interface ActionMeta {
  label: string;
  color: TagProps["color"];
  module?: string;
}

const ACTION_META: Record<string, ActionMeta> = {
  TEMPLATE_VERSION_PUBLISHED: {
    label: "模板已发布",
    color: "success",
    module: "page-builder-template",
  },
  TEMPLATE_ARCHIVED: {
    label: "模板已移入回收站",
    color: "warning",
    module: "page-builder-template",
  },
  TEMPLATE_RESTORED: {
    label: "模板已恢复",
    color: "success",
    module: "page-builder-template",
  },
  TEMPLATE_DRAFT_DELETED: {
    label: "模板已永久删除",
    color: "error",
    module: "page-builder-template",
  },
  PAGE_PUBLISHED: {
    label: "页面已发布",
    color: "success",
    module: "page-builder",
  },
  PAGE_PUBLICATION_ROLLED_BACK: {
    label: "线上页面已回滚",
    color: "warning",
    module: "page-builder",
  },
  create: { label: "已创建", color: "processing" },
  update: { label: "已更新", color: "default" },
  delete: { label: "已删除", color: "error" },
  export: { label: "已导出", color: "processing" },
  stock_update: { label: "库存已更新", color: "default", module: "inventory" },
};

const MODULE_OPTIONS = [
  { value: "page-builder-template", label: "模板设计" },
  { value: "page-builder", label: "页面装修" },
  { value: "page-modules", label: "页面装修接口" },
  { value: "product", label: "商品" },
  { value: "category", label: "分类" },
  { value: "order", label: "订单" },
  { value: "orders", label: "订单导出" },
  { value: "inventory", label: "库存" },
  { value: "user", label: "后台员工" },
  { value: "gold_price", label: "金价" },
];

const MODULE_LABELS = Object.fromEntries(
  MODULE_OPTIONS.map((option) => [option.value, option.label]),
);

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "使用中",
  ARCHIVED: "回收站",
  DELETED: "已永久删除",
  succeeded: "成功",
};

const DETAIL_FIELD_LABELS: Record<string, string> = {
  schemaVersion: "记录格式",
  event: "事件代码",
  actor: "操作人 ID",
  timestamp: "业务发生时间",
  templateId: "模板 ID",
  pageKey: "页面标识",
  pageDocumentId: "页面记录 ID",
  fromStatus: "操作前状态",
  toStatus: "操作后状态",
  publishedVersion: "正式版本",
  fromVersion: "原模板版本",
  toVersion: "新模板版本",
  fromRevision: "原页面修订",
  toRevision: "新页面修订",
  toRevisionVersion: "新修订版本号",
  result: "结果",
  method: "请求方法",
  path: "请求路径",
};

function parseDetail(value: string | null): Record<string, unknown> | null {
  if (!value?.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function actorLabel(row: AuditLogRow) {
  return row.user?.realName || row.user?.username || "系统";
}

function actionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? { label: action, color: "default" };
}

function moduleLabel(module: string) {
  return MODULE_LABELS[module] ?? module;
}

function detailSubject(row: AuditLogRow, detail: Record<string, unknown> | null) {
  if (typeof detail?.templateId === "string") return `模板 ${detail.templateId}`;
  if (typeof detail?.pageKey === "string") return `页面 ${detail.pageKey}`;
  const target = detail?.target;
  if (target && typeof target === "object" && !Array.isArray(target)) {
    const pageKey = (target as Record<string, unknown>).pageKey;
    if (typeof pageKey === "string") return `页面 ${pageKey}`;
  }
  return row.targetId ? `记录 #${row.targetId}` : "—";
}

function detailTransition(detail: Record<string, unknown> | null) {
  if (!detail) return "—";
  const fromStatus = typeof detail.fromStatus === "string" ? detail.fromStatus : null;
  const toStatus = typeof detail.toStatus === "string" ? detail.toStatus : null;
  if (fromStatus && toStatus) {
    return `${STATUS_LABELS[fromStatus] ?? fromStatus} → ${STATUS_LABELS[toStatus] ?? toStatus}`;
  }
  if (typeof detail.fromVersion === "number" && typeof detail.toVersion === "number") {
    return `v${detail.fromVersion} → v${detail.toVersion}`;
  }
  if (typeof detail.fromRevision === "number" && typeof detail.toRevision === "number") {
    return `修订 #${detail.fromRevision} → #${detail.toRevision}`;
  }
  if (typeof detail.publishedVersion === "number") return `正式版本 v${detail.publishedVersion}`;
  return "—";
}

function detailValue(value: unknown): ReactNode {
  if (typeof value === "string") return STATUS_LABELS[value] ?? value;
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return <pre className="audit-logs__structured-value">{JSON.stringify(value, null, 2)}</pre>;
}

export default function AuditLogs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [module, setModule] = useState<string>();
  const [action, setAction] = useState<string>();
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const response = await settingsApi.getLogs({
        page,
        pageSize: 30,
        keyword: keyword || undefined,
        module,
        action,
      });
      const data = unwrapResponse<PaginatedResult<AuditLogRow>>(response);
      if (requestId !== requestSequence.current) return;
      setLogs(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } catch (loadError: unknown) {
      if (requestId !== requestSequence.current) return;
      setError(getSafeAdminErrorMessage(loadError, "操作日志加载失败。请稍后重新加载。"));
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [action, keyword, module, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionOptions = useMemo(() => Object.entries(ACTION_META)
    .filter(([, meta]) => !module || !meta.module || meta.module === module)
    .map(([value, meta]) => ({ value, label: meta.label })), [module]);

  const hasFilters = Boolean(keyword || module || action);
  const selectedDetail = parseDetail(selectedLog?.detail ?? null);
  const columns: TableColumnsType<AuditLogRow> = [
    {
      title: "对象",
      key: "subject",
      width: 210,
      fixed: "left",
      render: (_value, row) => {
        const meta = actionMeta(row.action);
        return (
          <div className="audit-logs__subject-cell">
            <Typography.Text className="audit-logs__subject" ellipsis={{ tooltip: true }}>
              {detailSubject(row, parseDetail(row.detail))}
            </Typography.Text>
            <span className="audit-logs__mobile-event">
              {meta.label} · {formatTime(row.createdAt)}
            </span>
          </div>
        );
      },
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 180,
      render: (value: string) => <time className="audit-logs__time">{formatTime(value)}</time>,
    },
    {
      title: "操作人",
      key: "user",
      width: 140,
      render: (_value, row) => <span className="audit-logs__actor">{actorLabel(row)}</span>,
    },
    {
      title: "模块",
      dataIndex: "module",
      width: 140,
      render: (value: string) => <Tag>{moduleLabel(value)}</Tag>,
    },
    {
      title: "操作",
      dataIndex: "action",
      width: 190,
      render: (value: string) => {
        const meta = actionMeta(value);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: "变化",
      key: "transition",
      width: 190,
      render: (_value, row) => (
        <span className="audit-logs__transition">{detailTransition(parseDetail(row.detail))}</span>
      ),
    },
    {
      title: "详情",
      key: "detail",
      width: 96,
      fixed: "right",
      render: (_value, row) => (
        <Button type="link" className="audit-logs__detail-button" onClick={() => setSelectedLog(row)}>
          查看详情
        </Button>
      ),
    },
  ];

  const resetFilters = () => {
    setKeywordInput("");
    setKeyword("");
    setModule(undefined);
    setAction(undefined);
    setPage(1);
  };

  return (
    <div className="audit-logs">
      <AdminPageHeader
        title="操作日志"
        subtitle="按操作人、模块和动作查询后台记录"
        extra={(
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void load()}
            aria-label="刷新操作日志"
          >
            刷新
          </Button>
        )}
      />
      <Card className="audit-logs__card">
        <div className="audit-logs__filters" role="search" aria-label="操作日志筛选">
          <Input.Search
            allowClear
            className="audit-logs__search"
            placeholder="搜索操作人、动作或模块"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onSearch={(value) => {
              setKeyword(value.trim());
              setPage(1);
            }}
          />
          <Select
            allowClear
            className="audit-logs__filter"
            aria-label="按模块筛选"
            placeholder="全部模块"
            value={module}
            onChange={(value) => {
              setModule(value);
              if (action && ACTION_META[action]?.module && ACTION_META[action].module !== value) {
                setAction(undefined);
              }
              setPage(1);
            }}
            options={MODULE_OPTIONS}
          />
          <Select
            allowClear
            className="audit-logs__filter audit-logs__action-filter"
            aria-label="按动作筛选"
            placeholder="全部动作"
            value={action}
            onChange={(value) => {
              setAction(value);
              setPage(1);
            }}
            options={actionOptions}
          />
          <Button
            icon={<UndoOutlined />}
            disabled={!hasFilters && !keywordInput}
            onClick={resetFilters}
          >
            重置筛选
          </Button>
        </div>

        {!loading && !error ? (
          <div className="audit-logs__result-count" role="status" aria-live="polite">
            共 {total} 条记录
          </div>
        ) : null}

        {loading ? (
          <AdminLoadingState subject="操作日志" />
        ) : error ? (
          <AdminErrorState message={error} onRetry={() => void load()} />
        ) : logs.length === 0 ? (
          <AdminEmptyState
            message={hasFilters ? "没有符合当前筛选条件的操作记录" : "暂无操作记录"}
          />
        ) : (
          <Table
            dataSource={logs}
            rowKey="id"
            columns={columns}
            size="middle"
            scroll={{ x: 1_146 }}
            pagination={{
              current: page,
              total,
              pageSize: 30,
              showSizeChanger: false,
              showTotal: (count) => `共 ${count} 条记录`,
              onChange: setPage,
            }}
          />
        )}
      </Card>

      <Drawer
        title={selectedLog ? actionMeta(selectedLog.action).label : "操作详情"}
        width="min(560px, 100vw)"
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
      >
        {selectedLog ? (
          <div className="audit-logs__drawer-content">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="时间">{formatTime(selectedLog.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="操作人">{actorLabel(selectedLog)}</Descriptions.Item>
              <Descriptions.Item label="模块">{moduleLabel(selectedLog.module)}</Descriptions.Item>
              <Descriptions.Item label="对象">
                {detailSubject(selectedLog, selectedDetail)}
              </Descriptions.Item>
              <Descriptions.Item label="变化">{detailTransition(selectedDetail)}</Descriptions.Item>
              <Descriptions.Item label="日志 ID">#{selectedLog.id}</Descriptions.Item>
              {selectedLog.ip ? <Descriptions.Item label="来源 IP">{selectedLog.ip}</Descriptions.Item> : null}
            </Descriptions>
            <section className="audit-logs__detail-section" aria-labelledby="audit-detail-heading">
              <h2 id="audit-detail-heading">结构化记录</h2>
              {selectedDetail ? (
                <Descriptions bordered size="small" column={1}>
                  {Object.entries(selectedDetail).map(([key, value]) => (
                    <Descriptions.Item key={key} label={DETAIL_FIELD_LABELS[key] ?? key}>
                      {detailValue(value)}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ) : (
                <Typography.Paragraph className="audit-logs__plain-detail">
                  {selectedLog.detail || "—"}
                </Typography.Paragraph>
              )}
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

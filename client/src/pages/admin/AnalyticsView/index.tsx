import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import {
  analyticsApi,
  type AnalyticsEventRow,
  type AnalyticsOverview,
  type AnalyticsVisitor,
} from "@/services/clients/analyticsClient";
import { unwrapResponse } from "@/utils/unwrap";

const EVENT_LABELS: Record<string, string> = {
  page_view: "页面浏览",
  view_item_list: "查看商品列表",
  view_item: "查看商品",
  product_view: "商品查看（旧）",
  search: "搜索",
  filter: "筛选",
  add_to_selection: "加入选款",
  remove_from_selection: "移除选款",
  submit_selection: "提交选款",
  submit_inquiry: "提交咨询",
  cta_click: "行动按钮点击",
  add_to_cart: "加入购物车",
  remove_from_cart: "移出购物车",
  view_cart: "查看购物车",
  begin_checkout: "开始结算",
  add_payment_info: "提交支付信息",
  order_created: "订单已创建",
  purchase: "支付已确认",
  refund: "退款已完成",
};

const DEVICE_LABELS: Record<string, string> = {
  mobile: "手机",
  tablet: "平板",
  desktop: "电脑",
  unknown: "未知",
};

interface AnalyticsEventPage {
  list: AnalyticsEventRow[];
  total: number;
}

interface AnalyticsVisitorPage {
  list: AnalyticsVisitor[];
  total: number;
}

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

function regionText(value: {
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
}) {
  const parts = [value.countryCode, value.region, value.city].filter(
    (part): part is string => Boolean(part && part !== "未知"),
  );
  return parts.length ? parts.join(" · ") : "未知";
}

export default function AnalyticsView() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [visitors, setVisitors] = useState<AnalyticsVisitor[]>([]);
  const [events, setEvents] = useState<AnalyticsEventRow[]>([]);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventName, setEventName] = useState("");
  const [hours, setHours] = useState(24);
  const [reportLoading, setReportLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [reportError, setReportError] = useState(false);
  const [eventsError, setEventsError] = useState(false);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    setReportError(false);
    try {
      const [overviewResponse, visitorsResponse] = await Promise.all([
        analyticsApi.getOverview(days),
        analyticsApi.getVisitors(days),
      ]);
      setOverview(unwrapResponse<AnalyticsOverview>(overviewResponse));
      const visitorPage = unwrapResponse<AnalyticsVisitorPage>(visitorsResponse);
      setVisitors(visitorPage?.list ?? []);
    } catch {
      setReportError(true);
      setOverview(null);
      setVisitors([]);
    } finally {
      setReportLoading(false);
    }
  }, [days]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(false);
    try {
      const response = await analyticsApi.getEvents({
        eventName: eventName || undefined,
        hours,
        pageSize: 100,
      });
      const page = unwrapResponse<AnalyticsEventPage>(response);
      setEvents(page?.list ?? []);
      setEventTotal(page?.total ?? 0);
    } catch {
      setEventsError(true);
      setEvents([]);
      setEventTotal(0);
    } finally {
      setEventsLoading(false);
    }
  }, [eventName, hours]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const visitorColumns = useMemo<TableColumnsType<AnalyticsVisitor>>(
    () => [
      {
        title: "匿名访客",
        dataIndex: "visitorKey",
        width: 130,
        render: (value: string) => `访客 ${value}`,
      },
      {
        title: "类型",
        dataIndex: "returning",
        width: 90,
        render: (returning: boolean) => (
          <Tag color={returning ? "blue" : "default"}>
            {returning ? "回访" : "新访客"}
          </Tag>
        ),
      },
      { title: "首次访问", dataIndex: "firstSeen", width: 170, render: dateTime },
      { title: "最近访问", dataIndex: "lastSeen", width: 170, render: dateTime },
      { title: "活跃天数", dataIndex: "activeDays", width: 90 },
      { title: "会话", dataIndex: "sessions", width: 75 },
      { title: "浏览量", dataIndex: "pageViews", width: 75 },
      { title: "常用地区", width: 210, render: (_, row) => regionText(row) },
      {
        title: "设备",
        dataIndex: "deviceType",
        width: 80,
        render: (value: string | null) =>
          DEVICE_LABELS[value || "unknown"] || value || "未知",
      },
    ],
    [],
  );

  const eventColumns = useMemo<TableColumnsType<AnalyticsEventRow>>(
    () => [
      { title: "时间", dataIndex: "occurredAt", width: 170, render: dateTime },
      {
        title: "事件",
        dataIndex: "eventName",
        width: 140,
        render: (value: string) => <Tag>{EVENT_LABELS[value] || value}</Tag>,
      },
      {
        title: "页面",
        dataIndex: "pagePath",
        width: 220,
        ellipsis: true,
        render: (value) => value || "—",
      },
      { title: "来源", dataIndex: "source", width: 120, render: (value) => value || "—" },
      {
        title: "设备",
        dataIndex: "deviceType",
        width: 80,
        render: (value: string | null) =>
          DEVICE_LABELS[value || "unknown"] || value || "未知",
      },
      {
        title: "匿名访客",
        dataIndex: "visitorKey",
        width: 130,
        render: (value: string | null) => (value ? `访客 ${value}` : "旧数据"),
      },
    ],
    [],
  );

  const totals = overview?.totals;

  return (
    <div aria-label="网站访问分析">
      <AdminPageHeader
        title="访问分析"
        subtitle="查看已同意匿名分析的访客、回访、会话、页面与地域数据"
      />

      <Space direction="vertical" size={16} style={{ display: "flex" }}>
        {reportError && (
          <Alert
            type="error"
            showIcon
            message="访问分析加载失败"
            description="请稍后重新加载；当前没有用旧数据替代本次结果。"
            action={<Button onClick={() => void loadReport()}>重新加载</Button>}
          />
        )}
        {overview && !overview.collection.ingestionEnabled && (
          <Alert
            type="warning"
            showIcon
            message="后端分析入库当前未开启"
            description="页面仍会显示已有数据，但新的公网访问不会写入数据库。正式启用还需要重新构建已开启分析的前端。"
          />
        )}
        {overview?.collection.dataset === "TEST" && (
          <Alert
            type="info"
            showIcon
            message="当前显示测试数据集"
            description="测试访问不会与正式环境数据混合；生产环境必须显式使用 PRODUCTION 数据集。"
          />
        )}
        {overview && !overview.collection.geoHeadersEnabled && (
          <Alert
            type="info"
            showIcon
            message="地域统计尚未启用"
            description="确认公网入口可信并提供国家、省/地区和城市请求头后再开启；系统不会保存原始 IP。"
          />
        )}

        <Card
          title="访问概览"
          extra={
            <Space wrap>
              <Segmented
                aria-label="统计周期"
                value={days}
                options={[
                  { label: "近 7 日", value: 7 },
                  { label: "近 30 日", value: 30 },
                  { label: "近 90 日", value: 90 },
                ]}
                onChange={(value) => setDays(Number(value))}
              />
              <Button loading={reportLoading} onClick={() => void loadReport()}>
                刷新数据
              </Button>
            </Space>
          }
          loading={reportLoading && !overview}
        >
          <Row gutter={[16, 20]}>
            <Col xs={12} md={8} xl={4}><Statistic title="独立访客" value={totals?.visitors ?? 0} /></Col>
            <Col xs={12} md={8} xl={4}><Statistic title="回访访客" value={totals?.returningVisitors ?? 0} /></Col>
            <Col xs={12} md={8} xl={4}><Statistic title="访问会话" value={totals?.sessions ?? 0} /></Col>
            <Col xs={12} md={8} xl={4}><Statistic title="页面浏览" value={totals?.pageViews ?? 0} /></Col>
            <Col xs={12} md={8} xl={4}><Statistic title="回访率" value={totals?.returnRate ?? 0} suffix="%" precision={2} /></Col>
            <Col xs={12} md={8} xl={4}><Statistic title="每次会话浏览" value={totals?.pagesPerSession ?? 0} suffix="页" precision={2} /></Col>
          </Row>
          <Typography.Paragraph type="secondary" style={{ margin: "18px 0 0" }}>
            新访客 {totals?.newVisitors ?? 0} 人。匿名访客标识最多沿用 {overview?.collection.retentionDays ?? 90} 天；无痕模式、清除浏览器数据或更换设备会被视为新访客。
          </Typography.Paragraph>
        </Card>

        <Card title="每日趋势" loading={reportLoading && !overview}>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={overview?.trend ?? []} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="visitors" name="独立访客" stroke="#7a5c32" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="sessions" name="访问会话" stroke="#5f6f7a" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="pageViews" name="页面浏览" stroke="#1f2937" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={9}>
            <Card title="地区分布" style={{ height: "100%" }}>
              <Table
                rowKey={(row) => `${row.countryCode}-${row.region}-${row.city}`}
                size="small"
                pagination={{ pageSize: 8, hideOnSinglePage: true }}
                dataSource={overview?.regions ?? []}
                columns={[
                  { title: "地区", render: (_, row) => regionText(row) },
                  { title: "访客", dataIndex: "visitors", width: 70 },
                  { title: "浏览", dataIndex: "pageViews", width: 70 },
                ]}
                locale={{ emptyText: "暂无地域数据" }}
              />
            </Card>
          </Col>
          <Col xs={24} xl={7}>
            <Card title="热门页面" style={{ height: "100%" }}>
              <Table
                rowKey="pagePath"
                size="small"
                pagination={{ pageSize: 8, hideOnSinglePage: true }}
                dataSource={overview?.topPages ?? []}
                columns={[
                  { title: "页面", dataIndex: "pagePath", ellipsis: true },
                  { title: "访客", dataIndex: "visitors", width: 70 },
                  { title: "浏览", dataIndex: "pageViews", width: 70 },
                ]}
                locale={{ emptyText: "暂无页面数据" }}
              />
            </Card>
          </Col>
          <Col xs={24} md={12} xl={4}>
            <Card title="访问来源" style={{ height: "100%" }}>
              <Table
                rowKey="source"
                size="small"
                pagination={false}
                dataSource={overview?.sources ?? []}
                columns={[
                  { title: "来源", dataIndex: "source", ellipsis: true },
                  { title: "访客", dataIndex: "visitors", width: 70 },
                ]}
                locale={{ emptyText: "暂无来源数据" }}
              />
            </Card>
          </Col>
          <Col xs={24} md={12} xl={4}>
            <Card title="设备" style={{ height: "100%" }}>
              <Table
                rowKey="deviceType"
                size="small"
                pagination={false}
                dataSource={overview?.devices ?? []}
                columns={[
                  { title: "类型", dataIndex: "deviceType", render: (value) => DEVICE_LABELS[value] || value },
                  { title: "访客", dataIndex: "visitors", width: 70 },
                ]}
                locale={{ emptyText: "暂无设备数据" }}
              />
            </Card>
          </Col>
        </Row>

        <Card title="匿名访客与回访情况" loading={reportLoading && !overview}>
          <Table
            columns={visitorColumns}
            dataSource={visitors}
            rowKey="visitorKey"
            pagination={{
              pageSize: 20,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 位匿名访客`,
            }}
            scroll={{ x: 1200 }}
            locale={{ emptyText: "所选周期内暂无已同意分析的访客" }}
          />
        </Card>

        <Card
          title="最近行为事件"
          extra={
            <Space wrap>
              <Select
                aria-label="事件类型"
                placeholder="全部事件"
                value={eventName || undefined}
                onChange={(value) => setEventName(value || "")}
                allowClear
                style={{ width: 170 }}
                options={Object.entries(EVENT_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <Select
                aria-label="事件时间范围"
                value={hours}
                onChange={setHours}
                style={{ width: 130 }}
                options={[
                  { value: 1, label: "最近 1 小时" },
                  { value: 6, label: "最近 6 小时" },
                  { value: 24, label: "最近 24 小时" },
                  { value: 72, label: "最近 3 日" },
                ]}
              />
              <Button loading={eventsLoading} onClick={() => void loadEvents()}>
                刷新事件
              </Button>
            </Space>
          }
        >
          {eventsError && (
            <Alert
              type="error"
              showIcon
              message="行为事件加载失败"
              action={<Button onClick={() => void loadEvents()}>重新加载</Button>}
              style={{ marginBottom: 16 }}
            />
          )}
          <Table
            columns={eventColumns}
            dataSource={events}
            rowKey="id"
            loading={eventsLoading}
            pagination={{
              pageSize: 20,
              showSizeChanger: false,
              showTotal: () => `最近共 ${eventTotal} 条`,
            }}
            scroll={{ x: 900 }}
            size="small"
            locale={{ emptyText: "当前筛选范围内暂无行为事件" }}
          />
        </Card>
      </Space>
    </div>
  );
}

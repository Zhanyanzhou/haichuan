import { useEffect, useState } from "react";
import { Card, Empty, message, Spin, Tag } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { orderApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getAdminEmptyText, getSafeAdminErrorMessage } from "@/constants/adminCopy";

interface TradeOverviewData {
  today: { revenue: number; orderCount: number };
  amount: { paid: number; pending: number; refunded: number; net: number; avgOrderValue: number };
  distribution: {
    source: Array<{ source: string; count: number }>;
    orderType: Array<{ orderType: string; count: number }>;
  };
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  SPOT: "现货", CUSTOM: "定制", RESERVATION: "预订", OFFLINE: "线下",
};

function StatCard({ title, value, hint, accent }: { title: string; value: string | number; hint?: string; accent?: "gold" | "green" | "red" | "orange" }) {
  const accentClass = accent === "green" ? "text-green-600" : accent === "red" ? "text-red-500" : accent === "orange" ? "text-orange-500" : "text-brand-gold";
  return (
    <Card className="!bg-white !border-brand-line" size="small">
      <p className="text-xs text-brand-muted">{title}</p>
      <p className={`admin-type-kpi mt-1 ${accentClass}`}>{value}</p>
      {hint && <p className="text-xs text-brand-muted mt-1">{hint}</p>}
    </Card>
  );
}

export default function TradeOverview() {
  const [data, setData] = useState<TradeOverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await orderApi.getTradeOverview();
      setData(unwrapResponse<TradeOverviewData>(res));
    } catch (e: any) {
      setLoadError(true);
      message.error(getSafeAdminErrorMessage(e, "交易概览加载失败，请稍后重新加载。"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const yuan = (v?: number) => `¥${Number(v || 0).toLocaleString()}`;
  const maxSource = Math.max(1, ...(data?.distribution.source.map((s) => s.count) || [1]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-semibold text-brand-text">交易数据</h1>
          <p className="text-sm text-brand-muted mt-1">今日成交 · 收款概况 · 订单分布（严格区分订单金额与实际到账）</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-1.5 text-sm border border-brand-line text-brand-muted hover:text-brand-gold hover:border-brand-gold transition-all flex items-center gap-1"
        >
          <ReloadOutlined /> 刷新
        </button>
      </div>

      <Spin spinning={loading} tip="正在加载交易概览…">
        <div className="space-y-4">
          {/* 今日 */}
          <div>
            <p className="text-sm text-brand-muted mb-2">今日</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="今日成交额" value={yuan(data?.today.revenue)} hint="含未付款订单" />
              <StatCard title="今日订单数" value={data?.today.orderCount ?? 0} />
              <StatCard title="累计已收金额" value={yuan(data?.amount.paid)} accent="green" />
              <StatCard title="待收金额" value={yuan(data?.amount.pending)} accent="orange" />
            </div>
          </div>

          {/* 收款概况 */}
          <div>
            <p className="text-sm text-brand-muted mb-2">收款概况</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard title="累计退款金额" value={yuan(data?.amount.refunded)} accent="red" />
              <StatCard title="实际净收" value={yuan(data?.amount.net)} accent="green" hint="已收 − 已退" />
              <StatCard title="客单价" value={yuan(data?.amount.avgOrderValue)} />
            </div>
          </div>

          {/* 分布 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="订单来源分布" className="!bg-white !border-brand-line" size="small">
              {data?.distribution.source.length ? (
                <div className="space-y-2">
                  {data.distribution.source.map((s) => (
                    <div key={s.source} className="flex items-center gap-2 text-sm">
                      <span className="w-20 text-brand-muted">{s.source}</span>
                      <div className="flex-1 bg-brand-bg rounded h-5 overflow-hidden">
                        <div className="h-full bg-brand-gold/40" style={{ width: `${(s.count / maxSource) * 100}%` }} />
                      </div>
                      <span className="w-10 text-right">{s.count}</span>
                    </div>
                  ))}
                </div>
              ) : <Empty description={getAdminEmptyText("订单来源数据")} />}
            </Card>
            <Card title="订单类型分布" className="!bg-white !border-brand-line" size="small">
              {data?.distribution.orderType.length ? (
                <div className="flex gap-2 flex-wrap">
                  {data.distribution.orderType.map((t) => (
                    <Tag key={t.orderType} color="gold">{ORDER_TYPE_LABEL[t.orderType] || t.orderType}：{t.count}</Tag>
                  ))}
                </div>
              ) : <Empty description={getAdminEmptyText("订单类型数据")} />}
            </Card>
          </div>

          {loadError && (
            <div className="text-center text-brand-muted text-sm">数据暂时无法加载，请点击刷新重试。</div>
          )}
        </div>
      </Spin>
    </div>
  );
}

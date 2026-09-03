import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App as AntdApp, Card, Table, Tag, Button, InputNumber, Modal } from 'antd';
import { ArrowUpOutlined, EditOutlined } from '@ant-design/icons';
import { goldPriceApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from '@/components/common/AdminDataStates';

type GoldPriceRecord = {
  id?: number;
  price?: number;
  source?: string;
  recordDate?: string;
  change?: number;
};

type GoldLoadErrors = Partial<Record<'current' | 'history' | 'automation', string>>;

export default function GoldPrice() {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<GoldPriceRecord | null>(null);
  const [history, setHistory] = useState<GoldPriceRecord[]>([]);
  const [autoFetchConfigured, setAutoFetchConfigured] = useState<boolean | null>(null);
  const [loadErrors, setLoadErrors] = useState<GoldLoadErrors>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [newPrice, setNewPrice] = useState<number | null>(null);
  const [updating, setUpdating] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadErrors({});
    const [latestResult, historyResult, automationResult] = await Promise.allSettled([
      goldPriceApi.getLatest(),
      goldPriceApi.getHistory({}),
      goldPriceApi.getAutomationStatus(),
    ]);
    if (requestId !== requestIdRef.current) return;

    const nextErrors: GoldLoadErrors = {};
    if (latestResult.status === 'fulfilled') {
      setCurrentPrice(unwrapResponse<GoldPriceRecord>(latestResult.value) ?? null);
    } else {
      setCurrentPrice(null);
      nextErrors.current = getSafeAdminErrorMessage(
        latestResult.reason,
        '当前金价加载失败，请稍后重新加载。',
      );
    }

    if (historyResult.status === 'fulfilled') {
      const historyData = unwrapResponse<GoldPriceRecord[] | { list?: GoldPriceRecord[] }>(historyResult.value);
      if (Array.isArray(historyData)) {
        setHistory(historyData);
      } else if (Array.isArray(historyData?.list)) {
        setHistory(historyData.list);
      } else {
        setHistory([]);
        nextErrors.history = '金价历史加载失败，请稍后重新加载。';
      }
    } else {
      setHistory([]);
      nextErrors.history = getSafeAdminErrorMessage(
        historyResult.reason,
        '金价历史加载失败，请稍后重新加载。',
      );
    }

    if (automationResult.status === 'fulfilled') {
      const automationData = unwrapResponse<{ autoFetchConfigured?: boolean }>(automationResult.value);
      if (typeof automationData?.autoFetchConfigured === 'boolean') {
        setAutoFetchConfigured(automationData.autoFetchConfigured);
      } else {
        setAutoFetchConfigured(null);
        nextErrors.automation = '自动抓取配置状态加载失败，请稍后重新加载。';
      }
    } else {
      setAutoFetchConfigured(null);
      nextErrors.automation = getSafeAdminErrorMessage(
        automationResult.reason,
        '自动抓取配置状态加载失败，请稍后重新加载。',
      );
    }

    setLoadErrors(nextErrors);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleUpdate = async () => {
    if (updating) return;
    if (!newPrice || newPrice <= 0) { message.warning('请输入有效金价'); return; }
    setUpdating(true);
    try {
      await goldPriceApi.updateManually({ price: newPrice });
      message.success('金价已更新');
      setModalOpen(false);
      void load();
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, '金价更新失败，请核对输入后重试。'));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="font-semibold text-brand-text">金价管理</h1><p className="text-sm text-brand-muted mt-1">手动更新金价；更新后同步按金重调价</p></div>
        <Button type="primary" icon={<EditOutlined />} disabled={loading} onClick={() => { setNewPrice(currentPrice?.price ?? null); setModalOpen(true); }}>
          手动调价
        </Button>
      </div>
      {loading ? (
        <AdminLoadingState subject="金价数据" />
      ) : (
        <>
          {loadErrors.automation ? (
            <Alert
              showIcon
              type="error"
              message="自动抓取配置状态加载失败"
              description={loadErrors.automation}
              action={<Button onClick={() => void load()}>重新加载</Button>}
            />
          ) : autoFetchConfigured === false ? (
            <Alert
              showIcon
              type="warning"
              message="自动抓取未配置，当前金价需手动维护"
              description="系统不会生成模拟报价。手动更新后仍会按现有规则同步关联商品价格。"
            />
          ) : null}

          {loadErrors.current ? (
            <Card className="!bg-white !border-brand-line">
              <AdminErrorState subject="当前金价" message={loadErrors.current} onRetry={() => void load()} />
            </Card>
          ) : currentPrice ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { t: '当前金价', v: typeof currentPrice.price === 'number' ? currentPrice.price.toFixed(2) : '—', u: '元/克' },
                { t: '数据来源', v: currentPrice.source === 'MANUAL' ? '手动' : currentPrice.source === 'AUTO' ? '自动' : '—', u: '' },
                { t: '记录日期', v: currentPrice.recordDate?.slice(0, 10) || '—', u: '' },
                { t: '涨跌', v: typeof currentPrice.change === 'number' ? currentPrice.change.toFixed(2) : '—', u: '元' },
              ].map(s => (
                <div key={s.t} className="bg-white border border-brand-line p-4"><p className="text-xs text-brand-muted">{s.t}</p><p className="text-xl font-sans font-bold text-brand-text mt-1">{s.v} <span className="text-xs font-normal text-brand-muted">{s.u}</span></p></div>
              ))}
            </div>
          ) : (
            <Card className="!bg-white !border-brand-line">
              <AdminEmptyState subject="当前金价" kind="unconfigured" />
            </Card>
          )}

          <Card className="!bg-white !border-brand-line" title={<span className="font-semibold text-brand-text">金价历史</span>}>
            {loadErrors.history ? (
              <AdminErrorState subject="金价历史" message={loadErrors.history} onRetry={() => void load()} />
            ) : history.length === 0 ? (
              <AdminEmptyState subject="金价历史" />
            ) : (
              <Table dataSource={history} rowKey={(record) => record.id ?? record.recordDate ?? String(record.price)} pagination={false} size="middle"
          columns={[
            { title: '日期', dataIndex: 'recordDate', width: 120, render: (v: string) => v?.slice(0, 10) || v },
            { title: '金价(元/克)', dataIndex: 'price', width: 140, render: (v: number) => <span className="text-brand-text font-sans font-bold text-lg">¥{v?.toFixed(2)}</span> },
            { title: '涨跌', dataIndex: 'change', width: 100, render: (v?: number) => typeof v === 'number' ? <span style={{ color: v >= 0 ? 'var(--adm-success)' : 'var(--adm-error)' }}>{v >= 0 ? <ArrowUpOutlined className="mr-1" /> : '↓'}{Math.abs(v).toFixed(2)}</span> : '—' },
            { title: '来源', dataIndex: 'source', width: 80, render: (v: string) => <Tag color={v === 'AUTO' ? 'blue' : 'gold'}>{v === 'AUTO' ? '自动' : '手动'}</Tag> },
              ]} />
            )}
          </Card>
        </>
      )}

      <Modal title="手动调整金价" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleUpdate}
        confirmLoading={updating} okText="更新金价" cancelText="取消">
        <div className="py-4">
          <p className="text-sm text-brand-muted mb-3">请输入新的金价（元/克）</p>
          <InputNumber min={0} max={10000} step={0.01} value={newPrice} onChange={(v) => setNewPrice(v || 0)}
            className="w-full" size="large" prefix="¥" />
          <p className="text-xs text-brand-muted mt-3">
            更新后将自动按「金重 × 金价 × 系数 + 工费」重算全店已关联金重商品的 SKU 售价与起价，无需逐件调整。
          </p>
        </div>
      </Modal>
    </div>
  );
}

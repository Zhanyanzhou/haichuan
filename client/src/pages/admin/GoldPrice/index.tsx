import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, InputNumber, Modal, message } from 'antd';
import { ArrowUpOutlined, EditOutlined } from '@ant-design/icons';
import { goldPriceApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';

export default function GoldPrice() {
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newPrice, setNewPrice] = useState<number>(0);

  const load = async () => {
    setLoading(true);
    try {
      const [latest, hist] = await Promise.all([
        goldPriceApi.getLatest(),
        goldPriceApi.getHistory({}),
      ]);
      setCurrentPrice(unwrapResponse(latest));
      const h = unwrapResponse(hist);
      setHistory(Array.isArray(h) ? h : h?.list || []);
    } catch { /* fallback */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleUpdate = async () => {
    if (!newPrice || newPrice <= 0) { message.warning('请输入有效金价'); return; }
    try {
      await goldPriceApi.updateManually({ price: newPrice });
      message.success('金价已更新');
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e?.message || '更新失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-display font-semibold text-brand-text">金价管理</h1><p className="text-sm text-brand-muted mt-1">实时金价 · 自动调价引擎</p></div>
        <Button type="primary" icon={<EditOutlined />} onClick={() => { setNewPrice(currentPrice?.price || 485); setModalOpen(true); }}
          style={{ background: '#B8944E', borderColor: '#B8944E' }}>手动调价</Button>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[
          { t: '当前金价', v: currentPrice?.price?.toFixed(2) || '--', u: '元/克' },
          { t: '数据来源', v: currentPrice?.source === 'MANUAL' ? '手动' : '自动', u: '' },
          { t: '记录日期', v: currentPrice?.recordDate?.slice(0, 10) || '--', u: '' },
          { t: '涨跌', v: (currentPrice as any)?.change?.toFixed(2) || '0.00', u: '元' },
        ].map(s => (
          <div key={s.t} className="bg-white border border-brand-line p-4"><p className="text-xs text-brand-muted">{s.t}</p><p className="text-xl font-sans font-bold text-brand-gold mt-1">{s.v} <span className="text-xs font-normal text-brand-muted">{s.u}</span></p></div>
        ))}
      </div>
      <Card className="!bg-white !border-brand-line" title={<span className="font-display text-brand-text">金价历史</span>} loading={loading}>
        <Table dataSource={history} rowKey="id" pagination={false} size="middle"
          columns={[
            { title: '日期', dataIndex: 'recordDate', width: 120, render: (v: string) => v?.slice(0, 10) || v },
            { title: '金价(元/克)', dataIndex: 'price', width: 140, render: (v: number) => <span className="text-brand-gold font-sans font-bold text-lg">¥{v?.toFixed(2)}</span> },
            { title: '涨跌', dataIndex: 'change', width: 100, render: (v: number) => <span className={v >= 0 ? 'text-brand-gold' : 'text-red-400'}>{v >= 0 ? <ArrowUpOutlined className="mr-1" /> : '↓'}{Math.abs(v || 0).toFixed(2)}</span> },
            { title: '来源', dataIndex: 'source', width: 80, render: (v: string) => <Tag color={v === 'AUTO' ? 'blue' : 'gold'}>{v === 'AUTO' ? '自动' : '手动'}</Tag> },
          ]} />
      </Card>

      <Modal title="手动调整金价" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleUpdate}
        okText="确认更新" cancelText="取消"
        okButtonProps={{ style: { background: '#B8944E', borderColor: '#B8944E' } }}>
        <div className="py-4">
          <p className="text-sm text-brand-muted mb-3">请输入新的金价（元/克）</p>
          <InputNumber min={0} step={0.01} value={newPrice} onChange={(v) => setNewPrice(v || 0)}
            className="w-full" size="large" prefix="¥" />
        </div>
      </Modal>
    </div>
  );
}

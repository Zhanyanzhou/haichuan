import { useState, useEffect } from 'react';
import { Tabs, Spin } from 'antd';
import { ShoppingOutlined, HeartOutlined, EnvironmentOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { orderApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { Order, PaginatedResult } from '@/types';

export default function CustomerCenter() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await orderApi.getList({ pageSize: 20 });
        const data = unwrapResponse<PaginatedResult<Order>>(res);
        setOrders(data?.list || []);
      } catch { setOrders([]); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div className="min-h-screen bg-brand-bg flex items-center justify-center"><Spin size="large" /></div>;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="page-header"><h1 className="h1">我的账户</h1></div>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Tabs items={[
          { key: 'orders', label: <span><ShoppingOutlined /> 订单</span>, children: orders.length === 0
            ? <div className="text-center py-10 text-brand-muted">暂无订单</div>
            : orders.map(o => (
              <Link key={o.id} to={`/products/${o.items?.[0]?.productId || ''}`} className="block p-6 border border-brand-line mb-3 hover:border-brand-gold transition-colors">
                <div className="flex justify-between"><div><p className="font-medium">{o.items?.[0]?.product?.name || '商品'}</p><p className="text-xs text-brand-muted">{o.orderNo} · {o.createdAt}</p></div><p className="price">¥{o.finalAmount.toLocaleString()}</p></div>
              </Link>
            )),
          },
          { key: 'fav', label: <span><HeartOutlined /> 收藏</span>, children: <div className="text-center py-10 text-brand-muted">暂无收藏</div> },
          { key: 'addr', label: <span><EnvironmentOutlined /> 地址</span>, children: <div className="text-center py-10 text-brand-muted">暂无地址</div> },
          { key: 'profile', label: <span><UserOutlined /> 资料</span>, children: <div className="text-center py-10 text-brand-muted">个人资料</div> },
        ]} />
      </div>
    </div>
  );
}

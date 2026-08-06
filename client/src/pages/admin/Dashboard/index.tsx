import { useState, useEffect } from 'react';
import { Card, Tag, Spin, Button } from 'antd';
import { ShoppingOutlined, MessageOutlined, FileTextOutlined, PlusOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { productApi, inquiriesApi, pageModulesApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { PaginatedResult } from '@/types';

const STAT: Record<string, { c: string; t: string }> = {
  PENDING: { c: 'orange', t: '待处理' }, PROCESSING: { c: 'blue', t: '处理中' },
  REPLIED: { c: 'green', t: '已回复' },
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [productCount, setProductCount] = useState(0);
  const [pendingInquiries, setPendingInquiries] = useState(0);
  const [draftPages, setDraftPages] = useState(0);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [pRes, iRes, pagesRes] = await Promise.all([
          productApi.getList({ page: 1, pageSize: 1 }),
          inquiriesApi.getList({ page: 1, pageSize: 5, status: 'PENDING' }),
          pageModulesApi.getAdminAll('home'),
        ]);
        setProductCount(unwrapResponse<PaginatedResult<any>>(pRes)?.total || 0);
        const iData = unwrapResponse<PaginatedResult<any>>(iRes);
        setPendingInquiries(iData?.total || 0);
        setRecentLeads(iData?.list || []);
        const pages = unwrapResponse<any[]>(pagesRes) || [];
        setDraftPages(pages.filter((p: any) => p.status === 'DRAFT').length);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const stats = [
    { t: '产品总数', v: productCount, i: <ShoppingOutlined />, c: '#B69052', to: '/admin/products' },
    { t: '待处理预约', v: pendingInquiries, i: <MessageOutlined />, c: '#5E7F9E', to: '/admin/inquiries' },
    { t: '待发布页面', v: draftPages, i: <FileTextOutlined />, c: '#C08A45', to: '/admin/homepage' },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><Spin size="large" /></div>;

  return (
    <div>
      <div className="mb-6">
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#252522', margin: 0 }}>工作台</h1>
        <p style={{ fontSize: 13, color: '#96928A', marginTop: 4 }}>管理概览</p>
      </div>

      {/* 核心指标 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
        {stats.map(s => (
          <Link key={s.t} to={s.to}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E7E6E2', borderRadius: 10, padding: 24, minHeight: 136, boxShadow: '0 6px 20px rgba(40,36,30,0.035)', cursor: 'pointer' }}>
              <div className="flex justify-between items-start">
                <div>
                  <p style={{ fontSize: 12, color: '#96928A', marginBottom: 8 }}>{s.t}</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: '#252522', margin: 0 }}>{s.v.toLocaleString()}</p>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#F3EFE7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: s.c }}>{s.i}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* 第二层 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card title={<span style={{ fontSize: 15, fontWeight: 600, color: '#252522' }}>最近客户线索</span>}
            style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)' }}>
            {recentLeads.length === 0 ? (
              <p style={{ color: '#96928A', textAlign: 'center', padding: 20 }}>暂无客户线索</p>
            ) : (
              recentLeads.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center py-3 border-b" style={{ borderColor: '#E7E6E2' }}>
                  <div>
                    <p style={{ fontWeight: 500, color: '#252522' }}>{item.customerName || '未留名'}</p>
                    <p style={{ fontSize: 12, color: '#96928A' }}>{item.customerPhone || ''}</p>
                  </div>
                  <Tag color={STAT[item.status]?.c || 'default'}>{STAT[item.status]?.t || item.status}</Tag>
                </div>
              ))
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)' }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#252522', marginBottom: 16 }}>快捷操作</p>
            <div className="space-y-2">
              {[
                { t: '新增珠宝', i: <PlusOutlined />, to: '/admin/products' },
                { t: '编辑首页', i: <EditOutlined />, to: '/admin/homepage' },
                { t: '查看预约', i: <MessageOutlined />, to: '/admin/inquiries' },
                { t: '预览网站', i: <EyeOutlined />, to: '/', ext: true },
              ].map(a => (
                <Link key={a.t} to={a.to} target={a.ext ? '_blank' : undefined}>
                  <Button block style={{ textAlign: 'left', borderColor: '#E7E6E2', color: '#66645F', marginBottom: 8 }}>
                    {a.i} <span className="ml-2">{a.t}</span>
                  </Button>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

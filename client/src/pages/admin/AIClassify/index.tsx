import { useState, useEffect } from 'react';
import { Card, Upload, Table, Tag, Button, Space, message, Row, Col } from 'antd';
import { InboxOutlined, RobotOutlined, CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { aiClassifyApi, uploadApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { RcFile } from 'antd/es/upload';

const { Dragger } = Upload;

const sm: Record<string, { c: string; t: string }> = {
  auto_confirmed: { c: 'green', t: '已自动确认' }, pending_confirm: { c: 'gold', t: '待确认' }, pending_review: { c: 'orange', t: '待人工审核' },
  confirmed: { c: 'green', t: '已确认' }, rejected: { c: 'red', t: '已驳回' },
};

export default function AIClassify() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await aiClassifyApi.getRecords({ pageSize: 50 });
      const data = unwrapResponse(res);
      setRecords(data?.list || []);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadRecords(); }, []);

  const customUpload = async (options: any) => {
    setUploading(true);
    try {
      const file = options.file as RcFile;
      // 先上传取回图片地址，再按 JSON 契约发起识别（服务端 ClassifyImageDto 要求 imageUrl）
      const uploadRes = await uploadApi.uploadImage(file);
      const url = unwrapResponse<{ url: string }>(uploadRes)?.url;
      if (!url) throw new Error('图片上传失败：未获取到图片地址');
      await aiClassifyApi.classify({ imageUrl: url });
      message.success('识别完成');
      loadRecords();
    } catch (e: any) {
      message.error(e?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async (record: any) => {
    try {
      await aiClassifyApi.confirm(record.id, {
        status: 'confirmed',
        confirmedCategoryId: record.predictedCategoryId,
      });
      message.success('已确认');
      loadRecords();
    } catch (e: any) { message.error(e?.message || '确认失败'); }
  };

  const handleReject = async (id: number) => {
    try {
      await aiClassifyApi.confirm(id, { status: 'rejected' });
      message.success('已驳回');
      loadRecords();
    } catch (e: any) { message.error(e?.message || '驳回失败'); }
  };

  const stats = [
    { t: '识别记录', v: records.length, i: <RobotOutlined /> },
    { t: '自动确认率', v: records.length ? Math.round(records.filter(r => r.status === 'auto_confirmed').length / records.length * 100) + '%' : '0%', i: <CheckCircleOutlined /> },
    { t: '待确认', v: records.filter(r => r.status === 'pending_confirm').length, i: <ExclamationCircleOutlined /> },
    { t: '平均置信度', v: records.length ? (records.reduce((s, r) => s + (r.confidence || 0), 0) / records.length).toFixed(1) + '%' : '0%', i: <ThunderboltOutlined /> },
  ];

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-display font-semibold text-brand-text">AI 智能分类</h1><p className="text-sm text-brand-muted mt-1">上传图片 → AI识别 → 人工确认</p></div>
      <Row gutter={[16, 16]}>
        {stats.map(s => (
          <Col xs={12} sm={6} key={s.t}><div className="bg-white border border-brand-line p-4"><div className="flex justify-between"><div><p className="text-xs text-brand-muted">{s.t}</p><p className="text-xl font-sans font-bold text-brand-text mt-1">{s.v}</p></div><span className="text-xl text-brand-gold">{s.i}</span></div></div></Col>
        ))}
      </Row>
      <Card className="!bg-white !border-brand-line">
        <Dragger customRequest={customUpload} showUploadList={false} accept="image/*" multiple className="!bg-transparent !border-dashed !border-brand-line hover:!border-brand-gold"
          disabled={uploading}>
          <p className="text-3xl text-brand-gold mb-2"><InboxOutlined /></p>
          <p className="text-brand-text">{uploading ? '识别中...' : '点击或拖拽图片上传'}</p>
          <p className="text-xs text-brand-muted mt-1">支持批量，AI自动识别</p>
        </Dragger>
      </Card>
      <Card className="!bg-white !border-brand-line" title={<span className="font-display text-brand-text">识别记录</span>}>
        <Table dataSource={records} rowKey="id" loading={loading} pagination={false} size="middle"
          columns={[
            { title: 'ID', dataIndex: 'id', width: 60 },
            { title: '预测分类', dataIndex: 'predictedCategoryName', width: 120, render: (v: string) => <Tag color="blue">{v}</Tag> },
            { title: '置信度', dataIndex: 'confidence', width: 100, render: (v: number) => <span className={`font-sans font-bold ${v > 90 ? 'text-green-500' : v > 70 ? 'text-brand-gold' : 'text-red-400'}`}>{v}%</span> },
            { title: '状态', dataIndex: 'status', width: 120, render: (v: string) => { const s = sm[v]; return <Tag color={s?.c}>{s?.t}</Tag>; } },
            { title: '时间', dataIndex: 'createdAt', width: 150 },
            { title: '操作', width: 140, render: (_: any, r: any) => r.status === 'pending_confirm' ? <Space><Button size="small" type="primary" onClick={() => handleConfirm(r)}>确认</Button><Button size="small" onClick={() => handleReject(r.id)}>驳回</Button></Space> : null },
          ]} />
      </Card>
    </div>
  );
}

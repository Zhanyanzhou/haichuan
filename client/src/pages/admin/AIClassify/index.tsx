import { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntdApp, Card, Upload, Table, Tag, Button, Space, Row, Col, Input } from 'antd';
import { InboxOutlined, RobotOutlined, CheckCircleOutlined, ThunderboltOutlined, SendOutlined } from '@ant-design/icons';
import { aiClassifyApi, uploadApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';
import type { RcFile } from 'antd/es/upload';
import type { UploadProps } from 'antd';
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from '@/components/common/AdminDataStates';

const { Dragger } = Upload;

const sm: Record<string, { c: string; t: string }> = {
  auto_confirmed: { c: 'green', t: '已自动确认' }, pending_confirm: { c: 'gold', t: '待确认' }, pending_review: { c: 'orange', t: '待人工审核' },
  confirmed: { c: 'green', t: '已确认' }, rejected: { c: 'red', t: '已驳回' },
};

/** AI 对话快捷提示词（通用对话能力，无需 KIMI 配置时后端会返回 503） */
const chatQuickPrompts = [
  '为一款古法金手镯写一段 150 字左右的产品描述',
  '帮我想 3 条母亲节珠宝促销文案',
  '分析近期高热度珠宝品类的共同特点',
];

interface AIClassificationRecord {
  id: number;
  predictedCategoryId: number;
  predictedCategoryName?: string;
  confidence: number;
  status: string;
  createdAt: string;
}

interface AIClassificationReport {
  accuracy?: number | string;
  autoConfirmRate?: number | string;
  todayCount?: number;
}

function formatPercent(value: number | string | undefined): string {
  if (value === undefined || value === '') return '—';
  const text = String(value);
  return text.endsWith('%') ? text : `${text}%`;
}

export default function AIClassify() {
  const { message } = AntdApp.useApp();
  const [records, setRecords] = useState<AIClassificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState<AIClassificationReport | null>(null);
  const [reportError, setReportError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  // AI 通用对话状态
  const [chatList, setChatList] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setRecordsError('');
    try {
      const res = await aiClassifyApi.getRecords({ page, pageSize });
      const data = unwrapResponse<{ list?: AIClassificationRecord[]; total?: number }>(res);
      setRecords(data?.list || []);
      setTotal(data?.total || 0);
    } catch (error: unknown) {
      setRecords([]);
      setTotal(0);
      setRecordsError(getSafeAdminErrorMessage(error, '识别记录加载失败，请稍后重新加载。'));
    }
    finally { setLoading(false); }
  }, [page, pageSize]);

  const loadReport = useCallback(async () => {
    setReportError('');
    try {
      const res = await aiClassifyApi.getReport();
      setReport(unwrapResponse<AIClassificationReport>(res));
    } catch (error: unknown) {
      setReport(null);
      setReportError(getSafeAdminErrorMessage(error, '识别指标加载失败，请稍后重新加载。'));
    }
  }, []);

  useEffect(() => { void loadRecords(); void loadReport(); }, [loadRecords, loadReport]);

  const customUpload: NonNullable<UploadProps['customRequest']> = async (options) => {
    setUploading(true);
    try {
      const file = options.file as RcFile;
      // 先上传取回图片地址，再按 JSON 契约发起识别（服务端 ClassifyImageDto 要求 imageUrl）
      const uploadRes = await uploadApi.uploadImage(file);
      const url = unwrapResponse<{ url: string }>(uploadRes)?.url;
      if (!url) throw new Error('图片上传失败：未获取到图片地址');
      await aiClassifyApi.classify({ imageUrl: url });
      message.success('识别完成');
      void loadRecords();
      void loadReport();
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, '图片上传或识别失败，请检查文件格式和网络后重试。'));
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async (record: AIClassificationRecord) => {
    try {
      await aiClassifyApi.confirm(record.id, {
        status: 'confirmed',
        confirmedCategoryId: record.predictedCategoryId,
      });
      message.success('识别结果已确认');
      void loadRecords();
      void loadReport();
    } catch (e: unknown) { message.error(getSafeAdminErrorMessage(e, '识别结果确认失败，请重新加载后重试。')); }
  };

  const handleReject = async (id: number) => {
    try {
      await aiClassifyApi.confirm(id, { status: 'rejected' });
      message.success('识别结果已驳回');
      void loadRecords();
      void loadReport();
    } catch (e: unknown) { message.error(getSafeAdminErrorMessage(e, '识别结果驳回失败，请重新加载后重试。')); }
  };

  const sendChat = async (text?: string) => {
    const content = (text ?? chatInput).trim();
    if (!content || sending) return;
    setChatInput('');
    setChatList((prev) => [...prev, { role: 'user', content }]);
    setSending(true);
    try {
      const res = await aiClassifyApi.chat({ message: content });
      const data = unwrapResponse<{ content: string }>(res);
      setChatList((prev) => [
        ...prev,
        { role: 'assistant', content: data?.content?.trim() || '（AI 未返回内容）' },
      ]);
    } catch (e: unknown) {
      setChatList((prev) => [
        ...prev,
        { role: 'assistant', content: getSafeAdminErrorMessage(e, 'AI 服务暂时不可用，请稍后重试。') },
      ]);
    } finally {
      setSending(false);
    }
  };

  const stats = [
    { t: '识别记录', v: recordsError ? '—' : total, i: <RobotOutlined /> },
    { t: '自动确认率', v: reportError ? '—' : formatPercent(report?.autoConfirmRate), i: <CheckCircleOutlined /> },
    { t: '模型准确率', v: reportError ? '—' : formatPercent(report?.accuracy), i: <CheckCircleOutlined /> },
    { t: '今日识别', v: reportError ? '—' : (report?.todayCount ?? '—'), i: <ThunderboltOutlined /> },
  ];

  return (
    <div className="space-y-6">
      <div><h1 className="font-semibold text-brand-text">AI 智能分类</h1><p className="text-sm text-brand-muted mt-1">上传图片 → AI 识别 → 人工确认</p></div>
      <Row gutter={[16, 16]}>
        {stats.map(s => (
          <Col xs={12} sm={6} key={s.t}><div className="bg-white border border-brand-line p-4"><div className="flex justify-between"><div><p className="text-xs text-brand-muted">{s.t}</p><p className="text-xl font-sans font-bold text-brand-text mt-1">{s.v}</p></div><span className="text-xl text-brand-gold">{s.i}</span></div></div></Col>
        ))}
      </Row>
      {reportError && (
        <Alert
          type="error"
          showIcon
          message="识别指标加载失败"
          description={reportError}
          action={<Button onClick={() => void loadReport()}>重新加载</Button>}
        />
      )}
      <Card className="!bg-white !border-brand-line">
        <Dragger customRequest={customUpload} showUploadList={false} accept="image/*" multiple className="!bg-transparent !border-dashed !border-brand-line hover:!border-brand-gold"
          disabled={uploading}>
          <p className="text-3xl text-brand-gold mb-2"><InboxOutlined /></p>
          <p className="text-brand-text">{uploading ? '识别中…' : '点击或拖拽图片上传'}</p>
          <p className="text-xs text-brand-muted mt-1">支持批量，AI自动识别</p>
        </Dragger>
      </Card>
      <Card className="!bg-white !border-brand-line" title={<span className="font-semibold text-brand-text"><RobotOutlined className="mr-2 text-brand-gold" />AI 文案助手</span>}>
        <div className="space-y-3 mb-3">
          {chatQuickPrompts.map((p) => (
            <Button key={p} size="small" disabled={sending} onClick={() => sendChat(p)}>{p}</Button>
          ))}
        </div>
        {chatList.length > 0 && (
          <div className="space-y-3 max-h-[420px] overflow-y-auto mb-3">
            {chatList.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-3 rounded-lg text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-brand-text text-white' : 'bg-brand-bg text-brand-text'}`}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onPressEnter={() => sendChat()}
            placeholder="输入文案、咨询、分析等需求，回车发送"
            maxLength={2000}
            disabled={sending}
          />
          <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => sendChat()}>发送</Button>
        </Space.Compact>
        <p className="text-xs text-brand-muted mt-2">由 Kimi 驱动；未配置 KIMI_API_KEY 时该功能不可用。</p>
      </Card>
      <Card className="!bg-white !border-brand-line" title={<span className="font-semibold text-brand-text">识别记录</span>}>
        {loading ? <AdminLoadingState subject="识别记录" compact />
          : recordsError ? <AdminErrorState message={recordsError} onRetry={loadRecords} />
          : records.length === 0 ? <AdminEmptyState message="暂无识别记录" />
          : <Table dataSource={records} rowKey="id" size="middle" scroll={{ x: 760 }}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: (t) => `共 ${t} 条`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 60 },
            { title: '预测分类', dataIndex: 'predictedCategoryName', width: 120, render: (v: string) => <Tag color="blue">{v}</Tag> },
            { title: '置信度', dataIndex: 'confidence', width: 100, render: (v: number) => <span className="font-sans font-bold" style={{ color: v > 90 ? "var(--adm-success)" : v > 70 ? "var(--adm-warning)" : "var(--adm-error)" }}>{v}%</span> },
            { title: '状态', dataIndex: 'status', width: 120, render: (v: string) => { const s = sm[v]; return <Tag color={s?.c}>{s?.t}</Tag>; } },
            { title: '时间', dataIndex: 'createdAt', width: 150 },
            { title: '操作', width: 168, render: (_: unknown, r: AIClassificationRecord) => r.status === 'pending_confirm' ? <Space><Button size="small" type="primary" onClick={() => handleConfirm(r)}>确认结果</Button><Button size="small" onClick={() => handleReject(r.id)}>驳回结果</Button></Space> : null },
          ]} />}
      </Card>
    </div>
  );
}

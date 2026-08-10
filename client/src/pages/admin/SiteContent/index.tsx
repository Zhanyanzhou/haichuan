import { useState, useEffect } from 'react';
import { Alert, Card, Form, Input, Button, message, Spin, Divider } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { settingsApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import AdminPageHeader from '@/components/common/AdminPageHeader';
import { AdminLoadingState } from '@/components/common/AdminDataStates';

export default function SiteContent() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await settingsApi.getSettings();
        const data = unwrapResponse<any>(res);
        form.setFieldsValue(data);
      } catch {
        // Keep the form empty when remote settings are unavailable.
      } finally { setLoading(false); }
    })();
  }, [form]);

  const onFinish = async (values: any) => {
    setSaving(true);
    try {
      // 只保存本站特有的字段，不覆盖 Settings 页面的 siteName/logo
      await settingsApi.updateSettings(values);
      message.success('保存成功');
    } catch { message.error('保存失败'); }
    finally { setSaving(false); }
  };

  if (loading) return <AdminLoadingState />;

  return (
    <div>
      <AdminPageHeader title="店铺资料与品牌设置" subtitle="管理客户可见的店铺信息与全站默认 SEO" />
      <Alert
        type="info"
        showIcon
        message="这些资料会用于网站页眉、页脚、联系入口及浏览器默认搜索信息。"
        style={{ maxWidth: 680, marginBottom: 20 }}
      />
      <Form form={form} onFinish={onFinish} layout="vertical" style={{ maxWidth: 680 }}>
        <Card title="品牌基础信息" style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)', marginBottom: 20 }}>
          <Form.Item name="siteName" label="网站名称"><Input placeholder="海川珠宝" /></Form.Item>
        </Card>

        <Card title="联系方式" style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)', marginBottom: 20 }}>
          <Form.Item name="contactPhone" label="联系电话"><Input placeholder="400-xxx-xxxx" /></Form.Item>
          <Form.Item name="contactEmail" label="联系邮箱"><Input placeholder="contact@haichuan.com" /></Form.Item>
          <Form.Item name="contactAddress" label="公司地址"><Input placeholder="详细地址" /></Form.Item>
        </Card>

        <Card title="营业信息" style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)', marginBottom: 20 }}>
          <Form.Item name="businessHours" label="营业时间"><Input placeholder="周一至周日 10:00-22:00" /></Form.Item>
        </Card>

        <Card title="SEO 默认设置" style={{ borderRadius: 10, border: '1px solid #E7E6E2', boxShadow: '0 6px 20px rgba(40,36,30,0.035)', marginBottom: 20 }}>
          <Form.Item name="seoTitle" label="默认页面标题"><Input placeholder="海川珠宝 - 高端珠宝臻品平台" /></Form.Item>
          <Form.Item name="seoDescription" label="默认页面描述"><Input.TextArea rows={3} placeholder="描述文字" /></Form.Item>
          <Form.Item name="seoKeywords" label="默认关键词"><Input placeholder="珠宝,首饰,黄金" /></Form.Item>
        </Card>

        <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}
          style={{ background: '#B69052', borderColor: '#B69052', height: 44, paddingInline: 32 }}>
          保存设置
        </Button>
      </Form>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Switch, Upload, Tabs, message, Spin } from 'antd';
import { UploadOutlined, SaveOutlined, DatabaseOutlined } from '@ant-design/icons';
import { settingsApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';

export default function Settings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await settingsApi.getSettings();
        const data = unwrapResponse(res);
        form.setFieldsValue(data);
      } catch { /* fallback */ }
      finally { setLoading(false); }
    };
    load();
  }, [form]);

  const handleSave = async (values: any) => {
    try {
      await settingsApi.updateSettings(values);
      message.success('设置已保存');
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spin size="large" /></div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-display font-semibold text-brand-text">系统设置</h1><p className="text-sm text-brand-muted mt-1">网站配置 · 备份恢复</p></div>
      <Tabs items={[
        { key: 'site', label: '网站信息', children: (
            <div className="bg-white border border-brand-line p-8 max-w-xl">
              <Form layout="vertical" form={form} onFinish={handleSave}>
                <Form.Item name="siteName" label="网站名称"><Input /></Form.Item>
                <Form.Item name="siteDesc" label="网站描述"><Input.TextArea rows={2} /></Form.Item>
                <Form.Item name="logo" label="LOGO"><Upload><Button icon={<UploadOutlined />}>上传</Button></Upload></Form.Item>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} style={{ background: '#B8944E', borderColor: '#B8944E' }}>保存</Button>
              </Form>
            </div>
          ),
        },
        { key: 'backup', label: '备份', children: (
            <div className="bg-white border border-brand-line p-8 max-w-xl space-y-4">
              <div className="flex items-center justify-between p-4 bg-brand-bg"><div><p className="font-medium text-brand-text">数据库备份</p><p className="text-xs text-brand-muted">导出完整数据库</p></div><Button icon={<DatabaseOutlined />} onClick={() => message.success('备份已生成')}>立即备份</Button></div>
              <div className="flex items-center justify-between p-4 bg-brand-bg"><div><p className="font-medium text-brand-text">自动备份</p><p className="text-xs text-brand-muted">每日凌晨3:00</p></div><Switch defaultChecked /></div>
            </div>
          ),
        },
      ]} />
    </div>
  );
}

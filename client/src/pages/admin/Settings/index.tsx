import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Switch, Upload, Tabs, message, Spin } from 'antd';
import { UploadOutlined, SaveOutlined, DatabaseOutlined, LoadingOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { settingsApi, uploadApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';

/** 获取 token（兼容多种存储方式） */
function getToken(): string {
  try {
    const raw = localStorage.getItem('jewelry-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.state?.token || '';
    }
  } catch {
    // Ignore invalid serialized authentication state and try the legacy key.
  }
  return localStorage.getItem('token') || '';
}

export default function Settings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);

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

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await fetch('/api/settings/backup', {
        method: 'GET',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 按服务端真实状态反馈：当前备份任务未接入（返回占位状态），不假报成功
      const body = await res.json().catch(() => null);
      const payload = unwrapResponse(body) ?? body;
      if (payload?.lastBackup) {
        message.info(`最近备份：${payload.lastBackup}`);
      } else {
        message.warning(payload?.message || '备份功能未接入，请使用数据库侧备份方案');
      }
    } catch {
      message.error('备份失败，请检查后端服务');
    } finally {
      setBackingUp(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      const res = await uploadApi.uploadImage(file);
      const data = unwrapResponse<{ url: string }>(res as any);
      if (data?.url) {
        await settingsApi.updateSettings({ logo: data.url });
        message.success('Logo 已更新');
      }
    } catch {
      message.error('Logo 上传失败');
    }
    return false; // 阻止默认上传行为
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
                <Form.Item name="siteDescription" label="网站描述"><Input.TextArea rows={2} /></Form.Item>
                <Form.Item name="logo" label="LOGO">
                  <Upload accept="image/*" showUploadList={false}
                    beforeUpload={(file) => { handleLogoUpload(file); return false; }}>
                    <Button icon={<UploadOutlined />}>上传</Button>
                  </Upload>
                </Form.Item>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} style={{ background: '#B8944E', borderColor: '#B8944E' }}>保存</Button>
              </Form>
            </div>
          ),
        },
        { key: 'backup', label: '备份', children: (
            <div className="bg-white border border-brand-line p-8 max-w-xl space-y-4">
              <div className="flex items-center justify-between p-4 bg-brand-bg">
                <div>
                  <p className="font-medium text-brand-text">数据库备份</p>
                  <p className="text-xs text-brand-muted">导出完整数据库</p>
                </div>
                <Button icon={backingUp ? <LoadingOutlined /> : <DatabaseOutlined />}
                  loading={backingUp} onClick={handleBackup}>
                  {backingUp ? '备份中...' : '立即备份'}
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 bg-brand-bg">
                <div>
                  <p className="font-medium text-brand-text">自动备份</p>
                  <p className="text-xs text-brand-muted">未接入：服务端暂无自动备份任务</p>
                </div>
                <Switch checked={false} disabled />
              </div>
            </div>
          ),
        },
      ]} />
    </div>
  );
}

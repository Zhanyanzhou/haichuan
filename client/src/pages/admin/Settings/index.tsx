import { useState } from 'react';
import { Button, Switch, message } from 'antd';
import { DatabaseOutlined, LoadingOutlined } from '@ant-design/icons';
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
  const [backingUp, setBackingUp] = useState(false);

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

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-display font-semibold text-brand-text">系统设置</h1><p className="text-sm text-brand-muted mt-1">备份恢复</p></div>
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
    </div>
  );
}

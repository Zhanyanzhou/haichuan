import { useCallback, useEffect, useState } from "react";
import { App as AntdApp, Button, Tag } from "antd";
import { DatabaseOutlined, LoadingOutlined } from "@ant-design/icons";
import { unwrapResponse } from "@/utils/unwrap";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/common/AdminDataStates";
import { settingsApi } from "@/services/api";

/** 服务端 /settings/backup 真实返回（读 backup 容器产物目录） */
type BackupExecutionStatus = "SUCCESS" | "WARNING" | "FAILED" | "UNKNOWN" | "INVALID";

interface BackupStatus {
  lastBackup: string | null;
  autoBackup: boolean;
  storageMounted?: boolean;
  backupSchedule: string | null;
  backupRetentionDays?: number | null;
  totalBackups: number;
  incompleteArtifactCount?: number;
  latestFiles?: Array<{ name: string; size: number }>;
  markerPresent?: boolean;
  markerValid?: boolean;
  markerMatchesLatest?: boolean;
  executionStatus?: string | null;
  lastAttemptFinishedAt?: string | null;
  lastExitCode?: number | null;
  errorCode?: string | null;
  warningCode?: string | null;
  message: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN", { hour12: false });
}

function formatBackupRetentionDays(value: unknown): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? `${value} 天`
    : "由部署环境管理";
}

const EXECUTION_STATUS_META: Record<
  BackupExecutionStatus,
  { label: string; color: string }
> = {
  SUCCESS: { label: "已成功", color: "green" },
  WARNING: { label: "需检查", color: "gold" },
  FAILED: { label: "已失败", color: "red" },
  UNKNOWN: { label: "状态未知", color: "default" },
  INVALID: { label: "状态无效", color: "red" },
};

function getExecutionStatusMeta(value: unknown) {
  if (
    typeof value === "string"
    && Object.prototype.hasOwnProperty.call(EXECUTION_STATUS_META, value)
  ) {
    return EXECUTION_STATUS_META[value as BackupExecutionStatus];
  }
  return EXECUTION_STATUS_META.UNKNOWN;
}

export default function Settings() {
  const { message } = AntdApp.useApp();
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  // 区分"确认无备份"与"查询失败"：失败时不得回落成"暂无备份产物"的安全假象
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const executionStatusMeta = getExecutionStatusMeta(status?.executionStatus);

  const fetchStatus = useCallback(async (announce = false) => {
    setChecking(true);
    setLoadError(null);
    try {
      const res = await settingsApi.getBackupStatus();
      // 展示服务端真实状态：读 backup 容器产物目录，不假报成功
      const payload = unwrapResponse<BackupStatus>(res) ?? null;
      setStatus(payload);
      if (announce) {
        message.success("备份状态已更新");
      }
    } catch (error: unknown) {
      setStatus(null);
      setLoadError(error);
    } finally {
      setChecking(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="系统设置"
        subtitle="查看数据库与媒体备份状态。"
        extra={(
          <Button
            icon={checking ? <LoadingOutlined /> : <DatabaseOutlined />}
            loading={checking}
            onClick={() => void fetchStatus(true)}
          >
            {checking ? "正在查询备份状态…" : "刷新备份状态"}
          </Button>
        )}
      />
      <div className="bg-white border border-brand-line p-4 sm:p-6 max-w-xl space-y-4">
        {checking && !status ? (
          <AdminLoadingState subject="备份状态" compact />
        ) : loadError ? (
          <AdminErrorState
            subject="备份状态"
            error={loadError}
            onRetry={() => void fetchStatus()}
          />
        ) : !status ? (
          <AdminEmptyState
            subject="备份状态"
            kind="unconfigured"
            description="尚未取得备份状态。请检查备份服务配置后重新加载。"
          />
        ) : (
          <>
        <div className="flex items-center justify-between p-4 bg-brand-bg">
          <div>
            <p className="font-medium text-brand-text">数据库与媒体备份</p>
            <p className="text-xs text-brand-muted">
              {status.lastBackup ? (
                <>
                  最近备份 {formatTime(status.lastBackup)}
                  {status.totalBackups ? ` · 共 ${status.totalBackups} 组完整备份` : ""}
                </>
              ) : (
                "暂无备份产物"
              )}
            </p>
          </div>
          <Tag color={executionStatusMeta.color}>
            {executionStatusMeta.label}
          </Tag>
        </div>

            <div className="flex items-center justify-between p-4 bg-brand-bg">
              <div>
                <p className="font-medium text-brand-text">自动备份</p>
                <p className="text-xs text-brand-muted">
                  {status.autoBackup
                    ? status.backupSchedule || "backup 容器定时执行"
                    : status.message || "尚未配置自动备份"}
                </p>
              </div>
              <Tag color={status.autoBackup ? "green" : status.storageMounted ? "gold" : "default"}>
                {status.autoBackup ? "已配置" : status.storageMounted ? "待启用" : "未挂载"}
              </Tag>
            </div>

            <div className="flex items-center justify-between gap-4 p-4 bg-brand-bg">
              <span className="text-sm text-brand-muted">备份保留期</span>
              <span className="text-sm text-brand-text">
                {formatBackupRetentionDays(status.backupRetentionDays)}
              </span>
            </div>

            <div className="p-4 bg-brand-bg text-xs space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-brand-muted">最近执行结果</span>
                  <span className="text-brand-text">
                    {executionStatusMeta.label}
                    {status.lastExitCode !== null && status.lastExitCode !== undefined
                      ? ` · exit ${status.lastExitCode}`
                      : ""}
                  </span>
                </div>
                {status.lastAttemptFinishedAt && (
                  <div className="flex justify-between gap-4">
                    <span className="text-brand-muted">最近尝试完成</span>
                    <span className="text-brand-text">{formatTime(status.lastAttemptFinishedAt)}</span>
                  </div>
                )}
                {(status.errorCode && status.errorCode !== "NONE") && (
                  <div className="flex justify-between gap-4">
                    <span className="text-brand-muted">错误代码</span>
                    <code className="text-brand-text">{status.errorCode}</code>
                  </div>
                )}
                <p className="text-brand-muted pt-1">{status.message}</p>
              </div>

            {status.latestFiles && status.latestFiles.length > 0 && (
              <div className="p-4 bg-brand-bg">
                <p className="text-xs text-brand-muted mb-2">最近备份产物</p>
                <ul className="space-y-1">
                  {status.latestFiles.map((file) => (
                    <li
                      key={file.name}
                      className="flex items-center justify-between text-xs text-brand-text"
                    >
                      <span className="truncate mr-3">{file.name}</span>
                      <span className="text-brand-muted shrink-0">
                        {formatBytes(file.size)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs leading-[18px] text-brand-muted mt-2">
                  恢复演练：备份文件由部署环境管理；恢复前必须先校验数据库、媒体与批次清单，
                  并定期在隔离环境做真实恢复验证。
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

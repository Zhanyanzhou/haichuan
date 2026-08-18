import { useCallback, useEffect, useState } from "react";
import { Button, Tag, message } from "antd";
import { DatabaseOutlined, LoadingOutlined } from "@ant-design/icons";
import { unwrapResponse } from "@/utils/unwrap";
import { AdminLoadingState } from "@/components/common/AdminDataStates";

/** 获取 token（兼容多种存储方式） */
function getToken(): string {
  try {
    const raw = localStorage.getItem("jewelry-auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.state?.token || "";
    }
  } catch {
    // Ignore invalid serialized authentication and try the legacy key.
  }
  return localStorage.getItem("token") || "";
}

/** 服务端 /settings/backup 真实返回（读 backup 容器产物目录） */
interface BackupStatus {
  lastBackup: string | null;
  autoBackup: boolean;
  backupSchedule: string | null;
  totalBackups: number;
  latestFiles?: Array<{ name: string; size: number }>;
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

export default function Settings() {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<BackupStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/settings/backup", {
        method: "GET",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 展示服务端真实状态：读 backup 容器产物目录，不假报成功
      const body = await res.json().catch(() => null);
      const payload = unwrapResponse<BackupStatus>(body) ?? body ?? null;
      setStatus(payload);
      if (payload?.lastBackup) {
        message.success(`最近备份：${formatTime(payload.lastBackup)}`);
      } else {
        message.warning(payload?.message || "暂无备份产物");
      }
    } catch {
      setStatus(null);
      message.error("查询备份状态失败，请检查后端服务");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-brand-text">
          系统设置
        </h1>
        <p className="text-sm text-brand-muted mt-1">备份恢复</p>
      </div>
      <div className="bg-white border border-brand-line p-8 max-w-xl space-y-4">
        <div className="flex items-center justify-between p-4 bg-brand-bg">
          <div>
            <p className="font-medium text-brand-text">数据库与媒体备份</p>
            <p className="text-xs text-brand-muted">
              {checking && !status ? (
                "查询备份产物中…"
              ) : status?.lastBackup ? (
                <>
                  最近备份 {formatTime(status.lastBackup)}
                  {status.totalBackups ? ` · 共 ${status.totalBackups} 份产物` : ""}
                </>
              ) : (
                "暂无备份产物"
              )}
            </p>
          </div>
          <Button
            icon={checking ? <LoadingOutlined /> : <DatabaseOutlined />}
            loading={checking}
            onClick={() => void fetchStatus()}
          >
            {checking ? "查询中..." : "刷新备份状态"}
          </Button>
        </div>

        {checking && !status ? (
          <div className="flex justify-center p-6">
            <AdminLoadingState subject="服务状态" compact />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-4 bg-brand-bg">
              <div>
                <p className="font-medium text-brand-text">自动备份</p>
                <p className="text-xs text-brand-muted">
                  {status?.autoBackup
                    ? status.backupSchedule || "backup 容器定时执行"
                    : status?.message || "备份目录未挂载，自动备份状态未知"}
                </p>
              </div>
              <Tag color={status?.autoBackup ? "green" : "default"}>
                {status?.autoBackup ? "运行中" : "未挂载"}
              </Tag>
            </div>

            {status?.latestFiles && status.latestFiles.length > 0 && (
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
                  恢复演练：备份文件位于宿主机 ./backups（数据库 .sql.gz + 媒体 .tar.gz），
                  请定期在测试环境做一次真实恢复验证。
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

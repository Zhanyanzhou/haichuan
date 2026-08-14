/**
 * ContractStatusBanner.tsx — 模块内容完成度横幅（自 HomepageConfig/index.tsx 平移，逻辑零变更）。
 */
import { CheckCircleOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import type { ModuleContractStatus } from "../config/blockContracts";

export default function ContractStatusBanner({
  status,
}: {
  status: ModuleContractStatus;
}) {
  const tone =
    status.errors.length > 0
      ? "error"
      : status.warnings.length > 0
        ? "warning"
        : "ready";
  return (
    <div
      className={`homepage-editor__contract-status is-${tone}`}
      role="status"
    >
      {tone === "ready" ? (
        <CheckCircleOutlined />
      ) : (
        <ExclamationCircleOutlined />
      )}
      <div>
        <strong>
          内容完成度 {status.completed}/{status.total}
        </strong>
        {status.errors.length > 0 ? (
          <span>发布前需完成：{status.errors.join("；")}</span>
        ) : status.warnings.length > 0 ? (
          <span>{status.warnings[0]}</span>
        ) : (
          <span>当前模块已达到发布标准</span>
        )}
      </div>
    </div>
  );
}

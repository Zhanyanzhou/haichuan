/**
 * renderParity.tsx — 公开端与编辑器画布共享的渲染一致性规则。
 *
 * 编辑器主动检测本地素材缺失；公开端由实际图片请求处理失败，避免重复占用首屏连接。
 * 受治理的 `/uploads/page-assets/` 在未完成公开授权前，公开地址会 404；
 * 编辑器探测必须走登录预览端点，否则画布会把刚替换的图误判为已删除。
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveManagedTemplateMediaPreviewUrl } from "../template-definition/managedMediaPreview";

export const LOCAL_UPLOAD_PREFIX = "/uploads/";

/** 编辑器 HEAD 探测地址：page-assets 改走需登录的预览端点。 */
export function resolveEditorMediaProbeUrl(url: string): string {
  return resolveManagedTemplateMediaPreviewUrl(url) || url;
}

/** 只有确认文件不存在时才把画布整块换成占位；429/5xx 是拥塞，不是素材已删除。 */
export function editorMediaProbeIndicatesMissing(status: number): boolean {
  return status === 404 || status === 410;
}

/** 保留调用边界；当前不再为已删除模板做色值兼容转换。 */
export function normalizeLegacyRenderColors(value: unknown): unknown {
  return value;
}

/** 收集区块 props 中所有指向本站 /uploads/ 的素材地址。 */
type AssetRecord = Record<string, unknown>;

function asAssetRecord(value: unknown): AssetRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AssetRecord
    : undefined;
}

export function getLocalUploadUrls(props: AssetRecord): string[] {
  const urls = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === "string" && value.startsWith(LOCAL_UPLOAD_PREFIX)) {
      urls.add(value);
    }
  };

  const visit = (value: unknown, depth = 0) => {
    if (depth > 12) return;
    if (typeof value === "string") {
      collect(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    const record = asAssetRecord(value);
    if (record) Object.values(record).forEach((item) => visit(item, depth + 1));
  };
  visit(props);

  return [...urls];
}

/** 编辑态 HEAD 探测区块引用的本地素材是否仍然存在。 */
export function useHasMissingAssets(props: AssetRecord): boolean {
  const urlsKey = useMemo(
    () => getLocalUploadUrls(props || {}).join("\n"),
    [props],
  );
  const [hasMissingAsset, setHasMissingAsset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const urls = urlsKey ? urlsKey.split("\n") : [];
    if (!urls.length) {
      setHasMissingAsset(false);
      return;
    }

    void Promise.all(
      urls.map((url) =>
        fetch(resolveEditorMediaProbeUrl(url), {
          method: "HEAD",
          credentials: "same-origin",
        })
          .then((response) => editorMediaProbeIndicatesMissing(response.status))
          .catch(() => false),
      ),
    ).then((missingFlags) => {
      if (!cancelled) setHasMissingAsset(missingFlags.some(Boolean));
    });

    return () => {
      cancelled = true;
    };
  }, [urlsKey]);

  return hasMissingAsset;
}

export function MissingMediaState({
  type,
  hint,
}: {
  type?: string;
  /** 编辑器画布附加说明（例如"请在右侧重新选择素材"）；公开端不传。 */
  hint?: ReactNode;
}) {
  return (
    <section
      role="status"
      style={{
        minHeight: 260,
        display: "grid",
        placeItems: "center",
        padding: "48px 24px",
        background: "#F4F5F5",
        border: "1px solid #DDE1E2",
        color: "#181A1B",
        textAlign: "center",
      }}
    >
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 15 }}>该内容暂不可展示</p>
        <p style={{ margin: 0, fontSize: 13, color: "#5F6568" }}>
          {type ? `「${type}」相关素材` : "相关素材"}暂时不可用，请稍后再试。
        </p>
        {hint ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6E7477" }}>
            {hint}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * ImageStatus — 图片状态紧凑检测条（≤4 行）
 * 比例 / 清晰度（分辨率）/ 文件大小 / 格式。只提示，不阻止保存。
 */
interface ImageStatusSpec {
  width: number;
  height: number;
  ratio: string;
}

interface ImageStatusProps {
  width?: number;
  height?: number;
  format?: string;
  size?: number; // bytes
  spec?: ImageStatusSpec;
}

function formatBytes(b?: number) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function simplifyRatio(w: number, h: number) {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h) || 1;
  const rw = w / g;
  const rh = h / g;
  // 比例数字过大（如 3840:2160 化简为 16:9 正常，但异常图可能 1673:941）则保留 1 位小数
  if (rw <= 50 && rh <= 50) return `${rw}:${rh}`;
  return (w / h).toFixed(2);
}

export default function ImageStatus({ width, height, format, size, spec }: ImageStatusProps) {
  if (!width || !height) return null;

  const actualRatio = width / height;
  const targetRatio = spec ? spec.width / spec.height : actualRatio;
  const ratioOk = spec ? Math.abs(actualRatio - targetRatio) / targetRatio <= 0.08 : true;

  const resLevel = !spec ? "good" : width >= spec.width ? "good" : width >= spec.width * 0.75 ? "watch" : "risk";
  const sizeLevel = !size ? null : size <= 500 * 1024 ? "good" : size <= 2 * 1024 * 1024 ? "watch" : "risk";
  const fmt = (format || "").toUpperCase();
  const fmtOk = fmt === "WEBP" || fmt === "AVIF";

  const Row = ({ ok, label, value, hint }: { ok: boolean; label: string; value: string; hint?: string }) => (
    <div className={`homepage-editor__image-status-row${ok ? " is-ok" : " is-warn"}`}>
      <span className="homepage-editor__image-status-icon" aria-hidden>{ok ? "✓" : "⚠"}</span>
      <span className="homepage-editor__image-status-label">{label}</span>
      <span className="homepage-editor__image-status-value">{value}</span>
      {hint && <span className="homepage-editor__image-status-hint">{hint}</span>}
    </div>
  );

  return (
    <div className="homepage-editor__image-status">
      <Row ok={ratioOk} label="比例" value={simplifyRatio(width, height)} hint={!ratioOk && spec ? `推荐 ${spec.ratio}` : undefined} />
      <Row ok={resLevel === "good"} label="清晰度" value={`${width} × ${height}`} hint={resLevel !== "good" && spec ? `建议 ≥ ${spec.width} × ${spec.height}` : undefined} />
      {size && <Row ok={sizeLevel === "good"} label="文件大小" value={formatBytes(size)} hint={sizeLevel === "risk" ? "较大，可能影响加载" : undefined} />}
      {fmt && <Row ok={fmtOk} label="格式" value={fmt} hint={!fmtOk ? "建议 WebP/AVIF" : undefined} />}
    </div>
  );
}

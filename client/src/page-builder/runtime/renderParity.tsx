/**
 * renderParity.tsx — 公开端与编辑器画布共享的渲染一致性规则。
 *
 * 2026-08-21 从 PuckDocumentRenderer 抽取：旧色值规范化与本地素材缺失检测
 * 此前只在公开端生效，编辑器画布用另一套（没有这些规则），导致同一份数据
 * 两端画面不同。现在两端复用本模块，保证"画布≈前台"。
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TONE_PRESETS } from "@/page-builder/designSystem/tokens";

export const LOCAL_UPLOAD_PREFIX = "/uploads/";

const BLOCK_ASSET_FIELDS = [
  "desktopImage",
  "mobileImage",
  "mainImage",
  "detailImage",
  "image",
  "posterUrl",
  "url",
  "videoUrl",
  "backgroundImage",
  "beforeImage",
  "afterImage",
];

const LEGACY_RENDER_COLOR_MAP: Record<string, string> = Object.fromEntries(
  [
    ["1A1A1A", TONE_PRESETS.ivory.ink],
    ["222222", TONE_PRESETS.ivory.ink],
    ["66645F", TONE_PRESETS.ivory.muted],
    ["8C8C8C", "#6E7477"],
    ["E4E3DF", TONE_PRESETS.ivory.line],
    ["F5F5F5", TONE_PRESETS.champagne.bg],
    ["F8F7F4", TONE_PRESETS.ink.ink],
    ["FCFCFB", TONE_PRESETS.ivory.bg],
  ].map(([legacyHex, currentColor]) => [`#${legacyHex}`, currentColor]),
);

/** 历史文档中的旧色值在渲染层映射为新色板；只影响展示，不回写数据。 */
export function normalizeLegacyRenderColors(value: unknown): unknown {
  if (typeof value === "string") {
    return LEGACY_RENDER_COLOR_MAP[value.toUpperCase()] ?? value;
  }
  if (Array.isArray(value)) return value.map(normalizeLegacyRenderColors);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeLegacyRenderColors(item)]),
    );
  }
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

  BLOCK_ASSET_FIELDS.forEach((field) => collect(props[field]));
  if (Array.isArray(props.images)) {
    props.images.forEach((item) => {
      const record = asAssetRecord(item);
      collect(record?.url);
      collect(record?.mobileUrl);
    });
  }
  if (Array.isArray(props.categories)) {
    props.categories.forEach((item) => collect(asAssetRecord(item)?.image));
  }
  if (Array.isArray(props.items)) {
    // 作品画廊条目图
    props.items.forEach((item) => collect(asAssetRecord(item)?.image));
  }
  if (Array.isArray(props.certificates)) {
    props.certificates.forEach((item) => collect(asAssetRecord(item)?.imageUrl));
  }
  if (Array.isArray(props.steps)) {
    props.steps.forEach((item) => collect(asAssetRecord(item)?.image));
  }
  if (Array.isArray(props.testimonials)) {
    props.testimonials.forEach((item) => collect(asAssetRecord(item)?.image));
  }

  return [...urls];
}

/** HEAD 探测区块引用的本地素材是否仍然存在（素材被删后两端都显示占位）。 */
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
        fetch(url, { method: "HEAD" })
          .then((response) => response.ok)
          .catch(() => false),
      ),
    ).then((available) => {
      if (!cancelled) setHasMissingAsset(available.some((value) => !value));
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

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { App as AntdApp, Button, Modal, Slider } from "antd";
import MediaPickerField from "../fields/MediaPickerField";
import { resolveManagedTemplateMediaPreviewUrl } from "../template-definition/managedMediaPreview";
import type { TemplateDefinitionV2 } from "../template-definition";
import { uploadApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import {
  getEditorApiErrorMessage,
  getEditorErrorMessage,
  getEditorHttpStatus,
} from "../workspace/editorLifecycleErrors";
import {
  catalogCoverImageSlots,
  catalogCoverMediaSpec,
  resolveCatalogCoverFrame,
} from "./catalogCoverGeometry";

export default function TemplateCatalogCoverEditor({
  templateId,
  name,
  definition,
  catalogCoverUrl,
  saving,
  onClose,
  onClear,
  onSaved,
}: {
  templateId: string;
  name: string;
  definition: TemplateDefinitionV2;
  catalogCoverUrl: string | null;
  saving: boolean;
  onClose: () => void;
  onClear: () => void;
  onSaved: (catalogCoverUrl: string) => Promise<void>;
}) {
  const { message } = AntdApp.useApp();
  const [sourceUrl, setSourceUrl] = useState(catalogCoverUrl ?? "");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);
  const previewSrc = resolveManagedTemplateMediaPreviewUrl(sourceUrl);
  const pendingSelection = Boolean(sourceUrl) && sourceUrl !== (catalogCoverUrl ?? "");
  const busy = saving || cropping;
  const frame = useMemo(() => resolveCatalogCoverFrame(definition), [definition]);
  const imageSlots = useMemo(() => catalogCoverImageSlots(definition), [definition]);
  const mediaSpec = catalogCoverMediaSpec(frame);

  useEffect(() => {
    setSourceUrl(catalogCoverUrl ?? "");
  }, [catalogCoverUrl]);

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
  }, [sourceUrl]);

  const applyCroppedCover = async () => {
    if (!sourceUrl || !croppedArea) {
      message.warning("请先选择图片，并按当前模板画幅确认裁切。");
      return;
    }
    setCropping(true);
    try {
      let nextUrl = "";
      try {
        const response = await uploadApi.cropPageMedia({
          sourceUrl,
          x: croppedArea.x / 100,
          y: croppedArea.y / 100,
          width: croppedArea.width / 100,
          height: croppedArea.height / 100,
        });
        nextUrl = unwrapResponse<{ url?: string }>(response)?.url?.trim() ?? "";
      } catch (error) {
        const status = getEditorHttpStatus(error);
        const apiMessage = getEditorApiErrorMessage(error);
        const safeApiMessage = apiMessage && !/[A-Za-z]{3,}/.test(apiMessage) ? apiMessage : "";
        message.error(
          status === 404
            ? "裁切接口尚未生效。请重新编译并重启后台后再试。"
            : getEditorErrorMessage(
              error,
              safeApiMessage || "裁切未能保存。请确认已选择素材库中的图片后重试。",
            ),
        );
        return;
      }
      if (!nextUrl) {
        message.error("裁切结果异常，请换一张图片后重试。");
        return;
      }
      try {
        await onSaved(nextUrl);
      } catch {
        // persistCatalogCover 已提示失败原因
      }
    } finally {
      setCropping(false);
    }
  };

  return (
    <Modal
      className="template-editor__catalog-cover-dialog"
      title={`组件库预览图：${name}`}
      open
      onCancel={() => {
        if (!busy) onClose();
      }}
      destroyOnHidden
      footer={[
        catalogCoverUrl && !pendingSelection ? (
          <Button key="clear" disabled={busy} onClick={onClear}>
            改回实时预览
          </Button>
        ) : null,
        pendingSelection ? (
          <Button key="cancel" disabled={busy} onClick={onClose}>
            取消
          </Button>
        ) : null,
        pendingSelection ? (
          <Button
            key="apply"
            type="primary"
            loading={busy}
            disabled={!croppedArea}
            onClick={() => { void applyCroppedCover(); }}
          >
            应用这张预览图
          </Button>
        ) : (
          <Button key="done" type="primary" loading={busy} onClick={onClose}>
            完成
          </Button>
        ),
      ]}
    >
      <p className="homepage-editor__inspector-hint">
        {`裁切框按当前模板画幅 ${Math.round(frame.width)} × ${Math.round(frame.height)}（${frame.ratioLabel}）来定。白框标出图片槽位，方便把主体放到对应位置；系统不会再改成 4:3 或自动裁切。这张图只出现在模板组件库卡片上。没有图片或图片失效时，仍显示实时预览。放大预览和页面内容不受影响。`}
      </p>
      <MediaPickerField
        fieldKey={`catalog-cover:${templateId}`}
        value={sourceUrl}
        placeholder="上传组件库预览图"
        spec={mediaSpec}
        onChange={(value) => setSourceUrl(value.trim())}
      />
      {pendingSelection && previewSrc ? (
        <div className="template-editor__catalog-cover-crop">
          <div
            className="template-editor__catalog-cover-cropper"
            data-catalog-cover-cropper="true"
            data-cover-width={String(Math.round(frame.width))}
            data-cover-height={String(Math.round(frame.height))}
            style={{
              "--catalog-cover-width": String(frame.width),
              "--catalog-cover-height": String(frame.height),
            } as CSSProperties}
          >
            <Cropper
              image={previewSrc}
              crop={crop}
              zoom={zoom}
              aspect={frame.aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(area) => setCroppedArea(area)}
            />
            {imageSlots.length > 0 && definition.metadata.canvasSize ? (
              <svg
                className="template-editor__catalog-cover-slots"
                data-catalog-cover-slots="true"
                viewBox={`0 0 ${definition.metadata.canvasSize.width} ${definition.metadata.canvasSize.height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {imageSlots.map((slot) => (
                  <rect
                    key={slot.nodeId}
                    data-cover-slot={slot.kind}
                    x={slot.x}
                    y={slot.y}
                    width={slot.width}
                    height={slot.height}
                    rx={Math.min(frame.width, frame.height) / 80}
                  />
                ))}
              </svg>
            ) : null}
          </div>
          <label className="template-editor__catalog-cover-zoom">
            <span>缩放</span>
            <Slider
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(value) => setZoom(Array.isArray(value) ? value[0] : value)}
            />
          </label>
        </div>
      ) : null}
    </Modal>
  );
}

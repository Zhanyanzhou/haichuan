/**
 * 商品列表图裁切组件（HC-PRODUCT-LISTING-IMAGE-MVP-17）
 * — 使用 react-easy-crop 实现 1:1 固定比例裁切
 * — 发送归一化坐标（0-1）到 POST /products/:id/images/:sourceImageId/crop-listing
 */

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Slider, Button, message, Spin } from 'antd';

interface ImageCropperProps {
  imageUrl: string;           // 完整图片URL（如 /uploads/2026/08/06/xxx.png）
  productId: number;
  sourceImageId: number;
  onSaved: (listingUrl: string) => void;
  onCancel: () => void;
}

export default function ImageCropper({
  imageUrl, productId, sourceImageId, onSaved, onCancel,
}: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [croppedAreaNorm, setCroppedAreaNorm] = useState<Area | null>(null);

  const onCropComplete = useCallback((croppedArea: Area, _croppedAreaPixels: Area) => {
    // react-easy-crop: croppedArea 返回百分比值 (0-100)，转为归一化 (0-1)
    setCroppedAreaNorm({
      x: croppedArea.x / 100,
      y: croppedArea.y / 100,
      width: croppedArea.width / 100,
      height: croppedArea.height / 100,
    });
  }, []);

  const handleSave = async () => {
    if (!croppedAreaNorm) {
      message.warning('请先调整裁切区域');
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/products/${productId}/images/${sourceImageId}/crop-listing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            x: croppedAreaNorm.x,
            y: croppedAreaNorm.y,
            width: croppedAreaNorm.width,
            height: croppedAreaNorm.height,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '裁切失败');
      }
      const data = await res.json();
      const result = data?.data || data;
      message.success('列表图已生成（1200×1200 WebP）');
      onSaved(result.url);
    } catch (e: any) {
      message.error(e?.message || '裁切保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 裁切区 */}
      <div style={{ flex: 1, position: 'relative', margin: '40px 40px 0' }}>
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={1}             // 固定 1:1
          cropShape="rect"
          showGrid={true}
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
          style={{
            containerStyle: { background: '#1a1a1a' },
            cropAreaStyle: { border: '1px solid rgba(255,255,255,0.5)' },
          }}
        />
      </div>

      {/* 底部控制栏 */}
      <div style={{
        background: '#fff', padding: '16px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span style={{ fontSize: 12, color: '#999', whiteSpace: 'nowrap' }}>缩放</span>
        <Slider
          min={1} max={3} step={0.01}
          value={zoom}
          onChange={setZoom}
          style={{ flex: 1, maxWidth: 200 }}
        />
        <div style={{ flex: 1 }} />
        <Button onClick={onCancel} disabled={saving}>取消</Button>
        <Button type="primary" onClick={handleSave} loading={saving}>
          保存列表图
        </Button>
      </div>
    </div>
  );
}

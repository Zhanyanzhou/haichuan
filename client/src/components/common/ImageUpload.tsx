import { useState } from 'react';
import { Upload, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { imageStore } from '@/utils/imageStore';

interface Props {
  value?: string;          // 当前图片 ID
  onChange?: (id: string) => void;
  onUploaded?: (img: { id: string; name: string; dataUrl: string }) => void;
}

export default function ImageUpload({ value, onChange, onUploaded }: Props) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const handleBeforeUpload = (file: File) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) { message.error('只能上传图片文件'); return Upload.LIST_IGNORE; }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) { message.error('图片不能超过 5MB'); return Upload.LIST_IGNORE; }

    imageStore.upload(file).then((img) => {
      onChange?.(img.id);
      onUploaded?.(img);
      setFileList([{
        uid: img.id,
        name: img.name,
        status: 'done',
        url: img.dataUrl,
      }]);
      message.success('上传成功');
    }).catch(() => message.error('上传失败'));

    return false; // 阻止默认上传行为
  };

  // 如果有已保存的图片 ID，从 store 加载预览
  const previewUrl = value ? imageStore.getUrl(value) : undefined;

  return (
    <div>
      {previewUrl ? (
        <div className="mb-3">
          <img src={previewUrl} alt="预览" className="w-full max-w-[200px] aspect-square object-cover border border-brand-line" />
          <button
            onClick={() => { onChange?.(''); setFileList([]); }}
            className="text-xs mt-2"
            style={{ color: "#8C3F3B" }}
          >
            移除图片
          </button>
        </div>
      ) : (
        <Upload
          listType="picture-card"
          fileList={fileList}
          beforeUpload={handleBeforeUpload as any}
          onRemove={() => { onChange?.(''); setFileList([]); }}
          maxCount={1}
        >
          <div className="flex flex-col items-center">
            <PlusOutlined />
            <span className="mt-2 text-xs text-brand-muted">上传图片</span>
          </div>
        </Upload>
      )}
    </div>
  );
}

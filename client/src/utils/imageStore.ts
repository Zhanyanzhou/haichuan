/** 图片本地存储工具 — 用 localStorage 存 base64 */
const STORAGE_KEY = 'haichuan_images';

interface StoredImage {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

function readAll(): StoredImage[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function writeAll(list: StoredImage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.error('图片存储空间不足，请清理旧图片');
      alert('图片存储空间已满！请删除一些旧图片后重试。');
    }
    throw e;
  }
}

export const imageStore = {
  /** 上传图片，返回存储的图片对象 */
  upload: (file: File): Promise<StoredImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img: StoredImage = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: file.name,
          dataUrl: reader.result as string,
          createdAt: new Date().toISOString(),
        };
        const list = readAll();
        list.unshift(img);
        writeAll(list);
        resolve(img);
      };
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });
  },

  /** 获取所有已上传图片 */
  getAll: (): StoredImage[] => readAll(),

  /** 删除图片 */
  remove: (id: string) => {
    writeAll(readAll().filter((i) => i.id !== id));
  },

  /** 获取图片 URL */
  getUrl: (id: string): string | undefined => {
    return readAll().find((i) => i.id === id)?.dataUrl;
  },
};

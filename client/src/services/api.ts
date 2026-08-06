import axios from 'axios';
import { message } from 'antd';
import type { ApiResponse } from '@/types';
import {
  USE_MOCK, mockDelay, mockCategories, mockProducts, mockOrders,
  mockUsers, mockGoldPrice, mockGoldPriceHistory,
  filterProducts, paginate, mockHomepageConfig,
} from './mockData';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - unified error handling
api.interceptors.response.use(
  (response) => {
    const data = response.data as ApiResponse<unknown>;
    // 兼容后端 TransformInterceptor 格式
    if (data && typeof data.code === 'number' && data.code !== 200) {
      message.error(data.message || '请求失败');
      return Promise.reject(new Error(data.message || 'Request failed'));
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname.startsWith('/admin') && !window.location.pathname.includes('/admin/login')) {
        window.location.href = '/admin/login';
      }
    } else if (error.response?.status === 403) {
      message.error('没有权限执行此操作');
    } else if (error.response?.status === 429) {
      message.error('操作过于频繁，请稍后再试');
    } else if (error.response?.status && error.response.status >= 500) {
      message.error('服务器繁忙，请稍后再试');
    }
    const msg = error.response?.data?.message || error.message || '网络错误';
    return Promise.reject(new Error(msg));
  },
);

// ===== Mock Response Wrapper =====
function mockRes<T>(data: T): { data: ApiResponse<T> } {
  return { data: { code: 200, data, message: 'success', timestamp: new Date().toISOString() } };
}

// ===== Auth API =====
export const authApi = {
  login: async (data: { username: string; password: string }) => {
    if (USE_MOCK) {
      await mockDelay();
      if (data.username === 'admin' && data.password === 'admin123') {
        return mockRes({ accessToken: 'mock-jwt-token', user: mockUsers[0] });
      }
      throw new Error('用户名或密码错误');
    }
    return api.post('/auth/login', data);
  },
  register: (data: any) => api.post('/auth/register', data),
  getProfile: async () => {
    if (USE_MOCK) { await mockDelay(); return mockRes(mockUsers[0]); }
    return api.get('/auth/profile');
  },
};

// ===== Products API =====
export const productApi = {
  getList: async (params: any) => {
    if (USE_MOCK) {
      await mockDelay();
      const filtered = filterProducts(mockProducts, params);
      return mockRes(paginate(filtered, params.page || 1, params.pageSize || 20));
    }
    return api.get('/products', { params });
  },
  getById: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay();
      const p = mockProducts.find((x) => x.id === id);
      if (!p) throw new Error('产品不存在');
      return mockRes(p);
    }
    return api.get(`/products/${id}`);
  },
  create: (data: any) => api.post('/products', data),
  update: async (id: number, data: any) => {
    if (USE_MOCK) { await mockDelay(200); return mockRes({ id, ...data }); }
    return api.put(`/products/${id}`, data);
  },
  delete: async (id: number) => {
    if (USE_MOCK) { await mockDelay(200); return mockRes({ success: true }); }
    return api.delete(`/products/${id}`);
  },
  /* 图片管理 */
  addImage: (productId: number, data: { url: string; type?: string; sortOrder?: number }) =>
    api.post(`/products/${productId}/images`, data),
  updateImage: (productId: number, imageId: number, data: { type?: string; sortOrder?: number }) =>
    api.put(`/products/${productId}/images/${imageId}`, data),
  deleteImage: (productId: number, imageId: number) =>
    api.delete(`/products/${productId}/images/${imageId}`),
  setCoverImage: (productId: number, imageId: number) =>
    api.put(`/products/${productId}/images/${imageId}/cover`),
};

// ===== Categories API =====
export const categoryApi = {
  getTree: async () => {
    if (USE_MOCK) { await mockDelay(); return mockRes(mockCategories); }
    return api.get('/categories/tree');
  },
  getList: async () => {
    if (USE_MOCK) { await mockDelay(); return mockRes(mockCategories); }
    return api.get('/categories');
  },
  create: async (data: any) => {
    if (USE_MOCK) { await mockDelay(200); return mockRes({ id: Date.now(), ...data }); }
    return api.post('/categories', data);
  },
  update: async (id: number, data: any) => {
    if (USE_MOCK) { await mockDelay(200); return mockRes({ id, ...data }); }
    return api.put(`/categories/${id}`, data);
  },
  delete: async (id: number) => {
    if (USE_MOCK) { await mockDelay(200); return mockRes({ success: true }); }
    return api.delete(`/categories/${id}`);
  },
};

// ===== Users API =====
export const userApi = {
  getList: async (params: any) => {
    if (USE_MOCK) { await mockDelay(); return mockRes(paginate(mockUsers, params.page || 1, params.pageSize || 20)); }
    return api.get('/users', { params });
  },
  getById: (id: number) => api.get(`/users/${id}`),
  create: async (data: any) => {
    if (USE_MOCK) { await mockDelay(200); return mockRes({ id: Date.now(), ...data }); }
    return api.post('/users', data);
  },
  update: async (id: number, data: any) => {
    if (USE_MOCK) { await mockDelay(200); return mockRes({ id, ...data }); }
    return api.put(`/users/${id}`, data);
  },
  delete: (id: number) => api.delete(`/users/${id}`),
};

// ===== Orders API =====
export const orderApi = {
  getList: async (params: any) => {
    if (USE_MOCK) { await mockDelay(); return mockRes(paginate(mockOrders, params.page || 1, params.pageSize || 20)); }
    return api.get('/orders', { params });
  },
  getById: (id: number) => api.get(`/orders/${id}`),
  updateStatus: async (id: number, data: any) => {
    if (USE_MOCK) { await mockDelay(200); return mockRes({ id, ...data }); }
    return api.put(`/orders/${id}/status`, data);
  },
};

// ===== Gold Price API =====
export const goldPriceApi = {
  getLatest: async () => {
    if (USE_MOCK) { await mockDelay(); return mockRes(mockGoldPrice); }
    return api.get('/gold-price/latest');
  },
  getHistory: async (params: any) => {
    if (USE_MOCK) { await mockDelay(); return mockRes(mockGoldPriceHistory); }
    return api.get('/gold-price/history', { params });
  },
  updateManually: async (data: any) => {
    if (USE_MOCK) { await mockDelay(200); return mockRes({ ...mockGoldPrice, price: data.price, source: 'MANUAL' }); }
    return api.post('/gold-price/manual', data);
  },
};

// ===== Inventory API =====
export const inventoryApi = {
  getList: async (params: any) => {
    if (USE_MOCK) {
      await mockDelay();
      const items = mockProducts.flatMap((p) => (p.skus || []).map((sku) => ({
        id: sku.id, skuCode: sku.skuCode, productName: p.name,
        warehouse: ['深圳展厅', '广州工厂', '北京门店'][Math.floor(Math.random() * 3)],
        material: sku.material, quantity: sku.stock, safetyStock: sku.safetyStock,
        status: sku.stock <= 0 ? 'out' : sku.stock <= sku.safetyStock ? 'low' : 'normal',
      })));
      return mockRes(paginate(items, params.page || 1, params.pageSize || 20));
    }
    return api.get('/inventory', { params });
  },
  update: (id: number, data: any) => api.put(`/inventory/${id}`, data),
};

// ===== AI Classify API =====
export const aiClassifyApi = {
  classify: (data: FormData) => api.post('/ai-classify/single', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  batchClassify: (data: FormData) => api.post('/ai-classify/batch', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getRecords: async (params: any) => {
    if (USE_MOCK) {
      await mockDelay();
      const records = [
        { id: 1, imageUrl: '', predictedCategoryName: '平安扣', confidence: 96.5, status: 'auto_confirmed', createdAt: '2024-07-31 10:30' },
        { id: 2, imageUrl: '', predictedCategoryName: '葫芦', confidence: 82.3, status: 'pending_confirm', createdAt: '2024-07-31 10:25' },
        { id: 3, imageUrl: '', predictedCategoryName: '花戒', confidence: 65.0, status: 'pending_review', createdAt: '2024-07-31 10:20' },
        { id: 4, imageUrl: '', predictedCategoryName: '锁包', confidence: 93.1, status: 'auto_confirmed', createdAt: '2024-07-31 09:15' },
        { id: 5, imageUrl: '', predictedCategoryName: '佛公', confidence: 88.7, status: 'pending_confirm', confirmedCategoryName: '平安扣', createdAt: '2024-07-30 16:00' },
      ];
      return mockRes(paginate(records, params.page || 1, params.pageSize || 20));
    }
    return api.get('/ai-classify/records', { params });
  },
  confirm: (id: number, data: any) => api.put(`/ai-classify/confirm/${id}`, data),
};

// ===== Settings API =====
export const settingsApi = {
  getSettings: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({
        siteName: '海川珠宝',
        siteDesc: '高端珠宝产品管理平台',
        logo: '',
        autoBackup: true,
        backupTime: '03:00',
      });
    }
    return api.get('/settings');
  },
  updateSettings: async (data: any) => {
    if (USE_MOCK) { await mockDelay(300); return mockRes(data); }
    return api.put('/settings', data);
  },
  getLogs: async (params?: { page?: number; pageSize?: number }) => {
    if (USE_MOCK) { await mockDelay(); return mockRes({ list: [], total: 0, page: 1, pageSize: 30 }); }
    return api.get('/settings/logs', { params });
  },
};

// ===== SelectionInquiry API =====
export const selectionInquiryApi = {
  getList: async (params?: { status?: string; keyword?: string; page?: number; pageSize?: number }) =>
    api.get('/selection-inquiries', { params }),
  getDetail: async (id: number) => api.get(`/selection-inquiries/${id}`),
  update: async (id: number, data: { status?: string; handlerId?: number }) =>
    api.put(`/selection-inquiries/${id}`, data),
};

// ===== Inquiries API =====
export const inquiriesApi = {
  submit: async (data: {
    name: string; phone: string; email?: string;
    consultationType: string; preferredContact: string; preferredTime: string;
    budgetRange?: string; message: string; privacyConsent: boolean;
  }) => {
    if (USE_MOCK) {
      await mockDelay(500);
      return mockRes({ id: Date.now(), ...data, status: 'PENDING', createdAt: new Date().toISOString() });
    }
    return api.post('/inquiries', { ...data, customerName: data.name, customerPhone: data.phone, customerEmail: data.email });
  },
};

// ===== Upload API =====
export const uploadApi = {
  uploadImage: async (file: File) => {
    if (USE_MOCK) {
      await mockDelay(500);
      return mockRes({ url: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400', filename: file.name, size: file.size });
    }
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/upload/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  uploadVideo: async (file: File) => {
    if (USE_MOCK) {
      await mockDelay(500);
      return mockRes({ url: URL.createObjectURL(file), filename: file.name, size: file.size });
    }
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/upload/video', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },
};

// ===== Homepage API =====
export const homepageApi = {
  getConfig: async () => {
    if (USE_MOCK) { await mockDelay(300); return mockRes(mockHomepageConfig.filter((section) => section.isEnabled)); }
    return api.get('/homepage/config');
  },
  getAdminConfig: async () => {
    if (USE_MOCK) { await mockDelay(300); return mockRes([...mockHomepageConfig]); }
    return api.get('/homepage/admin/config');
  },
  updateConfig: async (sections: any[]) => {
    if (USE_MOCK) {
      await mockDelay(500);
      // Update local mock data — deep clone to avoid mutating original
      const cloned = JSON.parse(JSON.stringify(mockHomepageConfig));
      sections.forEach((s, index) => {
        const idx = cloned.findIndex((m: any) => m.id === s.id);
        if (idx >= 0) Object.assign(cloned[idx], s, { sortOrder: index + 1 });
        else cloned.push({ ...s, id: Date.now() + index, sortOrder: index + 1 });
      });
      // Replace array contents
      mockHomepageConfig.length = 0;
      mockHomepageConfig.push(...cloned);
      return mockRes([...mockHomepageConfig]);
    }
    return api.put('/homepage/config', { sections });
  },
  createSection: async (data: any) => {
    if (USE_MOCK) {
      await mockDelay(300);
      const newSection = { ...data, id: Date.now() };
      const cloned = JSON.parse(JSON.stringify(mockHomepageConfig));
      cloned.push(newSection);
      mockHomepageConfig.length = 0;
      mockHomepageConfig.push(...cloned);
      return mockRes(newSection);
    }
    return api.post('/homepage/section', data);
  },
  deleteSection: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(300);
      const cloned = JSON.parse(JSON.stringify(mockHomepageConfig));
      const idx = cloned.findIndex((m: any) => m.id === id);
      if (idx >= 0) cloned.splice(idx, 1);
      mockHomepageConfig.length = 0;
      mockHomepageConfig.push(...cloned);
      return mockRes({ success: true });
    }
    return api.delete(`/homepage/section/${id}`);
  },
};

export const contentSlotsApi = {
  getPublished: async (pageKey = 'home') => {
    return api.get('/content-slots/published', { params: { pageKey } });
  },
  getAdminAll: async (pageKey = 'home') => {
    return api.get('/content-slots/admin', { params: { pageKey } });
  },
  saveDraft: async (data: any) => {
    return api.put('/content-slots/draft', data);
  },
  publish: async (slotKey: string) => {
    return api.put(`/content-slots/${slotKey}/publish`);
  },
  publishAll: async (pageKey = 'home') => {
    return api.put('/content-slots/publish-all', { pageKey });
  },
  unpublish: async (slotKey: string) => {
    return api.put(`/content-slots/${slotKey}/unpublish`);
  },
};

// ===== Page Modules Mock Store =====
const _mockPageModules: Record<string, any[]> = {};

function _getMockModules(pageKey: string) {
  if (!_mockPageModules[pageKey]) {
    // 初始化默认模块：Hero + 双海报
    _mockPageModules[pageKey] = [
      {
        id: 1001, pageKey, moduleType: 'hero', sortOrder: 1, isVisible: true, status: 'PUBLISHED',
        content: {
          title: '东方之形，\n自有光华。',
          subtitle: 'CAMPAIGN / 01',
          description: '',
          desktopImage: '/images/editorial/hero-gold-bangle-v1.png',
          mobileImage: '/images/editorial/hero-gold-bangle-mobile-v1.webp',
          actionText: 'EXPLORE THE COLLECTION',
          linkUrl: '/products',
          altText: '海川珠宝 Hero',
        },
        layoutConfig: { template: 'overlay', textPosition: 'overlay', desktopColumns: '12' },
        styleConfig: { focusX: 50, focusY: 50, textColor: '#fff', spacing: 'normal', animation: 'fadeUp' },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      {
        id: 1002, pageKey, moduleType: 'doublePoster', sortOrder: 2, isVisible: true, status: 'PUBLISHED',
        content: {
          mainImage: '/images/editorial/poster-gold-ring-v1.png',
          detailImage: '/images/editorial/poster-gold-pendant-v1.png',
          title: '金环有序',
          subtitle: '02 / FORM',
          description: '线条、比例与轮廓的共同表达。',
          linkUrl: '/products?categoryId=17',
          number: '02', label: 'FORM',
        },
        layoutConfig: { template: 'leftBigRightSmall', desktopColumns: '8-4' },
        styleConfig: { mainFocusX: 50, mainFocusY: 50, detailFocusX: 50, detailFocusY: 50, spacing: 'normal', animation: 'fadeUp' },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    ];
  }
  return _mockPageModules[pageKey];
}

export const pageModulesApi = {
  getPublished: async (pageKey = 'home') => {
    if (USE_MOCK) {
      await mockDelay();
      const all = _getMockModules(pageKey);
      return mockRes(all.filter((m: any) => m.status === 'PUBLISHED'));
    }
    return api.get('/page-modules/published', { params: { pageKey } });
  },
  getAdminAll: async (pageKey = 'home') => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(_getMockModules(pageKey));
    }
    return api.get('/page-modules/admin', { params: { pageKey } });
  },
  saveDraft: async (data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const modules = _getMockModules(data.pageKey || 'home');
      const idx = modules.findIndex((m: any) => m.id === data.id);
      const now = new Date().toISOString();
      const module = {
        ...data,
        status: 'DRAFT' as const,
        updatedAt: now,
      };
      if (idx >= 0) {
        // 更新已有模块
        modules[idx] = { ...modules[idx], ...module };
      } else {
        // 新增模块
        module.id = Date.now();
        module.createdAt = now;
        module.sortOrder = data.sortOrder ?? modules.length + 1;
        modules.push(module);
      }
      return mockRes(module);
    }
    return api.put('/page-modules/draft', data);
  },
  reorder: async (items: { id: number; sortOrder: number }[]) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const modules = _getMockModules('home');
      for (const item of items) {
        const m = modules.find((x: any) => x.id === item.id);
        if (m) m.sortOrder = item.sortOrder;
      }
      modules.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
      return mockRes({ success: true });
    }
    return api.put('/page-modules/reorder', { items });
  },
  toggleVisibility: async (id: number, isVisible: boolean) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const modules = _getMockModules('home');
      const m = modules.find((x: any) => x.id === id);
      if (m) m.isVisible = isVisible;
      return mockRes(m);
    }
    return api.put(`/page-modules/${id}/toggle`, { isVisible });
  },
  duplicate: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const modules = _getMockModules('home');
      const src = modules.find((x: any) => x.id === id);
      if (!src) throw new Error('模块不存在');
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = Date.now();
      copy.status = 'DRAFT';
      copy.sortOrder = modules.length + 1;
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = new Date().toISOString();
      modules.push(copy);
      return mockRes(copy);
    }
    return api.post(`/page-modules/${id}/duplicate`);
  },
  remove: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const modules = _getMockModules('home');
      const idx = modules.findIndex((x: any) => x.id === id);
      if (idx >= 0) modules.splice(idx, 1);
      return mockRes({ success: true });
    }
    return api.delete(`/page-modules/${id}`);
  },
  publish: async (pageKey = 'home') => {
    if (USE_MOCK) {
      await mockDelay(300);
      const modules = _getMockModules(pageKey);
      for (const m of modules) {
        if (m.status === 'DRAFT') m.status = 'PUBLISHED';
      }
      return mockRes({ success: true });
    }
    return api.put('/page-modules/publish', { pageKey });
  },
};

export default api;

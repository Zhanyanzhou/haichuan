import { useCallback, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as AntdApp, Alert, Button, Card, Checkbox, Descriptions, Image, Input, Modal, Pagination, Popconfirm, Select, Space, Table, Tabs, Tag, Upload } from 'antd';
import type { TableColumnsType, UploadProps } from 'antd';
import { PictureOutlined, FileImageOutlined, DeleteOutlined, LinkOutlined, SafetyCertificateOutlined, UploadOutlined, UndoOutlined } from '@ant-design/icons';
import { productApi, uploadApi } from '@/services/api';
import type {
  MediaAssetSourceType,
  MediaAuthorizationImpactPreview,
  MediaAuthorizationResource,
  PageMediaAsset,
  SaveMediaAuthorizationDraftInput,
  StoredPageMediaAsset,
} from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';
import AdminPageHeader from '@/components/common/AdminPageHeader';
import { AdminLoadingState, AdminEmptyState, AdminErrorState } from '@/components/common/AdminDataStates';
import type { PaginatedResult } from '@/types';
import { SecureImage } from '@/components/common/SecureImage';
import { readPageMediaLibrary, writePageMediaLibrary } from '@/page-builder/fields/pageMediaLibrary';
import { useAuthStore } from '@/store/authStore';

type ProductMediaRow = {
  id: number;
  productId: number;
  mediaUrl?: string | null;
  productName?: string | null;
  productCode?: string | null;
  productStatus?: string | null;
  mediaAssetId?: number | null;
  authorization?: PageMediaAsset['authorization'];
  publicEligibility?: PageMediaAsset['publicEligibility'];
  type?: string | null;
  sortOrder?: number | null;
};

const PAGE_MEDIA_PAGE_SIZE = 24;
const PROJECTION_PAGE_SIZE = 100;

const SOURCE_TYPE_OPTIONS: Array<{ value: MediaAssetSourceType; label: string }> = [
  { value: 'BRAND_OWNED', label: '品牌自有' },
  { value: 'COMMISSIONED', label: '委托创作' },
  { value: 'LICENSED_THIRD_PARTY', label: '第三方授权' },
  { value: 'PUBLIC_DOMAIN', label: '公有领域' },
  { value: 'CUSTOMER_SUPPLIED', label: '客户提供' },
  { value: 'AI_GENERATED', label: 'AI 生成' },
  { value: 'LEGACY_UNVERIFIED', label: '旧素材待核验' },
  { value: 'OTHER', label: '其他' },
];

const REVIEW_STATUS_LABELS = {
  DRAFT: '草稿',
  IN_REVIEW: '待审核',
  APPROVED: '已批准',
  REJECTED: '审核未通过',
} as const;

type AuthorizationDraft = Omit<SaveMediaAuthorizationDraftInput, 'expectedRevision'>;

function toDatetimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getAuthorizationDisplay(item: PageMediaAsset) {
  if (item.publicEligibility?.eligible) return { color: 'success', label: '已批准公开' } as const;
  if (item.authorization?.revocationStatus === 'REVOKED') return { color: 'error', label: '已撤权' } as const;
  const reviewStatus = item.authorization?.reviewStatus;
  if (!reviewStatus) return { color: 'default', label: '待登记' } as const;
  const color = reviewStatus === 'IN_REVIEW'
    ? 'warning'
    : reviewStatus === 'REJECTED'
      ? 'error'
      : reviewStatus === 'APPROVED'
        ? 'warning'
        : 'default';
  return { color, label: REVIEW_STATUS_LABELS[reviewStatus] } as const;
}

export default function MediaLibrary() {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const canEditAuthorization = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'EDITOR';
  const canManagePageMedia = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [images, setImages] = useState<ProductMediaRow[]>([]);
  const [productMediaPage, setProductMediaPage] = useState(1);
  const [productMediaTotal, setProductMediaTotal] = useState(0);
  const [tab, setTab] = useState('pages');
  const [pageMedia, setPageMedia] = useState<PageMediaAsset[]>([]);
  const [pageMediaLoading, setPageMediaLoading] = useState(true);
  const [pageMediaError, setPageMediaError] = useState('');
  const [pageMediaPage, setPageMediaPage] = useState(1);
  const [pageMediaTotal, setPageMediaTotal] = useState(0);
  const [mediaKeyword, setMediaKeyword] = useState('');
  const [mediaType, setMediaType] = useState<'all' | 'image' | 'video'>('all');
  const [mediaStatus, setMediaStatus] = useState<'ready' | 'archived' | 'quarantined'>('ready');
  const [preview, setPreview] = useState<{ url: string; type: 'image' | 'video'; name: string } | null>(null);
  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const [authorizationLoading, setAuthorizationLoading] = useState(false);
  const [authorizationSaving, setAuthorizationSaving] = useState(false);
  const [authorizationResource, setAuthorizationResource] = useState<MediaAuthorizationResource | null>(null);
  const [authorizationImpact, setAuthorizationImpact] = useState<MediaAuthorizationImpactPreview | null>(null);
  const [authorizationDraft, setAuthorizationDraft] = useState<AuthorizationDraft>({
    sourceType: 'LEGACY_UNVERIFIED',
    authorizationBasis: '',
    evidenceReference: '',
    publicWebUseAllowed: false,
    validFrom: null,
    validUntil: null,
  });
  const [reviewNote, setReviewNote] = useState('');
  const [revocationReason, setRevocationReason] = useState('');
  const pageMediaRequestId = useRef(0);
  const pageMediaRetryPage = useRef(1);
  const currentAuthorization = authorizationResource?.authorization;
  const canSaveAuthorizationDraft = canEditAuthorization && (
    !currentAuthorization
    || currentAuthorization.reviewStatus === 'DRAFT'
    || currentAuthorization.reviewStatus === 'REJECTED'
  );
  const canRenewAuthorization = canManagePageMedia
    && currentAuthorization?.reviewStatus === 'APPROVED'
    && currentAuthorization.revocationStatus === 'ACTIVE';

  const fetchReadyProjection = useCallback(async () => {
    const readProjectionPass = async () => {
      const seen = new Map<number, PageMediaAsset>();
      let nextPage = 1;
      let total = 0;
      do {
        const response = await uploadApi.listPageMedia({
          page: nextPage,
          pageSize: PROJECTION_PAGE_SIZE,
          status: 'READY',
        });
        const data = unwrapResponse<{ list: PageMediaAsset[]; total: number }>(response);
        const batch = data?.list || [];
        total = data?.total || 0;
        batch.forEach((item) => seen.set(item.id, item));
        nextPage += 1;
        if (batch.length === 0) break;
      } while ((nextPage - 1) * PROJECTION_PAGE_SIZE < total);
      return {
        total,
        complete: seen.size === total,
        signature: [...seen.keys()].join(','),
        items: [...seen.values()].filter((item) => item.available),
      };
    };

    // offset 分页期间素材可能增删；连续两次完整扫描必须得到相同 ID 序列才写入投影。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const first = await readProjectionPass();
      const second = await readProjectionPass();
      if (
        first.complete && second.complete &&
        first.total === second.total && first.signature === second.signature
      ) {
        return second.items;
      }
    }
    throw new Error('素材库在同步期间发生变化，请重新加载');
  }, []);

  const loadPageMedia = useCallback(async (page = 1) => {
    const requestId = ++pageMediaRequestId.current;
    pageMediaRetryPage.current = page;
    setPageMediaLoading(true);
    setPageMediaError('');
    try {
      const requestedStatus = mediaStatus === 'ready'
        ? 'READY'
        : mediaStatus === 'archived'
          ? 'ARCHIVED'
          : 'QUARANTINED';
      const [response, readyProjection] = await Promise.all([
        uploadApi.listPageMedia({
          page,
          pageSize: PAGE_MEDIA_PAGE_SIZE,
          type: mediaType === 'all' ? undefined : mediaType,
          status: requestedStatus,
          keyword: mediaKeyword.trim() || undefined,
        }),
        fetchReadyProjection(),
      ]);
      let data = unwrapResponse<{ list: PageMediaAsset[]; total: number; page: number }>(response);
      if (requestId !== pageMediaRequestId.current) return;
      if ((data?.list?.length || 0) === 0 && (data?.total || 0) > 0 && page > 1) {
        const lastPage = Math.max(1, Math.ceil((data?.total || 0) / PAGE_MEDIA_PAGE_SIZE));
        if (lastPage < page) {
          const fallbackResponse = await uploadApi.listPageMedia({
            page: lastPage,
            pageSize: PAGE_MEDIA_PAGE_SIZE,
            type: mediaType === 'all' ? undefined : mediaType,
            status: requestedStatus,
            keyword: mediaKeyword.trim() || undefined,
          });
          if (requestId !== pageMediaRequestId.current) return;
          data = unwrapResponse<{ list: PageMediaAsset[]; total: number; page: number }>(fallbackResponse);
        }
      }
      setPageMedia(data?.list || []);
      setPageMediaTotal(data?.total || 0);
      setPageMediaPage(data?.page || page);
      // 兼容现有装修选择器：服务端是真实索引，本地只保留当前可用素材的投影。
      const projectionStored = writePageMediaLibrary(readyProjection
        .map(({ url, type, name, createdAt }) => ({ url, type, name, createdAt })));
      if (!projectionStored) {
        message.warning('媒体库已加载，但浏览器无法同步装修素材投影；请允许站点存储后重试。');
      }
    } catch (loadError: unknown) {
      if (requestId !== pageMediaRequestId.current) return;
      setPageMedia([]);
      setPageMediaTotal(0);
      writePageMediaLibrary([]);
      setPageMediaError(getSafeAdminErrorMessage(loadError, '页面素材加载失败，请稍后重新加载。'));
    } finally {
      if (requestId === pageMediaRequestId.current) setPageMediaLoading(false);
    }
  }, [fetchReadyProjection, mediaKeyword, mediaStatus, mediaType, message]);

  useEffect(() => {
    if (tab === 'pages') void loadPageMedia(1);
  }, [tab, loadPageMedia]);

  const applyAuthorizationResource = (resource: MediaAuthorizationResource) => {
    setAuthorizationResource(resource);
    setPageMedia((current) => current.map((item) => (
      item.id === resource.asset.id
        ? {
            ...item,
            ...resource.asset,
            authorization: resource.authorization,
            publicEligibility: resource.publicEligibility,
          }
        : item
    )));
    const authorization = resource.authorization;
    setAuthorizationDraft({
      sourceType: authorization?.sourceType ?? 'LEGACY_UNVERIFIED',
      authorizationBasis: authorization?.authorizationBasis ?? resource.proof?.authorizationBasis ?? '',
      evidenceReference: authorization?.evidenceReference ?? resource.proof?.evidenceReference ?? '',
      publicWebUseAllowed: authorization?.publicWebUseAllowed ?? false,
      validFrom: toDatetimeLocal(authorization?.validFrom),
      validUntil: toDatetimeLocal(authorization?.validUntil),
    });
  };

  const openAuthorization = async (item: Pick<PageMediaAsset, 'id'>) => {
    setAuthorizationOpen(true);
    setAuthorizationLoading(true);
    setAuthorizationResource(null);
    setAuthorizationImpact(null);
    setReviewNote('');
    setRevocationReason('');
    try {
      const [detailResponse, impactResponse] = await Promise.all([
        uploadApi.getMediaAuthorization(item.id),
        uploadApi.previewMediaAuthorizationImpact([item.id]),
      ]);
      const resource = unwrapResponse<MediaAuthorizationResource>(detailResponse);
      if (!resource?.asset) throw new Error('素材授权详情无效');
      applyAuthorizationResource(resource);
      setAuthorizationImpact(unwrapResponse<MediaAuthorizationImpactPreview>(impactResponse));
    } catch (detailError: unknown) {
      message.error(getSafeAdminErrorMessage(detailError, '素材授权详情加载失败，请稍后重试。'));
    } finally {
      setAuthorizationLoading(false);
    }
  };

  const saveAuthorizationDraft = async () => {
    const assetId = authorizationResource?.asset.id;
    if (!assetId || authorizationSaving) return;
    setAuthorizationSaving(true);
    try {
      const response = await uploadApi.saveMediaAuthorizationDraft(assetId, {
        ...authorizationDraft,
        expectedRevision: authorizationResource.authorization?.revision ?? 0,
        authorizationBasis: authorizationDraft.authorizationBasis?.trim(),
        evidenceReference: authorizationDraft.evidenceReference?.trim(),
        validFrom: toIsoOrNull(String(authorizationDraft.validFrom ?? '')),
        validUntil: toIsoOrNull(String(authorizationDraft.validUntil ?? '')),
      });
      const resource = unwrapResponse<MediaAuthorizationResource>(response);
      if (!resource?.asset) throw new Error('素材授权保存结果无效');
      applyAuthorizationResource(resource);
      message.success('素材授权草稿已保存');
    } catch (saveError: unknown) {
      message.error(getSafeAdminErrorMessage(saveError, '素材授权保存失败，请重新加载后再试。'));
    } finally {
      setAuthorizationSaving(false);
    }
  };

  const runAuthorizationAction = async (
    successMessage: string,
    action: (assetId: number, expectedRevision: number) => Promise<unknown>,
  ) => {
    const assetId = authorizationResource?.asset.id;
    const revision = authorizationResource?.authorization?.revision;
    if (!assetId || revision == null || authorizationSaving) return;
    setAuthorizationSaving(true);
    try {
      const response = await action(assetId, revision);
      const resource = unwrapResponse<MediaAuthorizationResource>(response);
      if (!resource?.asset) throw new Error('素材授权操作结果无效');
      applyAuthorizationResource(resource);
      message.success(successMessage);
    } catch (actionError: unknown) {
      message.error(getSafeAdminErrorMessage(actionError, '素材授权状态更新失败，请重新加载后再试。'));
    } finally {
      setAuthorizationSaving(false);
    }
  };

  const handleUpload = async (
    options: Parameters<NonNullable<UploadProps['customRequest']>>[0],
    type: 'image' | 'video',
  ) => {
    const { file, onSuccess, onError } = options;
    try {
      const res = type === 'image'
        ? await uploadApi.uploadImage(file as File)
        : await uploadApi.uploadVideo(file as File);
      const stored = unwrapResponse<StoredPageMediaAsset>(res);
      if (!stored?.url) throw new Error('上传失败');
      if (mediaStatus !== 'ready') setMediaStatus('ready');
      else await loadPageMedia(1);
      message.success(stored.deduplicated ? '已使用素材库中的相同文件' : '素材已上传；请在公开使用前完成授权审核');
      onSuccess?.(stored.url);
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, '素材上传失败，请检查文件格式和网络后重试。'));
      onError?.(error instanceof Error ? error : new Error('素材上传失败'));
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      message.success('链接已复制');
    } catch {
      message.warning('复制失败，请手动复制');
    }
  };

  const archiveMedia = async (item: PageMediaAsset) => {
    try {
      await uploadApi.archivePageMedia(item.id);
      pageMediaRequestId.current += 1;
      if (preview?.url === item.url) setPreview(null);
      if (!writePageMediaLibrary(readPageMediaLibrary().filter((entry) => entry.url !== item.url))) {
        message.warning('素材已归档，但浏览器装修投影未能更新；请允许站点存储并重新加载。');
      }
      setPageMedia((current) => current.filter((entry) => entry.id !== item.id));
      setPageMediaTotal((current) => Math.max(0, current - 1));
      const remainingTotal = Math.max(0, pageMediaTotal - 1);
      const targetPage = Math.min(pageMediaPage, Math.max(1, Math.ceil(remainingTotal / PAGE_MEDIA_PAGE_SIZE)));
      await loadPageMedia(targetPage);
      message.success('素材已归档，公开地址已停止访问');
    } catch (archiveError: unknown) {
      message.error(getSafeAdminErrorMessage(archiveError, '素材归档失败，请重新加载后重试。'));
    }
  };

  const restoreMedia = async (item: PageMediaAsset) => {
    try {
      await uploadApi.restorePageMedia(item.id);
      const remainingTotal = Math.max(0, pageMediaTotal - 1);
      const targetPage = Math.min(pageMediaPage, Math.max(1, Math.ceil(remainingTotal / PAGE_MEDIA_PAGE_SIZE)));
      await loadPageMedia(targetPage);
      message.success('素材文件已恢复；公开使用仍需有效授权并重新发布页面');
    } catch (restoreError: unknown) {
      message.error(getSafeAdminErrorMessage(restoreError, '素材恢复失败；文件可能已缺失，请重新上传。'));
    }
  };

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const res = await productApi.getMediaList({ page, pageSize: 50 });
      const data = unwrapResponse<PaginatedResult<ProductMediaRow>>(res);
      setImages(data?.list || []);
      setProductMediaTotal(data?.total || 0);
      setProductMediaPage(page);
    } catch (error: unknown) { setError(getSafeAdminErrorMessage(error, '商品图片加载失败，请稍后重新加载。')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'products') load();
  }, [tab, load]);

  const handleDelete = async (img: ProductMediaRow) => {
    try {
      await productApi.deleteImage(img.productId, img.id);
      message.success('商品图片已删除');
      load(productMediaPage);
    } catch (error) { message.error(getSafeAdminErrorMessage(error, '素材删除失败，请重新加载后重试。')); }
  };

  const columns: TableColumnsType<ProductMediaRow> = [
    { title: '缩略图', dataIndex: 'mediaUrl', width: 80, render: (v: string) => v ? <SecureImage src={v} tokenKind="staff" deferUntilVisible alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : <FileImageOutlined style={{ fontSize: 24, color: 'var(--adm-subtle)' }} /> },
    { title: '所属产品', render: (_, row) => <div><Button type="link" size="small" style={{ padding: 0, height: 'auto', color: 'var(--adm-action)' }} onClick={() => navigate(`/admin/products/${row.productId}/edit`)}>{row.productName || '—'}</Button><p style={{ fontSize: 13, lineHeight: '20px', color: 'var(--adm-text)', fontVariantNumeric: 'tabular-nums' }}>{row.productCode}</p></div> },
    { title: '类型', dataIndex: 'type', render: (v: string) => <Tag>{v || 'FRONT'}</Tag> },
    { title: '排序', dataIndex: 'sortOrder', width: 60 },
    { title: '授权', width: 120, render: (_, row) => row.mediaAssetId ? (
      <Tag color={row.publicEligibility?.eligible ? 'success' : row.authorization?.revocationStatus === 'REVOKED' ? 'error' : 'warning'}>
        {row.publicEligibility?.eligible ? '已批准公开' : row.authorization?.revocationStatus === 'REVOKED' ? '已撤权' : '阻止公开'}
      </Tag>
    ) : <Tag color="error">旧图待迁移</Tag> },
    { title: '操作', width: 210, render: (_, row) => (
      <Space size={4} wrap>
        {row.mediaAssetId ? <Button type="link" size="small" icon={<SafetyCertificateOutlined />} onClick={() => void openAuthorization({ id: row.mediaAssetId! })}>登记授权</Button> : null}
        {(canManagePageMedia || row.productStatus === 'DRAFT') ? (
          <Popconfirm title="删除这张商品图片？" description="删除后需要重新上传才能恢复。" okText="删除图片" cancelText="取消" onConfirm={() => handleDelete(row)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除图片</Button>
          </Popconfirm>
        ) : null}
      </Space>
    )},
  ];

  return (
    <div>
      <AdminPageHeader
        title="页面素材库"
        subtitle="页面与商品图片统一登记授权；未登记、未批准、已撤权或已过期的素材不能支持作品公开"
      />
      <Card style={{ borderRadius: 10, border: '1px solid var(--adm-line)', boxShadow: '0 6px 20px rgba(24,26,27,0.035)' }}>
        <Tabs activeKey={tab} onChange={setTab} items={[
          {
            key: 'pages', label: <span><FileImageOutlined /> 页面素材</span>,
            children: (
              <div>
                <Space style={{ marginBottom: 16 }} wrap>
                  <Upload accept="image/*" multiple showUploadList={false} customRequest={(o) => handleUpload(o, 'image')}>
                    <Button icon={<UploadOutlined />}>上传图片</Button>
                  </Upload>
                  <Upload accept="video/*" multiple showUploadList={false} customRequest={(o) => handleUpload(o, 'video')}>
                    <Button icon={<UploadOutlined />}>上传视频</Button>
                  </Upload>
                  <Button type="primary" onClick={() => navigate('/admin/editor/home')}>
                    进入首页装修
                  </Button>
                  <span style={{ color: 'var(--adm-muted)', fontSize: 12, lineHeight: '18px' }}>
                    当前筛选共 {pageMediaTotal} 个素材
                  </span>
                </Space>
                <Space style={{ marginBottom: 16 }} wrap>
                  <Input.Search
                    allowClear
                    placeholder="按文件名搜索"
                    style={{ width: 240 }}
                    onChange={(e) => setMediaKeyword(e.target.value)}
                    aria-label="按文件名搜索页面素材"
                  />
                  <Select value={mediaType} onChange={setMediaType} style={{ width: 120 }}
                    aria-label="素材类型"
                    options={[
                      { value: 'all', label: '全部类型' },
                      { value: 'image', label: '图片' },
                      { value: 'video', label: '视频' },
                    ]} />
                  <Select value={mediaStatus} onChange={setMediaStatus} style={{ width: 120 }}
                    aria-label="素材状态"
                    options={[
                      { value: 'ready', label: '可用素材' },
                      { value: 'archived', label: '已归档' },
                      { value: 'quarantined', label: '已隔离' },
                    ]} />
                </Space>
                {pageMediaLoading ? (
                  <AdminLoadingState subject="页面素材" />
                ) : pageMediaError ? (
                  <AdminErrorState message={pageMediaError} onRetry={() => void loadPageMedia(pageMediaRetryPage.current)} />
                ) : pageMedia.length === 0 ? (
                  <AdminEmptyState
                    subject="页面素材"
                    kind={mediaKeyword || mediaType !== 'all' ? 'filtered' : 'initial'}
                    message={mediaStatus === 'archived'
                      ? '暂无已归档页面素材'
                      : mediaStatus === 'quarantined'
                        ? '暂无因完整性异常而隔离的页面素材'
                        : '暂无页面素材；上传后可在装修中选择并引用'}
                  />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                    {pageMedia.map((m) => (
                      <div key={m.id} style={{ border: '1px solid var(--adm-line)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                        {m.status === 'READY' && m.available && m.type === 'image' ? (
                          <button type="button" aria-label={`预览 ${m.name}`} onClick={() => setPreview(m)} style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
                            <Image src={m.url} alt="" width="100%" height={120} style={{ objectFit: 'cover', display: 'block' }} preview={false} />
                          </button>
                        ) : m.status === 'READY' && m.available ? (
                          <button type="button" aria-label={`预览 ${m.name}`} onClick={() => setPreview(m)} style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
                            <video aria-hidden="true" src={m.url} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                          </button>
                        ) : (
                          <div role="status" style={{ height: 120, display: 'grid', placeItems: 'center', padding: 12, textAlign: 'center', color: 'var(--adm-muted)', background: 'var(--adm-surface-muted, #F4F5F5)' }}>
                            {m.status === 'ARCHIVED'
                              ? '已归档，公开地址不可访问'
                              : m.status === 'QUARANTINED'
                                ? '已隔离，文件完整性校验异常'
                                : '文件缺失，请归档或重新上传'}
                          </div>
                        )}
                        <div style={{ padding: 8 }}>
                          <p style={{ fontSize: 12, margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>{m.name}</p>
                          <Tag color={getAuthorizationDisplay(m).color} style={{ marginBottom: 6 }}>
                            {getAuthorizationDisplay(m).label}
                          </Tag>
                          {m.status === 'READY' ? (
                            <Space size={0} wrap>
                              <Button
                                size="small"
                                type="link"
                                icon={<LinkOutlined />}
                                disabled={!m.available || !m.publicUrl}
                                onClick={() => m.publicUrl && copyUrl(m.publicUrl)}
                              >
                                复制公开链接
                              </Button>
                              {canEditAuthorization ? (
                                <Button size="small" type="link" icon={<SafetyCertificateOutlined />} onClick={() => void openAuthorization(m)}>
                                  登记授权
                                </Button>
                              ) : null}
                              {canManagePageMedia ? (
                                <Popconfirm
                                  title="归档这个页面素材？"
                                  description="公开地址会立即停止访问；引用它的草稿需改用其他素材。"
                                  okText="归档素材"
                                  cancelText="取消"
                                  onConfirm={() => archiveMedia(m)}
                                >
                                  <Button size="small" type="link" danger icon={<DeleteOutlined />}>归档</Button>
                                </Popconfirm>
                              ) : null}
                            </Space>
                          ) : (
                            <Space size={0} wrap>
                              {canEditAuthorization ? (
                                <Button size="small" type="link" icon={<SafetyCertificateOutlined />} onClick={() => void openAuthorization(m)}>
                                  查看授权
                                </Button>
                              ) : null}
                              {canManagePageMedia && m.status === 'ARCHIVED' ? (
                                <Button size="small" type="link" icon={<UndoOutlined />} onClick={() => restoreMedia(m)}>恢复素材</Button>
                              ) : null}
                            </Space>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!pageMediaLoading && !pageMediaError && pageMediaTotal > PAGE_MEDIA_PAGE_SIZE ? (
                  <Pagination
                    current={pageMediaPage}
                    pageSize={PAGE_MEDIA_PAGE_SIZE}
                    total={pageMediaTotal}
                    showSizeChanger={false}
                    showTotal={(total) => `共 ${total} 个`}
                    onChange={(page) => void loadPageMedia(page)}
                    style={{ marginTop: 16, textAlign: 'right' }}
                  />
                ) : null}
              </div>
            ),
          },
          {
            key: 'products', label: <span><PictureOutlined /> 商品图片</span>,
            children: loading ? <AdminLoadingState subject="商品图片" /> :
              error ? <AdminErrorState message={error} onRetry={load} /> :
                images.length === 0 ? <AdminEmptyState message="暂无商品图片" /> :
                  <Table dataSource={images} rowKey="id" columns={columns} size="middle"
                    pagination={{ current: productMediaPage, pageSize: 50, total: productMediaTotal, showSizeChanger: false, onChange: (page) => void load(page), showTotal: t => `共 ${t} 张` }} />,
          },
        ]} />
      </Card>

      {/* 素材预览 */}
      <Modal open={!!preview} footer={null} onCancel={() => setPreview(null)} width={720} title={preview?.name || '预览'}>
        {preview && (preview.type === 'image'
          ? <Image src={preview.url} width="100%" style={{ objectFit: 'contain' }} />
          : <video src={preview.url} controls style={{ width: '100%', maxHeight: '60vh', display: 'block' }} />
        )}
      </Modal>

      <Modal
        open={authorizationOpen}
        title={authorizationResource ? `素材授权 · ${authorizationResource.asset.name}` : '素材授权'}
        width={760}
        confirmLoading={authorizationSaving}
        onCancel={() => {
          if (!authorizationSaving) setAuthorizationOpen(false);
        }}
        footer={null}
      >
        {authorizationLoading ? (
          <AdminLoadingState subject="素材授权详情" />
        ) : !authorizationResource ? (
          <AdminErrorState message="素材授权详情加载失败，请关闭后重试。" />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type={authorizationResource.publicEligibility.eligible ? 'success' : 'warning'}
              showIcon
              message={authorizationResource.publicEligibility.eligible ? '当前素材已具备公开资格' : '当前素材不能公开使用'}
              description={authorizationResource.publicEligibility.eligible
                ? '模板和页面发布仍会按实际引用重新检查，并记录当时的授权代数。'
                : `发现 ${authorizationResource.publicEligibility.reasons.length || 1} 项阻断。素材仍可在后台预览并保存到草稿。`}
            />
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="审核状态">
                {authorizationResource.authorization
                  ? REVIEW_STATUS_LABELS[authorizationResource.authorization.reviewStatus]
                  : '待登记'}
              </Descriptions.Item>
              <Descriptions.Item label="撤权状态">
                {authorizationResource.authorization?.revocationStatus === 'REVOKED' ? '已撤权' : '有效'}
              </Descriptions.Item>
              <Descriptions.Item label="授权修订">
                {authorizationResource.authorization?.revision ?? 0}
              </Descriptions.Item>
              <Descriptions.Item label="公开授权代数">
                {authorizationResource.authorization?.publicUseEpoch ?? 0}
              </Descriptions.Item>
            </Descriptions>

            <div>
              <label htmlFor="media-authorization-source-type">素材来源</label>
              <Select
                id="media-authorization-source-type"
                value={authorizationDraft.sourceType}
                options={SOURCE_TYPE_OPTIONS}
                onChange={(sourceType) => setAuthorizationDraft((current) => ({ ...current, sourceType }))}
                style={{ width: '100%', marginTop: 6 }}
                disabled={!canSaveAuthorizationDraft || authorizationSaving}
              />
            </div>
            <div>
              <label htmlFor="media-authorization-basis">授权依据</label>
              <Input.TextArea
                id="media-authorization-basis"
                value={authorizationDraft.authorizationBasis}
                onChange={(event) => setAuthorizationDraft((current) => ({ ...current, authorizationBasis: event.target.value }))}
                placeholder="说明权利主体、许可范围或品牌自有素材的内部依据"
                maxLength={1000}
                showCount
                autoSize={{ minRows: 3, maxRows: 6 }}
                style={{ marginTop: 6 }}
                disabled={!canSaveAuthorizationDraft || authorizationSaving}
              />
            </div>
            <div>
              <label htmlFor="media-authorization-evidence">证明存档引用</label>
              <Input
                id="media-authorization-evidence"
                value={authorizationDraft.evidenceReference}
                onChange={(event) => setAuthorizationDraft((current) => ({ ...current, evidenceReference: event.target.value }))}
                placeholder="例：内部拍摄任务号或授权文件存档编号"
                maxLength={1000}
                showCount
                style={{ marginTop: 6 }}
                disabled={!(canSaveAuthorizationDraft || canRenewAuthorization) || authorizationSaving}
              />
              <p style={{ margin: '6px 0 0', color: 'var(--adm-muted)', fontSize: 12 }}>
                证明引用、审核备注和内部人员信息只在后台授权详情中显示。
              </p>
            </div>
            <Space wrap size={16}>
              <label>
                生效时间
                <Input
                  type="datetime-local"
                  value={String(authorizationDraft.validFrom ?? '')}
                  onChange={(event) => setAuthorizationDraft((current) => ({ ...current, validFrom: event.target.value }))}
                  style={{ display: 'block', marginTop: 6, width: 220 }}
                  disabled={!canSaveAuthorizationDraft || authorizationSaving}
                />
              </label>
              <label>
                到期时间
                <Input
                  type="datetime-local"
                  value={String(authorizationDraft.validUntil ?? '')}
                  onChange={(event) => setAuthorizationDraft((current) => ({ ...current, validUntil: event.target.value }))}
                  style={{ display: 'block', marginTop: 6, width: 220 }}
                  disabled={!(canSaveAuthorizationDraft || canRenewAuthorization) || authorizationSaving}
                />
              </label>
            </Space>
            <Checkbox
              checked={authorizationDraft.publicWebUseAllowed}
              onChange={(event) => setAuthorizationDraft((current) => ({ ...current, publicWebUseAllowed: event.target.checked }))}
              disabled={!canSaveAuthorizationDraft || authorizationSaving}
            >
              授权范围允许品牌网站公开使用
            </Checkbox>

            {authorizationImpact ? (
              <Alert
                type={authorizationImpact.complete ? 'info' : 'warning'}
                showIcon
                message={`影响预览：${authorizationImpact.summary.publishedAffected} 个已发布页面，${authorizationImpact.summary.draftAffected} 个草稿页面`}
                description={authorizationImpact.complete
                  ? '撤权会立即阻止这些页面继续公开读取；历史修订和发布指针保持不变。'
                  : '页面关系清单尚未完整建立；当前数字不是完整影响范围，撤权仍按安全策略执行。'}
              />
            ) : null}

            {canSaveAuthorizationDraft ? (
              <Space wrap>
                <Button type="primary" loading={authorizationSaving} onClick={() => void saveAuthorizationDraft()}>
                  保存授权草稿
                </Button>
                {authorizationResource.authorization
                  && ['DRAFT', 'REJECTED'].includes(authorizationResource.authorization.reviewStatus) ? (
                    <Button
                      disabled={authorizationSaving}
                      onClick={() => void runAuthorizationAction(
                        '素材授权已提交审核',
                        (assetId, revision) => uploadApi.submitMediaAuthorization(assetId, revision),
                      )}
                    >
                      提交审核
                    </Button>
                  ) : null}
              </Space>
            ) : null}

            {canManagePageMedia && authorizationResource.authorization?.reviewStatus === 'IN_REVIEW' ? (
              <div>
                <label htmlFor="media-authorization-review-note">审核备注（不通过时必填）</label>
                <Input.TextArea
                  id="media-authorization-review-note"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  maxLength={1000}
                  showCount
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  style={{ marginTop: 6 }}
                  disabled={authorizationSaving}
                />
                <Space wrap style={{ marginTop: 8 }}>
                  <Button
                    type="primary"
                    loading={authorizationSaving}
                    onClick={() => void runAuthorizationAction(
                      '素材授权审核已通过',
                      (assetId, revision) => uploadApi.approveMediaAuthorization(assetId, revision, reviewNote.trim() || undefined),
                    )}
                  >
                    通过审核
                  </Button>
                  <Button
                    danger
                    disabled={!reviewNote.trim() || authorizationSaving}
                    onClick={() => void runAuthorizationAction(
                      '素材授权审核未通过',
                      (assetId, revision) => uploadApi.rejectMediaAuthorization(assetId, revision, reviewNote.trim()),
                    )}
                  >
                    不通过
                  </Button>
                </Space>
              </div>
            ) : null}

            {canManagePageMedia
              && authorizationResource.authorization?.reviewStatus === 'APPROVED'
              && authorizationResource.authorization.revocationStatus === 'ACTIVE' ? (
                <div>
                  <label htmlFor="media-authorization-revocation-reason">撤权原因</label>
                  <Input.TextArea
                    id="media-authorization-revocation-reason"
                    value={revocationReason}
                    onChange={(event) => setRevocationReason(event.target.value)}
                    placeholder="说明版权、隐私、安全或授权变化原因"
                    maxLength={1000}
                    showCount
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    style={{ marginTop: 6 }}
                    disabled={authorizationSaving}
                  />
                  <Space wrap style={{ marginTop: 8 }}>
                    <Button
                      disabled={
                        !authorizationDraft.validUntil
                        || !authorizationDraft.evidenceReference?.trim()
                        || authorizationSaving
                      }
                      onClick={() => void runAuthorizationAction(
                        '素材授权已续期；已发布页面仍需重新发布',
                        (assetId, revision) => uploadApi.renewMediaAuthorization(
                          assetId,
                          revision,
                          toIsoOrNull(String(authorizationDraft.validUntil)) || '',
                          authorizationDraft.evidenceReference?.trim(),
                        ),
                      )}
                    >
                      续期
                    </Button>
                    <Button
                      danger
                      disabled={!revocationReason.trim() || authorizationSaving}
                      onClick={() => void runAuthorizationAction(
                        '素材授权已撤回',
                        (assetId, revision) => uploadApi.revokeMediaAuthorization(assetId, revision, revocationReason.trim()),
                      )}
                    >
                      撤回公开授权
                    </Button>
                  </Space>
                </div>
              ) : null}
          </Space>
        )}
      </Modal>
    </div>
  );
}

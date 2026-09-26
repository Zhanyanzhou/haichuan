import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App as AntdApp, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { afterSalesApi, orderApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';
import { useAuthStore } from '@/store/authStore';
import type { AfterSalesCase, AfterSalesStatus, AfterSalesType, Order, PaginatedResult } from '@/types';

const STATUS_META: Record<AfterSalesStatus, { color: string; label: string }> = {
  REQUESTED: { color: 'gold', label: '待审核' },
  APPROVED: { color: 'blue', label: '已通过' },
  REJECTED: { color: 'default', label: '已驳回' },
  RETURNING: { color: 'cyan', label: '逆向物流中' },
  QC_PASSED: { color: 'green', label: '质检通过' },
  QC_FAILED: { color: 'orange', label: '质检不通过' },
  COMPLETED: { color: 'green', label: '已完成' },
  CANCELLED: { color: 'red', label: '已取消' },
};

const TYPE_META: Record<AfterSalesType, { label: string }> = {
  REFUND: { label: '退款退货' },
  EXCHANGE: { label: '换货' },
  REPAIR: { label: '维修' },
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'REQUESTED', label: STATUS_META.REQUESTED.label },
  { key: 'APPROVED', label: STATUS_META.APPROVED.label },
  { key: 'COMPLETED', label: STATUS_META.COMPLETED.label },
  { key: 'REJECTED', label: STATUS_META.REJECTED.label },
];

type AfterSalesListItem = AfterSalesCase & {
  order: { orderNo: string; customerName: string; customerPhone: string; finalAmount: number | string; status: string };
};

type WriteVerification = 'applied' | 'not-applied' | 'unknown';

type AfterSalesCreateAttempt = {
  fingerprint: string;
  key: string;
};

function afterSalesCreateAttemptStorageKey(userId: number) {
  return `hc:admin-after-sales-create-attempt:${userId}`;
}

function readAfterSalesCreateAttempt(storageKey: string): AfterSalesCreateAttempt | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AfterSalesCreateAttempt>;
    return typeof value.fingerprint === 'string' && typeof value.key === 'string'
      ? { fingerprint: value.fingerprint, key: value.key }
      : null;
  } catch {
    return null;
  }
}

function writeAfterSalesCreateAttempt(storageKey: string, attempt: AfterSalesCreateAttempt) {
  try {
    const serialized = JSON.stringify(attempt);
    sessionStorage.setItem(storageKey, serialized);
    return sessionStorage.getItem(storageKey) === serialized;
  } catch {
    return false;
  }
}

function clearAfterSalesCreateAttempt(storageKey: string) {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // 已确认成功、确定拒绝或员工明确放弃后，不让清理失败覆盖业务结果。
  }
}

function createAfterSalesIdempotencyKey() {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `after-sales-admin-${suffix}`;
}

async function hashAfterSalesCreatePayload(payload: object) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

function getHttpErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  const status = candidate.response?.status ?? candidate.status;
  return typeof status === 'number' ? status : null;
}

function isAmbiguousWriteFailure(error: unknown) {
  const status = getHttpErrorStatus(error);
  return status === null || status >= 500;
}

function sameMoney(left: unknown, right: unknown) {
  const leftValue = Number(left);
  const rightValue = Number(right);
  return Number.isFinite(leftValue)
    && Number.isFinite(rightValue)
    && Math.round(leftValue * 100) === Math.round(rightValue * 100);
}

function matchesSubmittedNote(authoritativeNote: string | null | undefined, submittedNote: string) {
  const normalized = submittedNote.trim();
  return !normalized || authoritativeNote?.trim() === normalized;
}

function verifyReviewResult(
  authoritative: AfterSalesListItem,
  originalStatus: AfterSalesStatus,
  action: 'APPROVED' | 'REJECTED',
  approvedRefundAmount: number | undefined,
  adminNote: string,
): WriteVerification {
  const targetStatus = action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  if (authoritative.status === targetStatus) {
    const amountMatches = action !== 'APPROVED'
      || authoritative.type !== 'REFUND'
      || sameMoney(authoritative.approvedRefundAmount, approvedRefundAmount);
    return amountMatches && matchesSubmittedNote(authoritative.adminNote, adminNote)
      ? 'applied'
      : 'unknown';
  }
  return authoritative.status === originalStatus ? 'not-applied' : 'unknown';
}

function verifyStatusResult(
  authoritative: AfterSalesListItem,
  originalStatus: AfterSalesStatus,
  targetStatus: AfterSalesStatus,
  adminNote: string,
): WriteVerification {
  if (authoritative.status === targetStatus) {
    return matchesSubmittedNote(authoritative.adminNote, adminNote) ? 'applied' : 'unknown';
  }
  return authoritative.status === originalStatus ? 'not-applied' : 'unknown';
}

export default function AfterSalesManage() {
  const { message, modal } = AntdApp.useApp();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const userId = useAuthStore((state) => state.user?.id);
  // 与 after-sales.controller 类级 @Roles 一致：客服可登记、审核并推进售后。
  const canManageAfterSales = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'CUSTOMER_SERVICE';
  // 与 refunds.controller 的写接口保持一致：客服可跟进退款，但只有管理员可创建或执行退款。
  const canOperateRefund = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const openRefundCenter = (caseId: number) => {
    navigate(`/admin/trade/refunds?afterSalesCaseId=${caseId}`);
  };

  // 登记售后：按订单号/客户搜索选定订单，自动带出客户与订单商品行，避免手填内部 ID 出错
  const [orderOptions, setOrderOptions] = useState<
    { value: number; label: string; order: Order }[]
  >([]);
  const [orderSearching, setOrderSearching] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const searchOrders = async (kw: string) => {
    if (!kw) { setOrderOptions([]); return; }
    setOrderSearching(true);
    try {
      const res = await orderApi.getList({ keyword: kw, page: 1, pageSize: 10 });
      const data = unwrapResponse<PaginatedResult<Order>>(res);
      setOrderOptions((data?.list || []).map((o) => ({
        value: o.id,
        label: `${o.orderNo} · ${o.customerName || ''} ${o.customerPhone || ''}`.trim(),
        order: o,
      })));
    } catch {
      setOrderOptions([]);
    } finally {
      setOrderSearching(false);
    }
  };

  const selectOrder = (orderId: number) => {
    const opt = orderOptions.find((o) => o.value === orderId);
    setSelectedOrder(opt?.order ?? null);
    createForm.setFieldsValue({
      orderId,
      customerId: opt?.order?.customerId ?? undefined,
      orderItemId: undefined,
    });
  };

  const clearSelectedOrder = () => {
    setSelectedOrder(null);
    setOrderOptions([]);
    createForm.setFieldsValue({ orderId: undefined, customerId: undefined, orderItemId: undefined });
  };

  const [list, setList] = useState<AfterSalesListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const listRequestIdRef = useRef(0);
  const [detail, setDetail] = useState<AfterSalesListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequestIdRef = useRef(0);
  const reviewRequestIdRef = useRef(0);
  const statusRequestIdRef = useRef(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingCreateAttempt, setPendingCreateAttempt] = useState(false);
  const [createAttemptConflict, setCreateAttemptConflict] = useState(false);
  const [createForm] = Form.useForm();
  const load = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await afterSalesApi.getList({
        page, pageSize,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        keyword: keyword || undefined,
      });
      const data = unwrapResponse<PaginatedResult<AfterSalesListItem>>(res);
      if (requestId !== listRequestIdRef.current) return;
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch {
      if (requestId !== listRequestIdRef.current) return;
      setLoadError(true);
      setList([]);
    } finally {
      if (requestId === listRequestIdRef.current) setLoading(false);
    }
  }, [page, pageSize, statusFilter, typeFilter, keyword]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => () => {
    listRequestIdRef.current += 1;
    detailRequestIdRef.current += 1;
    reviewRequestIdRef.current += 1;
    statusRequestIdRef.current += 1;
  }, []);

  const openDetail = async (record: AfterSalesListItem) => {
    const requestId = ++detailRequestIdRef.current;
    setDetail(record);
    setDetailLoading(true);
    try {
      const res = await afterSalesApi.getById(record.id);
      const full = unwrapResponse<AfterSalesListItem>(res);
      if (requestId !== detailRequestIdRef.current) return;
      if (full) setDetail(full);
    } catch (e: unknown) {
      if (requestId !== detailRequestIdRef.current) return;
      // 保留列表快照展示，但明确告知详情刷新失败，可关闭重开重试
      message.error(getSafeAdminErrorMessage(e, '售后详情加载失败，当前展示列表快照，请重新打开重试。'));
    } finally {
      if (requestId === detailRequestIdRef.current) setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    detailRequestIdRef.current += 1;
    setDetailLoading(false);
    setDetail(null);
  };

  const openCreateDialog = () => {
    setCreateAttemptConflict(false);
    setPendingCreateAttempt(
      userId != null
      && readAfterSalesCreateAttempt(afterSalesCreateAttemptStorageKey(userId)) !== null,
    );
    setCreateOpen(true);
  };

  const abandonPendingCreateAttempt = () => {
    if (userId == null) return;
    modal.confirm({
      title: '放弃待确认的售后登记凭据？',
      content: '这不会撤销服务器上可能已经创建的工单。请先刷新并核对售后列表；放弃后，当前表单将被视为一笔新的登记意图。',
      okText: '确认放弃凭据',
      cancelText: '保留凭据',
      okButtonProps: { danger: true },
      onOk: () => {
        clearAfterSalesCreateAttempt(afterSalesCreateAttemptStorageKey(userId));
        setPendingCreateAttempt(false);
        setCreateAttemptConflict(false);
        message.info('待确认凭据已放弃；请再次提交当前内容以创建新的售后登记意图。');
      },
    });
  };

  const handleCreate = async (values: { orderId: number; orderItemId: number; customerId: number; type: AfterSalesType; reason: string; customerNote?: string; requestedRefundAmount?: number }) => {
    if (userId == null) {
      message.error('当前员工会话缺少身份，系统未发送售后登记。请重新登录后再试。');
      return;
    }
    let requestSent = false;
    setCreating(true);
    try {
      const requestedRefundAmount = values.requestedRefundAmount === undefined
        || values.requestedRefundAmount === null
        ? undefined
        : Number(values.requestedRefundAmount);
      const payload = {
        orderId: Number(values.orderId),
        orderItemId: Number(values.orderItemId),
        customerId: Number(values.customerId),
        type: values.type,
        reason: values.reason.trim(),
        ...(values.customerNote?.trim() ? { customerNote: values.customerNote.trim() } : {}),
        ...(requestedRefundAmount === undefined ? {} : { requestedRefundAmount }),
      };
      const storageKey = afterSalesCreateAttemptStorageKey(userId);
      const fingerprint = await hashAfterSalesCreatePayload({
        orderId: payload.orderId,
        orderItemId: payload.orderItemId,
        customerId: payload.customerId,
        type: payload.type,
        reason: payload.reason,
        customerNote: payload.customerNote ?? null,
        requestedRefundAmountCents: requestedRefundAmount === undefined
          ? null
          : Math.round(requestedRefundAmount * 100),
      });
      const storedAttempt = readAfterSalesCreateAttempt(storageKey);
      if (storedAttempt && storedAttempt.fingerprint !== fingerprint) {
        setPendingCreateAttempt(true);
        setCreateAttemptConflict(true);
        message.warning('检测到另一笔结果待确认的售后登记；系统未发送当前申请。请恢复原内容重试，或先核对售后列表后明确放弃旧凭据。');
        return;
      }
      const attempt = storedAttempt ?? {
        fingerprint,
        key: createAfterSalesIdempotencyKey(),
      };
      if (!writeAfterSalesCreateAttempt(storageKey, attempt)) {
        message.error('浏览器无法安全保存本次售后登记的重试凭据，系统未发送请求。请恢复会话存储后再试。');
        return;
      }
      setPendingCreateAttempt(true);
      setCreateAttemptConflict(false);
      requestSent = true;
      await afterSalesApi.create(payload, attempt.key);
      message.success('售后工单已创建');
      clearAfterSalesCreateAttempt(storageKey);
      setPendingCreateAttempt(false);
      setCreateAttemptConflict(false);
      setCreateOpen(false);
      createForm.resetFields();
      setSelectedOrder(null);
      setOrderOptions([]);
      void load();
    } catch (e: unknown) {
      if (!requestSent) {
        message.error('无法生成安全的售后登记重试凭据，系统未发送请求。请刷新页面后再试。');
      } else if (isAmbiguousWriteFailure(e)) {
        setPendingCreateAttempt(true);
        message.warning('售后工单创建结果待确认；请保持订单、商品、类型、原因、备注和金额不变后重试，系统会沿用同一凭据恢复结果。');
      } else {
        clearAfterSalesCreateAttempt(afterSalesCreateAttemptStorageKey(userId));
        setPendingCreateAttempt(false);
        setCreateAttemptConflict(false);
        message.error(getSafeAdminErrorMessage(e, '售后工单创建失败，请检查必填信息后重试。'));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleReview = (record: AfterSalesListItem, action: 'APPROVED' | 'REJECTED') => {
    reviewRequestIdRef.current += 1;
    let adminNote = '';
    const requestedRefundAmount = Number(record.requestedRefundAmount);
    let approvedRefundAmount = Number.isFinite(requestedRefundAmount) && requestedRefundAmount > 0
      ? requestedRefundAmount
      : undefined;
    let submitting = false;
    const reviewOkButtonProps = { danger: action === 'REJECTED' };
    const reviewModal = modal.confirm({
      title: action === 'APPROVED' ? '审核通过该售后工单？' : '驳回该售后工单？',
      content: (
        <div className="space-y-2">
          {action === 'APPROVED' && record.type === 'REFUND' && (
            <>
              <p className="text-sm text-brand-muted">通过后只确认退款额度，不会把钱退回。真正退款请到退款中心执行。</p>
              {approvedRefundAmount ? (
                <p className="text-xs text-brand-muted">客户申请退款额：¥{approvedRefundAmount.toLocaleString()}。审核额度默认采用该金额，可按核验结果调低。</p>
              ) : (
                <p className="text-xs text-brand-muted">客户申请未提供金额，审核通过前必须明确核定正数退款额度。</p>
              )}
              <label className="block text-sm text-brand-text" htmlFor={`after-sales-approved-refund-${record.id}`}>
                审核通过的退款金额
              </label>
              <InputNumber
                id={`after-sales-approved-refund-${record.id}`}
                aria-label="审核通过的退款金额"
                className="w-full"
                min={0.01}
                step={0.01}
                precision={2}
                defaultValue={approvedRefundAmount}
                placeholder="请输入审核通过的退款金额（必填）"
                onChange={(value) => {
                  approvedRefundAmount = typeof value === 'number' ? value : undefined;
                }}
              />
            </>
          )}
          <Input.TextArea placeholder="处理备注（可选）" rows={3} onChange={(e) => { adminNote = e.target.value; }} />
        </div>
      ),
      okText: action === 'APPROVED' ? '确认通过' : '确认驳回',
      okButtonProps: reviewOkButtonProps,
      onCancel: () => { reviewRequestIdRef.current += 1; },
      onOk: (close) => {
        if (
          action === 'APPROVED' &&
          record.type === 'REFUND' &&
          (!approvedRefundAmount || approvedRefundAmount <= 0)
        ) {
          message.error('请输入大于 0 的审核退款金额。');
          return;
        }
        if (submitting) return;
        submitting = true;
        const requestId = ++reviewRequestIdRef.current;
        const submittedNote = adminNote.trim();
        const submittedAmount = approvedRefundAmount;
        reviewModal.update({
          okButtonProps: { ...reviewOkButtonProps, loading: true },
        });
        const completeReview = (verifiedAfterResponseLoss = false) => {
          if (requestId !== reviewRequestIdRef.current) return;
          close();
          if (action === 'APPROVED' && record.type === 'REFUND') {
            if (verifiedAfterResponseLoss) {
              message.success('售后审核已写入并完成权威核验');
            }
            modal.confirm({
              title: '售后已通过，退款尚未执行',
              content: canOperateRefund
                ? '当前只确认了退款额度。请到退款中心创建或执行退款单。'
                : '当前只确认了退款额度。退款中心仅管理员可以创建或执行退款单；您可以前往查看处理进度。',
              okText: canOperateRefund ? '前往退款中心' : '查看退款进度',
              cancelText: '留在售后',
              onOk: () => openRefundCenter(record.id),
            });
          } else {
            message.success(verifiedAfterResponseLoss
              ? '售后审核已写入并完成权威核验'
              : action === 'APPROVED' ? '已审核通过' : '已驳回');
          }
          void load();
        };
        const keepReviewOpen = (content: string) => {
          if (requestId !== reviewRequestIdRef.current) return;
          submitting = false;
          reviewModal.update({
            okButtonProps: { ...reviewOkButtonProps, loading: false },
          });
          message.warning(content);
        };
        void afterSalesApi.review(record.id, {
            action,
            adminNote: submittedNote || undefined,
            approvedRefundAmount: submittedAmount && submittedAmount > 0 ? submittedAmount : undefined,
          }).then(() => {
          completeReview();
        }).catch(async (e: unknown) => {
          if (requestId !== reviewRequestIdRef.current) return;
          if (isAmbiguousWriteFailure(e)) {
            try {
              const authoritative = unwrapResponse<AfterSalesListItem>(
                await afterSalesApi.getById(record.id),
              );
              if (requestId !== reviewRequestIdRef.current) return;
              const verification = verifyReviewResult(
                authoritative,
                record.status,
                action,
                submittedAmount,
                submittedNote,
              );
              if (verification === 'applied') {
                completeReview(true);
                return;
              }
              if (verification === 'not-applied') {
                keepReviewOpen('权威售后工单仍处于待审核，本次审核确定未生效；当前额度与备注已保留，可安全重试。');
                return;
              }
            } catch {
              if (requestId !== reviewRequestIdRef.current) return;
            }
            keepReviewOpen('售后审核结果待确认，当前额度与备注已保留；请先重新加载或查看工单详情，暂不要重复操作。');
            return;
          }
          submitting = false;
          reviewModal.update({
            okButtonProps: { ...reviewOkButtonProps, loading: false },
          });
          message.error(getSafeAdminErrorMessage(e, '售后审核未完成，请重新加载工单后重试。'));
        });
      },
    });
  };

  const handleUpdateStatus = (record: AfterSalesListItem) => {
    let adminNote = '';
    const nextOptions: Array<{ value: string; label: string }> = [];
    if (record.status === 'APPROVED') {
      nextOptions.push({ value: 'RETURNING', label: '开始逆向物流' }, { value: 'COMPLETED', label: '直接完成' });
    } else if (record.status === 'RETURNING') {
      nextOptions.push({ value: 'QC_PASSED', label: '质检通过' }, { value: 'QC_FAILED', label: '质检不通过' }, { value: 'COMPLETED', label: '完成' });
    } else if (record.status === 'QC_PASSED' || record.status === 'QC_FAILED') {
      nextOptions.push({ value: 'COMPLETED', label: '完成' });
    }
    if (!['COMPLETED', 'REJECTED', 'CANCELLED'].includes(record.status)) {
      nextOptions.push({ value: 'CANCELLED', label: '取消工单' });
    }
    if (nextOptions.length === 0) return;
    let nextStatus = nextOptions[0].value;
    statusRequestIdRef.current += 1;
    let submitting = false;
    const statusModal = modal.confirm({
      title: '更新售后状态',
      content: (
        <div className="space-y-2">
          <Select className="w-full" defaultValue={nextStatus} onChange={(v) => { nextStatus = v; }} options={nextOptions} />
          <Input.TextArea placeholder="处理备注（可选）" rows={2} onChange={(e) => { adminNote = e.target.value; }} />
        </div>
      ),
      okText: '确认更新',
      onCancel: () => { statusRequestIdRef.current += 1; },
      onOk: (close) => {
        if (submitting) return;
        submitting = true;
        const requestId = ++statusRequestIdRef.current;
        const submittedStatus = nextStatus as AfterSalesStatus;
        const submittedNote = adminNote.trim();
        statusModal.update({ okButtonProps: { loading: true } });
        const completeStatus = (verifiedAfterResponseLoss = false) => {
          if (requestId !== statusRequestIdRef.current) return;
          close();
          message.success(verifiedAfterResponseLoss ? '售后状态已写入并完成权威核验' : '状态已更新');
          void load();
        };
        const keepStatusOpen = (content: string) => {
          if (requestId !== statusRequestIdRef.current) return;
          submitting = false;
          statusModal.update({ okButtonProps: { loading: false } });
          message.warning(content);
        };
        void afterSalesApi.updateStatus(record.id, {
          status: submittedStatus,
          adminNote: submittedNote || undefined,
        }).then(() => {
          completeStatus();
        }).catch(async (e: unknown) => {
          if (requestId !== statusRequestIdRef.current) return;
          if (isAmbiguousWriteFailure(e)) {
            try {
              const authoritative = unwrapResponse<AfterSalesListItem>(
                await afterSalesApi.getById(record.id),
              );
              if (requestId !== statusRequestIdRef.current) return;
              const verification = verifyStatusResult(
                authoritative,
                record.status,
                submittedStatus,
                submittedNote,
              );
              if (verification === 'applied') {
                completeStatus(true);
                return;
              }
              if (verification === 'not-applied') {
                keepStatusOpen('权威售后工单仍处于操作前状态，本次更新确定未生效；当前选择与备注已保留，可安全重试。');
                return;
              }
            } catch {
              if (requestId !== statusRequestIdRef.current) return;
            }
            keepStatusOpen('售后状态更新结果待确认，当前选择与备注已保留；请先重新加载或查看工单详情，暂不要重复操作。');
            return;
          }
          submitting = false;
          statusModal.update({ okButtonProps: { loading: false } });
          message.error(getSafeAdminErrorMessage(e, '售后状态更新失败，请重新加载工单后重试。'));
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-semibold text-brand-text">售后中心</h1>
          <p className="text-sm text-brand-muted mt-1">处理退货、换货和维修。退款类工单通过后只确认额度，真正退款到退款中心执行。</p>
        </div>
        <Space>
          <Input.Search
            placeholder="工单号/订单号/客户"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
            className="w-64"
            allowClear
          />
          {canManageAfterSales && <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDialog}>登记售后</Button>}
        </Space>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1); }}
              className={`px-4 py-2 text-sm border transition-all ${statusFilter === tab.key ? 'border-brand-gold text-brand-gold' : 'border-brand-line text-brand-muted hover:text-brand-text hover:border-brand-gold'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Select
          className="w-36"
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setPage(1); }}
          options={[
            { value: 'all', label: '全部类型' },
            { value: 'REFUND', label: '退款退货' },
            { value: 'EXCHANGE', label: '换货' },
            { value: 'REPAIR', label: '维修' },
          ]}
        />
      </div>

      {loadError ? (
        <div className="text-center py-16">
          <p className="text-brand-muted mb-4">售后数据暂时无法加载</p>
          <Button type="primary" onClick={() => void load()}>重新加载</Button>
        </div>
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={list}
          size="middle"
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          locale={{ emptyText: '暂无售后工单' }}
          columns={[
            { title: '工单号', dataIndex: 'caseNo', render: (v: string) => <code className="text-xs text-brand-gold">{v}</code> },
            {
              title: '订单 / 客户', render: (_: unknown, r: AfterSalesListItem) => (
                <div>
                  <p className="text-sm">{r.order?.orderNo}</p>
                  <p className="text-xs text-brand-muted">{r.order?.customerName} · {r.order?.customerPhone}</p>
                </div>
              ),
            },
            { title: '类型', dataIndex: 'type', render: (v: AfterSalesType) => <Tag>{TYPE_META[v]?.label || v}</Tag> },
            { title: '原因', dataIndex: 'reason', ellipsis: true },
            {
              title: '退款额', dataIndex: 'requestedRefundAmount', render: (v: number | string | null) => v ? <span className="text-brand-gold">¥{Number(v).toLocaleString()}</span> : '—',
            },
            { title: '状态', dataIndex: 'status', render: (v: AfterSalesStatus) => <Tag color={STATUS_META[v]?.color}>{STATUS_META[v]?.label || v}</Tag> },
            {
              title: '操作', render: (_: unknown, r: AfterSalesListItem) => (
                <Space>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>详情</Button>
                  {canManageAfterSales && r.status === 'REQUESTED' && (
                    <>
                      <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleReview(r, 'APPROVED')}>通过</Button>
                      <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleReview(r, 'REJECTED')}>驳回</Button>
                    </>
                  )}
                  {r.type === 'REFUND' && r.status === 'APPROVED' && (
                    <Button size="small" onClick={() => openRefundCenter(r.id)}>去退款中心</Button>
                  )}
                  {canManageAfterSales && !['COMPLETED', 'REJECTED', 'CANCELLED', 'REQUESTED'].includes(r.status) && (
                    <Button size="small" onClick={() => handleUpdateStatus(r)}>推进状态</Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      {/* 详情抽屉 */}
      <Drawer open={!!detail} onClose={closeDetail} width={560} title="售后详情" loading={detailLoading}>
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="工单号"><code className="text-xs text-brand-gold">{detail.caseNo}</code></Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={STATUS_META[detail.status]?.color}>{STATUS_META[detail.status]?.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="类型">{TYPE_META[detail.type]?.label}</Descriptions.Item>
            <Descriptions.Item label="订单号">{detail.order?.orderNo}</Descriptions.Item>
            <Descriptions.Item label="客户">{detail.customer?.name || detail.order?.customerName} · {detail.customer?.phone || detail.order?.customerPhone}</Descriptions.Item>
            <Descriptions.Item label="申请原因">{detail.reason}</Descriptions.Item>
            <Descriptions.Item label="客户备注">{detail.customerNote || '—'}</Descriptions.Item>
            <Descriptions.Item label="期望退款额">{detail.requestedRefundAmount ? `¥${Number(detail.requestedRefundAmount).toLocaleString()}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="审核通过退款额">{detail.approvedRefundAmount ? `¥${Number(detail.approvedRefundAmount).toLocaleString()}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="处理备注">{detail.adminNote || '—'}</Descriptions.Item>
            <Descriptions.Item label="处理人">{detail.handler?.realName || detail.handler?.username || '—'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {detail.createdAt
                ? new Date(detail.createdAt).toLocaleString('zh-CN')
                : '—'}
            </Descriptions.Item>
            {detail.type === 'REFUND' && detail.status === 'APPROVED' && (
              <Descriptions.Item label="下一步">
                <Button size="small" type="primary" onClick={() => openRefundCenter(detail.id)}>
                  {canOperateRefund ? '去退款中心执行退款' : '去退款中心查看进度'}
                </Button>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Drawer>

      {/* 登记售后 */}
      <Modal
        title="登记售后工单"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} preserve={false}>
          {pendingCreateAttempt ? (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              message={createAttemptConflict ? '存在另一笔结果待确认的售后登记' : '存在结果待确认的售后登记'}
              description={createAttemptConflict
                ? '请恢复原订单、商品、类型、原因、备注和金额后重试。只有核对售后列表后确认这是新意图，才放弃原凭据。'
                : '保持原登记内容不变后再次提交，系统会沿用同一凭据恢复结果；请勿重复创建不同内容。'}
              action={<Button size="small" danger onClick={abandonPendingCreateAttempt}>放弃旧凭据</Button>}
            />
          ) : null}
          {/* 提交合同保持 orderId/customerId/orderItemId 数字字段；由下方选择器自动写入 */}
          <Form.Item name="orderId" hidden rules={[{ required: true, message: '请先搜索并选择订单' }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="customerId" hidden rules={[{ required: true, message: '所选订单缺少客户信息，请重新选择' }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item label="关联订单" htmlFor="after-sales-order" required>
            <Select
              id="after-sales-order"
              showSearch
              filterOption={false}
              onSearch={searchOrders}
              loading={orderSearching}
              placeholder="搜索订单号 / 客户姓名 / 手机号"
              value={selectedOrder?.id}
              onSelect={(v) => selectOrder(Number(v))}
              onClear={clearSelectedOrder}
              options={orderOptions}
              allowClear
              notFoundContent={orderSearching ? '搜索中…' : '输入关键字搜索订单'}
            />
          </Form.Item>
          {selectedOrder && (
            <p className="text-xs text-brand-muted -mt-2 mb-3">
              客户：{selectedOrder.customerName || '—'} · {selectedOrder.customerPhone || '—'}（自动关联，无需填写）
            </p>
          )}
          <Form.Item name="orderItemId" label="订单商品" rules={[{ required: true, message: '请选择订单内的商品行' }]}>
            <Select
              placeholder={selectedOrder ? '选择该订单内的商品行' : '请先选择订单'}
              disabled={!selectedOrder}
              options={(selectedOrder?.items || []).map((it) => ({
                value: it.id,
                label: [it.productNameSnapshot, it.productCodeSnapshot].filter(Boolean).join(' · '),
              }))}
            />
          </Form.Item>
          <Form.Item name="type" label="售后类型" rules={[{ required: true, message: '请选择售后类型' }]}>
            <Select options={[
              { value: 'REFUND', label: '退款退货' },
              { value: 'EXCHANGE', label: '换货' },
              { value: 'REPAIR', label: '维修' },
            ]} placeholder="选择售后类型" />
          </Form.Item>
          <Form.Item name="reason" label="售后原因" rules={[{ required: true, message: '请填写售后原因' }]}>
            <Input.TextArea rows={3} placeholder="客户申请售后的原因" />
          </Form.Item>
          <Form.Item name="requestedRefundAmount" label="期望退款额（元，可选）">
            <Input type="number" min={0} step={0.01} placeholder="仅退款退货类型需要" />
          </Form.Item>
          <Form.Item name="customerNote" label="客户备注（可选）">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={creating}>创建工单</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

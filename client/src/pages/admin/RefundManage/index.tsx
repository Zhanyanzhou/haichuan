import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App as AntdApp, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { afterSalesApi, refundApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getSafeAdminErrorMessage } from '@/constants/adminCopy';
import { useAuthStore } from '@/store/authStore';
import type { AfterSalesCase, PaginatedResult, Refund, RefundStatus } from '@/types';

const STATUS_META: Record<RefundStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '待审核' },
  APPROVED: { color: 'blue', label: '待执行' },
  PROCESSING: { color: 'cyan', label: '执行中' },
  COMPLETED: { color: 'green', label: '已完成' },
  REJECTED: { color: 'default', label: '已拒绝' },
  FAILED: { color: 'red', label: '执行失败' },
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'PENDING', label: STATUS_META.PENDING.label },
  { key: 'APPROVED', label: STATUS_META.APPROVED.label },
  { key: 'PROCESSING', label: STATUS_META.PROCESSING.label },
  { key: 'COMPLETED', label: STATUS_META.COMPLETED.label },
  { key: 'REJECTED', label: STATUS_META.REJECTED.label },
  { key: 'FAILED', label: STATUS_META.FAILED.label },
];

type RefundListItem = Refund & {
  order: { orderNo: string; customerName: string; customerPhone: string; finalAmount: number | string; status: string };
  payment?: { id: number; paymentNo: string; method: string; status: string; amount: number | string } | null;
};

type RefundAttempt = {
  fingerprint: string;
  key: string;
};

type RefundReviewOperation = {
  record: RefundListItem;
  action: 'APPROVED' | 'REJECTED';
  reviewNote: string;
  submitting: boolean;
};

type RefundExecutionOperation = {
  record: RefundListItem;
  action: 'COMPLETED' | 'FAILED';
  executionInput: string;
  submitting: boolean;
};

type ChannelRecoveryState = {
  ownerId: number | null;
  refundIds: Set<number>;
};

type RefundPaymentEligibility = {
  id: number;
  paymentNo: string;
  method: string;
  status: string;
  type: string;
  installmentLabel: string | null;
  installmentSequence: number | null;
  amount: string;
  occupiedRefundAmount: string;
  availableRefundAmount: string;
  eligible: boolean;
  reason: string | null;
};

type RefundCreateEligibility = {
  order: {
    id: number;
    orderNo: string;
    status: string;
    orderType: string;
    currency: string;
  };
  totalAvailableRefundAmount: string;
  payments: RefundPaymentEligibility[];
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: '定金',
  BALANCE: '尾款',
  FULL: '全款',
  SUPPLEMENT: '补款',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
  bank_transfer: '银行转账',
  store: '门店收款',
};

function refundAttemptStorageKey(userId: number) {
  return `hc:refund-create-attempt:${userId}`;
}

function channelRecoveryStorageKey(userId: number) {
  return `hc:refund-channel-recovery:${userId}`;
}

function readChannelRecoveryIds(userId: number) {
  try {
    const raw = sessionStorage.getItem(channelRecoveryStorageKey(userId));
    if (!raw) return new Set<number>();
    const values = JSON.parse(raw) as unknown;
    if (!Array.isArray(values)) return new Set<number>();
    return new Set(values.filter(
      (value): value is number =>
        typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
    ));
  } catch {
    return new Set<number>();
  }
}

function writeChannelRecoveryIds(userId: number, refundIds: Set<number>) {
  try {
    const storageKey = channelRecoveryStorageKey(userId);
    if (refundIds.size === 0) {
      sessionStorage.removeItem(storageKey);
      return sessionStorage.getItem(storageKey) === null;
    }
    const serialized = JSON.stringify([...refundIds].sort((a, b) => a - b));
    sessionStorage.setItem(storageKey, serialized);
    return sessionStorage.getItem(storageKey) === serialized;
  } catch {
    return false;
  }
}

function readRefundAttempt(storageKey: string): RefundAttempt | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RefundAttempt>;
    return typeof value.fingerprint === 'string' && typeof value.key === 'string'
      ? { fingerprint: value.fingerprint, key: value.key }
      : null;
  } catch {
    return null;
  }
}

function writeRefundAttempt(storageKey: string, attempt: RefundAttempt) {
  try {
    const serialized = JSON.stringify(attempt);
    sessionStorage.setItem(storageKey, serialized);
    return sessionStorage.getItem(storageKey) === serialized;
  } catch {
    return false;
  }
}

function clearRefundAttempt(storageKey: string) {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // 已确认成功、确定拒绝或管理员明确放弃凭据后，不让清理失败覆盖业务结果。
  }
}

function createRefundIdempotencyKey() {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `refund-${suffix}`;
}

function isAmbiguousWriteFailure(error: unknown) {
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  const status = candidate.response?.status ?? candidate.status;
  return typeof status !== 'number' || status >= 500;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function matchesRefundReview(
  refund: RefundListItem,
  action: 'APPROVED' | 'REJECTED',
  reviewNote: string,
  operatorId: number | undefined,
) {
  if (operatorId == null || refund.reviewedBy !== operatorId || !refund.reviewedAt) return false;
  if (normalizeOptionalText(refund.reviewNote) !== normalizeOptionalText(reviewNote)) return false;
  return action === 'REJECTED'
    ? refund.status === 'REJECTED'
    : ['APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(refund.status);
}

function matchesOfflineRefundCompletion(
  refund: RefundListItem,
  reference: string,
  userId: number | undefined,
) {
  return userId != null &&
    refund.status === 'COMPLETED' &&
    refund.processedBy === userId &&
    Boolean(refund.completedAt) &&
    normalizeOptionalText(refund.gatewayRefundNo) === normalizeOptionalText(reference);
}

async function hashRefundPayload(payload: object) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

export default function RefundManage() {
  const { message, modal } = AntdApp.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  // 仅 ADMIN 可执行写操作；前端按角色隐藏按钮（后端 @Roles 是最终边界）
  const role = useAuthStore((state) => state.user?.role);
  const userId = useAuthStore((state) => state.user?.id);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const [list, setList] = useState<RefundListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<RefundListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewOperation, setReviewOperation] = useState<RefundReviewOperation | null>(null);
  const [executionOperation, setExecutionOperation] = useState<RefundExecutionOperation | null>(null);
  const detailRequestIdRef = useRef(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [attemptConflict, setAttemptConflict] = useState(false);
  const [linkedAfterSalesCase, setLinkedAfterSalesCase] = useState<AfterSalesCase | null>(null);
  const [afterSalesHandoffError, setAfterSalesHandoffError] = useState<string | null>(null);
  const [afterSalesHandoffLoading, setAfterSalesHandoffLoading] = useState(false);
  const [channelLoadingId, setChannelLoadingId] = useState<number | null>(null);
  const [channelRecoveryState, setChannelRecoveryState] = useState<ChannelRecoveryState>(() => ({
    ownerId: userId ?? null,
    refundIds: userId == null ? new Set() : readChannelRecoveryIds(userId),
  }));
  const [createEligibility, setCreateEligibility] = useState<RefundCreateEligibility | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [createForm] = Form.useForm();
  const selectedPaymentId = Form.useWatch('paymentId', createForm);
  const refundAttemptRef = useRef<(RefundAttempt & { storageKey: string }) | null>(null);
  const listRequestIdRef = useRef(0);
  const handoffRequestIdRef = useRef(0);
  const eligibilityRequestIdRef = useRef(0);
  const afterSalesCaseParam = searchParams.get('afterSalesCaseId');
  const channelRecoveryReady = userId != null && channelRecoveryState.ownerId === userId;
  const channelRecoveryIds = channelRecoveryReady
    ? channelRecoveryState.refundIds
    : new Set<number>();
  const load = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await refundApi.getList({
        page, pageSize,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        keyword: keyword || undefined,
      });
      const data = unwrapResponse<PaginatedResult<RefundListItem>>(res);
      if (requestId !== listRequestIdRef.current) return;
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch {
      if (requestId !== listRequestIdRef.current) return;
      setLoadError(true);
      setList([]);
      setTotal(0);
    } finally {
      if (requestId === listRequestIdRef.current) setLoading(false);
    }
  }, [page, pageSize, statusFilter, keyword]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setChannelRecoveryState({
      ownerId: userId ?? null,
      refundIds: userId == null ? new Set() : readChannelRecoveryIds(userId),
    });
  }, [userId]);

  useEffect(() => {
    const requestId = ++handoffRequestIdRef.current;
    setLinkedAfterSalesCase(null);
    setAfterSalesHandoffError(null);
    if (!afterSalesCaseParam) {
      setAfterSalesHandoffLoading(false);
      return;
    }
    const caseId = Number(afterSalesCaseParam);
    if (!Number.isSafeInteger(caseId) || caseId <= 0) {
      setAfterSalesHandoffLoading(false);
      setAfterSalesHandoffError('售后工单参数无效，系统未打开退款申请。请返回售后中心重新进入。');
      return;
    }
    setAfterSalesHandoffLoading(true);
    void afterSalesApi.getById(caseId).then((response) => {
      if (requestId !== handoffRequestIdRef.current) return;
      const caseRecord = unwrapResponse<AfterSalesCase>(response);
      const approvedAmount = Number(caseRecord?.approvedRefundAmount);
      if (
        !caseRecord ||
        caseRecord.type !== 'REFUND' ||
        !['APPROVED', 'RETURNING', 'QC_PASSED'].includes(caseRecord.status) ||
        !Number.isFinite(approvedAmount) ||
        approvedAmount <= 0
      ) {
        setAfterSalesHandoffError('关联售后工单尚不满足创建退款条件，请返回售后中心核对工单类型、状态和审核额度。');
        return;
      }
      setLinkedAfterSalesCase(caseRecord);
      if (isAdmin) setCreateOpen(true);
    }).catch((error: unknown) => {
      if (requestId !== handoffRequestIdRef.current) return;
      setAfterSalesHandoffError(getSafeAdminErrorMessage(error, '售后工单加载失败，系统未打开退款申请。请返回售后中心后重试。'));
    }).finally(() => {
      if (requestId === handoffRequestIdRef.current) setAfterSalesHandoffLoading(false);
    });
  }, [afterSalesCaseParam, isAdmin]);

  const clearAfterSalesHandoff = () => {
    handoffRequestIdRef.current += 1;
    const next = new URLSearchParams(searchParams);
    next.delete('afterSalesCaseId');
    setSearchParams(next, { replace: true });
    setLinkedAfterSalesCase(null);
    setAfterSalesHandoffError(null);
    setAfterSalesHandoffLoading(false);
  };

  const openDetail = async (record: RefundListItem) => {
    const requestId = ++detailRequestIdRef.current;
    setDetail(record);
    setDetailLoading(true);
    try {
      const res = await refundApi.getById(record.id);
      if (requestId !== detailRequestIdRef.current) return;
      const full = unwrapResponse<RefundListItem>(res);
      if (full) setDetail(full);
    } catch {
      // 当前退款仍保留列表快照；已关闭或切换的旧请求不得改写新抽屉。
    } finally {
      if (requestId === detailRequestIdRef.current) setDetailLoading(false);
    }
  };

  const resetCreateEligibility = useCallback(() => {
    eligibilityRequestIdRef.current += 1;
    setCreateEligibility(null);
    setEligibilityLoading(false);
    setEligibilityError(null);
  }, []);

  const loadCreateEligibility = useCallback(async (rawOrderId: unknown) => {
    const orderId = Number(rawOrderId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      resetCreateEligibility();
      createForm.setFieldValue('paymentId', undefined);
      setEligibilityError('请先输入有效的订单 ID。');
      return;
    }
    const requestId = ++eligibilityRequestIdRef.current;
    setCreateEligibility(null);
    setEligibilityError(null);
    setEligibilityLoading(true);
    createForm.setFieldValue('paymentId', undefined);
    try {
      const response = await refundApi.getCreateEligibility(orderId);
      if (requestId !== eligibilityRequestIdRef.current) return;
      const eligibility = unwrapResponse<RefundCreateEligibility>(response);
      if (!eligibility || eligibility.order?.id !== orderId) {
        throw new Error('原付款核对响应与当前订单不一致');
      }
      setCreateEligibility(eligibility);
    } catch (error: unknown) {
      if (requestId !== eligibilityRequestIdRef.current) return;
      setEligibilityError(getSafeAdminErrorMessage(
        error,
        '订单与原付款暂时无法核对，系统未发送退款申请。请稍后重试。',
      ));
    } finally {
      if (requestId === eligibilityRequestIdRef.current) setEligibilityLoading(false);
    }
  }, [createForm, resetCreateEligibility]);

  useEffect(() => {
    if (!createOpen || !linkedAfterSalesCase) return;
    void loadCreateEligibility(linkedAfterSalesCase.orderId);
  }, [createOpen, linkedAfterSalesCase, loadCreateEligibility]);

  const closeCreateModal = () => {
    setCreateOpen(false);
    resetCreateEligibility();
    if (linkedAfterSalesCase) clearAfterSalesHandoff();
  };

  const handleCreate = async (values: { orderId: number; paymentId: number; amount: number; reason: string; afterSalesCaseId?: number }) => {
    setCreating(true);
    try {
      if (userId == null) {
        message.error('管理员身份尚未确认，系统未发送退款申请。请重新登录后再试。');
        return;
      }
      const orderId = Number(values.orderId);
      const paymentId = Number(values.paymentId);
      if (!createEligibility || createEligibility.order.id !== orderId) {
        message.error('请先核对当前订单的原付款，系统未发送退款申请。');
        return;
      }
      const selectedPayment = createEligibility.payments.find(
        (payment) => payment.id === paymentId && payment.eligible,
      );
      if (!selectedPayment) {
        message.error('请选择一笔仍可退款的原付款，系统未发送退款申请。');
        return;
      }
      const amountCents = Math.round(Number(values.amount) * 100);
      const paymentAvailableCents = Math.round(
        Number(selectedPayment.availableRefundAmount) * 100,
      );
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
        message.error('退款金额必须大于 0，系统未发送退款申请。');
        return;
      }
      if (amountCents > paymentAvailableCents) {
        message.error(`退款金额超过该笔原付款可退额度 ¥${Number(selectedPayment.availableRefundAmount).toFixed(2)}，系统未发送退款申请。`);
        return;
      }
      const payload: {
        orderId: number;
        paymentId: number;
        amount: number;
        reason: string;
        afterSalesCaseId?: number;
      } = {
        orderId,
        paymentId,
        amount: amountCents / 100,
        reason: values.reason.trim(),
        ...(values.afterSalesCaseId
          ? { afterSalesCaseId: Number(values.afterSalesCaseId) }
          : {}),
      };
      const storageKey = refundAttemptStorageKey(userId);
      const fingerprint = await hashRefundPayload({
        orderId: payload.orderId,
        paymentId: payload.paymentId,
        amountCents,
        reason: payload.reason,
        afterSalesCaseId: payload.afterSalesCaseId ?? null,
      });
      const storedAttempt = refundAttemptRef.current?.storageKey === storageKey
        ? refundAttemptRef.current
        : readRefundAttempt(storageKey);
      if (storedAttempt && storedAttempt.fingerprint !== fingerprint) {
        refundAttemptRef.current = { ...storedAttempt, storageKey };
        setAttemptConflict(true);
        message.warning('检测到另一笔结果待确认的退款申请；系统未发送当前申请。请恢复原内容重试，或先核对退款列表后明确放弃旧凭据。');
        return;
      }
      refundAttemptRef.current = storedAttempt
        ? { ...storedAttempt, storageKey }
        : { fingerprint, key: createRefundIdempotencyKey(), storageKey };
      if (!writeRefundAttempt(storageKey, {
        fingerprint: refundAttemptRef.current.fingerprint,
        key: refundAttemptRef.current.key,
      })) {
        refundAttemptRef.current = null;
        message.error('浏览器无法安全保存本次退款的重试凭据，系统未发送退款申请。请恢复会话存储后再试。');
        return;
      }
      setAttemptConflict(false);
      await refundApi.create({
        ...payload,
        idempotencyKey: refundAttemptRef.current.key,
      });
      message.success('退款申请已创建');
      clearRefundAttempt(storageKey);
      refundAttemptRef.current = null;
      setCreateOpen(false);
      resetCreateEligibility();
      if (payload.afterSalesCaseId) clearAfterSalesHandoff();
      void load();
    } catch (e: unknown) {
      const status = (e as { status?: unknown; response?: { status?: unknown } })?.response?.status
        ?? (e as { status?: unknown })?.status;
      if (typeof status !== 'number' || status >= 500) {
        message.warning('退款申请结果待确认；请保持订单、金额和原因不变后重试，系统会沿用同一凭据恢复结果。');
      } else {
        if (userId != null) clearRefundAttempt(refundAttemptStorageKey(userId));
        refundAttemptRef.current = null;
        setAttemptConflict(false);
        message.error(getSafeAdminErrorMessage(e, '退款申请创建失败，请检查订单和退款信息后重试。'));
      }
    } finally {
      setCreating(false);
    }
  };

  const eligibleCreatePayments = createEligibility?.payments.filter(
    (payment) => payment.eligible,
  ) ?? [];
  const selectedPayment = createEligibility?.payments.find(
    (payment) => payment.id === Number(selectedPaymentId),
  );

  const abandonPendingRefundAttempt = () => {
    if (userId == null) return;
    modal.confirm({
      title: '放弃待确认的退款重试凭据？',
      content: '这不会撤销服务器上可能已经创建的退款。请先刷新并核对退款列表；放弃后，当前表单将被视为一笔新的退款意图。',
      okText: '确认放弃凭据',
      cancelText: '保留凭据',
      okButtonProps: { danger: true },
      onOk: () => {
        clearRefundAttempt(refundAttemptStorageKey(userId));
        refundAttemptRef.current = null;
        setAttemptConflict(false);
        message.info('待确认凭据已放弃；请再次提交当前内容以创建新的退款意图。');
      },
    });
  };

  const handleReview = (record: RefundListItem, action: 'APPROVED' | 'REJECTED') => {
    setReviewOperation({
      record,
      action,
      reviewNote: '',
      submitting: false,
    });
  };

  const submitReview = async () => {
    const operation = reviewOperation;
    if (!operation || operation.submitting) return;
    const { record, action, reviewNote } = operation;
    setReviewOperation({ ...operation, submitting: true });

    try {
      const response = await refundApi.review(record.id, {
        action,
        reviewNote: reviewNote || undefined,
      });
      const result = unwrapResponse<RefundListItem & {
        channelAction?: { state?: string; message?: string };
      }>(response);
      if (action === 'APPROVED' && result?.channelAction?.state === 'DISABLED') {
        message.warning(result.channelAction.message || '已审核通过，真实退款门禁当前关闭');
      } else if (action === 'APPROVED' && result?.channelAction?.state === 'ATTENTION') {
        message.warning(result.channelAction.message || '已审核通过，渠道退款结果待确认');
      } else {
        message.success(action === 'APPROVED' ? '已审核通过' : '已拒绝');
      }
      setReviewOperation(null);
      await load();
    } catch (e: unknown) {
      if (isAmbiguousWriteFailure(e)) {
        try {
          const current = unwrapResponse<RefundListItem>(
            await refundApi.getById(record.id, { suppressGlobalError: true }),
          );
          if (matchesRefundReview(current, action, reviewNote, userId)) {
            message.success('退款审核已写入并完成权威核验');
            setReviewOperation(null);
            await load();
            if (detail?.id === record.id) setDetail(current);
            return;
          }
          if (current.status === 'PENDING') {
            message.warning('权威退款仍处于待审核，本次审核确定未生效；当前备注已保留，可安全重试。');
          } else {
            message.warning('权威退款已由其他审核结果推进；请关闭弹窗并重新加载，暂勿重复操作。');
          }
        } catch {
          message.warning('退款审核结果待确认；请保持审核动作和备注不变后重试，系统会安全恢复同一结果。');
        }
      } else {
        message.error(getSafeAdminErrorMessage(e, '退款审核未完成，请重新加载后确认当前状态。'));
      }
      setReviewOperation((current) => current ? { ...current, submitting: false } : current);
    }
  };

  const updateChannelRecovery = (refundId: number, required: boolean) => {
    if (userId == null) return false;
    const current = channelRecoveryState.ownerId === userId
      ? channelRecoveryState.refundIds
      : readChannelRecoveryIds(userId);
    const next = new Set(current);
    if (required) next.add(refundId);
    else next.delete(refundId);
    const stored = writeChannelRecoveryIds(userId, next);
    if (stored) {
      setChannelRecoveryState({ ownerId: userId, refundIds: next });
    }
    return stored;
  };

  const showChannelResult = (
    refundId: number,
    result: { state?: string },
    recovered = false,
  ) => {
    if (result?.state === 'SUCCESS') {
      updateChannelRecovery(refundId, false);
      message.success(recovered ? '微信已确认原路退款成功并完成渠道核验' : '微信已确认原路退款成功');
    } else if (result?.state === 'ABNORMAL') {
      updateChannelRecovery(refundId, true);
      message.warning('微信退款异常，请保持原退款单并进行渠道对账');
    } else if (result?.state === 'CLOSED') {
      updateChannelRecovery(refundId, false);
      message.warning('微信退款已关闭，可在核对后重新创建退款申请');
    } else {
      updateChannelRecovery(refundId, true);
      message.info(recovered ? '微信退款已由渠道受理，已完成只读核验' : '微信退款处理中，稍后可继续查询');
    }
  };

  const handleChannelRefund = async (record: RefundListItem) => {
    if (!channelRecoveryReady) return;
    const shouldStart = record.status === 'APPROVED' && !channelRecoveryIds.has(record.id);
    const run = async () => {
      if (shouldStart && !updateChannelRecovery(record.id, true)) {
        message.error('浏览器无法保存原路退款待确认状态，本次未发起资金请求。');
        return;
      }
      setChannelLoadingId(record.id);
      try {
        const response = shouldStart
          ? await refundApi.startChannel(record.id)
          : await refundApi.queryChannel(record.id);
        const result = unwrapResponse<{ state?: string }>(response);
        showChannelResult(record.id, result);
        await load();
        if (detail?.id === record.id) await openDetail(record);
      } catch (e: unknown) {
        if (shouldStart && isAmbiguousWriteFailure(e)) {
          updateChannelRecovery(record.id, true);
          try {
            const recovered = unwrapResponse<{ state?: string }>(
              await refundApi.queryChannel(record.id),
            );
            showChannelResult(record.id, recovered, true);
            await load();
            if (detail?.id === record.id) await openDetail(record);
            return;
          } catch {
            message.warning('原路退款发起结果待确认；当前只允许查询渠道状态，请勿再次发起。');
            await load();
            return;
          }
        }
        if (shouldStart) updateChannelRecovery(record.id, false);
        message.error(getSafeAdminErrorMessage(e, '原路退款操作未完成，请保留当前退款单并稍后查询。'));
      } finally {
        setChannelLoadingId(null);
      }
    };

    if (!shouldStart) {
      await run();
      return;
    }

    modal.confirm({
      title: '确认发起原路退款？',
      content: `将向微信发起退款 ¥${Number(record.amount).toLocaleString()}。渠道受理后不可从后台撤回。`,
      okText: '确认发起',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => run(),
    });
  };

  const handleExecute = (record: RefundListItem, action: 'COMPLETED' | 'FAILED') => {
    setExecutionOperation({
      record,
      action,
      executionInput: '',
      submitting: false,
    });
  };

  const submitExecution = async () => {
    const operation = executionOperation;
    if (!operation || operation.submitting) return;
    const { record, action } = operation;
    const executionInput = operation.executionInput.trim();
    if (!executionInput) {
      message.warning(action === 'COMPLETED' ? '请填写退款流水号' : '请填写失败原因');
      return;
    }
    setExecutionOperation({ ...operation, executionInput, submitting: true });

    try {
      await refundApi.execute(record.id, {
        action,
        ...(action === 'COMPLETED'
          ? { gatewayRefundNo: executionInput }
          : { reviewNote: executionInput }),
      });
      message.success(action === 'COMPLETED' ? '退款已完成' : '已记录退款失败');
      setExecutionOperation(null);
      await load();
    } catch (e: unknown) {
      if (isAmbiguousWriteFailure(e)) {
        try {
          const current = unwrapResponse<RefundListItem>(
            await refundApi.getById(record.id, { suppressGlobalError: true }),
          );
          if (
            action === 'COMPLETED' &&
            matchesOfflineRefundCompletion(current, executionInput, userId)
          ) {
            message.success('线下退款已完成并完成权威核验');
            setExecutionOperation(null);
            await load();
            if (detail?.id === record.id) setDetail(current);
            return;
          }
          if (action === 'COMPLETED' && ['APPROVED', 'PROCESSING'].includes(current.status)) {
            message.warning('权威退款仍未完成，本次补录确定未生效；当前流水号已保留，可安全重试。');
          } else if (action === 'FAILED' && ['APPROVED', 'PROCESSING'].includes(current.status)) {
            message.warning('失败记录结果待确认；请保持失败原因不变后重试，系统会安全恢复同一记录。');
          } else {
            message.warning('权威退款已出现其他执行结果；请关闭弹窗并重新加载，暂勿重复操作。');
          }
        } catch {
          message.warning(
            action === 'COMPLETED'
              ? '线下退款完成结果待确认；请保持流水号不变后重试，系统会安全恢复同一结果。'
              : '失败记录结果待确认；请保持失败原因不变后重试，系统会安全恢复同一记录。',
          );
        }
      } else {
        message.error(getSafeAdminErrorMessage(e, '退款执行状态更新失败，请重新加载后确认当前状态。'));
      }
      setExecutionOperation((current) => current ? { ...current, submitting: false } : current);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-semibold text-brand-text">退款中心</h1>
          <p className="text-sm text-brand-muted mt-1">退款申请与审核；在线付款必须原路退回，线下付款保留人工登记兜底</p>
        </div>
        <Space>
          <Input.Search
            placeholder="退款单号/订单号/客户"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
            className="w-64"
            allowClear
          />
          {isAdmin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                resetCreateEligibility();
                setCreateOpen(true);
              }}
            >
              发起退款
            </Button>
          )}
        </Space>
      </div>

      <div className="flex flex-wrap gap-2">
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

      {afterSalesHandoffLoading ? (
        <Alert type="info" showIcon message="正在加载关联售后工单…" />
      ) : afterSalesHandoffError ? (
        <Alert
          type="error"
          showIcon
          message="未能承接售后退款"
          description={afterSalesHandoffError}
          action={<Button size="small" onClick={clearAfterSalesHandoff}>清除关联</Button>}
        />
      ) : linkedAfterSalesCase && !isAdmin ? (
        <Alert
          type="info"
          showIcon
          message={`已关联售后工单 ${linkedAfterSalesCase.caseNo}`}
          description="您可以查看退款处理进度；创建、审核和执行退款仅限管理员。"
          action={<Button size="small" onClick={clearAfterSalesHandoff}>清除关联</Button>}
        />
      ) : null}

      {loadError ? (
        <div className="text-center py-16">
          <p className="text-brand-muted mb-4">退款数据暂时无法加载</p>
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
          locale={{ emptyText: '暂无退款记录' }}
          columns={[
            { title: '退款单号', dataIndex: 'refundNo', render: (v: string) => <code className="text-xs text-brand-gold">{v}</code> },
            {
              title: '订单 / 客户', render: (_: unknown, r: RefundListItem) => (
                <div>
                  <p className="text-sm">{r.order?.orderNo}</p>
                  <p className="text-xs text-brand-muted">{r.order?.customerName} · {r.order?.customerPhone}</p>
                </div>
              ),
            },
            { title: '退款金额', dataIndex: 'amount', render: (v: number | string) => <span className="text-brand-gold font-medium">¥{Number(v).toLocaleString()}</span> },
            { title: '原因', dataIndex: 'reason', ellipsis: true, render: (v: string) => v || '—' },
            { title: '状态', dataIndex: 'status', render: (v: RefundStatus) => <Tag color={STATUS_META[v]?.color}>{STATUS_META[v]?.label || v}</Tag> },
            {
              title: '操作', render: (_: unknown, r: RefundListItem) => (
                <Space>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>详情</Button>
                  {isAdmin && r.status === 'PENDING' && (
                    <>
                      <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleReview(r, 'APPROVED')}>通过</Button>
                      <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleReview(r, 'REJECTED')}>拒绝</Button>
                    </>
                  )}
                  {isAdmin && (r.status === 'APPROVED' || r.status === 'PROCESSING') && (
                    r.payment?.method === 'wechat' ? (
                      <Button
                        size="small"
                        type={r.status === 'APPROVED' && !channelRecoveryIds.has(r.id) ? 'primary' : 'default'}
                        disabled={!channelRecoveryReady}
                        loading={channelLoadingId === r.id}
                        onClick={() => void handleChannelRefund(r)}
                        title="只发起或查询微信原路退款，不会人工标记成功"
                      >
                        {r.status === 'APPROVED' && !channelRecoveryIds.has(r.id) ? '发起原路退款' : '查询退款状态'}
                      </Button>
                    ) : r.payment?.method === 'alipay' ? (
                      <Button size="small" disabled title="支付宝客户退款将在第二批接入">
                        支付宝退款第二批
                      </Button>
                    ) : (
                      <>
                        <Button size="small" onClick={() => handleExecute(r, 'COMPLETED')}>补录线下退款</Button>
                        <Button size="small" danger onClick={() => handleExecute(r, 'FAILED')}>记录线下退款失败</Button>
                      </>
                    )
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      <Modal
        title={reviewOperation?.action === 'APPROVED' ? '审核通过该退款？' : '拒绝该退款？'}
        open={!!reviewOperation}
        onCancel={() => {
          if (!reviewOperation?.submitting) setReviewOperation(null);
        }}
        onOk={() => void submitReview()}
        okText={reviewOperation?.action === 'APPROVED' ? '确认通过' : '确认拒绝'}
        confirmLoading={reviewOperation?.submitting}
        okButtonProps={{ danger: reviewOperation?.action === 'REJECTED' }}
        cancelButtonProps={{ disabled: reviewOperation?.submitting }}
        destroyOnHidden
      >
        <Input.TextArea
          placeholder="审核备注（可选）"
          rows={3}
          value={reviewOperation?.reviewNote ?? ''}
          disabled={reviewOperation?.submitting}
          onChange={(event) => setReviewOperation((current) => current ? {
            ...current,
            reviewNote: event.target.value,
          } : current)}
        />
      </Modal>

      <Modal
        title={executionOperation?.action === 'COMPLETED' ? '确认退款已完成？' : '标记退款执行失败？'}
        open={!!executionOperation}
        onCancel={() => {
          if (!executionOperation?.submitting) setExecutionOperation(null);
        }}
        onOk={() => void submitExecution()}
        okText={executionOperation?.action === 'COMPLETED' ? '确认完成' : '标记失败'}
        confirmLoading={executionOperation?.submitting}
        okButtonProps={{ danger: executionOperation?.action === 'FAILED' }}
        cancelButtonProps={{ disabled: executionOperation?.submitting }}
        destroyOnHidden
      >
        <p className="text-sm text-brand-muted mb-2">
          {executionOperation?.action === 'COMPLETED'
            ? '仅用于线下付款退款，请填写银行或门店退款流水号。'
            : '线下退款执行失败后可重新登记。'}
        </p>
        <Input
          placeholder={executionOperation?.action === 'COMPLETED' ? '退款流水号（必填）' : '失败原因（必填）'}
          value={executionOperation?.executionInput ?? ''}
          disabled={executionOperation?.submitting}
          onChange={(event) => setExecutionOperation((current) => current ? {
            ...current,
            executionInput: event.target.value,
          } : current)}
        />
      </Modal>

      {/* 详情抽屉 */}
      <Drawer
        open={!!detail}
        onClose={() => {
          detailRequestIdRef.current += 1;
          setDetail(null);
          setDetailLoading(false);
        }}
        width={560}
        title="退款详情"
        loading={detailLoading}
      >
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="退款单号"><code className="text-xs text-brand-gold">{detail.refundNo}</code></Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={STATUS_META[detail.status]?.color}>{STATUS_META[detail.status]?.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="订单号">{detail.order?.orderNo}</Descriptions.Item>
            <Descriptions.Item label="客户">{detail.order?.customerName} · {detail.order?.customerPhone}</Descriptions.Item>
            <Descriptions.Item label="退款金额"><span className="text-brand-gold font-medium">¥{Number(detail.amount).toLocaleString()}</span></Descriptions.Item>
            <Descriptions.Item label="退款原因">{detail.reason || '—'}</Descriptions.Item>
            <Descriptions.Item label="关联售后工单">{detail.afterSalesCaseId ? `#${detail.afterSalesCaseId}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="审核备注">{detail.reviewNote || '—'}</Descriptions.Item>
            <Descriptions.Item label="审核人">{detail.reviewer?.realName || detail.reviewer?.username || '—'}</Descriptions.Item>
            <Descriptions.Item label="审核时间">{detail.reviewedAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="执行人">{detail.processor?.realName || detail.processor?.username || '—'}</Descriptions.Item>
            <Descriptions.Item label="完成时间">{detail.completedAt || detail.processedAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="网关流水号">{detail.gatewayRefundNo || '—'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detail.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      {/* 发起退款 */}
      <Modal
        title="发起退款"
        open={createOpen}
        onCancel={closeCreateModal}
        footer={null}
        destroyOnHidden
      >
        <Form
          key={linkedAfterSalesCase?.id ?? 'standalone-refund'}
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          preserve={false}
          initialValues={linkedAfterSalesCase ? {
            orderId: linkedAfterSalesCase.orderId,
            amount: Number(linkedAfterSalesCase.approvedRefundAmount),
            reason: linkedAfterSalesCase.reason,
            afterSalesCaseId: linkedAfterSalesCase.id,
          } : undefined}
        >
          {linkedAfterSalesCase ? (
            <Alert
              className="mb-4"
              type="info"
              showIcon
              message={`关联售后工单 ${linkedAfterSalesCase.caseNo}`}
              description={`已带入订单与审核额度 ¥${Number(linkedAfterSalesCase.approvedRefundAmount).toLocaleString()}；服务端仍会校验剩余售后额度和原付款可退额度。`}
            />
          ) : null}
          {attemptConflict ? (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              message="存在另一笔结果待确认的退款申请"
              description="请恢复原订单、金额和原因后重试。只有核对退款列表后确认这是新意图，才放弃原重试凭据。"
              action={<Button size="small" danger onClick={abandonPendingRefundAttempt}>放弃旧凭据</Button>}
            />
          ) : null}
          <Form.Item name="afterSalesCaseId" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item label="订单 ID" required>
            <Space.Compact block>
              <Form.Item
                name="orderId"
                noStyle
                rules={[{ required: true, message: '请输入订单 ID' }]}
              >
                <InputNumber
                  className="w-full"
                  aria-label="订单 ID"
                  placeholder="请输入订单 ID（数字）"
                  min={1}
                  disabled={Boolean(linkedAfterSalesCase)}
                  onChange={(value) => {
                    if (createEligibility?.order.id !== Number(value)) {
                      resetCreateEligibility();
                      createForm.setFieldValue('paymentId', undefined);
                    }
                  }}
                />
              </Form.Item>
              <Button
                loading={eligibilityLoading}
                onClick={() => void loadCreateEligibility(createForm.getFieldValue('orderId'))}
              >
                {createEligibility ? '重新核对' : '核对原付款'}
              </Button>
            </Space.Compact>
          </Form.Item>
          {eligibilityError ? (
            <Alert
              className="mb-4"
              type="error"
              showIcon
              message="原付款核对失败"
              description={eligibilityError}
              action={(
                <Button
                  size="small"
                  onClick={() => void loadCreateEligibility(createForm.getFieldValue('orderId'))}
                >
                  重试
                </Button>
              )}
            />
          ) : null}
          {createEligibility ? (
            <>
              <Alert
                className="mb-4"
                type={createEligibility.payments.some((payment) => payment.eligible) ? 'info' : 'warning'}
                showIcon
                message={`订单 ${createEligibility.order.orderNo} · 当前可退合计 ¥${Number(createEligibility.totalAvailableRefundAmount).toFixed(2)}`}
                description="每张退款单只绑定一笔原付款；定金与尾款需要分别选择并拆单，提交时服务端会在订单锁内再次核验。"
              />
              <Form.Item
                name="paymentId"
                label="原付款"
                initialValue={eligibleCreatePayments.length === 1
                  ? eligibleCreatePayments[0].id
                  : undefined}
                rules={[{ required: true, message: '请选择原付款' }]}
              >
                <Select
                  placeholder="请选择本次退款对应的原付款"
                  options={createEligibility.payments.map((payment) => {
                    const role = payment.installmentLabel
                      || PAYMENT_TYPE_LABELS[payment.type]
                      || payment.type;
                    const method = PAYMENT_METHOD_LABELS[payment.method] || payment.method;
                    const suffix = payment.reason ? ` · ${payment.reason}` : '';
                    return {
                      value: payment.id,
                      disabled: !payment.eligible,
                      label: `${role} · ${payment.paymentNo} · ${method} · 已收 ¥${Number(payment.amount).toFixed(2)} · 可退 ¥${Number(payment.availableRefundAmount).toFixed(2)}${suffix}`,
                    };
                  })}
                />
              </Form.Item>
            </>
          ) : null}
          <Form.Item name="amount" label="退款金额（元）" rules={[
            { required: true, message: '请输入退款金额' },
            { type: 'number', min: 0.01, message: '退款金额必须大于 0' },
          ]}>
            <InputNumber
              className="w-full"
              placeholder="退款金额"
              min={0.01}
              max={selectedPayment ? Number(selectedPayment.availableRefundAmount) : undefined}
              step={0.01}
              precision={2}
            />
          </Form.Item>
          <Form.Item name="reason" label="退款原因" rules={[{ required: true, message: '请填写退款原因' }]}>
            <Input.TextArea rows={3} placeholder="退款原因（将记录到交易事件）" />
          </Form.Item>
          <div className="text-xs text-brand-muted mb-3">系统将同时校验订单累计额度、所选原付款剩余额度和付款计划状态。原付款、金额或原因改变会视为新的退款意图。</div>
          <div className="flex justify-end gap-2">
            <Button onClick={closeCreateModal}>取消</Button>
            <Button type="primary" htmlType="submit" loading={creating}>提交申请</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

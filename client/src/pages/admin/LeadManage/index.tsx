import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Table,
  Tag,
  Select,
  Input,
  Button,
  Drawer,
  Descriptions,
  Space,
  Card,
  Timeline,
  Alert,
  Popconfirm,
  App as AntdApp,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  SearchOutlined,
  EyeOutlined,
  PhoneOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import api, {
  leadApi,
  type LeadClaimResult,
  type LeadReplyResult,
} from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import { unwrapResponse } from "@/utils/unwrap";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import {
  AdminLoadingState,
  AdminEmptyState,
  AdminErrorState,
} from "@/components/common/AdminDataStates";
import { SecureImage } from "@/components/common/SecureImage";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { requestStatus } from "@/services/httpClient";
import type { PaginatedResult } from "@/types";

type LeadType = "inquiry" | "selection";

interface LeadListRow {
  id: number;
  leadType: LeadType;
  leadTypeLabel: string;
  customerName: string;
  phone?: string | null;
  email?: string | null;
  relatedProducts: number;
  status: string;
  assignedTo?: number | null;
  assigneeName?: string | null;
  nextFollowUpAt?: string | null;
  retentionUntil?: string | null;
  legalHoldAt?: string | null;
  privacyDisposition?: "ANONYMIZED" | null;
  privacyDisposedAt?: string | null;
  createdAt: string;
}

interface LeadItem {
  id: number;
  productNameSnapshot: string;
  productSkuSnapshot?: string | null;
  productImageSnapshot?: string | null;
}

interface LeadFollowUp {
  id: number;
  type?: string;
  content?: string | null;
  contactMethod?: string | null;
  nextFollowUpAt?: string | null;
  createdAt: string;
  creator?: { realName?: string | null } | null;
}

interface LeadDetail extends Partial<LeadListRow> {
  id: number;
  customerId?: number | null;
  leadType: LeadType;
  leadTypeLabel: string;
  customerName: string;
  status: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  product?: { id: number; name: string; code?: string | null } | null;
  assignedTo?: number | null;
  assignee?: { realName?: string | null } | null;
  handler?: { realName?: string | null } | null;
  message?: string | null;
  reply?: string | null;
  repliedAt?: string | null;
  updatedAt?: string;
  internalNote?: string | null;
  closureReason?: string | null;
  items?: LeadItem[];
  followUps?: LeadFollowUp[];
}

interface AssignableStaff {
  id: number;
  name: string;
}

interface LeadNotificationFailure {
  id: number;
  leadId?: number | null;
  leadType?: LeadType | null;
  customerName?: string | null;
  attempts: number;
  lastErrorCode?: string | null;
  retryable: boolean;
  updatedAt: string;
}

interface LeadClaimFeedback {
  key: string;
  type: "success" | "warning" | "error";
  message: string;
  leadType: LeadType;
  leadId: number;
}

const NOTIFICATION_ERROR_LABELS: Record<string, string> = {
  SMTP_NOT_CONFIGURED: "邮件服务未配置",
  NOTIFICATION_DELIVERY_DISABLED: "外部投递门禁关闭",
  SMTP_SEND_FAILED: "邮件服务发送失败",
  DELIVERY_RESULT_UNKNOWN: "发送结果未知",
  DESTINATION_UNAVAILABLE: "收件信息不可用",
  INVALID_EVENT_PAYLOAD: "通知关联数据异常",
};

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  PENDING: { color: "warning", label: "待处理" },
  CONTACTED: { color: "processing", label: "已联系" },
  FOLLOWING: { color: "processing", label: "跟进中" },
  COMPLETED: { color: "success", label: "已完成" },
  INVALID: { color: "default", label: "无效" },
};

const CONTACT_METHOD_OPTIONS = [
  { value: "phone", label: "电话" },
  { value: "wechat", label: "微信" },
  { value: "email", label: "电子邮件" },
  { value: "store", label: "到店" },
  { value: "other", label: "其他" },
] as const;

const CONTACT_METHOD_LABELS = Object.fromEntries(
  CONTACT_METHOD_OPTIONS.map((option) => [option.value, option.label]),
) as Record<string, string>;

function toLocalDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function followUpSchedule(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  if (date.getTime() < now.getTime()) {
    return { color: "error", label: "已逾期", date };
  }
  if (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  ) {
    return { color: "warning", label: "今日到期", date };
  }
  return { color: "default", label: "待跟进", date };
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONTACTED", "INVALID"],
  CONTACTED: ["FOLLOWING", "COMPLETED", "INVALID"],
  FOLLOWING: ["COMPLETED", "INVALID"],
  COMPLETED: ["PENDING"],
  INVALID: ["PENDING"],
};

const LEGAL_HOLD_REASONS = [
  { value: "LEGAL_REQUIREMENT", label: "法律或监管要求" },
  { value: "DISPUTE_OR_CLAIM", label: "争议或权利主张处理中" },
  { value: "RIGHTS_REQUEST_REVIEW", label: "隐私权利请求复核中" },
  { value: "OTHER_REVIEW", label: "其他合规复核" },
] as const;

const LEGAL_HOLD_RELEASE_REASONS = [
  { value: "REQUIREMENT_ENDED", label: "法律或监管要求已结束" },
  { value: "DISPUTE_RESOLVED", label: "争议已经解决" },
  { value: "REVIEW_COMPLETED", label: "合规复核已经完成" },
  { value: "ENTERED_IN_ERROR", label: "原保留设置有误" },
] as const;

function createReplyIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.()
    ?? `lead-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function leadKey(type: LeadType, id: number) {
  return `${type}:${id}`;
}

function isClaimableLead(lead: {
  status: string;
  assignedTo?: number | null;
  assigneeName?: string | null;
  assignee?: { realName?: string | null } | null;
  handler?: { realName?: string | null } | null;
  privacyDisposedAt?: string | null;
}) {
  return lead.assignedTo == null
    && !lead.assigneeName
    && !lead.assignee?.realName
    && !lead.handler?.realName
    && !lead.privacyDisposedAt
    && lead.status !== "COMPLETED"
    && lead.status !== "INVALID";
}

export default function LeadManage() {
  const { message } = AntdApp.useApp();
  const [searchParams] = useSearchParams();
  const [list, setList] = useState<LeadListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [leadType, setLeadType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailId, setDetailId] = useState<{ type: LeadType; id: number } | null>(
    null,
  );
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [followUpContactMethod, setFollowUpContactMethod] = useState("phone");
  const [followUpNextAt, setFollowUpNextAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusReason, setStatusReason] = useState("");
  const [staff, setStaff] = useState<AssignableStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [assignTo, setAssignTo] = useState<number | undefined>(undefined);
  const [assigning, setAssigning] = useState(false);
  const [claimingLeadKey, setClaimingLeadKey] = useState<string | null>(null);
  const [claimFeedback, setClaimFeedback] = useState<LeadClaimFeedback | null>(
    null,
  );
  const claimInFlightRef = useRef<string | null>(null);
  const detailIdRef = useRef<{ type: LeadType; id: number } | null>(null);
  const [notificationFailures, setNotificationFailures] = useState<
    LeadNotificationFailure[]
  >([]);
  const [notificationFailureTotal, setNotificationFailureTotal] = useState(0);
  const [notificationFailureError, setNotificationFailureError] =
    useState(false);
  const [retryingNotificationId, setRetryingNotificationId] = useState<
    number | null
  >(null);
  const [legalHoldReason, setLegalHoldReason] = useState<string>();
  const [privacyUpdating, setPrivacyUpdating] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyIdempotencyKey, setReplyIdempotencyKey] = useState<string | null>(null);
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === "SUPER_ADMIN";
  const canAssign =
    role === "SUPER_ADMIN" || role === "ADMIN" || role === "CUSTOMER_SERVICE";
  const requestedStatus = searchParams.get("status") || "";
  const requestedType = searchParams.get("type") || "";
  const requestedNotification = searchParams.get("notification") || "";
  const requestedRetentionDue = searchParams.get("retention") === "due";

  useEffect(() => {
    setStatus(
      Object.prototype.hasOwnProperty.call(STATUS_MAP, requestedStatus)
        ? requestedStatus
        : "",
    );
    setPage(1);
  }, [requestedStatus]);

  useEffect(() => {
    setLeadType(
      requestedType === "inquiry" || requestedType === "selection"
        ? requestedType
        : "",
    );
    setPage(1);
  }, [requestedType]);

  const pageSize = 15;

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get("/leads", {
        params: {
          page,
          pageSize,
          status: status || undefined,
          type: leadType || undefined,
          keyword: keyword || undefined,
          retentionDue: requestedRetentionDue ? true : undefined,
        },
      });
      const data = unwrapResponse<PaginatedResult<LeadListRow>>(res);
      setList(data.list ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [keyword, leadType, page, pageSize, requestedRetentionDue, status]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const fetchNotificationFailures = useCallback(async () => {
    setNotificationFailureError(false);
    try {
      const res = await api.get("/leads/notification-failures", {
        params: { page: 1, pageSize: 20 },
      });
      const data = unwrapResponse<PaginatedResult<LeadNotificationFailure>>(res);
      setNotificationFailures(data.list ?? []);
      setNotificationFailureTotal(data.total ?? 0);
    } catch {
      setNotificationFailureError(true);
    }
  }, []);

  useEffect(() => {
    void fetchNotificationFailures();
  }, [fetchNotificationFailures]);

  const openDetail = async (type: LeadType, id: number) => {
    const isSameLead = detailId?.type === type && detailId.id === id;
    if (!isSameLead) {
      setReplyText("");
      setReplyError(null);
      setReplyIdempotencyKey(null);
    }
    detailIdRef.current = { type, id };
    setDetailId({ type, id });
    setDetailError(false);
    setDetail(null);
    setStatusReason("");
    setLegalHoldReason(undefined);
    try {
      const res = await api.get(`/leads/${type}/${id}`);
      const loaded = unwrapResponse<LeadDetail>(res);
      setDetail(loaded);
      setFollowUpNextAt(toLocalDateTimeInput(loaded.nextFollowUpAt));
      const latestRecordedMethod = loaded.followUps?.find(
        (followUp) => followUp.type === "FOLLOW_UP" && followUp.contactMethod,
      )?.contactMethod;
      setFollowUpContactMethod(latestRecordedMethod || "phone");
    } catch {
      // P1-39：详情加载失败标记错误态，避免抽屉永久 loading 无法区分加载中/失败
      setDetailError(true);
    }
  };

  const submitReply = async () => {
    if (!detailId || !detail?.updatedAt) return;
    const reply = replyText.trim();
    if (!reply) {
      setReplyError("请输入客户可见的回复内容。");
      return;
    }
    const idempotencyKey = replyIdempotencyKey ?? createReplyIdempotencyKey();
    setReplyIdempotencyKey(idempotencyKey);
    setReplying(true);
    setReplyError(null);
    try {
      const response = await leadApi.reply(
        detailId.type,
        detailId.id,
        { reply, expectedUpdatedAt: detail.updatedAt },
        idempotencyKey,
      );
      const result = unwrapResponse<LeadReplyResult>(response);
      setDetail((current) => current
        ? {
            ...current,
            status: result.status,
            updatedAt: result.updatedAt,
            reply: result.reply.content,
            repliedAt: result.reply.createdAt,
          }
        : current);
      setReplyText("");
      setReplyIdempotencyKey(null);
      message.success("客户回复已提交，站内通知已生成");
      await Promise.all([fetchList(), openDetail(detailId.type, detailId.id)]);
    } catch (error) {
      const safeMessage = getSafeAdminErrorMessage(
        error,
        "客户回复提交失败，内容已保留，请稍后重新提交。",
      );
      setReplyError(safeMessage);
      if (requestStatus(error) === 409) {
        setReplyIdempotencyKey(null);
        await openDetail(detailId.type, detailId.id);
      }
    } finally {
      setReplying(false);
    }
  };

  const retryNotification = async (event: LeadNotificationFailure) => {
    setRetryingNotificationId(event.id);
    try {
      await api.post(`/leads/notification-failures/${event.id}/retry`);
      message.success("已加入重新投递队列，处理结果会继续记录在系统中");
      await fetchNotificationFailures();
      if (
        detailId
        && event.leadId === detailId.id
        && event.leadType === detailId.type
      ) {
        await openDetail(detailId.type, detailId.id);
      }
    } catch (error) {
      message.error(
        getSafeAdminErrorMessage(
          error,
          "通知重投失败，请刷新状态并确认邮件服务配置。",
        ),
      );
    } finally {
      setRetryingNotificationId(null);
    }
  };

  const updateLegalHold = async (release: boolean) => {
    if (!detailId || !legalHoldReason) return;
    setPrivacyUpdating(true);
    try {
      const payload = { reason: legalHoldReason };
      if (release) {
        await api.post(
          `/leads/${detailId.type}/${detailId.id}/legal-hold/release`,
          payload,
        );
      } else {
        await api.post(
          `/leads/${detailId.type}/${detailId.id}/legal-hold`,
          payload,
        );
      }
      message.success(release ? "法律保留已解除" : "法律保留已设置");
      setLegalHoldReason(undefined);
      await openDetail(detailId.type, detailId.id);
      await fetchList();
    } catch (error) {
      message.error(
        getSafeAdminErrorMessage(
          error,
          release ? "解除法律保留失败，请刷新后重试。" : "设置法律保留失败，请刷新后重试。",
        ),
      );
    } finally {
      setPrivacyUpdating(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!detailId) return;
    const needsClosureReason = newStatus === "COMPLETED" || newStatus === "INVALID";
    const needsReopenReason =
      (detail?.status === "COMPLETED" || detail?.status === "INVALID") &&
      newStatus === "PENDING";
    const reason = statusReason.trim();
    if ((needsClosureReason || needsReopenReason) && !reason) {
      message.warning(needsReopenReason ? "请填写重新打开原因" : "请填写完成或无效原因");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/leads/${detailId.type}/${detailId.id}`, {
        status: newStatus,
        ...(needsClosureReason ? { closureReason: reason } : {}),
        ...(needsReopenReason ? { reopenReason: reason } : {}),
      });
      message.success("状态已更新");
      setStatusReason("");
      openDetail(detailId.type, detailId.id);
      fetchList();
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "线索状态更新失败，请重新加载后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!detailId) return;
    setSaving(true);
    try {
      await api.put(`/leads/${detailId.type}/${detailId.id}`, {
        internalNote: noteText,
      });
      message.success("备注已保存");
      openDetail(detailId.type, detailId.id);
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "内部备注保存失败，请检查内容后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const addFollowUp = async () => {
    if (!detailId || !noteText) return;
    const nextFollowUpAt = followUpNextAt
      ? new Date(followUpNextAt).toISOString()
      : null;
    setSaving(true);
    try {
      await api.post(`/leads/${detailId.type}/${detailId.id}/follow-up`, {
        content: noteText,
        contactMethod: followUpContactMethod,
        nextFollowUpAt,
      });
      message.success("跟进已添加");
      setNoteText("");
      openDetail(detailId.type, detailId.id);
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "跟进记录添加失败，请检查内容后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const res = await api.get("/users/assignable");
      setStaff(unwrapResponse<AssignableStaff[]>(res) || []);
    } catch (error) {
      setStaff([]);
      message.error(getSafeAdminErrorMessage(error, "人员列表加载失败，请刷新后重试。"));
    } finally {
      setStaffLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!detailId || !assignTo) return;
    setAssigning(true);
    try {
      await api.put(`/leads/${detailId.type}/${detailId.id}`, {
        assignedTo: assignTo,
      });
      message.success("已指派");
      setAssignTo(undefined);
      openDetail(detailId.type, detailId.id);
      fetchList();
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "线索指派失败，请重新加载人员列表后重试。"));
    } finally {
      setAssigning(false);
    }
  };

  const refreshLeadViews = async (type: LeadType, id: number) => {
    const activeDetail = detailIdRef.current;
    await Promise.all([
      fetchList(),
      activeDetail?.type === type && activeDetail.id === id
        ? openDetail(type, id)
        : Promise.resolve(),
    ]);
  };

  const handleClaim = async (type: LeadType, id: number) => {
    const key = leadKey(type, id);
    if (claimInFlightRef.current) return;

    claimInFlightRef.current = key;
    setClaimingLeadKey(key);
    setClaimFeedback(null);
    try {
      const response = await leadApi.claim(type, id);
      unwrapResponse<LeadClaimResult>(response);
      setClaimFeedback({
        key,
        type: "success",
        message: "线索已领取。",
        leadType: type,
        leadId: id,
      });
      message.success("线索已领取");
      await refreshLeadViews(type, id);
    } catch (error) {
      const isConflict = requestStatus(error) === 409;
      const feedbackMessage = isConflict
        ? "线索已被其他员工领取。请重新加载后确认负责人。"
        : getSafeAdminErrorMessage(
            error,
            "线索领取失败，请重新加载后重试。",
          );
      setClaimFeedback({
        key,
        type: isConflict ? "warning" : "error",
        message: feedbackMessage,
        leadType: type,
        leadId: id,
      });
      if (isConflict) {
        message.warning(feedbackMessage);
      } else {
        message.error(feedbackMessage);
      }
    } finally {
      claimInFlightRef.current = null;
      setClaimingLeadKey(null);
    }
  };

  const renderClaimFeedback = (feedback: LeadClaimFeedback) => (
    <Alert
      type={feedback.type}
      showIcon
      closable
      message={feedback.message}
      action={feedback.type === "success" ? undefined : (
        <Button
          size="small"
          onClick={() => void refreshLeadViews(feedback.leadType, feedback.leadId)}
        >
          重新加载
        </Button>
      )}
      onClose={() => setClaimFeedback(null)}
    />
  );

  const columns: TableColumnsType<LeadListRow> = [
    { title: "客户", dataIndex: "customerName", width: 100 },
    {
      title: "类型",
      dataIndex: "leadTypeLabel",
      width: 80,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: "联系方式",
      width: 130,
      render: (_, row) => (
        <Space>
          {row.phone && (
            <>
              <PhoneOutlined />
              {row.phone}
            </>
          )}
          {row.email && (
            <>
              <MailOutlined />
              {row.email}
            </>
          )}
        </Space>
      ),
    },
    {
      title: "相关商品",
      width: 80,
      render: (_, row) => row.relatedProducts || 0,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 80,
      render: (s: string) => (
        <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label || s}</Tag>
      ),
    },
    {
      title: "负责人",
      dataIndex: "assigneeName",
      width: 80,
      render: (v: string) => v || "—",
    },
    {
      title: "下次跟进",
      dataIndex: "nextFollowUpAt",
      width: 180,
      render: (v: string) => {
        const schedule = followUpSchedule(v);
        if (!schedule) return "—";
        return (
          <Space size={4} wrap>
            <Tag color={schedule.color}>{schedule.label}</Tag>
            <span>{schedule.date.toLocaleString("zh-CN")}</span>
          </Space>
        );
      },
    },
    {
      title: "留存复核",
      width: 110,
      render: (_, row) => {
        if (row.privacyDisposedAt) return <Tag>已匿名化</Tag>;
        if (row.legalHoldAt) return <Tag color="processing">法律保留</Tag>;
        const v = row.retentionUntil;
        if (!v) return "—";
        const due = new Date(v).getTime() <= Date.now();
        return (
          <Tag color={due ? "error" : "default"}>
            {due ? "已到期" : new Date(v).toLocaleDateString("zh-CN")}
          </Tag>
        );
      },
    },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      width: 150,
      render: (v: string) => (v ? new Date(v).toLocaleString("zh-CN") : "—"),
    },
    {
      title: "操作",
      width: 140,
      render: (_, row) => {
        const key = leadKey(row.leadType, row.id);
        return (
          <Space size={4}>
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openDetail(row.leadType, row.id)}
            >
              查看
            </Button>
            {canAssign && isClaimableLead(row) && (
              <Button
                type="link"
                size="small"
                loading={claimingLeadKey === key}
                disabled={claimingLeadKey !== null && claimingLeadKey !== key}
                onClick={() => void handleClaim(row.leadType, row.id)}
              >
                领取线索
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="客户线索"
        subtitle="统一管理预约咨询、选款咨询与定制咨询"
      />
      {claimFeedback
        && (!detailId || claimFeedback.key !== leadKey(detailId.type, detailId.id))
        && (
          <div style={{ marginBottom: 16 }}>
            {renderClaimFeedback(claimFeedback)}
          </div>
        )}
      {requestedRetentionDue && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="正在查看留存期已到期的线索"
          description="本页用于授权人员复核。匿名化 CLI 默认只预览；真实执行必须显式开启一次性门禁、提供超级管理员身份和固定确认词。法律保留中的线索不会进入处置批次。"
        />
      )}
      {(notificationFailureError
        || notificationFailureTotal > 0
        || requestedNotification === "failed") && (
        <Alert
          style={{ marginBottom: 16 }}
          type={
            notificationFailureError
              ? "warning"
              : notificationFailureTotal > 0
                ? "error"
                : "success"
          }
          showIcon
          message={
            notificationFailureError
              ? "通知投递异常状态读取失败"
              : notificationFailureTotal > 0
                ? `${notificationFailureTotal} 条咨询回复通知需要处理`
                : "当前没有失败的咨询回复通知"
          }
          description={
            notificationFailureError ? (
              <Button size="small" onClick={fetchNotificationFailures}>
                重新读取
              </Button>
            ) : notificationFailureTotal > 0 ? (
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                {notificationFailures.map((event) => (
                  <Space key={event.id} wrap>
                    <span>
                      事件 #{event.id}
                      {event.customerName ? ` · ${event.customerName}` : ""}
                      {event.leadId ? ` · 线索 #${event.leadId}` : ""}
                    </span>
                    <Tag color={event.retryable ? "warning" : "error"}>
                      {event.lastErrorCode
                        ? NOTIFICATION_ERROR_LABELS[event.lastErrorCode]
                          || event.lastErrorCode
                        : "未知失败"}
                    </Tag>
                    <span>
                      已尝试 {event.attempts} 次 ·{" "}
                      {new Date(event.updatedAt).toLocaleString("zh-CN")}
                    </span>
                    {event.leadId && event.leadType && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() =>
                          void openDetail(event.leadType as LeadType, event.leadId as number)
                        }
                      >
                        查看线索
                      </Button>
                    )}
                    {event.retryable ? (
                      <Popconfirm
                        title="确认重新投递这条回复通知？"
                        description="系统会在投递服务可用时再次向客户邮箱发送原回复。"
                        okText="确认重投"
                        cancelText="取消"
                        onConfirm={() => retryNotification(event)}
                      >
                        <Button
                          size="small"
                          type="primary"
                          loading={retryingNotificationId === event.id}
                        >
                          重新投递
                        </Button>
                      </Popconfirm>
                    ) : (
                      <span>需人工核对，系统禁止重投</span>
                    )}
                  </Space>
                ))}
                {notificationFailureTotal > notificationFailures.length && (
                  <span>
                    当前显示最近 {notificationFailures.length} 条，请处理后刷新查看其余记录。
                  </span>
                )}
              </Space>
            ) : undefined
          }
        />
      )}
      <Card
        style={{
          borderRadius: 10,
          border: "1px solid var(--adm-line)",
          marginBottom: 16,
        }}
      >
        <Space wrap>
          <Input
            placeholder="客户姓名/电话（回车应用）"
            prefix={<SearchOutlined />}
            value={keywordInput}
            onChange={(e) => {
              setKeywordInput(e.target.value);
              // allowClear 清空时同步重置已应用的关键词
              if (e.target.value === "" && keyword) {
                setKeyword("");
                setPage(1);
              }
            }}
            onPressEnter={() => {
              setKeyword(keywordInput);
              setPage(1);
            }}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="线索类型"
            value={leadType || undefined}
            onChange={(v) => {
              setLeadType(v || "");
              setPage(1);
            }}
            allowClear
            style={{ width: 120 }}
          >
            <Select.Option value="inquiry">预约咨询</Select.Option>
            <Select.Option value="selection">选款咨询</Select.Option>
          </Select>
          <Select
            placeholder="状态筛选"
            value={status || undefined}
            onChange={(v) => {
              setStatus(v || "");
              setPage(1);
            }}
            allowClear
            style={{ width: 120 }}
          >
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <Select.Option key={k} value={k}>
                {v.label}
              </Select.Option>
            ))}
          </Select>
          <Button
            type="primary"
            onClick={fetchList}
          >
            搜索
          </Button>
        </Space>
      </Card>

      {error ? (
        <AdminErrorState onRetry={fetchList} />
      ) : (
        <Table
          columns={columns}
          dataSource={list}
          rowKey={(r) => `${r.leadType}-${r.id}`}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showTotal: (t: number) => `共 ${t} 条`,
          }}
          locale={{ emptyText: <AdminEmptyState description="暂无客户线索" /> }}
          scroll={{ x: 1000 }}
        />
      )}

      <Drawer
        title={`线索详情`}
        open={detailId !== null}
        onClose={() => {
          detailIdRef.current = null;
          setDetailId(null);
          setDetail(null);
          setReplyText("");
          setReplyError(null);
          setReplyIdempotencyKey(null);
        }}
        width={640}
      >
        {detail ? (
          <>
            {claimFeedback
              && detailId
              && claimFeedback.key === leadKey(detailId.type, detailId.id)
              && (
                <div style={{ marginBottom: 16 }}>
                  {renderClaimFeedback(claimFeedback)}
                </div>
              )}
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="客户">
                {detail.customerName}
              </Descriptions.Item>
              <Descriptions.Item label="电话">
                {detail.phone || detail.customerPhone || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="邮箱">
                {detail.email || detail.customerEmail || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag>{detail.leadTypeLabel}</Tag>
              </Descriptions.Item>
              {detail.leadType === "inquiry" && detail.product && (
                <Descriptions.Item label="来源作品">
                  <Space direction="vertical" size={0}>
                    <span>{detail.product.name}</span>
                    <span style={{ color: "var(--adm-muted)", fontSize: 12 }}>
                      货号：{detail.product.code || "历史记录未保留货号"}
                    </span>
                  </Space>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[detail.status]?.color}>
                  {STATUS_MAP[detail.status]?.label || detail.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="下次跟进">
                {detail.nextFollowUpAt
                  ? new Date(detail.nextFollowUpAt).toLocaleString("zh-CN")
                  : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="隐私处置">
                {detail.privacyDisposedAt ? (
                  <Tag>已匿名化</Tag>
                ) : detail.legalHoldAt ? (
                  <Tag color="processing">法律保留中</Tag>
                ) : (
                  <Tag color="default">按留存规则复核</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="负责人">
                {detail.assignee?.realName || detail.handler?.realName || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="提交内容">
                {detail.message || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="客户可见回复">
                {detail.reply || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="内部备注">
                {detail.internalNote || "—"}
              </Descriptions.Item>
              {(detail.status === "COMPLETED" || detail.status === "INVALID") && (
                <Descriptions.Item label="关闭原因">
                  {detail.closureReason || "历史记录未保留原因"}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="提交时间">
                {detail.createdAt
                  ? new Date(detail.createdAt).toLocaleString("zh-CN")
                  : "—"}
              </Descriptions.Item>
            </Descriptions>

            {detail.privacyDisposedAt && (
              <Alert
                style={{ marginTop: 16 }}
                type="info"
                showIcon
                message="该线索已完成匿名化"
                description={`处置时间：${new Date(detail.privacyDisposedAt).toLocaleString("zh-CN")}。业务骨架与结构化审计保留，个人信息和自由文本不可恢复；本页禁止继续分配、回复或跟进。`}
              />
            )}

            {isSuperAdmin && !detail.privacyDisposedAt && detailId && (
              <Card
                size="small"
                title={
                  <Space>
                    <SafetyCertificateOutlined />
                    法律保留
                  </Space>
                }
                style={{ marginTop: 16 }}
              >
                <Alert
                  type={detail.legalHoldAt ? "warning" : "info"}
                  showIcon
                  message={
                    detail.legalHoldAt
                      ? "该线索不会进入到期匿名化批次"
                      : "仅在确有法律、争议或权利请求复核依据时设置"
                  }
                  style={{ marginBottom: 12 }}
                />
                <Space wrap>
                  <Select<string>
                    style={{ minWidth: 240 }}
                    placeholder={detail.legalHoldAt ? "选择解除原因" : "选择保留原因"}
                    value={legalHoldReason}
                    onChange={setLegalHoldReason}
                    options={
                      detail.legalHoldAt
                        ? [...LEGAL_HOLD_RELEASE_REASONS]
                        : [...LEGAL_HOLD_REASONS]
                    }
                  />
                  <Popconfirm
                    title={detail.legalHoldAt ? "确认解除法律保留？" : "确认设置法律保留？"}
                    description={
                      detail.legalHoldAt
                        ? "解除后，到期线索可再次进入匿名化预览。"
                        : "设置后，该线索会从到期匿名化候选中排除。"
                    }
                    okText={detail.legalHoldAt ? "确认解除" : "确认设置"}
                    cancelText="取消"
                    onConfirm={() => updateLegalHold(Boolean(detail.legalHoldAt))}
                  >
                    <Button
                      type="primary"
                      loading={privacyUpdating}
                      disabled={!legalHoldReason}
                    >
                      {detail.legalHoldAt ? "解除法律保留" : "设置法律保留"}
                    </Button>
                  </Popconfirm>
                </Space>
              </Card>
            )}

            {detail.items && detail.items.length > 0 && (
              <>
                <h4 style={{ marginTop: 16 }}>
                  选款商品（{detail.items.length}）
                </h4>
                {detail.items.map((item) => (
                  <Card key={item.id} size="small" style={{ marginBottom: 8 }}>
                    <Space>
                      {item.productImageSnapshot && (
                        <SecureImage
                          src={item.productImageSnapshot}
                          alt=""
                          style={{
                            width: 48,
                            height: 48,
                            objectFit: "cover",
                            borderRadius: 4,
                          }}
                          tokenKind="staff"
                        />
                      )}
                      <div>
                        <strong>{item.productNameSnapshot}</strong>
                        <div style={{ color: "var(--adm-muted)", fontSize: 12 }}>
                          {item.productSkuSnapshot}
                        </div>
                      </div>
                    </Space>
                  </Card>
                ))}
              </>
            )}

            <Card size="small" title="回复客户" style={{ marginTop: 16 }}>
              {detail.privacyDisposedAt ? (
                <Alert
                  type="info"
                  showIcon
                  message="匿名化线索不能回复"
                />
              ) : !detail.customerId ? (
                <Alert
                  type="info"
                  showIcon
                  message="该线索未关联已登录客户"
                  description="游客咨询无法生成客户中心站内回复；请根据其电话或邮箱，在下方记录实际联系渠道与跟进结果。"
                />
              ) : detail.status === "COMPLETED" || detail.status === "INVALID" ? (
                <Alert
                  type="warning"
                  showIcon
                  message="当前状态不能回复"
                  description="请先重新打开线索，再提交新的客户回复。"
                />
              ) : (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Input.TextArea
                    aria-label="客户可见回复"
                    rows={4}
                    value={replyText}
                    maxLength={5000}
                    showCount
                    disabled={replying}
                    placeholder="输入将展示在客户中心的回复内容"
                    onChange={(event) => {
                      setReplyText(event.target.value);
                      setReplyError(null);
                      setReplyIdempotencyKey(null);
                    }}
                  />
                  {replyError ? (
                    <Alert
                      type="error"
                      showIcon
                      message={replyError}
                      action={
                        <Button
                          size="small"
                          onClick={() => void submitReply()}
                          loading={replying}
                        >
                          重新提交
                        </Button>
                      }
                    />
                  ) : null}
                  <Button
                    type="primary"
                    onClick={() => void submitReply()}
                    loading={replying}
                    disabled={!replyText.trim() || !detail.updatedAt}
                  >
                    提交回复
                  </Button>
                </Space>
              )}
            </Card>

            <h4 style={{ marginTop: 16 }}>跟进记录</h4>
            {(detail.followUps?.length ?? 0) > 0 ? (
              <Timeline
                items={(detail.followUps ?? []).map((followUp) => ({
                  children: (
                    <div>
                      <div>{followUp.content || "系统记录"}</div>
                      <small style={{ color: "var(--adm-muted)" }}>
                        {followUp.creator?.realName || "系统"} ·{" "}
                        {new Date(followUp.createdAt).toLocaleString("zh-CN")}
                      </small>
                      {(followUp.contactMethod || followUp.nextFollowUpAt) && (
                        <div style={{ marginTop: 4 }}>
                          <Space size={4} wrap>
                            {followUp.contactMethod && (
                              <Tag>{CONTACT_METHOD_LABELS[followUp.contactMethod] || followUp.contactMethod}</Tag>
                            )}
                            {followUp.nextFollowUpAt && (
                              <span style={{ color: "var(--adm-muted)", fontSize: 12 }}>
                                下次：{new Date(followUp.nextFollowUpAt).toLocaleString("zh-CN")}
                              </span>
                            )}
                          </Space>
                        </div>
                      )}
                    </div>
                  ),
                }))}
              />
            ) : (
              <AdminEmptyState description="暂无跟进记录" />
            )}

            {!detail.privacyDisposedAt && (
              <>
            <div style={{ marginTop: 16 }}>
              <Input.TextArea
                aria-label="内部备注或跟进内容"
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="添加内部备注或跟进记录..."
              />
              <Space wrap style={{ marginTop: 8, width: "100%" }}>
                <Select
                  aria-label="跟进渠道"
                  value={followUpContactMethod}
                  onChange={setFollowUpContactMethod}
                  options={CONTACT_METHOD_OPTIONS.map((option) => ({ ...option }))}
                  style={{ width: 140 }}
                />
                <Input
                  aria-label="下次跟进时间"
                  type="datetime-local"
                  value={followUpNextAt}
                  onChange={(event) => setFollowUpNextAt(event.target.value)}
                  style={{ width: 210 }}
                />
                <Button onClick={saveNote} loading={saving}>
                  保存备注
                </Button>
                <Button
                  onClick={addFollowUp}
                  loading={saving}
                  type="primary"
                >
                  添加跟进
                </Button>
              </Space>
            </div>

            {canAssign && detailId && (
              <div style={{ marginTop: 16 }}>
                <Space wrap>
                  {isClaimableLead(detail) && (
                    <Button
                      type="primary"
                      onClick={() => void handleClaim(detailId.type, detailId.id)}
                      loading={
                        claimingLeadKey === leadKey(detailId.type, detailId.id)
                      }
                      disabled={
                        claimingLeadKey !== null
                        && claimingLeadKey !== leadKey(detailId.type, detailId.id)
                      }
                    >
                      领取线索
                    </Button>
                  )}
                  <span>指派负责人：</span>
                  <Select
                    style={{ minWidth: 180 }}
                    placeholder="选择员工"
                    value={assignTo}
                    onChange={setAssignTo}
                    loading={staffLoading}
                    options={staff.map((user) => ({
                      value: user.id,
                      label: user.name,
                    }))}
                    onOpenChange={(open) => {
                      if (open && staff.length === 0) void loadStaff();
                    }}
                  />
                  <Button
                    type="primary"
                    size="small"
                    onClick={handleAssign}
                    loading={assigning}
                  >
                    指派
                  </Button>
                </Space>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <Input.TextArea
                rows={2}
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
                maxLength={1000}
                showCount
                placeholder={
                  detail.status === "COMPLETED" || detail.status === "INVALID"
                    ? "重新打开原因（必填）"
                    : "完成或标记无效的原因（执行对应状态时必填）"
                }
                aria-label="状态变更原因"
              />
              <Space>
                <span>状态流转：</span>
                {(STATUS_TRANSITIONS[detail.status] ?? []).map((nextStatus) => (
                  <Button
                    key={nextStatus}
                    size="small"
                    danger={nextStatus === "INVALID"}
                    loading={saving}
                    onClick={() => updateStatus(nextStatus)}
                  >
                    {nextStatus === "INVALID"
                      ? "标记无效"
                      : nextStatus === "PENDING"
                        ? "重新打开"
                        : STATUS_MAP[nextStatus].label}
                  </Button>
                ))}
              </Space>
            </div>
              </>
            )}
          </>
        ) : detailError ? (
          <AdminErrorState
            onRetry={() => {
              if (detailId) void openDetail(detailId.type, detailId.id);
            }}
          />
        ) : (
          <AdminLoadingState subject="线索详情" />
        )}
      </Drawer>
    </div>
  );
}

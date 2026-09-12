// 客户中心登录态主面板：账户总览/心愿单/订单(可视化进度+物流轨迹+评价)/个人资料(导出与注销)/地址管理
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  App as AntdApp,
  Modal,
  Upload,
  Form,
  Input,
  Button,
  Pagination,
  Radio,
} from "antd";
import { customerApi } from "@/services/api";
import {
  customerProfileApi,
  type ContactChangeChallenge,
  type ContactChangeType,
} from "@/services/clients/customerProfileClient";
import { getRequestErrorMessage } from "@/services/httpClient";
import { unwrapResponse } from "@/utils/unwrap";
import { useCommerceEnabled } from "@/store/featureFlags";
import { SecureImage } from "@/components/common/SecureImage";
import CustomerPaymentDialog, {
  type CustomerPaymentOrder,
} from "@/components/commerce/CustomerPaymentDialog";
import CustomerAfterSalesDialog, {
  getCustomerAfterSalesError,
  getRequestableAfterSalesItems,
} from "./CustomerAfterSalesDialog";
import CustomerOrdersPanel from "./CustomerOrdersPanel";
import CustomerReviewDialog from "./CustomerReviewDialog";
import ForYouRecommendations from "./ForYouRecommendations";
import CustomerNotificationsPanel from "./CustomerNotificationsPanel";
import {
  ACCOUNT_PASSWORD_HINT,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  EXISTING_PASSWORD_MAX_LENGTH,
  isAccountPasswordValid,
} from "@/config/accountPasswordPolicy";
import type {
  CustomerAfterSalesCase,
  CustomerConsultationDetail,
  CustomerConsultationReply,
  CustomerNotificationPage,
  CustomerOrder,
  CustomerReviewOrder,
  CustomerAddress,
  CustomerInquiryPage,
  CustomerPartnerState,
  CustomerProfile,
  CustomerSelectionInquiry,
} from "./types";
import "./MyAccountDashboard.css";

type AccountDashboardProps = {
  profile: CustomerProfile | null;
  orders: CustomerOrder[];
  addresses: CustomerAddress[];
  selectionInquiries: CustomerSelectionInquiry[];
  selectionInquiryLoading: boolean;
  selectionInquiryError: string | null;
  onRetrySelectionInquiries: () => Promise<void>;
  selectedLeadId: number | null;
  consultationDetail: CustomerConsultationDetail | null;
  consultationLoading: boolean;
  consultationError: "not-found" | "error" | null;
  onRetryConsultation?: () => Promise<void>;
  inquiryPage: CustomerInquiryPage;
  inquiryLoading: boolean;
  inquiryError: string | null;
  onInquiryPageChange: (page: number) => Promise<void>;
  partner: CustomerPartnerState;
  partnerError: string | null;
  notifications: CustomerNotificationPage;
  notificationLoading: boolean;
  notificationError: string | null;
  onRetryNotifications: () => Promise<void>;
  onReadNotification: (id: number) => Promise<void>;
  onReadAllNotifications: () => Promise<void>;
  onSignOut: () => void;
  onRefresh?: () => void;
};

type AccountAddress = AccountDashboardProps["addresses"][number];

const inquiryStatus: Record<string, string> = {
  PENDING: "待顾问联系",
  PROCESSING: "顾问跟进中",
  CONTACTED: "已联系",
  FOLLOWING: "持续跟进中",
  REPLIED: "已回复",
  COMPLETED: "已完成",
  INVALID: "已关闭",
  CLOSED: "已结束",
};

// 合作商家身份状态文案（与后端 PartnerStatus 对齐）
const PARTNER_STATUS_LABEL: Record<string, string> = {
  NONE: "尚未申请合作商家身份",
  PENDING: "合作申请审核中",
  NEEDS_SUPPLEMENT: "合作申请待补充资料",
  REJECTED: "合作申请未通过",
  SUSPENDED: "合作资格已暂停",
};

// 合作商家区块入口动作：按状态给出可操作目标
const PARTNER_ACTION: Record<string, { label: string; to: string }> = {
  NONE: { label: "申请合作商家", to: "/customer?section=partner" },
  PENDING: { label: "查看进度", to: "/customer?section=partner" },
  NEEDS_SUPPLEMENT: { label: "补充资料", to: "/customer?section=partner" },
  REJECTED: { label: "重新申请", to: "/customer?section=partner" },
  SUSPENDED: { label: "联系顾问", to: "/contact" },
  APPROVED: { label: "查看合作作品", to: "/catalog" },
};

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="my-account-empty">{children}</p>;
}

function ConsultationDetail({
  detailId,
  message,
  reply,
  selected,
  children,
}: {
  detailId: string;
  message?: string | null;
  reply?: CustomerConsultationReply | null;
  selected: boolean;
  children?: React.ReactNode;
}) {
  return (
    <details
      id={detailId}
      className="my-account__consultation-detail"
      open={selected}
      tabIndex={-1}
    >
      <summary>查看详情</summary>
      <div className="my-account__consultation-body">
        {children}
        <div>
          <h4>我的需求</h4>
          <p>{message || "提交时未填写补充说明。"}</p>
        </div>
        <div className="my-account__consultation-reply">
          <h4>顾问回复</h4>
          {reply ? (
            <>
              <p>{reply.content}</p>
              <small>
                海川顾问 · {new Date(reply.createdAt).toLocaleString("zh-CN")}
              </small>
            </>
          ) : (
            <p>顾问尚未回复，请留意服务通知和当前处理状态。</p>
          )}
        </div>
      </div>
    </details>
  );
}

function ConsultationContext({ detail }: { detail: CustomerConsultationDetail }) {
  if (detail.type === "selection") {
    return (
      <div>
        <h4>所选作品</h4>
        <p>
          {detail.items.map((item) => item.productNameSnapshot).join("、")
            || "历史记录未保留作品名称。"}
        </p>
      </div>
    );
  }
  return (
    <div>
      <h4>服务信息</h4>
      <p>
        {[
          detail.preferredContact
            ? `联系偏好：${detail.preferredContact}`
            : null,
          detail.preferredTime ? `方便时间：${detail.preferredTime}` : null,
          detail.budgetRange ? `预算范围：${detail.budgetRange}` : null,
        ].filter(Boolean).join("；") || "暂无补充服务信息。"}
      </p>
    </div>
  );
}

export default function MyAccountDashboard({
  profile,
  partner,
  orders,
  addresses,
  selectionInquiries,
  selectionInquiryLoading,
  selectionInquiryError,
  onRetrySelectionInquiries,
  selectedLeadId,
  consultationDetail,
  consultationLoading,
  consultationError,
  onRetryConsultation,
  inquiryPage,
  inquiryLoading,
  inquiryError,
  onInquiryPageChange,
  notifications,
  notificationLoading,
  notificationError,
  onRetryNotifications,
  onReadNotification,
  onReadAllNotifications,
  onSignOut,
  onRefresh,
  partnerError,
}: AccountDashboardProps) {
  const { message, modal } = AntdApp.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const name = profile?.name || "海川贵宾";
  const commerceEnabled = useCommerceEnabled();
  const inquiries = inquiryPage.list;
  const partnerStatus = partner?.customer?.partnerStatus || "NONE";
  const partnerApprovedAt = partner?.customer?.partnerApprovedAt || null;
  const [selectionPage, setSelectionPage] = useState(1);
  const selectionPageSize = 3;
  const selectionPageCount = Math.max(
    1,
    Math.ceil(selectionInquiries.length / selectionPageSize),
  );
  const visibleSelectionInquiries = selectionInquiries.slice(
    (selectionPage - 1) * selectionPageSize,
    selectionPage * selectionPageSize,
  );

  useEffect(() => {
    if (selectionPage <= selectionPageCount) return;
    setSelectionPage(selectionPageCount);
  }, [selectionPage, selectionPageCount]);

  useEffect(() => {
    if (selectedLeadId === null) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById("consultation-focus");
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [consultationDetail, consultationError, consultationLoading, selectedLeadId]);

  const clearConsultationUrl = (focusTargetId: string) => {
    const params = new URLSearchParams(location.search);
    params.delete("leadId");
    if (params.get("section") === "consultations") params.delete("section");
    const search = params.toString();
    navigate(`${location.pathname}${search ? `?${search}` : ""}`, {
      replace: true,
    });
    requestAnimationFrame(() => {
      document.getElementById(focusTargetId)?.focus({ preventScroll: true });
    });
  };

  const consultationTitle = consultationDetail?.type === "selection"
    ? consultationDetail.items[0]?.productNameSnapshot || "选款咨询"
    : consultationDetail?.product?.name
      || consultationDetail?.consultationType
      || "预约咨询";

  // 心愿单（组件自治拉取：CustomerCenter 无需为其扩展 props）
  const [favorites, setFavorites] = useState<
    Array<{
      id: number;
      productId: number;
      name: string;
      code?: string;
      shortDescription?: string | null;
      price?: number | string | null;
      image?: string | null;
      favoritedAt: string;
    }>
  >([]);
  const [favoriteStatus, setFavoriteStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");

  const loadFavorites = useCallback(async () => {
    setFavoriteStatus("loading");
    try {
      const response = await customerApi.getFavorites();
      setFavorites(unwrapResponse<typeof favorites>(response) || []);
      setFavoriteStatus("ready");
    } catch {
      setFavoriteStatus("error");
    }
  }, []);

  const removeFavorite = (productId: number) => {
    customerApi
      .toggleFavorite(productId)
      .then(() => {
        setFavorites((list) => list.filter((f) => f.productId !== productId));
      })
      .catch(() => message.error("移出失败，请稍后重试"));
  };

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  // 特殊线下订单凭证兜底；标准零售主链使用客户本人发起的微信支付。
  const [proofOrderId, setProofOrderId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<CustomerPaymentOrder | null>(null);

  // 客户本人售后：只提交订单商品、类型和原因，不采集金额或后台字段。
  const [afterSalesOrder, setAfterSalesOrder] = useState<
    CustomerOrder | null
  >(null);
  const [cancellingAfterSalesId, setCancellingAfterSalesId] = useState<
    number | null
  >(null);

  // 个人资料编辑
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileForm] = Form.useForm();
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm] = Form.useForm();
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordProof, setPasswordProof] = useState<"PASSWORD" | "SMS">("PASSWORD");
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm] = Form.useForm();
  const [contactType, setContactType] = useState<ContactChangeType>("PHONE");
  const [contactProof, setContactProof] = useState<"PASSWORD" | "SMS">("PASSWORD");
  const [contactChallenge, setContactChallenge] = useState<ContactChangeChallenge | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [sendingSecurityCode, setSendingSecurityCode] = useState(false);
  const [securityCodeCooldown, setSecurityCodeCooldown] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);
  // 地址管理
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressForm] = Form.useForm();
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);

  // 评价（已完成订单 → 先审后展）
  const [reviewOrder, setReviewOrder] = useState<CustomerReviewOrder | null>(
    null,
  );

  // 合规：数据导出 + 注销
  const [exportingData, setExportingData] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closePassword, setClosePassword] = useState("");
  const [closing, setClosing] = useState(false);

  const handleExportData = async () => {
    setExportingData(true);
    try {
      const res = await customerApi.exportMyData();
      const data = unwrapResponse<unknown>(res);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `haichuan-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "导出失败，请稍后重试"));
    } finally {
      setExportingData(false);
    }
  };

  const handleCloseAccount = async () => {
    if (!closePassword) {
      message.warning("请输入登录密码确认");
      return;
    }
    setClosing(true);
    try {
      const response = await customerApi.closeAccount({ password: closePassword });
      const result = unwrapResponse<{ retainedUnderLegalHold?: number }>(response);
      if ((result.retainedUnderLegalHold ?? 0) > 0) {
        message.warning("账户已注销；依法需要保留的咨询记录将在保留依据结束后继续处理");
      } else {
        message.success("账户已注销，关联咨询个人信息已匿名化");
      }
      onSignOut();
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "注销失败"));
    } finally {
      setClosing(false);
    }
  };

  const openReview = (order: CustomerReviewOrder) => {
    setReviewOrder(order);
  };

  const openAfterSales = (order: CustomerOrder) => {
    const requestableItems = getRequestableAfterSalesItems(order);
    if (!requestableItems.length) {
      message.info("订单商品已有进行中的售后申请");
      return;
    }
    setAfterSalesOrder(order);
  };

  const cancelAfterSales = (caseRecord: CustomerAfterSalesCase) => {
    modal.confirm({
      title: "撤销售后申请？",
      content: "撤销后本次申请将结束；如仍需服务，可以重新提交。",
      okText: "确认撤销",
      cancelText: "暂不撤销",
      onOk: async () => {
        setCancellingAfterSalesId(caseRecord.id);
        try {
          await customerApi.cancelAfterSales(caseRecord.id);
          message.success("售后申请已撤销");
          onRefresh?.();
        } catch (error) {
          message.error(
            getCustomerAfterSalesError(
              error,
              "售后申请暂时无法撤销，请刷新后重试。",
            ),
          );
          return Promise.reject();
        } finally {
          setCancellingAfterSalesId(null);
        }
      },
    });
  };

  const handleUploadProof = async (file: File) => {
    if (proofOrderId == null) return;
    setUploading(true);
    try {
      const upRes = await customerApi.uploadPaymentProof(file);
      const proofKey = unwrapResponse<{ storageKey?: string }>(
        upRes,
      )?.storageKey;
      if (!proofKey) throw new Error("凭证上传失败");
      await customerApi.submitPaymentProof(proofOrderId, proofKey);
      message.success("付款凭证已提交，等待审核");
      setProofOrderId(null);
      onRefresh?.();
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "凭证上传失败"));
    } finally {
      setUploading(false);
    }
  };

  const openProfileEdit = () => {
    setProfileEditOpen(true);
  };

  const saveProfile = async () => {
    const values = await profileForm.validateFields().catch(() => null);
    if (!values) return;
    setSavingProfile(true);
    try {
      await customerProfileApi.updateName(values.name);
      message.success("资料已更新");
      setProfileEditOpen(false);
      onRefresh?.();
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "保存失败"));
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    if (securityCodeCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setSecurityCodeCooldown((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [securityCodeCooldown]);

  const sendCurrentPhoneCode = async () => {
    setSendingSecurityCode(true);
    try {
      await customerProfileApi.requestCurrentPhoneCode();
      setSecurityCodeCooldown(60);
      message.success("验证码已发送至当前绑定手机号");
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "验证码发送失败"));
    } finally {
      setSendingSecurityCode(false);
    }
  };

  const savePassword = async () => {
    const values = await passwordForm.validateFields().catch(() => null);
    if (!values) return;
    setSavingPassword(true);
    try {
      const verification = passwordProof === "PASSWORD"
        ? { currentPassword: values.currentPassword as string }
        : { currentSmsCode: values.currentSmsCode as string };
      await customerProfileApi.changePassword(verification, values.newPassword);
      message.success("密码已修改，请重新登录");
      passwordForm.resetFields();
      setPasswordOpen(false);
      onSignOut();
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "密码修改失败"));
    } finally {
      setSavingPassword(false);
    }
  };

  const openPasswordChange = () => {
    passwordForm.resetFields();
    setPasswordProof(profile?.hasPassword === false ? "SMS" : "PASSWORD");
    setPasswordOpen(true);
  };

  const openContactChange = (type: ContactChangeType) => {
    setContactType(type);
    setContactProof(profile?.hasPassword === false ? "SMS" : "PASSWORD");
    setContactChallenge(null);
    contactForm.resetFields();
    setContactOpen(true);
  };

  const submitContactChange = async () => {
    const values = await contactForm.validateFields().catch(() => null);
    if (!values) return;
    setSavingContact(true);
    try {
      if (!contactChallenge) {
        const verification = contactProof === "PASSWORD"
          ? { currentPassword: values.currentPassword as string }
          : { currentSmsCode: values.currentSmsCode as string };
        const response = await customerProfileApi.startContactChange(
          contactType,
          values.newValue,
          verification,
        );
        setContactChallenge(unwrapResponse<ContactChangeChallenge>(response));
        contactForm.setFieldsValue({ verificationCode: "" });
        message.success("新绑定验证码已发送");
        return;
      }
      await customerProfileApi.confirmContactChange(
        contactChallenge.changeId,
        values.verificationCode,
      );
      message.success("绑定信息已更新，请重新登录");
      contactForm.resetFields();
      setContactOpen(false);
      onSignOut();
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "换绑失败"));
    } finally {
      setSavingContact(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!allowed) {
      message.error("头像仅支持 JPG、PNG 或 WebP 格式");
      return Upload.LIST_IGNORE;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error("头像图片不能超过 5MB");
      return Upload.LIST_IGNORE;
    }
    setUploadingAvatar(true);
    try {
      await customerProfileApi.uploadAvatar(file);
      message.success("头像已更新");
      onRefresh?.();
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "头像上传失败"));
    } finally {
      setUploadingAvatar(false);
    }
    return Upload.LIST_IGNORE;
  };

  const deleteAvatar = () => {
    modal.confirm({
      title: "删除当前头像？",
      content: "删除后将改为显示称呼首字；您仍可随时重新上传头像。",
      okText: "删除头像",
      cancelText: "保留头像",
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingAvatar(true);
        try {
          await customerProfileApi.deleteAvatar();
          message.success("头像已删除");
          onRefresh?.();
        } catch {
          message.error("头像删除失败，当前头像已保留，请重试");
        } finally {
          setDeletingAvatar(false);
        }
      },
    });
  };

  const cooldownLabel = (value?: string | null) => {
    if (!value || Date.parse(value) <= Date.now()) return null;
    return `可于 ${new Date(value).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })} 再次修改`;
  };

  const openAddressCreate = () => {
    setEditingAddressId(null);
    setAddressOpen(true);
  };

  const openAddressEdit = (addr: AccountAddress) => {
    setEditingAddressId(addr.id);
    setAddressOpen(true);
  };

  const saveAddress = async () => {
    const values = await addressForm.validateFields();
    setSavingAddress(true);
    try {
      if (editingAddressId) {
        await customerApi.updateAddress(editingAddressId, values);
      } else {
        await customerApi.createAddress(values);
      }
      message.success(editingAddressId ? "地址已更新" : "地址已添加");
      setAddressOpen(false);
      onRefresh?.();
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "保存失败"));
    } finally {
      setSavingAddress(false);
    }
  };

  const removeAddress = async (id: number) => {
    try {
      await customerApi.deleteAddress(id);
      message.success("地址已删除");
      onRefresh?.();
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "删除失败"));
    }
  };

  return (
    <>
      <div className="my-account">
        <section className="my-account__intro">
          <div>
            <p className="my-account__eyebrow">HAICHUAN PRIVATE CLIENT</p>
            <h1>我的账号</h1>
            <p className="my-account__greeting">
              您好，{name}。您的作品、咨询与服务记录都在这里。
            </p>
          </div>
          <button
            type="button"
            className="my-account__sign-out"
            onClick={onSignOut}
          >
            退出登录
          </button>
        </section>

        <nav className="my-account__shortcuts" aria-label="账号快捷服务">
          <a href="#my-selections">
            <span>01</span>我的选款
          </a>
          <a href="#my-appointments">
            <span>02</span>我的预约
          </a>
          <a href="#my-orders">
            <span>03</span>我的订单
          </a>
          <a href="#my-profile">
            <span>04</span>个人资料
          </a>
          <a href="#my-notifications">
            <span>05</span>服务通知
          </a>
        </nav>

        <section className="my-account__summary" aria-label="服务概览">
          <div>
            <strong>
              {String(selectionInquiries.length).padStart(2, "0")}
            </strong>
            <span>选款咨询</span>
          </div>
          <div>
            <strong>{String(inquiryPage.total).padStart(2, "0")}</strong>
            <span>预约咨询</span>
          </div>
          <div>
            <strong>{String(orders.length).padStart(2, "0")}</strong>
            <span>历史订单</span>
          </div>
          <Link to="/catalog" className="my-account__summary-action">
            继续选款 <b>→</b>
          </Link>
        </section>

        <div className="my-account__grid">
          {selectedLeadId !== null ? (
            <section
              id="consultation-focus"
              className="my-account__panel my-account__panel--wide"
              aria-labelledby="consultation-focus-title"
              tabIndex={-1}
            >
              <div className="my-account__panel-head">
                <div>
                  <p>CONSULTATION DETAIL</p>
                  <h2 id="consultation-focus-title">咨询详情</h2>
                </div>
                <button
                  type="button"
                  className="my-account__sign-out"
                  onClick={() => clearConsultationUrl(
                    consultationDetail?.type === "selection"
                      ? "my-selections"
                      : "my-appointments",
                  )}
                >
                  关闭详情
                </button>
              </div>
              {consultationLoading ? (
                <p className="my-account__records-state" role="status">
                  正在加载咨询详情…
                </p>
              ) : consultationError === "not-found" ? (
                <div className="my-account__records-state" role="alert">
                  <p>未找到这条咨询，或者它不属于当前账户。</p>
                  <button
                    type="button"
                    className="my-account__inline-retry"
                    onClick={() => clearConsultationUrl("my-appointments")}
                  >
                    返回咨询列表
                  </button>
                </div>
              ) : consultationError ? (
                <div className="my-account__records-state" role="alert">
                  <p>咨询详情暂时无法加载，已保留当前链接。</p>
                  {onRetryConsultation ? (
                    <button
                      type="button"
                      className="my-account__inline-retry"
                      onClick={() => void onRetryConsultation()}
                    >
                      重新加载
                    </button>
                  ) : null}
                </div>
              ) : consultationDetail ? (
                <article className="my-account__consultation-record">
                  <div className="my-account__consultation-row">
                    <div>
                      <small>
                        {new Date(consultationDetail.createdAt).toLocaleDateString("zh-CN")}
                      </small>
                      <h3>{consultationTitle}</h3>
                    </div>
                    <em>
                      {inquiryStatus[consultationDetail.status]
                        || consultationDetail.status}
                    </em>
                  </div>
                  <ConsultationDetail
                    detailId="consultation-focus-content"
                    message={consultationDetail.message}
                    reply={consultationDetail.reply}
                    selected
                  >
                    <ConsultationContext detail={consultationDetail} />
                  </ConsultationDetail>
                </article>
              ) : null}
            </section>
          ) : null}
          <CustomerNotificationsPanel
            resource={notifications}
            loading={notificationLoading}
            error={notificationError}
            onRetry={onRetryNotifications}
            onRead={onReadNotification}
            onReadAll={onReadAllNotifications}
          />
          <section id="my-selections" className="my-account__panel" tabIndex={-1}>
            <div className="my-account__panel-head">
              <div>
                <p>PRIVATE SELECTION</p>
                <h2>我的选款</h2>
              </div>
              <Link to="/catalog">进入选款中心 →</Link>
            </div>
            {selectionInquiryError ? (
              <p className="my-account__records-state" role="alert">
                {selectionInquiryError}
                <button
                  type="button"
                  className="my-account__inline-retry"
                  onClick={() => void onRetrySelectionInquiries()}
                >
                  重新加载
                </button>
              </p>
            ) : null}
            {selectionInquiryLoading && selectionInquiries.length === 0 ? (
              <p className="my-account__records-state" role="status">
                正在加载选款咨询…
              </p>
            ) : selectionInquiryError && selectionInquiries.length === 0 ? (
              null
            ) : selectionInquiries.length ? (
              <>
                <div className="my-account__records" aria-busy={selectionInquiryLoading}>
                  {visibleSelectionInquiries.map((record) => (
                    <article key={record.id} className="my-account__consultation-record">
                      <div className="my-account__consultation-row">
                        <div>
                          <small>
                            {new Date(record.createdAt).toLocaleDateString("zh-CN")}
                          </small>
                          <h3>
                            {record.items?.[0]?.productNameSnapshot || "选款咨询"}
                          </h3>
                        </div>
                        <em>{inquiryStatus[record.status] || record.status}</em>
                      </div>
                      <ConsultationDetail
                        detailId={`consultation-${record.leadId ?? `selection-${record.id}`}`}
                        message={record.message}
                        reply={record.reply}
                        selected={false}
                      >
                        <div>
                          <h4>所选作品</h4>
                          <p>
                            {record.items?.map((item) => item.productNameSnapshot).join("、")
                              || "历史记录未保留作品名称。"}
                          </p>
                        </div>
                      </ConsultationDetail>
                    </article>
                  ))}
                </div>
                <nav className="my-account__pagination" aria-label="选款咨询分页">
                  <Pagination
                    current={selectionPage}
                    pageSize={selectionPageSize}
                    total={selectionInquiries.length}
                    showSizeChanger={false}
                    hideOnSinglePage
                    disabled={selectionInquiryLoading}
                    onChange={(page) => {
                      setSelectionPage(page);
                      clearConsultationUrl("my-selections");
                    }}
                  />
                </nav>
              </>
            ) : (
              <Empty>
                暂未提交选款咨询。<Link to="/catalog">去挑选心仪作品 →</Link>
              </Empty>
            )}
          </section>

          <section id="my-appointments" className="my-account__panel" tabIndex={-1}>
            <div className="my-account__panel-head">
              <div>
                <p>PERSONAL SERVICE</p>
                <h2>我的预约</h2>
              </div>
              <Link to="/contact">预约咨询 →</Link>
            </div>
            {inquiryError && (
              <p className="my-account__records-state" role="alert">
                {inquiryError}
                <button
                  type="button"
                  className="my-account__inline-retry"
                  onClick={() => void onInquiryPageChange(inquiryPage.page)}
                >
                  重新加载
                </button>
              </p>
            )}
            {inquiryLoading && inquiries.length === 0 ? (
              <p className="my-account__records-state" role="status">
                正在加载预约记录…
              </p>
            ) : inquiryError && inquiries.length === 0 ? (
              null
            ) : inquiries.length ? (
              <>
                <div className="my-account__records" aria-busy={inquiryLoading}>
                  {inquiries.map((record) => (
                    <article key={record.id} className="my-account__consultation-record">
                      <div className="my-account__consultation-row">
                        <div>
                          <small>
                            {new Date(record.createdAt).toLocaleDateString("zh-CN")}
                          </small>
                          <h3>
                            {record.product?.name ||
                              record.consultationType ||
                              "预约咨询"}
                          </h3>
                        </div>
                        <em>{inquiryStatus[record.status] || record.status}</em>
                      </div>
                      <ConsultationDetail
                        detailId={`consultation-${record.leadId ?? `inquiry-${record.id}`}`}
                        message={record.message}
                        reply={record.reply}
                        selected={false}
                      >
                        <div>
                          <h4>服务信息</h4>
                          <p>
                            {[
                              record.preferredContact
                                ? `联系偏好：${record.preferredContact}`
                                : null,
                              record.preferredTime
                                ? `方便时间：${record.preferredTime}`
                                : null,
                              record.budgetRange
                                ? `预算范围：${record.budgetRange}`
                                : null,
                            ].filter(Boolean).join("；") || "暂无补充服务信息。"}
                          </p>
                        </div>
                      </ConsultationDetail>
                    </article>
                  ))}
                </div>
                <nav className="my-account__pagination" aria-label="预约咨询分页">
                  <Pagination
                    current={inquiryPage.page}
                    pageSize={inquiryPage.pageSize}
                    total={inquiryPage.total}
                    showSizeChanger={false}
                    hideOnSinglePage
                    disabled={inquiryLoading}
                    onChange={(page) => {
                      clearConsultationUrl("my-appointments");
                      void onInquiryPageChange(page);
                    }}
                  />
                </nav>
              </>
            ) : (
              <Empty>
                还没有预约记录。<Link to="/contact">预约专属顾问 →</Link>
              </Empty>
            )}
          </section>

          {/* 心愿单：收藏的作品（商品详情页心形按钮加入） */}
          <section
            id="my-favorites"
            className="my-account__panel my-account__panel--wide"
            aria-labelledby="my-favorites-title"
          >
            <div className="my-account__panel-head">
              <div>
                <p>WISHLIST</p>
                <h2 id="my-favorites-title">我的心愿单</h2>
              </div>
              <strong>
                {favoriteStatus === "ready"
                  ? String(favorites.length).padStart(2, "0")
                  : "—"}
              </strong>
            </div>
            {favoriteStatus === "loading" ? (
              <p className="my-account-empty" role="status">
                正在加载心愿单…
              </p>
            ) : favoriteStatus === "error" ? (
              <p className="my-account-empty" role="alert">
                心愿单暂时无法加载。
                <button
                  type="button"
                  className="my-account__summary-action"
                  onClick={() => void loadFavorites()}
                >
                  重新加载
                </button>
              </p>
            ) : favorites.length ? (
              <div className="my-account__records">
                {favorites.map((fav) => (
                  <article
                    key={fav.id}
                    className="my-account__favorite"
                    style={{ display: "flex", gap: 16, alignItems: "center" }}
                  >
                    <Link
                      to={`/products/${fav.productId}`}
                      style={{
                        width: 72,
                        height: 72,
                        flexShrink: 0,
                        background: "#f4f5f5",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {fav.image ? (
                        <SecureImage
                          src={fav.image}
                          alt={fav.name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <span style={{ color: "#6e7477", fontSize: 24 }}>
                          ◆
                        </span>
                      )}
                    </Link>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link to={`/products/${fav.productId}`}>
                        <h3 style={{ fontSize: 15 }}>{fav.name}</h3>
                      </Link>
                      {fav.shortDescription ? (
                        <p
                          style={{
                            fontSize: 12,
                            color: "#5f6568",
                            margin: "4px 0 0",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {fav.shortDescription}
                        </p>
                      ) : null}
                      {fav.price != null && Number(fav.price) > 0 ? (
                        <p
                          style={{
                            fontSize: 13,
                            margin: "6px 0 0",
                            color: "#181a1b",
                          }}
                        >
                          ¥{Number(fav.price).toLocaleString("zh-CN")}
                        </p>
                      ) : null}
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <Link
                        to={`/products/${fav.productId}`}
                        style={{ fontSize: 12, color: "#181a1b" }}
                      >
                        查看作品
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeFavorite(fav.productId)}
                        style={{
                          fontSize: 12,
                          color: "#6E7477",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        移出
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty>
                心愿单还是空的。
                <Link to="/catalog">去选款中心挑选心仪作品 →</Link>
              </Empty>
            )}
          </section>

          <CustomerOrdersPanel
            orders={orders}
            commerceEnabled={commerceEnabled}
            uploadingProof={uploading}
            cancellingAfterSalesId={cancellingAfterSalesId}
            onOpenReview={openReview}
            onOpenAfterSales={openAfterSales}
            onCancelAfterSales={cancelAfterSales}
            onOpenProof={setProofOrderId}
            onOpenPayment={setPaymentOrder}
            onRefresh={onRefresh}
          />

          <section
            id="my-profile"
            className="my-account__panel my-account__panel--profile my-account__panel--wide"
          >
            <div className="my-account__panel-head">
              <div>
                <p>ACCOUNT PROFILE</p>
                <h2>个人资料</h2>
              </div>
            </div>
            <div className="my-account__profile-identity">
              <div className="my-account__avatar" aria-label="当前头像">
                {profile?.avatarUrl ? (
                  <img
                    src={`${profile.avatarUrl}?v=${encodeURIComponent(profile.updatedAt || "current")}`}
                    alt={`${name}的头像`}
                  />
                ) : (
                  <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div>
                <strong>{name}</strong>
                <p>{profile?.phone || "—"}</p>
                <div className="my-account__profile-actions">
                  <Button size="small" onClick={openProfileEdit}>修改称呼</Button>
                  <Upload
                    accept="image/jpeg,image/png,image/webp"
                    showUploadList={false}
                    beforeUpload={uploadAvatar}
                    disabled={uploadingAvatar || deletingAvatar}
                  >
                    <Button size="small" loading={uploadingAvatar}>更换头像</Button>
                  </Upload>
                  {profile?.avatarUrl ? (
                    <Button
                      size="small"
                      danger
                      loading={deletingAvatar}
                      disabled={uploadingAvatar}
                      onClick={deleteAvatar}
                    >
                      删除头像
                    </Button>
                  ) : null}
                </div>
                <small>JPG、PNG 或 WebP，最大 5MB；上传后由服务端裁切压缩。</small>
              </div>
            </div>
            {/* 申请合作：申请入口 + 当前状态（协议未落地前，入口指向说明页，不开放表单提交） */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: "#5f6568", margin: "0 0 8px" }}>
                申请合作
              </p>
              <div
                style={{
                  padding: "12px 14px",
                  background:
                    partnerStatus === "APPROVED" ? "#eff5f1" : "#f4f5f5",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: "#5f6568" }}>
                    {partnerError
                      ? partnerError
                      : partnerStatus === "APPROVED"
                      ? "✓ 已认证合作商家"
                      : PARTNER_STATUS_LABEL[partnerStatus] ||
                        "尚未申请合作商家身份"}
                    {partnerStatus === "APPROVED" && partnerApprovedAt
                      ? ` · ${new Date(partnerApprovedAt).toLocaleDateString("zh-CN")}`
                      : ""}
                  </span>
                  {!partnerError && partnerStatus !== "APPROVED" &&
                  partner?.latest?.reviewNote ? (
                    <p
                      style={{
                        fontSize: 12,
                        color: "#5f6568",
                        margin: "6px 0 0",
                      }}
                    >
                      审核说明：{partner.latest.reviewNote}
                    </p>
                  ) : null}
                </div>
                {partnerError ? (
                  <button
                    type="button"
                    className="my-account__summary-action"
                    onClick={onRefresh}
                  >
                    重新加载
                  </button>
                ) : (
                  <Link
                    to={PARTNER_ACTION[partnerStatus]?.to || "/customer?section=partner"}
                    style={{ fontSize: 12, color: "#181a1b", flexShrink: 0 }}
                  >
                    {PARTNER_ACTION[partnerStatus]?.label || "了解详情"} →
                  </Link>
                )}
              </div>
            </div>
            <div className="my-account__security-settings">
              <div className="my-account__security-row">
                <div>
                  <strong>绑定手机号</strong>
                  <span>{profile?.phone || "—"}</span>
                  {cooldownLabel(profile?.phoneChangeAvailableAt) ? (
                    <small>{cooldownLabel(profile?.phoneChangeAvailableAt)}</small>
                  ) : null}
                </div>
                <Button
                  size="small"
                  disabled={Boolean(cooldownLabel(profile?.phoneChangeAvailableAt))}
                  onClick={() => openContactChange("PHONE")}
                >
                  更换手机号
                </Button>
              </div>
              <div className="my-account__security-row">
                <div>
                  <strong>绑定邮箱</strong>
                  <span>{profile?.email || "暂未绑定"}</span>
                  {cooldownLabel(profile?.emailChangeAvailableAt) ? (
                    <small>{cooldownLabel(profile?.emailChangeAvailableAt)}</small>
                  ) : null}
                </div>
                <Button
                  size="small"
                  disabled={Boolean(cooldownLabel(profile?.emailChangeAvailableAt))}
                  onClick={() => openContactChange("EMAIL")}
                >
                  {profile?.email ? "更换邮箱" : "绑定邮箱"}
                </Button>
              </div>
              <div className="my-account__security-row">
                <div>
                  <strong>登录密码</strong>
                  <span>修改后所有设备都需要重新登录</span>
                </div>
                <Button size="small" onClick={openPasswordChange}>
                  {profile?.hasPassword === false ? "设置密码" : "修改密码"}
                </Button>
              </div>
            </div>
            {/* 合规（个保法）：数据导出 + 账户注销 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                background: "#f4f5f5",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 12, color: "#5f6568" }}>
                我的个人数据（资料/订单/收藏等）可随时导出或注销账户
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                <Button
                  size="small"
                  onClick={handleExportData}
                  loading={exportingData}
                >
                  导出我的数据
                </Button>
                <Button size="small" danger onClick={() => setCloseOpen(true)}>
                  注销账户
                </Button>
              </span>
            </div>
            <div className="my-account__address">
              <p>收货地址 <Button size="small" onClick={openAddressCreate}>新增地址</Button></p>
              {addresses.length > 0 ? (
                addresses.map((addr) => (
                  <div key={addr.id} style={{ marginBottom: 10 }}>
                    <span>
                      {addr.recipientName} · {addr.recipientPhone}
                      <br />
                      {[addr.province, addr.city, addr.district, addr.detail]
                        .filter(Boolean)
                        .join("")}
                    </span>
                    <div>
                      <Button
                        size="small"
                        type="link"
                        onClick={() => openAddressEdit(addr)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="small"
                        type="link"
                        danger
                        onClick={() => removeAddress(addr.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <span>暂未保存收货地址</span>
              )}
            </div>
          </section>
        </div>
        <ForYouRecommendations />
      </div>
      <CustomerPaymentDialog
        open={paymentOrder !== null}
        order={paymentOrder}
        onClose={() => setPaymentOrder(null)}
        onPaid={() => {
          setPaymentOrder(null);
          onRefresh?.();
        }}
      />
      <CustomerAfterSalesDialog
        order={afterSalesOrder}
        onClose={() => setAfterSalesOrder(null)}
        onSubmitted={() => {
          setAfterSalesOrder(null);
          onRefresh?.();
        }}
      />
      {commerceEnabled && (
        <Modal
          open={proofOrderId !== null}
          title="上传付款凭证"
          onCancel={() => setProofOrderId(null)}
          footer={null}
          destroyOnHidden
        >
          <p style={{ color: "#5f6568", fontSize: 13, marginBottom: 16 }}>
            此入口只用于已约定的特殊线下转账订单。请上传转账截图或凭证图片（JPG/PNG/WebP，≤10MB）；微信支付无需上传凭证。
          </p>
          <Upload
            accept="image/jpeg,image/png,image/webp,image/gif"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              void handleUploadProof(file);
              return false;
            }}
            disabled={uploading}
          >
            <button
              type="button"
              className="my-account__button"
              disabled={uploading}
              style={{
                padding: "10px 16px",
                background: "#181a1b",
                color: "#fff",
                border: 0,
                cursor: "pointer",
              }}
            >
              {uploading ? "上传中..." : "选择图片并上传"}
            </button>
          </Upload>
        </Modal>
      )}

      <CustomerReviewDialog
        order={reviewOrder}
        onClose={() => setReviewOrder(null)}
        onSubmitted={() => setReviewOrder(null)}
      />

      <Modal
        open={closeOpen}
        title="注销账户"
        onCancel={() => {
          setCloseOpen(false);
          setClosePassword("");
        }}
        onOk={handleCloseAccount}
        confirmLoading={closing}
        okText="确认注销"
        okButtonProps={{ danger: true }}
        cancelText="再想想"
        destroyOnHidden
      >
        <div className="space-y-3">
          <p style={{ color: "#8C3F3B", fontSize: 13 }}>
            注销后您的姓名、邮箱、地址与收藏将被清除，账户将永久无法登录，此操作不可恢复。
          </p>
          <p style={{ color: "#5f6568", fontSize: 13 }}>
            依据法律要求，历史订单与收款记录将留存；您发布且已公开展示的评价将继续匿名展示。建议先"导出我的数据"留档。
          </p>
          <Input.Password
            placeholder="输入登录密码确认注销"
            value={closePassword}
            maxLength={EXISTING_PASSWORD_MAX_LENGTH}
            onChange={(e) => setClosePassword(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={profileEditOpen}
        title="修改称呼"
        onCancel={() => setProfileEditOpen(false)}
        onOk={saveProfile}
        confirmLoading={savingProfile}
        okText="保存"
        cancelText="取消"
        afterOpenChange={(open) => {
          if (open) {
            profileForm.setFieldsValue({
              name: profile?.name,
            });
          }
        }}
      >
        <Form form={profileForm} layout="vertical">
          <Form.Item
            name="name"
            label="称呼"
            rules={[
              { required: true, message: "请填写称呼" },
              { min: 1, max: 50, message: "称呼长度必须为 1–50 个字符" },
              {
                pattern: /^[\p{L}\p{N}_·.\- ]+$/u,
                message: "称呼只能包含文字、数字、空格、下划线、中点和短横线",
              },
            ]}
          >
            <Input placeholder="您的称呼" maxLength={50} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={passwordOpen}
        title="修改登录密码"
        onCancel={() => {
          passwordForm.resetFields();
          setPasswordOpen(false);
        }}
        onOk={savePassword}
        confirmLoading={savingPassword}
        okText="确认修改"
        cancelText="取消"
        forceRender
      >
        <p className="my-account__security-note">
          {profile?.hasPassword === false
            ? "当前账户尚未设置密码，请先验证绑定手机号。设置成功后将退出所有设备。"
            : "修改成功后将退出所有设备上的登录会话，请使用新密码重新登录。"}
        </p>
        <Form form={passwordForm} layout="vertical">
          <Form.Item label="验证当前身份">
            <Radio.Group
              value={passwordProof}
              onChange={(event) => {
                setPasswordProof(event.target.value);
                passwordForm.setFieldsValue({ currentPassword: undefined, currentSmsCode: undefined });
              }}
            >
              <Radio.Button value="PASSWORD" disabled={profile?.hasPassword === false}>当前密码</Radio.Button>
              <Radio.Button value="SMS">手机验证码</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {passwordProof === "PASSWORD" ? (
            <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: "请输入当前密码" }]}>
              <Input.Password maxLength={EXISTING_PASSWORD_MAX_LENGTH} autoComplete="current-password" />
            </Form.Item>
          ) : (
            <Form.Item label="当前手机号验证码" required>
              <div className="my-account__code-row">
                <Form.Item name="currentSmsCode" noStyle rules={[{ required: true, pattern: /^\d{6}$/, message: "请输入 6 位验证码" }]}>
                  <Input inputMode="numeric" maxLength={6} placeholder="6 位验证码" />
                </Form.Item>
                <Button
                  onClick={sendCurrentPhoneCode}
                  loading={sendingSecurityCode}
                  disabled={securityCodeCooldown > 0}
                >
                  {securityCodeCooldown > 0 ? `${securityCodeCooldown}s` : "发送验证码"}
                </Button>
              </div>
            </Form.Item>
          )}
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { validator: (_, value) => !value || isAccountPasswordValid(value) ? Promise.resolve() : Promise.reject(new Error(ACCOUNT_PASSWORD_HINT)) },
            ]}
            extra={ACCOUNT_PASSWORD_HINT}
          >
            <Input.Password maxLength={ACCOUNT_PASSWORD_MAX_LENGTH} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "请再次输入新密码" },
              ({ getFieldValue }) => ({
                validator: (_, value) => !value || value === getFieldValue("newPassword")
                  ? Promise.resolve()
                  : Promise.reject(new Error("两次输入的密码不一致")),
              }),
            ]}
          >
            <Input.Password maxLength={ACCOUNT_PASSWORD_MAX_LENGTH} autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={contactOpen}
        title={`${profile?.[contactType === "PHONE" ? "phone" : "email"] ? "更换" : "绑定"}${contactType === "PHONE" ? "手机号" : "邮箱"}`}
        onCancel={() => {
          contactForm.resetFields();
          setContactOpen(false);
          setContactChallenge(null);
        }}
        onOk={submitContactChange}
        confirmLoading={savingContact}
        okText={contactChallenge ? "完成换绑" : "验证并发送新验证码"}
        cancelText="取消"
        forceRender
      >
        <p className="my-account__security-note">
          {contactChallenge
            ? `验证码已发送至 ${contactChallenge.maskedTarget}，10 分钟内有效。`
            : "先验证当前身份，再验证新的联系方式。换绑成功后 7 天内不能再次修改，并会退出所有设备。"}
        </p>
        <Form form={contactForm} layout="vertical">
          {!contactChallenge ? (
            <>
              <Form.Item
                name="newValue"
                label={contactType === "PHONE" ? "新手机号" : "新邮箱"}
                rules={contactType === "PHONE"
                  ? [{ required: true, pattern: /^1[3-9]\d{9}$/, message: "请填写正确的手机号" }]
                  : [{ required: true, type: "email", message: "请填写正确的邮箱地址" }]}
              >
                <Input
                  inputMode={contactType === "PHONE" ? "tel" : "email"}
                  maxLength={contactType === "PHONE" ? 11 : 100}
                  autoComplete={contactType === "PHONE" ? "tel" : "email"}
                />
              </Form.Item>
              <Form.Item label="验证当前身份">
                <Radio.Group
                  value={contactProof}
                  onChange={(event) => {
                    setContactProof(event.target.value);
                    contactForm.setFieldsValue({ currentPassword: undefined, currentSmsCode: undefined });
                  }}
                >
                  <Radio.Button value="PASSWORD" disabled={profile?.hasPassword === false}>当前密码</Radio.Button>
                  <Radio.Button value="SMS">当前手机验证码</Radio.Button>
                </Radio.Group>
              </Form.Item>
              {contactProof === "PASSWORD" ? (
                <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: "请输入当前密码" }]}>
                  <Input.Password maxLength={EXISTING_PASSWORD_MAX_LENGTH} autoComplete="current-password" />
                </Form.Item>
              ) : (
                <Form.Item label="当前手机号验证码" required>
                  <div className="my-account__code-row">
                    <Form.Item name="currentSmsCode" noStyle rules={[{ required: true, pattern: /^\d{6}$/, message: "请输入 6 位验证码" }]}>
                      <Input inputMode="numeric" maxLength={6} placeholder="6 位验证码" />
                    </Form.Item>
                    <Button
                      onClick={sendCurrentPhoneCode}
                      loading={sendingSecurityCode}
                      disabled={securityCodeCooldown > 0}
                    >
                      {securityCodeCooldown > 0 ? `${securityCodeCooldown}s` : "发送验证码"}
                    </Button>
                  </div>
                </Form.Item>
              )}
            </>
          ) : (
            <Form.Item
              name="verificationCode"
              label={`新${contactType === "PHONE" ? "手机号" : "邮箱"}验证码`}
              rules={[{ required: true, pattern: /^\d{6}$/, message: "请输入 6 位验证码" }]}
            >
              <Input inputMode="numeric" maxLength={6} autoFocus placeholder="6 位验证码" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 地址新增/编辑 */}
      <Modal
        open={addressOpen}
        title={editingAddressId ? "编辑地址" : "新增地址"}
        onCancel={() => setAddressOpen(false)}
        onOk={saveAddress}
        confirmLoading={savingAddress}
        okText="保存"
        cancelText="取消"
        afterOpenChange={(open) => {
          if (!open) return;
          const address = editingAddressId
            ? addresses.find((item) => item.id === editingAddressId)
            : undefined;
          if (address) addressForm.setFieldsValue(address);
          else addressForm.resetFields();
        }}
      >
        <Form form={addressForm} layout="vertical">
          <div
            className="grid grid-cols-2 gap-4"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              columnGap: 16,
            }}
          >
            <Form.Item
              name="recipientName"
              label="收件人"
              rules={[{ required: true, message: "请填写收件人" }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="recipientPhone"
              label="联系电话"
              rules={[{ required: true, message: "请填写联系电话" }]}
            >
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="province" label="省">
            <Input />
          </Form.Item>
          <Form.Item name="city" label="市">
            <Input />
          </Form.Item>
          <Form.Item name="district" label="区/县">
            <Input />
          </Form.Item>
          <Form.Item
            name="detail"
            label="详细地址"
            rules={[{ required: true, message: "请填写详细地址" }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

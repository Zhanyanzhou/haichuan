// 客户中心登录态主面板：账户总览/心愿单/订单(可视化进度+物流轨迹+评价)/个人资料(导出与注销)/地址管理
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Modal,
  Upload,
  message,
  Form,
  Input,
  Button,
  Rate,
  Select,
} from "antd";
import { customerApi, reviewApi, uploadApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { useCommerceEnabled } from "@/store/featureFlags";
import { SecureImage } from "@/components/common/SecureImage";
import ForYouRecommendations from "./ForYouRecommendations";

type AccountDashboardProps = {
  profile: { name?: string; phone?: string; email?: string } | null;
  orders: Array<{
    id: number;
    orderNo: string;
    finalAmount: number | string;
    status: string;
    createdAt: string;
    paymentConfirmedAt?: string | null;
    shippedAt?: string | null;
    completedAt?: string | null;
    logisticsCompany?: string | null;
    logisticsNo?: string | null;
    items?: Array<{ productId: number; product?: { name: string } }>;
    payments?: Array<{ id: number; status: string; hasProof?: boolean }>;
  }>;
  addresses: Array<{
    id: number;
    recipientName: string;
    recipientPhone: string;
    province?: string;
    city?: string;
    district?: string;
    detail: string;
  }>;
  selectionInquiries: Array<{
    id: number;
    status: string;
    createdAt: string;
    items?: Array<{ productNameSnapshot: string }>;
  }>;
  inquiries: Array<{
    id: number;
    status: string;
    createdAt: string;
    consultationType?: string;
    product?: { name?: string };
  }>;
  partner: {
    customer?: {
      accountType?: string;
      partnerStatus?: string;
      partnerApprovedAt?: string | null;
    } | null;
    latest?: { reviewNote?: string | null } | null;
  } | null;
  onSignOut: () => void;
  onRefresh?: () => void;
};

const orderStatus: Record<string, string> = {
  PENDING_PAYMENT: "待付款",
  PENDING_SHIP: "待发货",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const inquiryStatus: Record<string, string> = {
  PENDING: "待顾问联系",
  PROCESSING: "顾问跟进中",
  REPLIED: "已回复",
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
  NONE: { label: "申请合作商家", to: "/partner" },
  PENDING: { label: "查看进度", to: "/partner" },
  NEEDS_SUPPLEMENT: { label: "补充资料", to: "/partner" },
  REJECTED: { label: "重新申请", to: "/partner" },
  SUSPENDED: { label: "联系顾问", to: "/contact" },
  APPROVED: { label: "查看合作作品", to: "/catalog" },
};

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="my-account-empty">{children}</p>;
}

export default function MyAccountDashboard({
  profile,
  partner,
  orders,
  addresses,
  selectionInquiries,
  inquiries,
  onSignOut,
  onRefresh,
}: AccountDashboardProps) {
  const name = profile?.name || "海川贵宾";
  const commerceEnabled = useCommerceEnabled();
  const partnerStatus = partner?.customer?.partnerStatus || "NONE";
  const partnerApprovedAt = partner?.customer?.partnerApprovedAt || null;

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

  const removeFavorite = (productId: number) => {
    customerApi
      .toggleFavorite(productId)
      .then(() => {
        setFavorites((list) => list.filter((f) => f.productId !== productId));
      })
      .catch(() => message.error("移出失败，请稍后重试"));
  };

  useEffect(() => {
    customerApi
      .getFavorites()
      .then((res) => setFavorites(unwrapResponse<any>(res) || []))
      .catch(() => setFavorites([]));
  }, []);

  // P1-29：付款凭证上传（电商闭环 —— 线下转账订单需顾客补凭证，否则卡死 PENDING_PAYMENT）
  const [proofOrderId, setProofOrderId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  // 个人资料编辑
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileForm] = Form.useForm();
  const [savingProfile, setSavingProfile] = useState(false);
  // 地址管理
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressForm] = Form.useForm();
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);

  // 评价（已完成订单 → 先审后展）
  const [reviewOrder, setReviewOrder] = useState<{
    id: number;
    items: Array<{ productId: number; product?: { name: string } }>;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewProductId, setReviewProductId] = useState<number | null>(null);
  const [reviewContent, setReviewContent] = useState("");
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);

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
    } catch (e: any) {
      message.error(e?.message || "导出失败，请稍后重试");
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
      await customerApi.closeAccount({ password: closePassword });
      message.success("账户已注销");
      onSignOut();
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || "注销失败");
    } finally {
      setClosing(false);
    }
  };

  // 物流轨迹（快递100，按订单展开）
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [trackingData, setTrackingData] = useState<{
    carrier: string;
    trackingNo: string;
    state: string;
    events: Array<{ time: string; context: string }>;
  } | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const TRACK_STATE: Record<string, string> = {
    "0": "在途",
    "1": "已揽收",
    "2": "疑难",
    "3": "已签收",
    "4": "退签",
    "5": "派件中",
    "6": "退回",
    "10": "待揽收",
  };

  const toggleTracking = async (orderId: number) => {
    if (trackingOrderId === orderId) {
      setTrackingOrderId(null);
      setTrackingData(null);
      return;
    }
    setTrackingOrderId(orderId);
    setTrackingData(null);
    setTrackingLoading(true);
    try {
      const res = await customerApi.getOrderTracking(orderId);
      setTrackingData(unwrapResponse<any>(res) || null);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "轨迹查询失败";
      setTrackingData({ carrier: "", trackingNo: "", state: "", events: [] });
      message.error(msg);
    } finally {
      setTrackingLoading(false);
    }
  };

  const openReview = (order: {
    id: number;
    items: Array<{ productId: number; product?: { name: string } }>;
  }) => {
    setReviewOrder(order);
    setReviewProductId(order.items[0]?.productId ?? null);
    setReviewRating(5);
    setReviewContent("");
    setReviewImages([]);
  };

  /** 晒单图上传：复用公开上传管线，成功后暂存 URL（提交时随评价一起落库） */
  const uploadReviewImage = async (options: any) => {
    const { onSuccess, onError, file } = options;
    try {
      const res = await uploadApi.uploadImage(file as File);
      const url = unwrapResponse<{ url: string }>(res)?.url;
      if (!url) throw new Error("上传失败");
      setReviewImages((list) => (list.length >= 6 ? list : [...list, url]));
      onSuccess?.(url);
    } catch (e: any) {
      message.error(e?.message || "晒单图上传失败");
      onError?.(e);
    }
  };

  const submitReview = async () => {
    if (!reviewOrder || !reviewProductId) {
      message.warning("请选择要评价的作品");
      return;
    }
    if (reviewRating < 1) {
      message.warning("请选择星级");
      return;
    }
    if (reviewContent.trim().length < 5) {
      message.warning("评价内容至少 5 个字");
      return;
    }
    setSubmittingReview(true);
    try {
      await reviewApi.submit({
        orderId: reviewOrder.id,
        productId: reviewProductId,
        rating: reviewRating,
        content: reviewContent.trim(),
        imageUrls: reviewImages.length ? reviewImages : undefined,
      });
      message.success("评价已提交，审核通过后将在作品页展示");
      setReviewOrder(null);
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || "提交失败");
    } finally {
      setSubmittingReview(false);
    }
  };

  const hasPendingProof = (orderId: number) =>
    orders
      .find((x) => x.id === orderId)
      ?.payments?.some((p) => p.status === "PENDING" && p.hasProof);

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
    } catch (e: any) {
      message.error(e?.message || "凭证上传失败");
    } finally {
      setUploading(false);
    }
  };

  const openProfileEdit = () => {
    profileForm.setFieldsValue({ name: profile?.name, email: profile?.email });
    setProfileEditOpen(true);
  };

  const saveProfile = async () => {
    const values = await profileForm.validateFields();
    setSavingProfile(true);
    try {
      await customerApi.updateProfile({
        name: values.name,
        email: values.email,
      });
      message.success("资料已更新");
      setProfileEditOpen(false);
      onRefresh?.();
    } catch (e: any) {
      message.error(e?.message || "保存失败");
    } finally {
      setSavingProfile(false);
    }
  };

  const openAddressCreate = () => {
    setEditingAddressId(null);
    addressForm.resetFields();
    setAddressOpen(true);
  };

  const openAddressEdit = (addr: any) => {
    setEditingAddressId(addr.id);
    addressForm.setFieldsValue(addr);
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
    } catch (e: any) {
      message.error(e?.message || "保存失败");
    } finally {
      setSavingAddress(false);
    }
  };

  const removeAddress = async (id: number) => {
    try {
      await customerApi.deleteAddress(id);
      message.success("地址已删除");
      onRefresh?.();
    } catch (e: any) {
      message.error(e?.message || "删除失败");
    }
  };

  return (
    <>
      <main className="my-account">
        <style>{styles}</style>
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
        </nav>

        <section className="my-account__summary" aria-label="服务概览">
          <div>
            <strong>
              {String(selectionInquiries.length).padStart(2, "0")}
            </strong>
            <span>选款咨询</span>
          </div>
          <div>
            <strong>{String(inquiries.length).padStart(2, "0")}</strong>
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
          <section id="my-selections" className="my-account__panel">
            <div className="my-account__panel-head">
              <div>
                <p>PRIVATE SELECTION</p>
                <h2>我的选款</h2>
              </div>
              <Link to="/catalog">进入选款中心 →</Link>
            </div>
            {selectionInquiries.length ? (
              <div className="my-account__records">
                {selectionInquiries.slice(0, 3).map((record) => (
                  <article key={record.id}>
                    <div>
                      <small>
                        {new Date(record.createdAt).toLocaleDateString("zh-CN")}
                      </small>
                      <h3>
                        {record.items?.[0]?.productNameSnapshot || "选款咨询"}
                      </h3>
                    </div>
                    <em>{inquiryStatus[record.status] || record.status}</em>
                  </article>
                ))}
              </div>
            ) : (
              <Empty>
                暂未提交选款咨询。<Link to="/catalog">去挑选心仪作品 →</Link>
              </Empty>
            )}
          </section>

          <section id="my-appointments" className="my-account__panel">
            <div className="my-account__panel-head">
              <div>
                <p>PERSONAL SERVICE</p>
                <h2>我的预约</h2>
              </div>
              <Link to="/contact">预约咨询 →</Link>
            </div>
            {inquiries.length ? (
              <div className="my-account__records">
                {inquiries.slice(0, 3).map((record) => (
                  <article key={record.id}>
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
                  </article>
                ))}
              </div>
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
          >
            <div className="my-account__panel-head">
              <div>
                <p>WISHLIST</p>
                <h2>我的心愿单</h2>
              </div>
              <strong>{String(favorites.length).padStart(2, "0")}</strong>
            </div>
            {favorites.length ? (
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

          <section
            id="my-orders"
            className="my-account__panel my-account__panel--wide"
          >
            <div className="my-account__panel-head">
              <div>
                <p>ORDER ARCHIVE</p>
                <h2>我的订单</h2>
              </div>
            </div>
            {orders.length ? (
              <div className="my-account__records">
                {orders.slice(0, 4).map((order) => {
                  // 履约进度（订单可视化）：四步推导自服务端时间戳
                  const cancelled = order.status === "CANCELLED";
                  const steps = [
                    { label: "下单", done: true },
                    { label: "收款", done: Boolean(order.paymentConfirmedAt) },
                    { label: "发货", done: Boolean(order.shippedAt) },
                    { label: "完成", done: Boolean(order.completedAt) },
                  ];
                  return (
                    <article key={order.id}>
                      <div>
                        <small>
                          {order.orderNo} ·{" "}
                          {new Date(order.createdAt).toLocaleDateString(
                            "zh-CN",
                          )}
                        </small>
                        <h3>{order.items?.[0]?.product?.name || "珠宝作品"}</h3>
                      </div>
                      {/* 履约进度条 + 物流信息 */}
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          alignItems: "center",
                          margin: "10px 0 6px",
                        }}
                        aria-label="订单进度"
                      >
                        {cancelled ? (
                          <span style={{ fontSize: 11, color: "#8C3F3B" }}>
                            ✕ 订单已取消
                          </span>
                        ) : (
                          steps.map((step, index) => (
                            <span
                              key={step.label}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 11,
                                color: step.done ? "#181a1b" : "#6e7477",
                              }}
                            >
                              {index > 0 && (
                                <span
                                  style={{
                                    width: 18,
                                    height: 1,
                                    background: step.done
                                      ? "#181a1b"
                                      : "#dde1e2",
                                    display: "inline-block",
                                  }}
                                />
                              )}
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  background: step.done ? "#181a1b" : "#dde1e2",
                                  display: "inline-block",
                                }}
                              />
                              {step.label}
                            </span>
                          ))
                        )}
                      </div>
                      {order.logisticsCompany && order.logisticsNo ? (
                        <p
                          style={{
                            fontSize: 11,
                            color: "#5f6568",
                            margin: "0 0 6px",
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <span>
                            物流：{order.logisticsCompany} · 运单号{" "}
                            {order.logisticsNo}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleTracking(order.id)}
                            style={{
                              fontSize: 11,
                              color: "#181a1b",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {trackingOrderId === order.id
                              ? "收起轨迹"
                              : "查看轨迹"}
                          </button>
                        </p>
                      ) : null}
                      {trackingOrderId === order.id && (
                        <div
                          style={{
                            background: "#f4f5f5",
                            padding: 12,
                            marginBottom: 8,
                            fontSize: 12,
                          }}
                        >
                          {trackingLoading ? (
                            <p style={{ color: "#5f6568", margin: 0 }}>
                              轨迹查询中…
                            </p>
                          ) : trackingData && trackingData.events.length ? (
                            <>
                              <p
                                style={{ color: "#335f7d", margin: "0 0 8px" }}
                              >
                                {TRACK_STATE[trackingData.state] || "运输中"}
                                {trackingData.carrier
                                  ? ` · ${trackingData.carrier}`
                                  : ""}
                              </p>
                              {trackingData.events.map((ev, i) => (
                                <p
                                  key={i}
                                  style={{
                                    margin: "0 0 6px",
                                    color: i === 0 ? "#5f6568" : "#5f6568",
                                  }}
                                >
                                  <span style={{ marginRight: 8 }}>
                                    {ev.time}
                                  </span>
                                  {ev.context}
                                </p>
                              ))}
                            </>
                          ) : (
                            <p style={{ color: "#5f6568", margin: 0 }}>
                              暂无轨迹数据（物流查询服务可能未接入，请联系顾问）
                            </p>
                          )}
                        </div>
                      )}
                      <div className="my-account__order-meta">
                        <em>{orderStatus[order.status] || order.status}</em>
                        <strong>
                          ¥{Number(order.finalAmount).toLocaleString("zh-CN")}
                        </strong>
                        {order.status === "COMPLETED" && order.items?.length ? (
                          <button
                            type="button"
                            className="my-account__summary-action"
                            style={{
                              padding: "6px 12px",
                              fontSize: 12,
                              minHeight: 0,
                            }}
                            onClick={() =>
                              openReview({
                                id: order.id,
                                items: order.items || [],
                              })
                            }
                          >
                            评价作品
                          </button>
                        ) : null}
                        {order.status === "PENDING_PAYMENT" &&
                          (commerceEnabled ? (
                            hasPendingProof(order.id) ? (
                              <span style={{ fontSize: 11, color: "#7a531a" }}>
                                凭证已提交·待审核
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="my-account__summary-action"
                                style={{
                                  padding: "6px 12px",
                                  fontSize: 12,
                                  minHeight: 0,
                                }}
                                onClick={() => setProofOrderId(order.id)}
                                disabled={uploading}
                              >
                                上传付款凭证
                              </button>
                            )
                          ) : (
                            <span style={{ fontSize: 11, color: "#5f6568" }}>
                              线上付款暂未开放·顾问将联系您
                            </span>
                          ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty>
                暂未有订单记录。<Link to="/catalog">浏览珠宝作品 →</Link>
              </Empty>
            )}
          </section>

          <section
            id="my-profile"
            className="my-account__panel my-account__panel--profile"
          >
            <div className="my-account__panel-head">
              <div>
                <p>ACCOUNT PROFILE</p>
                <h2>个人资料</h2>
              </div>
            </div>
            <dl>
              <div>
                <dt>称呼</dt>
                <dd>{name}</dd>
              </div>
              <div>
                <dt>手机号</dt>
                <dd>{profile?.phone || "—"}</dd>
              </div>
              <div>
                <dt>邮箱</dt>
                <dd>{profile?.email || "暂未填写"}</dd>
              </div>
            </dl>
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
                    {partnerStatus === "APPROVED"
                      ? "✓ 已认证合作商家"
                      : PARTNER_STATUS_LABEL[partnerStatus] ||
                        "尚未申请合作商家身份"}
                    {partnerStatus === "APPROVED" && partnerApprovedAt
                      ? ` · ${new Date(partnerApprovedAt).toLocaleDateString("zh-CN")}`
                      : ""}
                  </span>
                  {partnerStatus !== "APPROVED" &&
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
                <Link
                  to={PARTNER_ACTION[partnerStatus]?.to || "/partner"}
                  style={{ fontSize: 12, color: "#181a1b", flexShrink: 0 }}
                >
                  {PARTNER_ACTION[partnerStatus]?.label || "了解详情"} →
                </Link>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Button
                size="small"
                onClick={openProfileEdit}
                style={{ marginRight: 8 }}
              >
                编辑资料
              </Button>
              <Button size="small" onClick={openAddressCreate}>
                新增地址
              </Button>
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
              <p>收货地址</p>
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
      </main>
      {commerceEnabled && (
        <Modal
          open={proofOrderId !== null}
          title="上传付款凭证"
          onCancel={() => setProofOrderId(null)}
          footer={null}
          destroyOnClose
        >
          <p style={{ color: "#5f6568", fontSize: 13, marginBottom: 16 }}>
            请上传转账截图或凭证图片（JPG/PNG/WebP，≤10MB）。审核通过后订单进入发货流程。
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

      {/* 个人资料编辑 */}
      <Modal
        open={reviewOrder !== null}
        title="评价作品"
        onCancel={() => setReviewOrder(null)}
        onOk={submitReview}
        confirmLoading={submittingReview}
        okText="提交评价"
        cancelText="取消"
        destroyOnClose
      >
        <p style={{ color: "#5f6568", fontSize: 13, marginBottom: 16 }}>
          评价提交后经审核将在作品页展示，感谢您分享佩戴体验。
        </p>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, marginBottom: 8 }}>选择作品</p>
          <Select
            style={{ width: "100%" }}
            value={reviewProductId}
            onChange={(value: number) => setReviewProductId(value)}
            options={(reviewOrder?.items || []).map((item) => ({
              value: item.productId,
              label: item.product?.name || `作品 #${item.productId}`,
            }))}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, marginBottom: 8 }}>星级</p>
          <Rate value={reviewRating} onChange={setReviewRating} />
        </div>
        <div>
          <p style={{ fontSize: 13, marginBottom: 8 }}>评价内容（5-500 字）</p>
          <Input.TextArea
            rows={4}
            maxLength={500}
            showCount
            value={reviewContent}
            onChange={(e) => setReviewContent(e.target.value)}
            placeholder="工艺、佩戴感受、顾问服务体验…"
          />
        </div>
        <div>
          <p style={{ fontSize: 13, marginBottom: 8 }}>
            晒单图（选填，最多 6 张）
          </p>
          <Upload
            listType="picture-card"
            accept="image/*"
            multiple
            showUploadList={false}
            customRequest={uploadReviewImage}
            disabled={reviewImages.length >= 6}
          >
            {reviewImages.length >= 6 ? null : (
              <span style={{ fontSize: 20, color: "#181a1b" }}>+</span>
            )}
          </Upload>
          {reviewImages.length > 0 ? (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 8,
              }}
            >
              {reviewImages.map((url) => (
                <div key={url} style={{ position: "relative" }}>
                  <img
                    src={url}
                    alt="晒单图"
                    style={{ width: 64, height: 64, objectFit: "cover" }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setReviewImages((list) => list.filter((u) => u !== url))
                    }
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: "none",
                      background: "rgba(0,0,0,.6)",
                      color: "#fff",
                      fontSize: 10,
                      lineHeight: "18px",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>

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
        destroyOnClose
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
            onChange={(e) => setClosePassword(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={profileEditOpen}
        title="编辑个人资料"
        onCancel={() => setProfileEditOpen(false)}
        onOk={saveProfile}
        confirmLoading={savingProfile}
        okText="保存"
        cancelText="取消"
      >
        <Form form={profileForm} layout="vertical">
          <Form.Item
            name="name"
            label="称呼"
            rules={[{ required: true, message: "请填写称呼" }]}
          >
            <Input placeholder="您的称呼" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="name@example.com" />
          </Form.Item>
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

const styles = `
.my-account{--ink:#181a1b!important;--soft:#5f6568!important;--line:#dde1e2!important;--gold:#181a1b!important}
.my-account__summary-action{background:#f4f5f5!important}
.my-account__panel--collection{background:#111315!important;border-color:#111315!important}
.my-account__button{color:#181a1b!important}
.my-account{--ink:#181a1b;--soft:#5f6568;--line:#dde1e2;--gold:#181a1b;max-width:1240px;margin:auto;padding:clamp(42px,7vw,96px) clamp(20px,5vw,64px) 112px;color:var(--ink)}.my-account__intro{display:flex;align-items:end;justify-content:space-between;gap:28px;padding-bottom:34px;border-bottom:1px solid var(--line)}.my-account__eyebrow,.my-account__panel-head p,.my-account__panel--collection>p{margin:0 0 12px;color:var(--gold);font:12px/1.2 "Cormorant Garamond","Noto Serif SC",serif;letter-spacing:.18em}.my-account h1,.my-account h2{margin:0;font-family:"Cormorant Garamond","Noto Serif SC",serif;font-weight:500;letter-spacing:.04em}.my-account h1{font-size:clamp(44px,6vw,68px);line-height:1}.my-account__greeting{margin:16px 0 0;color:var(--soft);font-size:14px}.my-account__sign-out{padding:0;border:0;background:none;color:var(--soft);font-size:13px;cursor:pointer}.my-account__sign-out:hover{color:var(--ink)}.my-account__shortcuts{display:flex;gap:26px;padding:18px 0;border-bottom:1px solid var(--line);overflow:auto}.my-account__shortcuts a{flex:none;color:var(--ink);font-size:13px;text-decoration:none}.my-account__shortcuts span{margin-right:7px;color:var(--gold);font:13px "Cormorant Garamond",serif}.my-account__summary{display:grid;grid-template-columns:repeat(3,1fr) minmax(150px,.8fr);margin:32px 0 18px;border:1px solid var(--line)}.my-account__summary>div,.my-account__summary-action{min-height:106px;padding:21px 24px;border-right:1px solid var(--line);display:grid;align-content:center;gap:6px}.my-account__summary strong{font:34px/1 "Cormorant Garamond",serif}.my-account__summary span{color:var(--soft);font-size:12px}.my-account__summary-action{background:#f4f5f5;color:var(--ink);font-size:13px;text-decoration:none}.my-account__summary-action b{color:var(--gold);font-size:17px;font-weight:400}.my-account__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.my-account__panel{min-height:250px;padding:30px;border:1px solid var(--line);background:#fff}.my-account__panel--wide{grid-column:span 2;min-height:auto}.my-account__panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.my-account__panel-head h2,.my-account__panel--collection h2{font-size:28px}.my-account__panel-head>a{color:var(--soft);font-size:12px;text-decoration:none}.my-account__panel-head>a:hover{color:var(--ink)}.my-account__records{margin-top:22px}.my-account__records article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 0;border-top:1px solid var(--line)}.my-account__records small{display:block;color:var(--soft);font-size:11px}.my-account__records h3{margin:6px 0 0;font-size:14px;font-weight:500}.my-account__records em{font-style:normal;color:var(--gold);font-size:12px;white-space:nowrap}.my-account__order-meta{display:grid;justify-items:end;gap:8px}.my-account__order-meta strong{font:22px "Cormorant Garamond",serif}.my-account-empty{margin:44px 0 0;color:var(--soft);font-size:13px;line-height:1.8}.my-account-empty a{display:block;width:max-content;margin-top:10px;color:var(--ink);text-decoration:none;border-bottom:1px solid var(--gold)}.my-account__panel--collection{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;background:#181a1b;border-color:#181a1b;color:#fff}.my-account__panel--collection>p{color:#fff}.my-account__panel--collection>span{margin:15px 0 24px;max-width:280px;font-size:13px;line-height:1.8}.my-account__button{padding:12px 18px;background:#fff;color:#181a1b;text-decoration:none;font-size:13px}.my-account__panel--profile{display:grid;grid-template-columns:1.1fr 1fr;column-gap:32px}.my-account__panel--profile .my-account__panel-head{grid-column:span 2}.my-account dl{margin:22px 0 0}.my-account dl div{padding:11px 0;border-top:1px solid var(--line)}.my-account dt{color:var(--soft);font-size:11px}.my-account dd{margin:5px 0 0;font-size:14px}.my-account__address{margin-top:22px;padding-top:11px;border-top:1px solid var(--line);font-size:13px;line-height:1.8}.my-account__address p{margin:0 0 6px;color:var(--soft);font-size:11px}@media(max-width:720px){.my-account__intro{align-items:flex-start;flex-direction:column}.my-account__summary{grid-template-columns:repeat(2,1fr)}.my-account__summary-action{border-top:1px solid var(--line)}.my-account__grid{grid-template-columns:1fr}.my-account__panel--wide{grid-column:auto}.my-account__panel--profile{grid-template-columns:1fr}.my-account__panel--profile .my-account__panel-head{grid-column:auto}.my-account__shortcuts{gap:18px}.my-account__panel{min-height:0;padding:25px}}@media(max-width:420px){.my-account__summary>div,.my-account__summary-action{padding:18px}.my-account__summary strong{font-size:29px}.my-account__panel-head{display:block}.my-account__panel-head>a{display:inline-block;margin-top:12px}.my-account__records article{align-items:flex-start;flex-direction:column}.my-account__order-meta{justify-items:start}}
`;

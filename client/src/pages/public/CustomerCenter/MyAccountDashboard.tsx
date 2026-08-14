import { useState } from "react";
import { Link } from "react-router-dom";
import { Modal, Upload, message } from "antd";
import { customerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { isCustomerCommerceEnabled } from "@/store/featureFlags";

type AccountDashboardProps = {
  profile: { name?: string; phone?: string; email?: string } | null;
  orders: Array<{
    id: number;
    orderNo: string;
    finalAmount: number | string;
    status: string;
    createdAt: string;
    items?: Array<{ product?: { name: string } }>;
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="my-account-empty">{children}</p>;
}

export default function MyAccountDashboard({
  profile,
  orders,
  addresses,
  selectionInquiries,
  inquiries,
  onSignOut,
  onRefresh,
}: AccountDashboardProps) {
  const name = profile?.name || "海川贵宾";
  const primaryAddress = addresses[0];
  const commerceEnabled = isCustomerCommerceEnabled();

  // P1-29：付款凭证上传（电商闭环 —— 线下转账订单需顾客补凭证，否则卡死 PENDING_PAYMENT）
  const [proofOrderId, setProofOrderId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const hasPendingProof = (orderId: number) =>
    orders.find((x) => x.id === orderId)?.payments?.some((p) => p.status === "PENDING" && p.hasProof);

  const handleUploadProof = async (file: File) => {
    if (proofOrderId == null) return;
    setUploading(true);
    try {
      const upRes = await customerApi.uploadPaymentProof(file);
      const proofKey = unwrapResponse<{ storageKey?: string }>(upRes)?.storageKey;
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

  return (
    <>
    <main className="my-account">
      <style>{styles}</style>
      <section className="my-account__intro">
        <div>
          <p className="my-account__eyebrow">HAICHUAN PRIVATE CLIENT</p>
          <h1>我的账号</h1>
          <p className="my-account__greeting">您好，{name}。您的作品、咨询与服务记录都在这里。</p>
        </div>
        <button type="button" className="my-account__sign-out" onClick={onSignOut}>退出登录</button>
      </section>

      <nav className="my-account__shortcuts" aria-label="账号快捷服务">
        <a href="#my-selections"><span>01</span>我的选款</a>
        <a href="#my-appointments"><span>02</span>我的预约</a>
        <a href="#my-orders"><span>03</span>我的订单</a>
        <a href="#my-profile"><span>04</span>个人资料</a>
      </nav>

      <section className="my-account__summary" aria-label="服务概览">
        <div><strong>{String(selectionInquiries.length).padStart(2, "0")}</strong><span>选款咨询</span></div>
        <div><strong>{String(inquiries.length).padStart(2, "0")}</strong><span>预约咨询</span></div>
        <div><strong>{String(orders.length).padStart(2, "0")}</strong><span>历史订单</span></div>
        <Link to="/catalog" className="my-account__summary-action">继续选款 <b>→</b></Link>
      </section>

      <div className="my-account__grid">
        <section id="my-selections" className="my-account__panel">
          <div className="my-account__panel-head"><div><p>PRIVATE SELECTION</p><h2>我的选款</h2></div><Link to="/catalog">进入选款中心 →</Link></div>
          {selectionInquiries.length ? <div className="my-account__records">{selectionInquiries.slice(0, 3).map((record) => <article key={record.id}><div><small>{new Date(record.createdAt).toLocaleDateString("zh-CN")}</small><h3>{record.items?.[0]?.productNameSnapshot || "选款咨询"}</h3></div><em>{inquiryStatus[record.status] || record.status}</em></article>)}</div> : <Empty>暂未提交选款咨询。<Link to="/catalog">去挑选心仪作品 →</Link></Empty>}
        </section>

        <section id="my-appointments" className="my-account__panel">
          <div className="my-account__panel-head"><div><p>PERSONAL SERVICE</p><h2>我的预约</h2></div><Link to="/contact">预约咨询 →</Link></div>
          {inquiries.length ? <div className="my-account__records">{inquiries.slice(0, 3).map((record) => <article key={record.id}><div><small>{new Date(record.createdAt).toLocaleDateString("zh-CN")}</small><h3>{record.product?.name || record.consultationType || "预约咨询"}</h3></div><em>{inquiryStatus[record.status] || record.status}</em></article>)}</div> : <Empty>还没有预约记录。<Link to="/contact">预约专属顾问 →</Link></Empty>}
        </section>

        <section id="my-orders" className="my-account__panel my-account__panel--wide">
          <div className="my-account__panel-head"><div><p>ORDER ARCHIVE</p><h2>我的订单</h2></div></div>
          {orders.length ? <div className="my-account__records">{orders.slice(0, 4).map((order) => <article key={order.id}><div><small>{order.orderNo} · {new Date(order.createdAt).toLocaleDateString("zh-CN")}</small><h3>{order.items?.[0]?.product?.name || "珠宝作品"}</h3></div><div className="my-account__order-meta"><em>{orderStatus[order.status] || order.status}</em><strong>¥{Number(order.finalAmount).toLocaleString("zh-CN")}</strong>{order.status === "PENDING_PAYMENT" && (commerceEnabled ? (hasPendingProof(order.id) ? <span style={{ fontSize: 11, color: "#b8944e" }}>凭证已提交·待审核</span> : <button type="button" className="my-account__summary-action" style={{ padding: "6px 12px", fontSize: 12, minHeight: 0 }} onClick={() => setProofOrderId(order.id)} disabled={uploading}>上传付款凭证</button>) : <span style={{ fontSize: 11, color: "#766f66" }}>线上付款暂未开放·顾问将联系您</span>)}</div></article>)}</div> : <Empty>暂未有订单记录。<Link to="/catalog">浏览珠宝作品 →</Link></Empty>}
        </section>

        <section className="my-account__panel my-account__panel--collection">
          <p>PRIVATE COLLECTION</p><h2>我的收藏</h2><span>把心仪的作品留在这里，方便下次继续挑选。</span><Link to="/catalog" className="my-account__button">浏览作品</Link>
        </section>

        <section id="my-profile" className="my-account__panel my-account__panel--profile">
          <div className="my-account__panel-head"><div><p>ACCOUNT PROFILE</p><h2>个人资料</h2></div></div>
          <dl><div><dt>称呼</dt><dd>{name}</dd></div><div><dt>手机号</dt><dd>{profile?.phone || "—"}</dd></div><div><dt>邮箱</dt><dd>{profile?.email || "暂未填写"}</dd></div></dl>
          <div className="my-account__address"><p>常用收货地址</p>{primaryAddress ? <span>{primaryAddress.recipientName} · {primaryAddress.recipientPhone}<br />{[primaryAddress.province, primaryAddress.city, primaryAddress.district, primaryAddress.detail].filter(Boolean).join("")}</span> : <span>暂未保存收货地址</span>}</div>
        </section>
      </div>
    </main>
      {commerceEnabled && <Modal
        open={proofOrderId !== null}
        title="上传付款凭证"
        onCancel={() => setProofOrderId(null)}
        footer={null}
        destroyOnClose
      >
        <p style={{ color: "#766f66", fontSize: 13, marginBottom: 16 }}>请上传转账截图或凭证图片（JPG/PNG/WebP，≤10MB）。审核通过后订单进入发货流程。</p>
        <Upload
          accept="image/jpeg,image/png,image/webp,image/gif"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => { void handleUploadProof(file); return false; }}
          disabled={uploading}
        >
          <button type="button" className="my-account__button" disabled={uploading} style={{ padding: "10px 16px", background: "#b8944e", color: "#fff", border: 0, cursor: "pointer" }}>
            {uploading ? "上传中..." : "选择图片并上传"}
          </button>
        </Upload>
      </Modal>}
    </>
  );
}

const styles = `
.my-account{--ink:#29241f;--soft:#766f66;--line:#e8e3da;--gold:#b8944e;max-width:1240px;margin:auto;padding:clamp(42px,7vw,96px) clamp(20px,5vw,64px) 112px;color:var(--ink)}.my-account__intro{display:flex;align-items:end;justify-content:space-between;gap:28px;padding-bottom:34px;border-bottom:1px solid var(--line)}.my-account__eyebrow,.my-account__panel-head p,.my-account__panel--collection>p{margin:0 0 12px;color:var(--gold);font:12px/1.2 "Cormorant Garamond","Noto Serif SC",serif;letter-spacing:.18em}.my-account h1,.my-account h2{margin:0;font-family:"Cormorant Garamond","Noto Serif SC",serif;font-weight:500;letter-spacing:.04em}.my-account h1{font-size:clamp(44px,6vw,68px);line-height:1}.my-account__greeting{margin:16px 0 0;color:var(--soft);font-size:14px}.my-account__sign-out{padding:0;border:0;background:none;color:var(--soft);font-size:13px;cursor:pointer}.my-account__sign-out:hover{color:var(--ink)}.my-account__shortcuts{display:flex;gap:26px;padding:18px 0;border-bottom:1px solid var(--line);overflow:auto}.my-account__shortcuts a{flex:none;color:var(--ink);font-size:13px;text-decoration:none}.my-account__shortcuts span{margin-right:7px;color:var(--gold);font:13px "Cormorant Garamond",serif}.my-account__summary{display:grid;grid-template-columns:repeat(3,1fr) minmax(150px,.8fr);margin:32px 0 18px;border:1px solid var(--line)}.my-account__summary>div,.my-account__summary-action{min-height:106px;padding:21px 24px;border-right:1px solid var(--line);display:grid;align-content:center;gap:6px}.my-account__summary strong{font:34px/1 "Cormorant Garamond",serif}.my-account__summary span{color:var(--soft);font-size:12px}.my-account__summary-action{background:#f7f4ee;color:var(--ink);font-size:13px;text-decoration:none}.my-account__summary-action b{color:var(--gold);font-size:17px;font-weight:400}.my-account__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.my-account__panel{min-height:250px;padding:30px;border:1px solid var(--line);background:#fff}.my-account__panel--wide{grid-column:span 2;min-height:auto}.my-account__panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.my-account__panel-head h2,.my-account__panel--collection h2{font-size:28px}.my-account__panel-head>a{color:var(--soft);font-size:12px;text-decoration:none}.my-account__panel-head>a:hover{color:var(--ink)}.my-account__records{margin-top:22px}.my-account__records article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 0;border-top:1px solid var(--line)}.my-account__records small{display:block;color:var(--soft);font-size:11px}.my-account__records h3{margin:6px 0 0;font-size:14px;font-weight:500}.my-account__records em{font-style:normal;color:var(--gold);font-size:12px;white-space:nowrap}.my-account__order-meta{display:grid;justify-items:end;gap:8px}.my-account__order-meta strong{font:22px "Cormorant Garamond",serif}.my-account-empty{margin:44px 0 0;color:var(--soft);font-size:13px;line-height:1.8}.my-account-empty a{display:block;width:max-content;margin-top:10px;color:var(--ink);text-decoration:none;border-bottom:1px solid var(--gold)}.my-account__panel--collection{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;background:#b8944e;border-color:#b8944e;color:#fff}.my-account__panel--collection>p{color:#fff}.my-account__panel--collection>span{margin:15px 0 24px;max-width:280px;font-size:13px;line-height:1.8}.my-account__button{padding:12px 18px;background:#fff;color:#8c6b2d;text-decoration:none;font-size:13px}.my-account__panel--profile{display:grid;grid-template-columns:1.1fr 1fr;column-gap:32px}.my-account__panel--profile .my-account__panel-head{grid-column:span 2}.my-account dl{margin:22px 0 0}.my-account dl div{padding:11px 0;border-top:1px solid var(--line)}.my-account dt{color:var(--soft);font-size:11px}.my-account dd{margin:5px 0 0;font-size:14px}.my-account__address{margin-top:22px;padding-top:11px;border-top:1px solid var(--line);font-size:13px;line-height:1.8}.my-account__address p{margin:0 0 6px;color:var(--soft);font-size:11px}@media(max-width:720px){.my-account__intro{align-items:flex-start;flex-direction:column}.my-account__summary{grid-template-columns:repeat(2,1fr)}.my-account__summary-action{border-top:1px solid var(--line)}.my-account__grid{grid-template-columns:1fr}.my-account__panel--wide{grid-column:auto}.my-account__panel--profile{grid-template-columns:1fr}.my-account__panel--profile .my-account__panel-head{grid-column:auto}.my-account__shortcuts{gap:18px}.my-account__panel{min-height:0;padding:25px}}@media(max-width:420px){.my-account__summary>div,.my-account__summary-action{padding:18px}.my-account__summary strong{font-size:29px}.my-account__panel-head{display:block}.my-account__panel-head>a{display:inline-block;margin-top:12px}.my-account__records article{align-items:flex-start;flex-direction:column}.my-account__order-meta{justify-items:start}}
`;

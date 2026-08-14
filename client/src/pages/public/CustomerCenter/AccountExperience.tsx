import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { customerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";

type AccountExperienceProps = {
  isSignedIn: boolean;
  profile: { name?: string; phone?: string; email?: string } | null;
  orders: Array<{
    id: number;
    orderNo: string;
    finalAmount: number | string;
    status: string;
    createdAt: string;
    items?: Array<{ product?: { name: string } }>;
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
  authLoading: boolean;
  onLogin: (values: { phone: string; password: string }) => void;
  onRegister: (values: {
    phone: string;
    password: string;
    name: string;
    email?: string;
    smsCode?: string;
  }) => void;
  onSignOut: () => void;
};

type Section =
  | "overview"
  | "selections"
  | "appointments"
  | "orders"
  | "favorites"
  | "profile";

const statusLabels: Record<string, string> = {
  PENDING_PAYMENT: "待付款",
  PENDING_SHIP: "待发货",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const navItems: Array<{
  key: Section;
  number: string;
  label: string;
  detail: string;
}> = [
  { key: "overview", number: "01", label: "账户首页", detail: "专属服务概览" },
  {
    key: "selections",
    number: "02",
    label: "我的选款",
    detail: "心仪作品与进度",
  },
  {
    key: "appointments",
    number: "03",
    label: "我的预约",
    detail: "顾问与到店安排",
  },
  { key: "orders", number: "04", label: "我的订单", detail: "订单与售后服务" },
  { key: "profile", number: "05", label: "个人资料", detail: "账户与收货信息" },
];

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="account-empty">
      <span className="account-empty__mark">◇</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function MemberAccess({
  authLoading,
  onLogin,
  onRegister,
}: Pick<AccountExperienceProps, "authLoading" | "onLogin" | "onRegister">) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // 手机验真：是否强制验证码由服务端开关决定（SMS 凭据接入后打开）
  const [smsCode, setSmsCode] = useState("");
  const [smsRequired, setSmsRequired] = useState(false);
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [sendingSms, setSendingSms] = useState(false);

  useEffect(() => {
    customerApi
      .smsRequirements()
      .then((res: unknown) => {
        const data = unwrapResponse<{ registerRequired?: boolean }>(res);
        setSmsRequired(Boolean(data?.registerRequired));
      })
      .catch(() => setSmsRequired(false));
  }, []);

  useEffect(() => {
    if (smsCooldown <= 0) return;
    const timer = setInterval(() => setSmsCooldown((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, [smsCooldown]);

  const handleSendSmsCode = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      alert("请先填写有效的手机号");
      return;
    }
    setSendingSms(true);
    try {
      await customerApi.requestSmsCode({ phone });
      setSmsCooldown(60);
    } catch (e: any) {
      alert(e?.response?.data?.message || e?.message || "验证码发送失败");
    } finally {
      setSendingSms(false);
    }
  };

  return (
    <form
      id="member-access-form"
      className="account-member-access"
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "login") onLogin({ phone, password });
        else
          onRegister({
            phone,
            password,
            name,
            email: email || undefined,
            smsCode: smsRequired ? smsCode.trim() : undefined,
          });
      }}
    >
      <div className="account-access-tabs">
        <button
          type="button"
          className={mode === "login" ? "is-active" : ""}
          onClick={() => setMode("login")}
        >
          会员登录
        </button>
        <button
          type="button"
          className={mode === "register" ? "is-active" : ""}
          onClick={() => setMode("register")}
        >
          注册会员
        </button>
      </div>
      <p>
        {mode === "login"
          ? "登录后，提交咨询无需重复填写联系方式。"
          : "注册后，为您保存作品偏好、咨询与订单档案。"}
      </p>
      {mode === "register" && (
        <label>
          称呼
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={50}
            required
          />
        </label>
      )}
      <label>
        手机号
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="numeric"
          maxLength={11}
          required
        />
      </label>
      {mode === "register" && (
        <label>
          邮箱（选填）
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            maxLength={100}
          />
        </label>
      )}
      {mode === "register" && smsRequired && (
        <label>
          短信验证码
          <span
            style={{ display: "flex", gap: 8 }}
          >
            <input
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value)}
              inputMode="numeric"
              maxLength={6}
              required
            />
            <button
              type="button"
              onClick={handleSendSmsCode}
              disabled={sendingSms || smsCooldown > 0 || !/^1\d{10}$/.test(phone)}
              style={{ whiteSpace: "nowrap", fontSize: 12, minHeight: 0, padding: "0 10px" }}
            >
              {smsCooldown > 0 ? `${smsCooldown}s` : sendingSms ? "发送中…" : "获取验证码"}
            </button>
          </span>
        </label>
      )}
      <label>
        密码
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          minLength={8}
          required
        />
      </label>
      <small>密码至少 8 位，需包含字母和数字。</small>
      {mode === "login" && (
        <div className="text-right">
          <Link
            to="/customer/forgot"
            className="text-xs text-brand-muted hover:text-brand-gold underline underline-offset-2"
          >
            忘记密码？
          </Link>
        </div>
      )}
      <button
        type="submit"
        className="account-button account-button--dark"
        disabled={authLoading}
      >
        {authLoading
          ? "处理中…"
          : mode === "login"
            ? "登录我的账户"
            : "创建会员账户"}
      </button>
    </form>
  );
}

export default function AccountExperience({
  isSignedIn,
  profile,
  orders,
  addresses,
  selectionInquiries,
  inquiries,
  authLoading,
  onLogin,
  onRegister,
  onSignOut,
}: AccountExperienceProps) {
  const [section, setSection] = useState<Section>("overview");
  const firstOrder = orders[0];
  const displayName = profile?.name || "海川贵宾";
  const stats = useMemo(
    () => [
      {
        value: String(selectionInquiries.length).padStart(2, "0"),
        label: "选款咨询",
      },
      { value: String(inquiries.length).padStart(2, "0"), label: "预约到店" },
      { value: String(orders.length).padStart(2, "0"), label: "历史订单" },
    ],
    [inquiries.length, orders.length, selectionInquiries.length],
  );

  if (!isSignedIn) {
    return (
      <main className="account-page account-page--guest">
        <style>{accountStyles}</style>
        <section className="account-hero">
          <p className="account-kicker">HAICHUAN PRIVATE CLIENT</p>
          <h1>
            您的珠宝档案，
            <br />
            值得被悉心珍藏。
          </h1>
          <p className="account-hero__text">
            登录后，作品偏好、专属咨询、预约与订单将被妥善保存于同一处。
          </p>
          <div className="account-hero__actions">
            <button
              type="button"
              className="account-button account-button--dark"
              onClick={() =>
                document
                  .getElementById("member-access-form")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
            >
              会员登录 / 注册
            </button>
            <Link to="/catalog" className="account-text-link">
              先浏览作品 <span>→</span>
            </Link>
          </div>
        </section>
        <section className="account-guest-grid">
          <div className="account-benefits">
            <p className="account-kicker">MEMBER EXPERIENCE</p>
            <h2>
              为每一次心动，
              <br />
              留下恰到好处的记录。
            </h2>
            <div className="account-benefit-list">
              <div>
                <span>01</span>
                <p>
                  <strong>专属选款</strong>保存心仪作品，顾问了解您的偏好。
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <strong>一对一预约</strong>集中管理线上咨询与到店安排。
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <strong>订单档案</strong>随时查看订单、支付与售后服务。
                </p>
              </div>
            </div>
          </div>
          <div className="account-guest-side">
            <MemberAccess
              authLoading={authLoading}
              onLogin={onLogin}
              onRegister={onRegister}
            />
          </div>
        </section>
      </main>
    );
  }

  const renderSection = () => {
    if (section === "overview") {
      return (
        <div className="account-overview">
          <section className="account-welcome">
            <p className="account-kicker">PRIVATE CLIENT</p>
            <h1>您好，{displayName}</h1>
            <p>每一件作品，都是一段值得珍藏的故事。</p>
            <div className="account-stats">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
          </section>
          <div className="account-content-grid">
            <section className="account-panel">
              <div className="account-panel__head">
                <div>
                  <p className="account-kicker">RECENT ORDER</p>
                  <h2>最近订单</h2>
                </div>
                <button type="button" onClick={() => setSection("orders")}>
                  查看全部
                </button>
              </div>
              {firstOrder ? (
                <div className="account-order">
                  <div>
                    <small>{firstOrder.orderNo}</small>
                    <h3>
                      {firstOrder.items?.[0]?.product?.name || "珠宝作品"}
                    </h3>
                    <p>
                      {new Date(firstOrder.createdAt).toLocaleDateString(
                        "zh-CN",
                      )}{" "}
                      · {statusLabels[firstOrder.status] || firstOrder.status}
                    </p>
                  </div>
                  <strong>
                    ¥{Number(firstOrder.finalAmount).toLocaleString("zh-CN")}
                  </strong>
                </div>
              ) : (
                <EmptyState
                  title="尚未有订单记录"
                  description="探索心仪作品，开始您的珠宝故事。"
                  action={
                    <Link to="/catalog" className="account-text-link">
                      进入选款中心 →
                    </Link>
                  }
                />
              )}
            </section>
            <section className="account-panel account-panel--gold">
              <p className="account-kicker">PERSONAL SERVICE</p>
              <h2>预约专属顾问</h2>
              <p>从挑选到佩戴，为您安排一对一珠宝顾问服务。</p>
              <Link
                to="/contact"
                className="account-button account-button--light"
              >
                预约咨询
              </Link>
            </section>
          </div>
        </div>
      );
    }
    if (section === "orders") {
      return (
        <section className="account-panel">
          <div className="account-panel__head">
            <div>
              <p className="account-kicker">ORDERS</p>
              <h2>我的订单</h2>
            </div>
          </div>
          {orders.length ? (
            <div className="account-order-list">
              {orders.map((order) => (
                <div className="account-order" key={order.id}>
                  <div>
                    <small>{order.orderNo}</small>
                    <h3>{order.items?.[0]?.product?.name || "珠宝作品"}</h3>
                    <p>
                      {new Date(order.createdAt).toLocaleDateString("zh-CN")} ·{" "}
                      {statusLabels[order.status] || order.status}
                    </p>
                  </div>
                  <strong>
                    ¥{Number(order.finalAmount).toLocaleString("zh-CN")}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="尚未有订单记录"
              description="浏览作品，开始您的专属珠宝档案。"
              action={
                <Link to="/catalog" className="account-text-link">
                  进入选款中心 →
                </Link>
              }
            />
          )}
        </section>
      );
    }
    if (section === "profile") {
      return (
        <section className="account-panel">
          <div className="account-panel__head">
            <div>
              <p className="account-kicker">PROFILE</p>
              <h2>个人资料</h2>
            </div>
          </div>
          <div className="account-profile-grid">
            <div>
              <span>姓名</span>
              <strong>{displayName}</strong>
            </div>
            <div>
              <span>手机号</span>
              <strong>{profile?.phone || "—"}</strong>
            </div>
            <div>
              <span>邮箱</span>
              <strong>{profile?.email || "暂未填写"}</strong>
            </div>
          </div>
          <div className="account-address">
            <p className="account-kicker">DELIVERY ADDRESS</p>
            <h3>常用收货地址</h3>
            {addresses.length ? (
              addresses.map((address) => (
                <p key={address.id}>
                  {address.recipientName} · {address.recipientPhone}
                  <br />
                  {[
                    address.province,
                    address.city,
                    address.district,
                    address.detail,
                  ]
                    .filter(Boolean)
                    .join("")}
                </p>
              ))
            ) : (
              <p className="account-muted">暂未保存收货地址</p>
            )}
          </div>
        </section>
      );
    }
    if (section === "selections" || section === "appointments") {
      const records = section === "selections" ? selectionInquiries : inquiries;
      const heading = section === "selections" ? "我的选款" : "我的预约";
      const emptyDescription =
        section === "selections"
          ? "心仪的作品会在这里等待您"
          : "预约咨询与到店安排会在这里呈现";
      const path = section === "selections" ? "/catalog" : "/contact";
      return (
        <section className="account-panel">
          <div className="account-panel__head">
            <div>
              <p className="account-kicker">PRIVATE SERVICE</p>
              <h2>{heading}</h2>
            </div>
          </div>
          {records.length ? (
            <div className="account-order-list">
              {records.map((record) => (
                <div className="account-order" key={record.id}>
                  <div>
                    <small>
                      {new Date(record.createdAt).toLocaleDateString("zh-CN")}
                    </small>
                    <h3>
                      {section === "selections"
                        ? (record as (typeof selectionInquiries)[number])
                            .items?.[0]?.productNameSnapshot || "选款咨询"
                        : (record as (typeof inquiries)[number]).product
                            ?.name ||
                          (record as (typeof inquiries)[number])
                            .consultationType ||
                          "预约咨询"}
                    </h3>
                    <p>
                      {record.status === "PENDING"
                        ? "待顾问联系"
                        : record.status === "PROCESSING"
                          ? "顾问跟进中"
                          : record.status === "REPLIED"
                            ? "已回复"
                            : record.status}
                    </p>
                  </div>
                  <strong>→</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title={heading}
              description={emptyDescription}
              action={
                <Link
                  to={path}
                  className="account-button account-button--outline"
                >
                  {section === "selections" ? "去选款中心" : "预约咨询"}
                </Link>
              }
            />
          )}
        </section>
      );
    }
    const labels: Record<
      Exclude<
        Section,
        "overview" | "orders" | "profile" | "selections" | "appointments"
      >,
      [string, string, string]
    > = { favorites: ["我的收藏", "珍藏每一次令人心动的相遇", "浏览作品"] };
    const [title, description, action] = labels[section as keyof typeof labels];
    return (
      <section className="account-panel">
        <p className="account-kicker">PRIVATE COLLECTION</p>
        <EmptyState
          title={title}
          description={description}
          action={
            <Link
              to="/catalog"
              className="account-button account-button--outline"
            >
              {action}
            </Link>
          }
        />
      </section>
    );
  };

  return (
    <main className="account-page">
      <style>{accountStyles}</style>
      <section className="account-header">
        <div>
          <p className="account-kicker">HAICHUAN JEWELRY</p>
          <h1>我的账户</h1>
        </div>
        <button type="button" className="account-signout" onClick={onSignOut}>
          退出登录
        </button>
      </section>
      <div className="account-layout">
        <aside className="account-nav" aria-label="账户导航">
          {navItems.map((item) => (
            <button
              type="button"
              className={section === item.key ? "is-active" : ""}
              onClick={() => setSection(item.key)}
              key={item.key}
            >
              <span>{item.number}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
            </button>
          ))}
        </aside>
        <section className="account-main">{renderSection()}</section>
      </div>
    </main>
  );
}

const accountStyles = `
.account-guest-side{display:grid;gap:18px;align-self:start}.account-member-access{padding:30px;background:#fff;border:1px solid var(--line)}.account-member-access>p{margin:16px 0 0;color:var(--muted);font-size:13px;line-height:1.8}.account-member-access label{display:grid;gap:8px;margin-top:16px;font-size:12px;color:var(--muted)}.account-member-access input{height:42px;box-sizing:border-box;border:1px solid var(--line);padding:0 11px;background:#fff;color:var(--ink);outline:none}.account-member-access input:focus{border-color:var(--gold)}.account-member-access small{display:block;margin-top:10px;color:var(--muted);font-size:11px}.account-member-access .account-button{width:100%;margin-top:22px}.account-access-tabs{display:flex;gap:24px;border-bottom:1px solid var(--line)}.account-access-tabs button{padding:0 0 12px;border:0;border-bottom:1px solid transparent;background:transparent;color:var(--muted);font-size:15px;cursor:pointer}.account-access-tabs button.is-active{border-bottom-color:var(--gold);color:var(--ink)}
.account-page{--ink:#29241f;--muted:rgba(41,36,31,.58);--line:#e5e1d9;--gold:#b8944e;max-width:1320px;margin:0 auto;padding:clamp(40px,6vw,92px) clamp(24px,5vw,72px) clamp(72px,9vw,128px);color:var(--ink);font-family:var(--font-sans,system-ui,sans-serif)}
.account-kicker{margin:0 0 14px;color:var(--gold);font-family:"Cormorant Garamond","Noto Serif SC",serif;font-size:12px;letter-spacing:.2em}.account-header,.account-panel__head,.account-order,.account-welcome,.account-hero__actions{display:flex;align-items:center;justify-content:space-between;gap:24px}.account-header{padding-bottom:32px;border-bottom:1px solid var(--line)}.account-header h1,.account-hero h1,.account-welcome h1,.account-benefits h2{margin:0;font-family:"Cormorant Garamond","Noto Serif SC",serif;font-weight:500;letter-spacing:.03em}.account-header h1{font-size:clamp(40px,5vw,64px)}.account-signout,.account-panel__head button{border:0;background:transparent;color:var(--muted);font-size:13px;cursor:pointer}.account-signout:hover,.account-panel__head button:hover{color:var(--ink)}.account-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:clamp(40px,6vw,90px);padding-top:48px}.account-nav{display:flex;flex-direction:column;border-top:1px solid var(--line)}.account-nav button{display:flex;gap:14px;padding:18px 0;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left;color:var(--muted);cursor:pointer}.account-nav button span{padding-top:2px;color:#aaa299;font:11px/1 "Cormorant Garamond",serif}.account-nav button strong,.account-nav button small{display:block}.account-nav button strong{font-size:15px;font-weight:500;letter-spacing:.04em}.account-nav button small{margin-top:4px;font-size:11px}.account-nav button.is-active{color:var(--ink)}.account-nav button.is-active strong{color:var(--gold)}.account-main{min-width:0}.account-welcome{align-items:flex-end;padding:clamp(32px,5vw,56px);background:#f6f3ed}.account-welcome h1{font-size:clamp(32px,4vw,52px)}.account-welcome>p{margin:0;color:var(--muted);font-size:14px}.account-stats{display:flex;gap:28px}.account-stats div{display:grid;gap:4px}.account-stats strong{font:34px/1 "Cormorant Garamond",serif}.account-stats span{font-size:11px;color:var(--muted)}.account-content-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(230px,.8fr);gap:18px;margin-top:18px}.account-panel{padding:clamp(26px,4vw,42px);border:1px solid var(--line);background:#fff}.account-panel h2{margin:0;font:500 28px/1.2 "Cormorant Garamond","Noto Serif SC",serif;letter-spacing:.04em}.account-panel--gold{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;background:#b8944e;color:#fff;border-color:#b8944e}.account-panel--gold .account-kicker{color:#fff}.account-panel--gold>p:not(.account-kicker){margin:16px 0 28px;line-height:1.8;font-size:13px}.account-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 22px;border:1px solid transparent;font-size:13px;letter-spacing:.07em;text-decoration:none;cursor:pointer}.account-button--dark{background:#29241f;color:#fff}.account-button--dark:disabled{opacity:.48;cursor:not-allowed}.account-button--light{background:#fff;color:#8a6b2e}.account-button--outline{border-color:var(--ink);color:var(--ink);background:#fff}.account-order{padding:24px 0;border-top:1px solid var(--line)}.account-order small{font-size:11px;letter-spacing:.08em;color:var(--gold)}.account-order h3{margin:8px 0 6px;font-size:15px;font-weight:500}.account-order p,.account-muted{margin:0;color:var(--muted);font-size:12px}.account-order>strong{font:24px "Cormorant Garamond",serif;white-space:nowrap}.account-empty{text-align:center;padding:56px 16px}.account-empty__mark{display:block;margin-bottom:13px;color:var(--gold);font-size:24px}.account-empty h3{margin:0;font:500 25px "Cormorant Garamond","Noto Serif SC",serif}.account-empty p{margin:12px 0 24px;color:var(--muted);font-size:13px}.account-text-link{color:var(--ink);font-size:13px;text-decoration:none;border-bottom:1px solid var(--gold);padding-bottom:5px}.account-text-link span{color:var(--gold);padding-left:5px}.account-order-list .account-order:last-child{border-bottom:1px solid var(--line)}.account-profile-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin:28px 0;background:var(--line)}.account-profile-grid div{padding:18px;background:#fff}.account-profile-grid span,.account-profile-grid strong{display:block}.account-profile-grid span{margin-bottom:8px;font-size:11px;color:var(--muted)}.account-profile-grid strong{font-size:14px;font-weight:500}.account-address{margin-top:38px;padding-top:26px;border-top:1px solid var(--line)}.account-address h3{margin:0 0 14px;font-size:15px;font-weight:500}.account-address>p:not(.account-kicker){font-size:13px;line-height:1.8}.account-page--guest{padding-top:clamp(32px,6vw,88px)}.account-hero{padding:clamp(40px,7vw,104px) clamp(28px,7vw,100px);background:linear-gradient(120deg,#f7f4ee,#ece5d7)}.account-hero h1{font-size:clamp(42px,6vw,80px);line-height:1.03}.account-hero__text{max-width:430px;margin:22px 0 30px;color:var(--muted);line-height:1.9;font-size:14px}.account-hero__actions{justify-content:flex-start}.account-guest-grid{display:grid;grid-template-columns:1.35fr .9fr;gap:clamp(32px,7vw,100px);padding:clamp(48px,8vw,112px) 4vw}.account-benefits h2{font-size:clamp(32px,4vw,52px);line-height:1.2}.account-benefit-list{margin-top:34px;border-top:1px solid var(--line)}.account-benefit-list>div{display:flex;gap:22px;padding:18px 0;border-bottom:1px solid var(--line)}.account-benefit-list span{font:17px "Cormorant Garamond",serif;color:var(--gold)}.account-benefit-list p{margin:0;color:var(--muted);font-size:13px;line-height:1.8}.account-benefit-list strong{display:block;color:var(--ink);font-size:14px;font-weight:500}.account-access{padding:34px;background:#29241f;color:#fff;align-self:start}.account-access h2{margin:0;font:500 31px "Cormorant Garamond","Noto Serif SC",serif}.account-access>p:not(.account-kicker){color:rgba(255,255,255,.64);font-size:13px;line-height:1.8}.account-access .account-kicker{color:#d6bb7d}.account-access label{display:grid;gap:8px;margin-top:18px;color:rgba(255,255,255,.78);font-size:12px}.account-access input{height:42px;box-sizing:border-box;border:1px solid rgba(255,255,255,.26);padding:0 11px;background:transparent;color:#fff;outline:none}.account-access input:focus{border-color:#d6bb7d}.account-access .account-button{width:100%;margin-top:26px;background:#fff;color:#29241f}@media(max-width:820px){.account-layout{grid-template-columns:1fr;gap:32px}.account-nav{display:grid;grid-template-columns:repeat(3,1fr);border-left:1px solid var(--line)}.account-nav button{padding:13px;border-right:1px solid var(--line)}.account-nav button small{display:none}.account-welcome{display:block}.account-welcome>p{margin-top:12px}.account-stats{margin-top:30px}.account-content-grid,.account-guest-grid{grid-template-columns:1fr}.account-guest-grid{padding-inline:0}.account-profile-grid{grid-template-columns:1fr}.account-header{align-items:flex-end}}@media(max-width:520px){.account-page{padding-inline:20px}.account-header h1{font-size:42px}.account-nav{grid-template-columns:repeat(2,1fr)}.account-nav button:last-child{grid-column:span 2}.account-welcome{padding:28px}.account-stats{gap:20px}.account-stats strong{font-size:27px}.account-hero__actions{align-items:flex-start;flex-direction:column}.account-order{align-items:flex-start;flex-direction:column;gap:12px}}
`;

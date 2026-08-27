import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { customerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getRequestErrorMessage } from "@/services/httpClient";
import type { CustomerAccount } from "@/store/customerAuthStore";
import "./AccountExperience.css";

type AccountExperienceProps = {
  authLoading: boolean;
  onLogin: (values: { phone: string; password: string }) => void;
  onRegister: (values: {
    phone: string;
    password: string;
    name: string;
    email?: string;
    smsCode?: string;
  }) => void;
  onWechatAuth: (result: { customer: CustomerAccount }) => void;
};
function WechatLoginPanel({
  onAuthenticated,
}: {
  onAuthenticated: (result: { customer: CustomerAccount }) => void;
}) {
  const [qrConnectUrl, setQrConnectUrl] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [bindToken, setBindToken] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [binding, setBinding] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    customerApi
      .wechatConfig(window.location.origin)
      .then((res: unknown) => {
        const data = unwrapResponse<{ enabled: boolean; qrConnectUrl?: string }>(res);
        if (cancelled) return;
        if (data?.enabled && data.qrConnectUrl) {
          setQrConnectUrl(data.qrConnectUrl);
        } else {
          setNotConfigured(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNotConfigured(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // 只接受我们嵌入的扫码 iframe 发来的消息，拒绝任何其它窗口伪造的登录结果
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as {
        type?: string;
        payload?: {
          kind?: "success" | "need-bind" | "error";
          customer?: CustomerAccount;
          bindToken?: string;
          message?: string;
        };
      };
      if (data?.type !== "wechat-login-result" || !data.payload) return;
      const payload = data.payload;
      if (payload.kind === "success" && payload.customer) {
        onAuthenticated({ customer: payload.customer });
      } else if (payload.kind === "need-bind" && payload.bindToken) {
        setBindToken(payload.bindToken);
      } else if (payload.kind === "error") {
        alert(payload.message || "微信登录失败，请重试");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onAuthenticated]);

  const handleBind = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      alert("请填写有效的手机号");
      return;
    }
    if (password.length < 8) {
      alert("密码至少 8 位");
      return;
    }
    setBinding(true);
    try {
      const res = await customerApi.wechatBind({
        bindToken: bindToken!,
        phone,
        password,
      });
      const result = unwrapResponse<{ customer: CustomerAccount }>(res);
      if (!result?.customer) throw new Error("绑定成功但会话未建立");
      onAuthenticated(result);
    } catch (error: unknown) {
      alert(getRequestErrorMessage(error, "绑定失败，请重试"));
    } finally {
      setBinding(false);
    }
  };

  if (notConfigured) return null;

  if (bindToken) {
    return (
      <div
        className="account-wechat-login"
        style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(0,0,0,0.08)" }}
      >
        <p className="text-xs">已通过微信验证身份，请绑定手机号完成登录</p>
        <label style={{ display: "block", marginTop: 12 }}>
          手机号
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="numeric"
            maxLength={11}
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ display: "block", marginTop: 12 }}>
          密码
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength={8}
            style={{ marginTop: 6 }}
          />
        </label>
        <p className="text-xs" style={{ marginTop: 6 }}>
          已注册手机号请填原密码绑定；未注册将创建新会员账户。
        </p>
        <button
          type="button"
          className="account-button account-button--dark"
          style={{ width: "100%", marginTop: 12 }}
          disabled={binding}
          onClick={handleBind}
        >
          {binding ? "绑定中…" : "绑定并登录"}
        </button>
      </div>
    );
  }

  if (!qrConnectUrl) {
    return (
      <p className="text-xs" style={{ marginTop: 24, textAlign: "center" }}>
        正在加载微信登录…
      </p>
    );
  }

  return (
    <div
      className="account-wechat-login"
      style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(0,0,0,0.08)", textAlign: "center" }}
    >
      <p className="text-xs">或使用微信扫码登录</p>
      <iframe
        ref={iframeRef}
        title="微信扫码登录"
        src={qrConnectUrl}
        style={{ width: 240, height: 240, border: "none", marginTop: 12 }}
      />
      <p className="text-xs">使用微信「扫一扫」，扫码后自动登录</p>
    </div>
  );
}

function MemberAccess({
  authLoading,
  onLogin,
  onRegister,
  onWechatAuth,
}: Pick<
  AccountExperienceProps,
  "authLoading" | "onLogin" | "onRegister" | "onWechatAuth"
>) {
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
    } catch (error: unknown) {
      alert(getRequestErrorMessage(error, "验证码发送失败"));
    } finally {
      setSendingSms(false);
    }
  };

  return (
    <>
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
    <WechatLoginPanel onAuthenticated={onWechatAuth} />
    </>
  );
}

export default function AccountExperience({
  authLoading,
  onLogin,
  onRegister,
  onWechatAuth,
}: AccountExperienceProps) {
  return (
    <div className="account-page account-page--guest">
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
            onWechatAuth={onWechatAuth}
          />
        </div>
      </section>
    </div>
  );
}

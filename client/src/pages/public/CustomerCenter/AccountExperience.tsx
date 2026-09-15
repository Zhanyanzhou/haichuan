import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { customerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getRequestErrorMessage } from "@/services/httpClient";
import type { CustomerAccount } from "@/store/customerAuthStore";
import {
  ACCOUNT_PASSWORD_HINT,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
} from "@/config/accountPasswordPolicy";
import "./AccountExperience.css";

type AccountExperienceProps = {
  authLoading: boolean;
  onLogin: (values: {
    phone: string;
    password: string;
    captchaId?: string;
    captchaCode?: string;
    smsCode?: string;
  }) => void | Promise<unknown>;
  onRegister: (values: {
    phone: string;
    password: string;
    name: string;
    email?: string;
    smsCode?: string;
  }) => void;
  onWechatAuth: (result: { customer: CustomerAccount }) => void;
};

type WechatLoginPayload =
  | { kind: "success"; customer: CustomerAccount }
  | { kind: "need-bind"; bindToken: string }
  | { kind: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index])
  );
}

export function parseWechatLoginMessage(value: unknown): WechatLoginPayload | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["payload", "type", "version"]) ||
    value.type !== "wechat-login-result" ||
    value.version !== 1 ||
    !isRecord(value.payload)
  ) {
    return null;
  }
  const payload = value.payload;
  if (payload.kind === "success") {
    if (
      !hasExactKeys(payload, ["customer", "kind"]) ||
      !isRecord(payload.customer) ||
      !hasExactKeys(payload.customer, ["email", "id", "name", "phone"]) ||
      !Number.isInteger(payload.customer.id) ||
      (payload.customer.id as number) <= 0 ||
      typeof payload.customer.phone !== "string" ||
      !/^1\d{10}$/.test(payload.customer.phone) ||
      !(
        typeof payload.customer.name === "string" ||
        payload.customer.name === null
      ) ||
      !(
        typeof payload.customer.email === "string" ||
        payload.customer.email === null
      )
    ) {
      return null;
    }
    return payload as WechatLoginPayload;
  }
  if (
    payload.kind === "need-bind" &&
    hasExactKeys(payload, ["bindToken", "kind"]) &&
    typeof payload.bindToken === "string" &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
      payload.bindToken,
    )
  ) {
    return { kind: "need-bind", bindToken: payload.bindToken };
  }
  if (
    payload.kind === "error" &&
    hasExactKeys(payload, ["kind", "message"]) &&
    typeof payload.message === "string" &&
    payload.message.length > 0 &&
    payload.message.length <= 200
  ) {
    return { kind: "error", message: payload.message };
  }
  return null;
}

function WechatLoginPanel({
  onAuthenticated,
}: {
  onAuthenticated: (result: { customer: CustomerAccount }) => void;
}) {
  const [qrConnectUrl, setQrConnectUrl] = useState<string | null>(null);
  const [callbackOrigin, setCallbackOrigin] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [bindToken, setBindToken] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  // 新手机号建账户必须短信验真（服务端强制；既有账户绑定不需要）
  const [smsCode, setSmsCode] = useState("");
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [sendingSms, setSendingSms] = useState(false);
  const [binding, setBinding] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (smsCooldown <= 0) return;
    const timer = setInterval(() => setSmsCooldown((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, [smsCooldown]);

  const handleSendBindSmsCode = async () => {
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

  useEffect(() => {
    let cancelled = false;
    customerApi
      .wechatConfig(window.location.origin)
      .then((res: unknown) => {
        const data = unwrapResponse<{
          enabled: boolean;
          qrConnectUrl?: string;
          callbackOrigin?: string;
        }>(res);
        if (cancelled) return;
        if (data?.enabled && data.qrConnectUrl && data.callbackOrigin) {
          const parsedCallbackOrigin = new URL(data.callbackOrigin);
          if (
            !["http:", "https:"].includes(parsedCallbackOrigin.protocol) ||
            parsedCallbackOrigin.origin !== data.callbackOrigin
          ) {
            throw new Error("微信回调来源配置无效");
          }
          setCallbackOrigin(parsedCallbackOrigin.origin);
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
      if (
        !callbackOrigin ||
        event.origin !== callbackOrigin ||
        event.source !== iframeRef.current?.contentWindow
      ) {
        return;
      }
      const payload = parseWechatLoginMessage(event.data);
      if (!payload) return;
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
  }, [callbackOrigin, onAuthenticated]);

  const handleBind = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      alert("请填写有效的手机号");
      return;
    }
    if (!password) {
      alert("请输入登录密码");
      return;
    }
    setBinding(true);
    try {
      const res = await customerApi.wechatBind({
        bindToken: bindToken!,
        phone,
        password,
        smsCode: smsCode.trim() || undefined,
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
            maxLength={128}
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ display: "block", marginTop: 12 }}>
          短信验证码（新手机号创建账户必填）
          <span style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value)}
              inputMode="numeric"
              maxLength={6}
            />
            <button
              type="button"
              onClick={handleSendBindSmsCode}
              disabled={sendingSms || smsCooldown > 0 || !/^1\d{10}$/.test(phone)}
              style={{ whiteSpace: "nowrap", fontSize: 12, minHeight: 0, padding: "0 10px" }}
            >
              {smsCooldown > 0 ? `${smsCooldown}s` : sendingSms ? "发送中…" : "获取验证码"}
            </button>
          </span>
        </label>
        <p className="text-xs" style={{ marginTop: 6 }}>
          已注册手机号填原密码即可绑定，无需验证码；未注册手机号将创建新会员账户，需短信验证，新密码需为 {ACCOUNT_PASSWORD_MIN_LENGTH}–{ACCOUNT_PASSWORD_MAX_LENGTH} 位。
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
        referrerPolicy="no-referrer"
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
  // 手机号作为账户身份时必须验真；要求接口异常时保持失败关闭。
  const [smsCode, setSmsCode] = useState("");
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [sendingSms, setSendingSms] = useState(false);
  // 登录分级挑战：3 次失败要求图形验证码，5 次失败升级短信验证码（服务端判定）
  const [loginChallenge, setLoginChallenge] = useState<"none" | "captcha" | "sms">("none");
  const [captcha, setCaptcha] = useState<{ captchaId: string; svg: string } | null>(null);
  const [captchaCode, setCaptchaCode] = useState("");
  const [loginSmsCode, setLoginSmsCode] = useState("");
  const [loginSmsCooldown, setLoginSmsCooldown] = useState(0);
  const [sendingLoginSms, setSendingLoginSms] = useState(false);

  const loadLoginCaptcha = async () => {
    try {
      const res = await customerApi.loginCaptcha();
      const data = unwrapResponse<{ captchaId: string; svg: string }>(res);
      if (data?.captchaId) {
        setCaptcha({ captchaId: data.captchaId, svg: data.svg });
        setCaptchaCode("");
      }
    } catch {
      // 验证码加载失败不打断表单；提交时服务端会再次要求
    }
  };

  const refreshLoginChallenge = async () => {
    if (!/^1\d{10}$/.test(phone)) return "none" as const;
    try {
      const res = await customerApi.loginChallenge(phone);
      const data = unwrapResponse<{ level: "none" | "captcha" | "sms" }>(res);
      const level = data?.level ?? "none";
      setLoginChallenge(level);
      if (level === "captcha" && !captcha) await loadLoginCaptcha();
      return level;
    } catch {
      return "none" as const;
    }
  };

  useEffect(() => {
    if (loginSmsCooldown <= 0) return;
    const timer = setInterval(() => setLoginSmsCooldown((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, [loginSmsCooldown]);

  const handleSendLoginSmsCode = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      alert("请先填写有效的手机号");
      return;
    }
    setSendingLoginSms(true);
    try {
      await customerApi.requestLoginSmsCode({ phone });
      setLoginSmsCooldown(60);
    } catch (error: unknown) {
      alert(getRequestErrorMessage(error, "验证码发送失败"));
    } finally {
      setSendingLoginSms(false);
    }
  };

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
        if (mode === "login") {
          void (async () => {
            // 提交前按服务端失败计数刷新挑战等级；缺失挑战输入时先补齐再提交
            const level = await refreshLoginChallenge();
            if (level === "captcha" && !captchaCode.trim()) {
              if (!captcha) await loadLoginCaptcha();
              return;
            }
            if (level === "sms" && !loginSmsCode.trim()) return;
            await onLogin({
              phone,
              password,
              captchaId: level === "captcha" ? captcha?.captchaId : undefined,
              captchaCode: level === "captcha" ? captchaCode.trim() : undefined,
              smsCode: level === "sms" ? loginSmsCode.trim() : undefined,
            });
            // 失败后等级可能升级；成功时组件已卸载，刷新无副作用
            await refreshLoginChallenge();
          })();
        } else
          onRegister({
            phone,
            password,
            name,
            email: email || undefined,
            smsCode: smsCode.trim(),
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
      {mode === "register" && (
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
      {mode === "login" && loginChallenge === "captcha" && (
        <label>
          图形验证码
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={captchaCode}
              onChange={(event) => setCaptchaCode(event.target.value)}
              maxLength={4}
              autoCapitalize="characters"
              style={{ textTransform: "uppercase", letterSpacing: 2 }}
              required
            />
            {captcha ? (
              <img
                src={`data:image/svg+xml;base64,${btoa(captcha.svg)}`}
                alt="图形验证码"
                title="点击刷新"
                onClick={() => void loadLoginCaptcha()}
                style={{ height: 44, cursor: "pointer", borderRadius: 2, border: "1px solid #DDE1E2" }}
              />
            ) : (
              <button
                type="button"
                onClick={() => void loadLoginCaptcha()}
                style={{ whiteSpace: "nowrap", fontSize: 12, minHeight: 0, padding: "0 10px" }}
              >
                获取验证码
              </button>
            )}
          </span>
        </label>
      )}
      {mode === "login" && loginChallenge === "sms" && (
        <label>
          短信验证码（多次尝试后需验证手机）
          <span style={{ display: "flex", gap: 8 }}>
            <input
              value={loginSmsCode}
              onChange={(event) => setLoginSmsCode(event.target.value)}
              inputMode="numeric"
              maxLength={6}
              required
            />
            <button
              type="button"
              onClick={handleSendLoginSmsCode}
              disabled={sendingLoginSms || loginSmsCooldown > 0 || !/^1\d{10}$/.test(phone)}
              style={{ whiteSpace: "nowrap", fontSize: 12, minHeight: 0, padding: "0 10px" }}
            >
              {loginSmsCooldown > 0 ? `${loginSmsCooldown}s` : sendingLoginSms ? "发送中…" : "获取验证码"}
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
          minLength={mode === "register" ? ACCOUNT_PASSWORD_MIN_LENGTH : undefined}
          maxLength={mode === "register" ? ACCOUNT_PASSWORD_MAX_LENGTH : 128}
          required
        />
      </label>
      <small>{mode === "register" ? ACCOUNT_PASSWORD_HINT : "请输入账户当前密码。"}</small>
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

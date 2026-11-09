import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCommerceFlags, type CommerceFlags } from "@/store/featureFlags";
import { customerApi, productApi } from "@/services/api";
import type { Product } from "@/types";
import { getMaterialLabel } from "@/utils/material";
import { publicProductPath, normalizePublicProductReference } from "@/utils/publicProductPath";
import { clampProductTitle } from "@/utils/productTitleLength";
import { unwrapResponse } from "@/utils/unwrap";
import { getRequestErrorMessage } from "@/services/httpClient";
import type { CustomerAccount } from "@/store/customerAuthStore";
import {
  ACCOUNT_PASSWORD_HINT,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
  isAccountPasswordValid,
} from "@/config/accountPasswordPolicy";
import { MemberGate, RevealPasswordInput } from "./MemberGate";
import RouteLoading from "@/components/common/RouteLoading";

const CUSTOMER_USERNAME_PATTERN = /^[a-z][a-z0-9_]{3,31}$/;

type AccountExperienceProps = {
  authLoading: boolean;
  onLogin: (values: {
    phone?: string;
    username?: string;
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
  }) => void | Promise<unknown>;
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
  const [bindError, setBindError] = useState<string | null>(null);
  const [wechatError, setWechatError] = useState<string | null>(null);
  const [needsExistingPassword, setNeedsExistingPassword] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (smsCooldown <= 0) return;
    const timer = setInterval(() => setSmsCooldown((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, [smsCooldown]);

  const handleSendBindSmsCode = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setBindError("请先填写有效的手机号");
      return;
    }
    setSendingSms(true);
    setBindError(null);
    try {
      await customerApi.requestSmsCode({ phone });
      setSmsCooldown(60);
    } catch (error: unknown) {
      setBindError(getRequestErrorMessage(error, "验证码发送失败"));
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
        setWechatError(payload.message || "微信登录失败，请重试");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [callbackOrigin, onAuthenticated]);

  const handleBind = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setBindError("请填写有效的手机号");
      return;
    }
    if (!smsCode.trim() && !password.trim()) {
      setBindError("请填写短信验证码。该手机号已是会员时，改为填写原密码。");
      return;
    }
    if (needsExistingPassword && !password.trim()) {
      setBindError("该手机号已是会员，请输入原密码完成绑定");
      return;
    }
    setBinding(true);
    setBindError(null);
    try {
      const res = await customerApi.wechatBind({
        bindToken: bindToken!,
        phone,
        password: password.trim() || undefined,
        smsCode: smsCode.trim() || undefined,
      });
      const result = unwrapResponse<{ customer: CustomerAccount }>(res);
      if (!result?.customer) throw new Error("绑定成功但会话未建立");
      onAuthenticated(result);
    } catch (error: unknown) {
      const message = getRequestErrorMessage(error, "绑定失败，请重试");
      if (message.includes("请输入原密码") || message.includes("尚未设置密码")) {
        setNeedsExistingPassword(true);
      }
      setBindError(message);
    } finally {
      setBinding(false);
    }
  };

  if (notConfigured) {
    return (
      <div className="account-wechat-login account-wechat-login--method">
        <p>当前环境尚未开通微信扫码。请改用用户名或手机号登录。</p>
      </div>
    );
  }

  if (bindToken) {
    return (
      <div
        className="account-wechat-login"
        style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(0,0,0,0.08)" }}
      >
        <p className="text-xs">
          已通过微信验证。填写本人手机号并完成短信验证，即可成为会员并登录。
        </p>
        {bindError ? (
          <p role="alert" style={{ color: "#8C3F3B", marginTop: 12 }}>
            {bindError}
          </p>
        ) : null}
        <label style={{ display: "block", marginTop: 12 }}>
          手机号
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="numeric"
            maxLength={11}
            autoComplete="tel"
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ display: "block", marginTop: 12 }}>
          短信验证码
          <span style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
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
        <label style={{ display: "block", marginTop: 12 }}>
          {needsExistingPassword ? "原密码" : "密码（选填）"}
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required={needsExistingPassword}
            style={{ marginTop: 6 }}
          />
        </label>
        <p className="text-xs" style={{ marginTop: 6 }}>
          {needsExistingPassword
            ? "这个手机号已是会员。填写原密码即可绑定当前微信并登录。"
            : `新会员只需短信验证，登录后可在账户里设置 ${ACCOUNT_PASSWORD_MIN_LENGTH}–${ACCOUNT_PASSWORD_MAX_LENGTH} 位密码。该手机号已是会员时，改为填写原密码。`}
        </p>
        <button
          type="button"
          className="account-button account-button--dark"
          style={{ width: "100%", marginTop: 12 }}
          disabled={binding}
          onClick={handleBind}
        >
          {binding ? "处理中…" : needsExistingPassword ? "绑定并登录" : "成为会员并登录"}
        </button>
      </div>
    );
  }

  if (!qrConnectUrl) {
    return (
      <RouteLoading scope="panel" surface="public" label="正在加载微信登录…" />
    );
  }

  return (
    <div className="account-wechat-login account-wechat-login--method">
      {wechatError ? (
        <p role="alert" className="member-error">
          {wechatError}
        </p>
      ) : null}
      <iframe
        ref={iframeRef}
        title="微信扫码登录"
        src={qrConnectUrl}
        referrerPolicy="no-referrer"
      />
      <p>已绑定的微信扫码后直接登录。第一次使用，验证手机号后成为会员。</p>
    </div>
  );
}

function MemberAccess({
  authLoading,
  onLogin,
  onRegister,
  onWechatAuth,
  continuationNote,
}: Pick<
  AccountExperienceProps,
  "authLoading" | "onLogin" | "onRegister" | "onWechatAuth"
> & { continuationNote: string | null }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginMethod, setLoginMethod] = useState<"username" | "phone" | "wechat">("username");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const nameId = useId();
  const usernameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const smsId = useId();
  const captchaFieldId = useId();
  const loginSmsId = useId();
  const passwordId = useId();
  const confirmId = useId();
  // 手机号作为账户身份时必须验真；要求接口异常时保持失败关闭。
  const [smsCode, setSmsCode] = useState("");
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [sendingSms, setSendingSms] = useState(false);
  // 登录分级挑战：3 次失败要求图形验证码，5 次失败升级短信验证码（服务端判定）
  const [loginChallenge, setLoginChallenge] = useState<"none" | "captcha" | "sms">("none");
  const [loginChallengeError, setLoginChallengeError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<{ captchaId: string; svg: string } | null>(null);
  const [captchaCode, setCaptchaCode] = useState("");
  const [loginSmsCode, setLoginSmsCode] = useState("");
  const [loginSmsCooldown, setLoginSmsCooldown] = useState(0);
  const [sendingLoginSms, setSendingLoginSms] = useState(false);
  const [authPreparing, setAuthPreparing] = useState(false);
  const authPreparingRef = useRef(false);
  const authAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      authAttemptRef.current += 1;
      authPreparingRef.current = false;
    };
  }, []);

  const loadLoginCaptcha = async () => {
    // 每次换图都立即丢弃旧挑战，避免刷新失败时继续提交已消费的 captchaId。
    setCaptcha(null);
    setCaptchaCode("");
    try {
      const res = await customerApi.loginCaptcha();
      if (!mountedRef.current) return;
      const data = unwrapResponse<{ captchaId: string; svg: string }>(res);
      if (data?.captchaId) {
        setCaptcha({ captchaId: data.captchaId, svg: data.svg });
      }
    } catch {
      // 验证码加载失败不打断表单；提交时服务端会再次要求
    }
  };

  const refreshLoginChallenge = async (forceCaptchaRefresh = false) => {
    const usingUsername = loginMethod === "username";
    const identifier = usingUsername
      ? { username: username.trim().toLowerCase() }
      : { phone };
    const identifierReady = usingUsername
      ? CUSTOMER_USERNAME_PATTERN.test(identifier.username ?? "")
      : /^1\d{10}$/.test(phone);
    if (!identifierReady) {
      setLoginChallengeError(null);
      return "none" as const;
    }
    try {
      const res = await customerApi.loginChallenge(identifier);
      if (!mountedRef.current) return "none" as const;
      const data = unwrapResponse<{ level: "none" | "captcha" | "sms" }>(res);
      const level = data?.level ?? "none";
      setLoginChallengeError(null);
      setLoginChallenge(level);
      if (level === "captcha" && (forceCaptchaRefresh || !captcha)) {
        await loadLoginCaptcha();
      } else if (level !== "captcha") {
        setCaptcha(null);
        setCaptchaCode("");
      }
      return level;
    } catch {
      if (mountedRef.current) {
        setLoginChallengeError("登录验证暂时不可用，请稍后重试。");
      }
      return "unavailable" as const;
    }
  };

  useEffect(() => {
    if (loginSmsCooldown <= 0) return;
    const timer = setInterval(() => setLoginSmsCooldown((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, [loginSmsCooldown]);

  const handleSendLoginSmsCode = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setFieldError("请先填写 11 位中国大陆手机号。");
      return;
    }
    setSendingLoginSms(true);
    setFieldError(null);
    try {
      await customerApi.requestLoginSmsCode({ phone });
      setLoginSmsCooldown(60);
    } catch (error: unknown) {
      setFieldError(getRequestErrorMessage(error, "验证码发送失败"));
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
      setFieldError("请先填写 11 位中国大陆手机号。");
      return;
    }
    setSendingSms(true);
    setFieldError(null);
    try {
      await customerApi.requestSmsCode({ phone });
      setSmsCooldown(60);
    } catch (error: unknown) {
      setFieldError(getRequestErrorMessage(error, "验证码发送失败"));
    } finally {
      setSendingSms(false);
    }
  };

  return (
    <>
    <form
      id="member-access-form"
      className="account-member-access"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "login" && loginMethod === "wechat") return;
        if (authLoading || authPreparingRef.current) return;
        const usingUsername = mode === "login" && loginMethod === "username";
        const normalizedUsername = username.trim().toLowerCase();
        const normalizedPhone = phone.trim();
        if (usingUsername) {
          if (!CUSTOMER_USERNAME_PATTERN.test(normalizedUsername)) {
            setFieldError("用户名需为 4–32 位小写字母、数字或下划线，并以字母开头。");
            return;
          }
        } else if (!/^1\d{10}$/.test(normalizedPhone)) {
          setFieldError("请填写 11 位中国大陆手机号。");
          return;
        }
        if (mode === "register") {
          if (!name.trim()) {
            setFieldError("请填写称呼。");
            return;
          }
          if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
            setFieldError("请填写正确的邮箱，或留空。");
            return;
          }
          if (!smsCode.trim()) {
            setFieldError("请填写短信验证码。");
            return;
          }
          if (!isAccountPasswordValid(password)) {
            setFieldError(ACCOUNT_PASSWORD_HINT);
            return;
          }
          if (password !== confirmPassword) {
            setFieldError("两次输入的密码不一致。");
            return;
          }
        } else if (!password) {
          setFieldError("请填写密码。");
          return;
        }
        setFieldError(null);
        authPreparingRef.current = true;
        setAuthPreparing(true);
        const attempt = authAttemptRef.current + 1;
        authAttemptRef.current = attempt;
        void (async () => {
          try {
            if (mode === "login") {
              // 提交前按服务端失败计数刷新挑战等级；缺失挑战输入时先补齐再提交
              const level = await refreshLoginChallenge();
              if (!mountedRef.current || authAttemptRef.current !== attempt) return;
              if (level === "unavailable") return;
              if (level === "captcha" && !captchaCode.trim()) {
                setFieldError("请填写图形验证码。");
                return;
              }
              if (level === "sms" && !loginSmsCode.trim()) {
                setFieldError("请填写短信验证码。");
                return;
              }
              await onLogin({
                ...(usingUsername
                  ? { username: normalizedUsername }
                  : { phone: normalizedPhone }),
                password,
                captchaId: level === "captcha" ? captcha?.captchaId : undefined,
                captchaCode: level === "captcha" ? captchaCode.trim() : undefined,
                smsCode: !usingUsername && level === "sms" ? loginSmsCode.trim() : undefined,
              });
              if (!mountedRef.current || authAttemptRef.current !== attempt) return;
              // 图形验证码在每次登录尝试后都会被服务端消费；失败时必须换取新挑战。
              // 登录成功时组件会卸载，因此这里不会覆盖已认证界面。
              await refreshLoginChallenge(level === "captcha");
            } else {
              await onRegister({
                phone: normalizedPhone,
                password,
                name: name.trim(),
                email: email.trim() || undefined,
                smsCode: smsCode.trim(),
              });
            }
          } finally {
            if (mountedRef.current && authAttemptRef.current === attempt) {
              authPreparingRef.current = false;
              setAuthPreparing(false);
            }
          }
        })();
      }}
    >
      {mode === "login" ? (
        <div className="account-method-tabs" role="tablist" aria-label="登录方式">
          {([
            ["username", "用户名"],
            ["phone", "手机号"],
            ["wechat", "微信扫码"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              className={loginMethod === value ? "is-active" : ""}
              aria-selected={loginMethod === value}
              aria-pressed={loginMethod === value}
              disabled={authLoading || authPreparing}
              onClick={() => {
                setLoginMethod(value);
                setFieldError(null);
                setLoginChallenge("none");
                setLoginChallengeError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {mode === "register" ? (
        <p className="member-mode-note">注册后，作品偏好、咨询与订单会保存在此账户。</p>
      ) : continuationNote ? null : (
        <p className="member-mode-note">
          {loginMethod === "phone"
            ? "使用注册手机号与密码登录。"
            : loginMethod === "wechat"
              ? "使用微信扫码登录。已绑定的微信会直接进入账户。"
              : "使用用户名与密码登录。"}
        </p>
      )}
      {mode === "login" && loginMethod === "wechat" ? (
        <WechatLoginPanel onAuthenticated={onWechatAuth} />
      ) : null}
      {mode === "login" && loginMethod === "wechat" ? null : (
      <>
      {mode === "login" && loginChallengeError ? (
        <p className="member-error" role="alert">
          {loginChallengeError}
        </p>
      ) : null}
      <div className="member-fields" key={mode}>
      {mode === "register" && (
        <div className="member-field">
          <label htmlFor={nameId}>称呼</label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldError(null);
            }}
            maxLength={50}
            autoComplete="name"
            required
          />
        </div>
      )}
      {mode === "login" && loginMethod === "username" ? (
        <div className="member-field">
          <label htmlFor={usernameId}>用户名</label>
          <input
            id={usernameId}
            name="username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setFieldError(null);
            }}
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            maxLength={32}
            spellCheck={false}
            required
          />
        </div>
      ) : (
        <div className="member-field">
          <label htmlFor={phoneId}>手机号</label>
          <input
            id={phoneId}
            name="phone"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setFieldError(null);
            }}
            inputMode="numeric"
            autoComplete="tel"
            maxLength={11}
            required
          />
        </div>
      )}
      {mode === "register" && (
        <div className="member-field">
          <label htmlFor={emailId}>邮箱（选填）</label>
          <input
            id={emailId}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldError(null);
            }}
            type="email"
            autoComplete="email"
            maxLength={100}
          />
        </div>
      )}
      {mode === "register" && (
        <div className="member-field">
          <label htmlFor={smsId}>短信验证码</label>
          <span className="member-inline">
            <input
              id={smsId}
              value={smsCode}
              onChange={(event) => {
                setSmsCode(event.target.value);
                setFieldError(null);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            <button
              type="button"
              onClick={handleSendSmsCode}
              disabled={sendingSms || smsCooldown > 0 || !/^1\d{10}$/.test(phone)}
            >
              {smsCooldown > 0 ? `${smsCooldown}s` : sendingSms ? "发送中…" : "获取验证码"}
            </button>
          </span>
        </div>
      )}
      {mode === "login" && loginChallenge === "captcha" && (
        <div className="member-field">
          <label htmlFor={captchaFieldId}>图形验证码</label>
          <span className="member-inline">
            <input
              id={captchaFieldId}
              value={captchaCode}
              onChange={(event) => {
                setCaptchaCode(event.target.value);
                setFieldError(null);
              }}
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
              required
            />
            {captcha ? (
              <img
                className="member-captcha"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(captcha.svg)}`}
                alt="图形验证码"
                title="点击刷新"
                onClick={() => void loadLoginCaptcha()}
              />
            ) : (
              <button type="button" onClick={() => void loadLoginCaptcha()}>
                获取验证码
              </button>
            )}
          </span>
        </div>
      )}
      {mode === "login" && loginChallenge === "sms" && (
        <div className="member-field">
          <label htmlFor={loginSmsId}>短信验证码（多次尝试后需验证手机）</label>
          <span className="member-inline">
            <input
              id={loginSmsId}
              value={loginSmsCode}
              onChange={(event) => {
                setLoginSmsCode(event.target.value);
                setFieldError(null);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            <button
              type="button"
              onClick={handleSendLoginSmsCode}
              disabled={sendingLoginSms || loginSmsCooldown > 0 || !/^1\d{10}$/.test(phone)}
            >
              {loginSmsCooldown > 0 ? `${loginSmsCooldown}s` : sendingLoginSms ? "发送中…" : "获取验证码"}
            </button>
          </span>
        </div>
      )}
      <div className="member-field">
        <label htmlFor={passwordId}>密码</label>
        <RevealPasswordInput
          id={passwordId}
          name="password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            setFieldError(null);
          }}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={mode === "register" ? ACCOUNT_PASSWORD_MIN_LENGTH : undefined}
          maxLength={mode === "register" ? ACCOUNT_PASSWORD_MAX_LENGTH : 128}
          required
        />
        <p className="member-note">{mode === "register" ? ACCOUNT_PASSWORD_HINT : "请输入账户当前密码。"}</p>
      </div>
      {mode === "register" && (
        <div className="member-field">
          <label htmlFor={confirmId}>确认密码</label>
          <RevealPasswordInput
            id={confirmId}
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              setFieldError(null);
            }}
            autoComplete="new-password"
            minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
            maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
            required
          />
        </div>
      )}
      {mode === "login" && (
        <div className="member-forgot">
          <Link to="/customer/forgot">忘记密码？</Link>
        </div>
      )}
      {fieldError ? (
        <p className="member-error" role="alert">{fieldError}</p>
      ) : null}
      <button
        type="submit"
        className="account-button account-button--dark"
        disabled={authLoading || authPreparing}
        aria-busy={authLoading || authPreparing}
      >
        {authLoading || authPreparing
          ? "处理中…"
          : mode === "login"
            ? "登录我的账户"
            : "创建会员账户"}
      </button>
      <p className="member-legal">
        账户信息的收集与使用，见<Link to="/privacy">隐私说明</Link>。
      </p>
      </div>
      </>
      )}
      <div className="account-access-tabs" aria-label="登录或注册">
        <button
          type="button"
          className={mode === "login" ? "is-active" : ""}
          aria-pressed={mode === "login"}
          disabled={authLoading || authPreparing}
          onClick={() => {
            setMode("login");
            setFieldError(null);
          }}
        >
          会员登录
        </button>
        <button
          type="button"
          className={mode === "register" ? "is-active" : ""}
          aria-pressed={mode === "register"}
          disabled={authLoading || authPreparing}
          onClick={() => {
            setMode("register");
            setFieldError(null);
          }}
        >
          注册会员
        </button>
      </div>
    </form>
    </>
  );
}

function positiveIntegerParam(params: URLSearchParams, name: string): number | null {
  const values = params.getAll(name);
  if (values.length !== 1 || !/^[1-9]\d*$/.test(values[0])) return null;
  const value = Number(values[0]);
  return Number.isSafeInteger(value) ? value : null;
}

/** 只接受详情页写入的单件结算地址，避免把任意回跳渲染成购买摘要。 */
function checkoutIntent(search: string): { reference: string; skuId: number; quantity: number } | null {
  const candidate = new URLSearchParams(search).get("returnTo")?.trim() ?? "";
  if (
    !candidate.startsWith("/checkout")
    || candidate.startsWith("//")
    || candidate.includes("\\")
    || candidate.length > 2048
  ) {
    return null;
  }
  const queryIndex = candidate.indexOf("?");
  if (queryIndex < 0) return null;
  const params = new URLSearchParams(candidate.slice(queryIndex + 1));
  if (params.getAll("product").length !== 1) return null;
  const reference = normalizePublicProductReference(params.get("product"));
  const skuId = positiveIntegerParam(params, "sku");
  const quantity = positiveIntegerParam(params, "quantity");
  if (!reference || !skuId || !quantity || quantity > 99) return null;
  return { reference, skuId, quantity };
}

function preparedPurchase(
  product: Product,
  skuId: number,
  quantity: number,
): PreparedPurchase | null {
  const sku = product.skus?.find((item) => item.id === skuId && item.isActive);
  const unit = Number(sku?.price);
  if (
    !sku
    || product.salesMode !== "DIRECT_PURCHASE"
    || product.isAvailableForPurchase !== true
    || sku.isAvailableForPurchase !== true
    || !Number.isFinite(unit)
    || !(unit > 0)
    || (product.inventoryPolicy === "SINGLE_UNIT" && quantity !== 1)
  ) {
    return null;
  }
  const material = getMaterialLabel(sku.material);
  return {
    name: clampProductTitle(product.name),
    spec: [
      material !== "其他" ? material : "",
      sku.color?.trim() ?? "",
      sku.size?.trim() ?? "",
      Number(sku.goldWeight) > 0 ? `${sku.goldWeight}g` : "",
    ].filter(Boolean).join(" · "),
    quantity,
    priceLabel: `¥${new Intl.NumberFormat("zh-CN").format(unit * quantity)}`,
    productPath: publicProductPath(product),
  };
}

interface PreparedPurchase {
  name: string;
  spec: string;
  quantity: number;
  priceLabel: string;
  productPath: string;
}

function purchaseReturnPath(search: string): "/checkout" | "/cart" | null {
  const candidate = new URLSearchParams(search).get("returnTo")?.trim() ?? "";
  if (
    !candidate.startsWith("/")
    || candidate.startsWith("//")
    || candidate.includes("\\")
    || candidate.length > 2048
  ) return null;
  if (candidate.startsWith("/checkout")) return "/checkout";
  if (candidate.startsWith("/cart")) return "/cart";
  return null;
}

function purchaseContinuationNote(
  search: string,
  flags: CommerceFlags | null,
): string | null {
  const path = purchaseReturnPath(search);
  if (path === "/cart") return "登录后将继续查看购物车。";
  if (path !== "/checkout") return null;
  if (flags?.commerceEnabled === true && flags.paymentEnabled === true) {
    return "登录后将继续核对订单并完成提交。";
  }
  if (!flags) return "登录后将继续核对所选规格、数量和收货信息。";
  return "登录后将继续核对所选规格、数量和收货信息。暂时不能提交订单或付款。";
}

export default function AccountExperience({
  authLoading,
  onLogin,
  onRegister,
  onWechatAuth,
}: AccountExperienceProps) {
  const location = useLocation();
  const flags = useCommerceFlags((state) => state.flags);
  const loading = useCommerceFlags((state) => state.loading);
  const load = useCommerceFlags((state) => state.load);
  useEffect(() => {
    if (!flags && !loading) void load();
  }, [flags, loading, load]);
  const continuationNote = purchaseContinuationNote(location.search, flags);
  const [prepared, setPrepared] = useState<PreparedPurchase | null>(null);
  const [readingPurchase, setReadingPurchase] = useState(false);
  useEffect(() => {
    const current = checkoutIntent(location.search);
    if (!current) {
      setPrepared(null);
      setReadingPurchase(false);
      return;
    }
    const controller = new AbortController();
    setReadingPurchase(true);
    setPrepared(null);
    void productApi.getPublicById(current.reference, {
      suppressGlobalError: true,
      signal: controller.signal,
    }).then((response) => {
      if (controller.signal.aborted) return;
      const product = unwrapResponse<Product>(response);
      setPrepared(product ? preparedPurchase(product, current.skuId, current.quantity) : null);
    }).catch(() => {
      if (!controller.signal.aborted) setPrepared(null);
    }).finally(() => {
      if (!controller.signal.aborted) setReadingPurchase(false);
    });
    return () => controller.abort();
  }, [location.search]);
  return (
    <MemberGate
      kicker="Private Membership"
      title="欢迎回来"
      lede={
        continuationNote ? (
          <p role="status">{continuationNote}</p>
        ) : (
          <p>登录您的海川账户，开启专属会员体验。</p>
        )
      }
    >
      {readingPurchase ? (
        <p className="account-purchase account-purchase--pending" role="status">正在读取所选作品。</p>
      ) : null}
      {prepared ? (
        <section className="account-purchase" aria-label="待核对的作品">
          <h2>{prepared.name}</h2>
          {prepared.spec ? <p>{prepared.spec}</p> : null}
          <p>数量 {prepared.quantity}</p>
          <p className="account-purchase__price">{prepared.priceLabel}</p>
          <Link to={prepared.productPath} className="account-text-link">
            返回这件作品
          </Link>
        </section>
      ) : null}
      <MemberAccess
        authLoading={authLoading}
        onLogin={onLogin}
        onRegister={onRegister}
        onWechatAuth={onWechatAuth}
        continuationNote={continuationNote}
      />
      <section className="member-services" aria-labelledby="member-services-title">
        <h2 id="member-services-title">会员服务</h2>
        <ul>
          <li>
            <strong>作品与选款</strong>
            <span>保存心仪作品，顾问可以了解您的偏好。</span>
          </li>
          <li>
            <strong>咨询与预约</strong>
            <span>集中查看线上咨询与到店预约。</span>
          </li>
          <li>
            <strong>订单与售后</strong>
            <span>登录后查看订单进度与售后记录。</span>
          </li>
        </ul>
      </section>
      <p className="member-browse">
        <Link to="/catalog">浏览作品</Link>
      </p>
    </MemberGate>
  );
}

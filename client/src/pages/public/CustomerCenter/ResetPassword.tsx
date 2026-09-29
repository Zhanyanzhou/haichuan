import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import { customerApi } from '@/services/api';
import {
  getRequestErrorMessage,
  requestErrorCode,
  requestRetryAfterSeconds,
  requestStatus,
} from '@/services/httpClient';
import {
  ACCOUNT_PASSWORD_HINT,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
  isAccountPasswordValid,
} from '@/config/accountPasswordPolicy';

const RESET_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const INVALID_TOKEN_ERROR_CODES = new Set([
  'PASSWORD_RESET_TOKEN_INVALID',
  'PASSWORD_RESET_TOKEN_EXPIRED',
  'PASSWORD_RESET_TOKEN_USED',
]);

type ResetView = 'form' | 'invalid' | 'uncertain';

function readExplicitResetToken(search: string, hash: string) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));

  // fragment 是新链接格式，存在时必须覆盖兼容 query；空值或非法值也代表
  // 一次显式的新导航，不能回退到旧链接已经捕获的令牌。
  if (fragment.has('token')) {
    const candidate = fragment.get('token') ?? '';
    return {
      present: true,
      token: RESET_TOKEN_PATTERN.test(candidate) ? candidate : '',
    };
  }
  if (query.has('token')) {
    const candidate = query.get('token') ?? '';
    return {
      present: true,
      token: RESET_TOKEN_PATTERN.test(candidate) ? candidate : '',
    };
  }
  return { present: false, token: '' };
}

/**
 * 重置密码（第二步）：从邮件链接进入（/customer/reset#token=...），设置新密码。
 * 令牌一次性、30 分钟过期；成功后引导登录。忘记 token 的来源时提示重新发起找回。
 */
export default function ResetPassword() {
  const { message } = AntdApp.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const initialToken = useRef(
    readExplicitResetToken(location.search, location.hash),
  ).current;
  const [token, setToken] = useState(
    initialToken.present ? initialToken.token : '',
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<ResetView>(
    initialToken.present && initialToken.token ? 'form' : 'invalid',
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const attemptGenerationRef = useRef(0);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptGenerationRef.current += 1;
      submittingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  useLayoutEffect(() => {
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    const incomingToken = readExplicitResetToken(location.search, location.hash);
    if (!incomingToken.present) return;

    attemptGenerationRef.current += 1;
    setToken(incomingToken.token);
    setPassword('');
    setConfirm('');
    setSubmitting(false);
    submittingRef.current = false;
    setView(incomingToken.token ? 'form' : 'invalid');
    setFeedback(null);
    setRetryAfterSeconds(0);

    query.delete('token');
    fragment.delete('token');
    const queryString = query.toString();
    const fragmentString = fragment.toString();
    navigate(
      {
        pathname: location.pathname,
        search: queryString ? `?${queryString}` : '',
        hash: fragmentString ? `#${fragmentString}` : '',
      },
      { replace: true, state: location.state },
    );
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAccountPasswordValid(password)) {
      setFeedback(ACCOUNT_PASSWORD_HINT);
      return;
    }
    if (password !== confirm) {
      setFeedback('两次输入的密码不一致');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    const requestGeneration = attemptGenerationRef.current + 1;
    attemptGenerationRef.current = requestGeneration;
    setFeedback(null);
    setSubmitting(true);
    try {
      await customerApi.resetPassword({ token, password });
      if (
        !mountedRef.current
        || attemptGenerationRef.current !== requestGeneration
      ) return;
      message.success('密码已重置，请使用新密码登录');
      navigate('/customer', { replace: true });
    } catch (error: unknown) {
      if (
        !mountedRef.current
        || attemptGenerationRef.current !== requestGeneration
      ) return;
      const status = requestStatus(error);
      const errorCode = requestErrorCode(error);
      if (errorCode && INVALID_TOKEN_ERROR_CODES.has(errorCode)) {
        setPassword('');
        setConfirm('');
        setView('invalid');
      } else if (status === undefined || status >= 500) {
        setPassword('');
        setConfirm('');
        setView('uncertain');
      } else if (status === 429) {
        setRetryAfterSeconds(requestRetryAfterSeconds(error) ?? 60);
      } else {
        setFeedback(getRequestErrorMessage(error, '重置失败，请重试'));
      }
    } finally {
      if (
        mountedRef.current
        && attemptGenerationRef.current === requestGeneration
      ) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  };

  if (!token || view === 'invalid') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md bg-white border border-brand-line p-10 text-center" role="alert">
          <h1 className="text-xl font-display font-semibold text-brand-text">重置链接无效</h1>
          <p className="text-sm text-brand-muted mt-3">
            {!token
              ? '链接缺少有效令牌，请从邮件中的按钮进入，或重新发起找回。'
              : '该链接无效、已过期或已使用，请重新发起找回。'}
          </p>
          <Link to="/customer/forgot" className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-brand-text underline underline-offset-4 hover:text-brand-muted">
            重新找回密码
          </Link>
        </div>
      </div>
    );
  }

  if (view === 'uncertain') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md bg-white border border-brand-line p-10" role="alert" aria-live="assertive">
          <h1 className="text-xl font-display font-semibold text-brand-text">重置结果待确认</h1>
          <p className="mt-3 text-sm leading-relaxed text-brand-muted">
            请求响应未能确认，密码可能已经更新。请勿重复提交当前链接，先尝试使用新密码登录；若无法登录，再重新发起找回。
          </p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm">
            <Link to="/customer" className="inline-flex min-h-11 items-center font-medium text-brand-text underline underline-offset-4 hover:text-brand-muted">
              使用新密码登录
            </Link>
            <Link to="/customer/forgot" className="inline-flex min-h-11 items-center text-brand-muted underline underline-offset-4 hover:text-brand-text">
              重新找回密码
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-white border border-brand-line p-10">
        <h1 className="text-2xl font-display font-semibold text-brand-text">设置新密码</h1>
        <p className="text-sm text-brand-muted mt-2">该链接仅可使用一次，30 分钟内有效。</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm text-brand-text">新密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFeedback(null);
              }}
              minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
              maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
              required
              autoFocus
              className="mt-2 w-full border border-brand-line px-4 py-3 text-sm focus:border-brand-text focus:outline-none focus:ring-2 focus:ring-brand-text focus:ring-offset-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-brand-text">确认新密码</span>
            <input
              type="password"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setFeedback(null);
              }}
              minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
              maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
              required
              className="mt-2 w-full border border-brand-line px-4 py-3 text-sm focus:border-brand-text focus:outline-none focus:ring-2 focus:ring-brand-text focus:ring-offset-2"
            />
          </label>
          <small className="block text-xs text-brand-muted">{ACCOUNT_PASSWORD_HINT}。</small>
          <button
            type="submit"
            disabled={submitting || retryAfterSeconds > 0}
            className="w-full bg-brand-text text-white py-3 text-sm tracking-widest hover:opacity-90 disabled:opacity-50"
          >
            {submitting
              ? '提交中…'
              : retryAfterSeconds > 0
                ? `${retryAfterSeconds} 秒后可重试`
                : '重置密码'}
          </button>
          {retryAfterSeconds > 0 ? (
            <p role="alert" className="text-sm text-[#8C3F3B]">
              操作过于频繁，请在 {retryAfterSeconds} 秒后重试。
            </p>
          ) : feedback ? (
            <p role="alert" className="text-sm text-[#8C3F3B]">{feedback}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

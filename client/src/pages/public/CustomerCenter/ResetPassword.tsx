import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MemberGate, RevealPasswordInput } from './MemberGate';
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
  const passwordId = useId();
  const confirmId = useId();

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

  const invalid = !token || view === 'invalid';
  const title = invalid
    ? '重置链接无效'
    : view === 'uncertain'
      ? '重置结果待确认'
      : '设置新密码';
  const lede = invalid
    ? (!token
      ? '链接缺少有效令牌，请从邮件中的按钮进入，或重新发起找回。'
      : '该链接无效、已过期或已使用，请重新发起找回。')
    : view === 'uncertain'
      ? '请求响应未能确认，密码可能已经更新。请勿重复提交当前链接，先尝试使用新密码登录；若无法登录，再重新发起找回。'
      : '该链接仅可使用一次，30 分钟内有效。';

  return (
    <MemberGate
      kicker="Private Membership"
      title={title}
      lede={<p>{lede}</p>}
    >
      {invalid ? (
        <div className="member-recovery" role="alert">
          <div className="member-recovery__links">
            <Link to="/customer/forgot">重新找回密码</Link>
          </div>
        </div>
      ) : view === 'uncertain' ? (
        <div className="member-recovery" role="alert" aria-live="assertive">
          <div className="member-recovery__links">
            <Link to="/customer">使用新密码登录</Link>
            <Link to="/customer/forgot">重新找回密码</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="member-recovery" noValidate>
          <div className="member-field">
            <label htmlFor={passwordId}>新密码</label>
            <RevealPasswordInput
              id={passwordId}
              value={password}
              onChange={(value) => {
                setPassword(value);
                setFeedback(null);
              }}
              autoComplete="new-password"
              minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
              maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
              required
              autoFocus
            />
          </div>
          <div className="member-field">
            <label htmlFor={confirmId}>确认新密码</label>
            <RevealPasswordInput
              id={confirmId}
              value={confirm}
              onChange={(value) => {
                setConfirm(value);
                setFeedback(null);
              }}
              autoComplete="new-password"
              minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
              maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
              required
            />
          </div>
          <p className="member-note">{ACCOUNT_PASSWORD_HINT}。</p>
          <button
            type="submit"
            disabled={submitting || retryAfterSeconds > 0}
            className="account-button account-button--dark member-submit"
            aria-busy={submitting}
          >
            {submitting
              ? '提交中…'
              : retryAfterSeconds > 0
                ? `${retryAfterSeconds} 秒后可重试`
                : '重置密码'}
          </button>
          {retryAfterSeconds > 0 ? (
            <p role="alert" className="member-error">
              操作过于频繁，请在 {retryAfterSeconds} 秒后重试。
            </p>
          ) : feedback ? (
            <p role="alert" className="member-error">{feedback}</p>
          ) : null}
        </form>
      )}
    </MemberGate>
  );
}

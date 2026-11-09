import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { customerApi } from '@/services/api';
import { MemberGate } from './MemberGate';
import {
  getRequestErrorMessage,
  requestRetryAfterSeconds,
  requestStatus,
} from '@/services/httpClient';

type RecoveryView = 'form' | 'accepted' | 'uncertain';

/**
 * 找回密码（第一步）：提交注册邮箱并等待统一 accepted 响应。
 * 页面不区分邮箱是否已注册，也不把请求受理冒充为邮件已经送达。
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<RecoveryView>('form');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const emailId = useId();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setFeedback('请填写正确的邮箱地址');
      return;
    }
    // React 状态要到下一次渲染才会禁用按钮；同步 ref 阻止同一事件循环内的
    // 重复 submit，避免签发多个令牌后让较早到达的邮件立即失效。
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFeedback(null);
    setSubmitting(true);
    try {
      await customerApi.forgotPassword({ email: normalizedEmail });
      if (!mountedRef.current) return;
      setView('accepted');
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      const status = requestStatus(error);
      if (status === 429) {
        setRetryAfterSeconds(requestRetryAfterSeconds(error) ?? 60);
      } else if (status === undefined || status >= 500) {
        setView('uncertain');
      } else {
        setFeedback(getRequestErrorMessage(error, '提交失败，请稍后重试'));
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <MemberGate
      kicker="Private Membership"
      title="找回密码"
      lede={<p>输入注册邮箱。若账户匹配，系统会处理一次性重置链接，链接 30 分钟内有效。</p>}
    >
      {view === 'accepted' ? (
        <div className="member-recovery" role="status" aria-live="polite">
          <h2>找回请求已受理</h2>
          <p>若该邮箱已注册，我们已受理找回请求。邮件可能需要几分钟，请同时检查垃圾邮件文件夹。</p>
          <p>请勿连续提交；若稍后仍未收到，请联系顾问协助重置。</p>
          <div className="member-recovery__links">
            <Link to="/customer">返回登录</Link>
          </div>
        </div>
      ) : view === 'uncertain' ? (
        <div className="member-recovery" role="alert" aria-live="assertive">
          <h2>请求结果待确认</h2>
          <p>网络响应未能确认。若该邮箱已注册，邮件仍可能送达；请先等待几分钟并检查垃圾邮件，不要连续提交。</p>
          <div className="member-recovery__links">
            <Link to="/customer">返回客户中心登录</Link>
            <Link to="/contact">联系顾问</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="member-recovery" noValidate>
          <div className="member-field">
            <label htmlFor={emailId}>注册邮箱</label>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFeedback(null);
              }}
              disabled={submitting}
              maxLength={100}
              required
              autoFocus
              autoComplete="email"
            />
          </div>
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
                : '提交找回请求'}
          </button>
          {retryAfterSeconds > 0 ? (
            <p role="alert" className="member-error">
              操作过于频繁，请在 {retryAfterSeconds} 秒后重试。
            </p>
          ) : feedback ? (
            <p role="alert" className="member-error">{feedback}</p>
          ) : null}
          <div className="member-recovery__links">
            <Link to="/customer">返回登录</Link>
          </div>
        </form>
      )}
    </MemberGate>
  );
}

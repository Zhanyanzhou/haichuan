import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { customerApi } from '@/services/api';
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
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-white border border-brand-line p-10">
        <h1 className="text-2xl font-display font-semibold text-brand-text">找回密码</h1>
        <p className="text-sm text-brand-muted mt-2">
          输入注册邮箱。若账户匹配，系统会处理一次性重置链接（链接 30 分钟内有效）。
        </p>

        {view === 'accepted' ? (
          <div className="mt-8 space-y-4" role="status" aria-live="polite">
            <h2 className="text-base font-medium text-brand-text">找回请求已受理</h2>
            <p className="text-sm text-brand-text leading-relaxed">
              若该邮箱已注册，我们已受理找回请求。邮件可能需要几分钟，请同时检查垃圾邮件文件夹。
            </p>
            <p className="text-xs text-brand-muted">请勿连续提交；若稍后仍未收到，请联系您的专属顾问协助重置。</p>
            <Link to="/customer" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-text underline underline-offset-4 hover:text-brand-muted">
              返回客户中心登录
            </Link>
          </div>
        ) : view === 'uncertain' ? (
          <div className="mt-8 space-y-4" role="alert" aria-live="assertive">
            <h2 className="text-base font-medium text-brand-text">请求结果待确认</h2>
            <p className="text-sm text-brand-text leading-relaxed">
              网络响应未能确认。若该邮箱已注册，邮件仍可能送达；请先等待几分钟并检查垃圾邮件，不要连续提交。
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
              <Link to="/customer" className="inline-flex min-h-11 items-center font-medium text-brand-text underline underline-offset-4 hover:text-brand-muted">
                返回客户中心登录
              </Link>
              <Link to="/contact" className="inline-flex min-h-11 items-center text-brand-muted underline underline-offset-4 hover:text-brand-text">
                联系顾问
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm text-brand-text">注册邮箱</span>
              <input
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
                className="mt-2 w-full border border-brand-line px-4 py-3 text-sm focus:border-brand-text focus:outline-none focus:ring-2 focus:ring-brand-text focus:ring-offset-2"
              />
            </label>
            <button
              type="submit"
              disabled={submitting || retryAfterSeconds > 0}
              className="w-full bg-brand-text text-white py-3 text-sm tracking-widest hover:opacity-90 disabled:opacity-50"
            >
              {submitting
                ? '提交中…'
                : retryAfterSeconds > 0
                  ? `${retryAfterSeconds} 秒后可重试`
                  : '提交找回请求'}
            </button>
            {retryAfterSeconds > 0 ? (
              <p role="alert" className="text-sm text-[#8C3F3B]">
                操作过于频繁，请在 {retryAfterSeconds} 秒后重试。
              </p>
            ) : feedback ? (
              <p role="alert" className="text-sm text-[#8C3F3B]">{feedback}</p>
            ) : null}
            <Link to="/customer" className="flex min-h-11 items-center justify-center text-center text-xs text-brand-muted underline underline-offset-4 hover:text-brand-text">
              返回登录
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

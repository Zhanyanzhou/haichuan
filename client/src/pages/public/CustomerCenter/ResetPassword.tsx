import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { customerApi } from '@/services/api';
import { getRequestErrorMessage } from '@/services/httpClient';
import {
  ACCOUNT_PASSWORD_HINT,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
  isAccountPasswordValid,
} from '@/config/accountPasswordPolicy';

/**
 * 重置密码（第二步）：从邮件链接进入（/customer/reset#token=...），设置新密码。
 * 令牌一次性、30 分钟过期；成功后引导登录。忘记 token 的来源时提示重新发起找回。
 */
export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  // 新链接从 fragment 读取；query 仅用于兼容已经发出的旧邮件。
  const token = useRef(
    new URLSearchParams(location.hash.replace(/^#/, '')).get('token')
      || new URLSearchParams(location.search).get('token')
      || '',
  ).current;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    const hadQueryToken = query.has('token');
    const hadFragmentToken = fragment.has('token');
    if (!hadQueryToken && !hadFragmentToken) return;

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
      message.warning(ACCOUNT_PASSWORD_HINT);
      return;
    }
    if (password !== confirm) {
      message.warning('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      await customerApi.resetPassword({ token, password });
      message.success('密码已重置，请使用新密码登录');
      navigate('/customer', { replace: true });
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, '重置失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md bg-white border border-brand-line p-10 text-center">
          <h1 className="text-xl font-display font-semibold text-brand-text">重置链接无效</h1>
          <p className="text-sm text-brand-muted mt-3">链接缺少有效令牌，请从邮件中的按钮进入，或重新发起找回。</p>
          <Link to="/customer/forgot" className="inline-block mt-6 text-sm text-brand-gold underline underline-offset-4">
            重新找回密码
          </Link>
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
              onChange={(event) => setPassword(event.target.value)}
              minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
              maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
              required
              autoFocus
              className="mt-2 w-full border border-brand-line px-4 py-3 text-sm focus:outline-none focus:border-brand-gold"
            />
          </label>
          <label className="block">
            <span className="text-sm text-brand-text">确认新密码</span>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
              maxLength={ACCOUNT_PASSWORD_MAX_LENGTH}
              required
              className="mt-2 w-full border border-brand-line px-4 py-3 text-sm focus:outline-none focus:border-brand-gold"
            />
          </label>
          <small className="block text-xs text-brand-muted">{ACCOUNT_PASSWORD_HINT}。</small>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-text text-white py-3 text-sm tracking-widest hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? '提交中…' : '重置密码'}
          </button>
        </form>
      </div>
    </div>
  );
}

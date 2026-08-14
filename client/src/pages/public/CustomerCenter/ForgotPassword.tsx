import { useState } from 'react';
import { Link } from 'react-router-dom';
import { message } from 'antd';
import { customerApi } from '@/services/api';

/**
 * 找回密码（第一步）：输入注册邮箱，系统发送一次性重置链接（30 分钟有效）。
 * 提示文案与服务端一致（防枚举）：不区分"邮箱是否已注册"。
 * 依赖 SMTP 配置：服务端未配置邮件通道时如实提示 503，不假报已发送。
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      message.warning('请填写正确的邮箱地址');
      return;
    }
    setSubmitting(true);
    try {
      await customerApi.forgotPassword({ email: email.trim() });
      setSent(true);
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-white border border-brand-line p-10">
        <h1 className="text-2xl font-display font-semibold text-brand-text">找回密码</h1>
        <p className="text-sm text-brand-muted mt-2">
          输入您的注册邮箱，我们将向您发送一次性重置链接（30 分钟内有效）。
        </p>

        {sent ? (
          <div className="mt-8 space-y-4">
            <p className="text-sm text-brand-text leading-relaxed">
              若该邮箱已注册，重置邮件已发送，请注意查收（也请检查垃圾邮件文件夹）。
            </p>
            <p className="text-xs text-brand-muted">没有收到？请确认邮箱地址，或联系您的专属顾问协助重置。</p>
            <Link to="/customer" className="inline-block text-sm text-brand-gold underline underline-offset-4">
              返回客户中心登录
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm text-brand-text">注册邮箱</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={100}
                required
                autoFocus
                className="mt-2 w-full border border-brand-line px-4 py-3 text-sm focus:outline-none focus:border-brand-gold"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-text text-white py-3 text-sm tracking-widest hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? '发送中…' : '发送重置邮件'}
            </button>
            <Link to="/customer" className="block text-center text-xs text-brand-muted hover:text-brand-gold">
              返回登录
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

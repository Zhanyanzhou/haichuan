import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Checkbox } from 'antd';
import type { InputRef } from 'antd';
import { UserOutlined, LockOutlined, EyeInvisibleOutlined, EyeOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { ADMIN_COLORS } from '@/styles/antdTheme';

/* ═══════ 局部视觉令牌 — 仅作用于登录页 ═══════ */
const TOKENS = {
  bg: '#F2EFEA',
  bgLight: '#F8F6F2',
  card: 'rgba(255,255,255,0.88)',
  title: ADMIN_COLORS.ink,
  text: ADMIN_COLORS.textStrong,
  muted: ADMIN_COLORS.muted,
  border: '#DCD6CF',
  brandGold: ADMIN_COLORS.brandGold,
  accent: ADMIN_COLORS.action,
  accentHover: ADMIN_COLORS.actionHover,
  accentActive: ADMIN_COLORS.actionActive,
  accentDisabled: '#D8C7AC',
  inputBg: '#FBFAF8',
  placeholder: ADMIN_COLORS.muted,
  error: ADMIN_COLORS.error,
  hint: ADMIN_COLORS.muted,
} as const;

const REMEMBER_KEY = 'haichuan_remembered_user';

export default function Login() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const usernameInputRef = useRef<InputRef>(null);
  const passwordInputRef = useRef<InputRef>(null);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  // 页面加载时恢复记住的用户名
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setRemember(true);
      form.setFieldsValue({ username: saved });
      setCredentials((current) => ({ ...current, username: saved }));
    }
  }, [form]);

  const onFinish = async (values: { username: string; password: string }) => {
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(values);
      const data = unwrapResponse<{ accessToken: string; user: any }>(res);
      setAuth(data.accessToken, data.user);

      // 记住用户名
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, values.username);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      navigate('/admin/dashboard');
    } catch (err: any) {
      if (err.message?.includes('Network') || err.message?.includes('网络')) {
        setError('暂时无法连接服务器，请稍后重试');
      } else {
        setError('账号或密码不正确，请检查后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5 overflow-y-auto py-8"
      style={{ background: `radial-gradient(ellipse at 50% 40%, ${TOKENS.bgLight} 0%, ${TOKENS.bg} 60%, #EBE6DF 100%)` }}
    >
      {/* 卡片 */}
      <div
        className="w-full"
        style={{
          maxWidth: 520,
          background: TOKENS.card,
          borderRadius: 18,
          border: `1px solid rgba(182,170,158,0.22)`,
          boxShadow: '0 18px 50px rgba(77,65,54,0.10), 0 2px 8px rgba(77,65,54,0.04)',
          padding: '56px 52px 44px',
        }}
      >
        {/* ═══ 标题区 ═══ */}
        <div className="text-center mb-8">
          <h1
            className="text-[26px] font-semibold tracking-normal m-0"
            style={{ color: TOKENS.title, fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif', lineHeight: '34px' }}
          >
            欢迎登录
          </h1>
          <div
            className="mx-auto mt-4"
            style={{ width: 30, height: 2, background: TOKENS.brandGold, borderRadius: 1 }}
          />
        </div>

        {/* ═══ 表单 ═══ */}
        <Form form={form} onFinish={onFinish} autoComplete="off" layout="vertical" size="large">

          {/* 用户名 */}
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { pattern: /^[a-zA-Z0-9]+$/, message: '用户名仅支持英文和数字' },
            ]}
            label={<span style={{ fontSize: 14, fontWeight: 500, color: TOKENS.text }}>用户名</span>}
            style={{ marginBottom: 20 }}
          >
            <Input
              ref={usernameInputRef}
              id="admin-login-username"
              prefix={<UserOutlined style={{ color: TOKENS.placeholder }} />}
              placeholder="输入用户名"
              autoFocus
              onChange={(e) => {
                // 实时过滤：只保留英文和数字
                const username = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                e.target.value = username;
                setCredentials((current) => ({ ...current, username }));
              }}
              style={{
                height: 56,
                borderRadius: 8,
                background: TOKENS.inputBg,
                border: `1px solid ${TOKENS.border}`,
                color: TOKENS.text,
                fontSize: 15,
                paddingLeft: 16,
              }}
            />
          </Form.Item>

          {/* 密码 */}
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
            label={<span style={{ fontSize: 14, fontWeight: 500, color: TOKENS.text }}>密码</span>}
            style={{ marginBottom: 24 }}
          >
            <Input.Password
              ref={passwordInputRef}
              id="admin-login-password"
              prefix={<LockOutlined style={{ color: TOKENS.placeholder }} />}
              placeholder="输入密码"
              onChange={(e) => {
                setCredentials((current) => ({ ...current, password: e.target.value }));
              }}
              iconRender={(visible) =>
                visible ? (
                  <EyeOutlined style={{ color: TOKENS.muted }} aria-label="隐藏密码" />
                ) : (
                  <EyeInvisibleOutlined style={{ color: TOKENS.muted }} aria-label="显示密码" />
                )
              }
              style={{
                height: 56,
                borderRadius: 8,
                background: TOKENS.inputBg,
                border: `1px solid ${TOKENS.border}`,
                color: TOKENS.text,
                fontSize: 15,
                paddingLeft: 16,
              }}
            />
          </Form.Item>

          {/* 记住我 */}
          <div className="flex items-center mb-5 -mt-1">
            <Checkbox
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ color: TOKENS.muted, fontSize: 13 }}
            >
              <span style={{ color: TOKENS.muted, fontSize: 13 }}>记住我</span>
            </Checkbox>
          </div>

          {/* 错误提示 */}
          {error && (
            <div
              className="text-center mb-5 -mt-2"
              style={{ color: TOKENS.error, fontSize: 14 }}
            >
              {error}
            </div>
          )}

          {/* 登录按钮 */}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              const usernameElement = document.getElementById('admin-login-username') as HTMLInputElement | null;
              const passwordElement = document.getElementById('admin-login-password') as HTMLInputElement | null;
              const username = usernameElement?.value.trim() || credentials.username;
              const password = passwordElement?.value || credentials.password;
              if (!username || !password) {
                setError('请输入用户名和密码');
                return;
              }
              void onFinish({ username, password });
            }}
            style={{
              width: '100%',
              height: 54,
              borderRadius: 8,
              background: TOKENS.accent,
              border: 'none',
              color: ADMIN_COLORS.onAction,
              fontWeight: 500,
              fontSize: 16,
              letterSpacing: 0,
              boxShadow: 'none',
            }}
            onMouseEnter={(e) => {
              if (!loading) (e.currentTarget as HTMLElement).style.background = TOKENS.accentHover;
            }}
            onMouseLeave={(e) => {
              if (!loading) (e.currentTarget as HTMLElement).style.background = TOKENS.accent;
            }}
            onMouseDown={(e) => {
              if (!loading) (e.currentTarget as HTMLElement).style.background = TOKENS.accentActive;
            }}
            onMouseUp={(e) => {
              if (!loading) (e.currentTarget as HTMLElement).style.background = TOKENS.accentHover;
            }}
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </Form>

        {/* ═══ 安全提示 ═══ */}
        <div className="text-center mt-6 flex items-center justify-center gap-1.5">
          <SafetyCertificateOutlined style={{ fontSize: 13, color: TOKENS.hint }} />
          <span style={{ fontSize: 13, color: TOKENS.hint }}>
            安全登录，保护您的账户安全
          </span>
        </div>
      </div>

      {/* ═══ 全局样式注入 ═══ */}
      <style>{`
        /* 聚焦样式使用高对比交互色，不以品牌金作唯一焦点。 */
        .ant-input-affix-wrapper:focus-within,
        .ant-input-affix-wrapper:hover,
        .ant-input:focus,
        .ant-input:hover {
          border-color: ${TOKENS.accent} !important;
          box-shadow: 0 0 0 3px rgba(111,87,51,0.18) !important;
        }
        /* 密码输入框 */
        .ant-input-affix-wrapper {
          background: ${TOKENS.inputBg} !important;
          border: 1px solid ${TOKENS.border} !important;
          border-radius: 8px !important;
          padding: 0 12px !important;
        }
        .ant-input-affix-wrapper input {
          background: transparent !important;
          color: ${TOKENS.text} !important;
          font-size: 15px !important;
        }
        .ant-input-affix-wrapper .ant-input-prefix {
          margin-right: 10px;
        }
        /* 标签样式 */
        .ant-form-item-label > label {
          font-size: 14px !important;
          font-weight: 500 !important;
          color: ${TOKENS.text} !important;
        }
        /* 记住我 Checkbox */
        .ant-checkbox-checked .ant-checkbox-inner {
          background-color: ${TOKENS.accent} !important;
          border-color: ${TOKENS.accent} !important;
        }
        .ant-checkbox:hover .ant-checkbox-inner {
          border-color: ${TOKENS.accent} !important;
        }
        /* placeholder */
        .ant-input::placeholder {
          color: ${TOKENS.placeholder} !important;
        }
        /* 按钮 */
        .ant-btn-primary {
          box-shadow: none !important;
        }
        /* 移动端内边距 */
        @media (max-width: 520px) {
          .min-h-screen > div {
            padding: 28px 22px !important;
            border-radius: 14px !important;
            max-width: calc(100vw - 40px) !important;
          }
          h1 { font-size: 26px !important; line-height: 34px !important; }
        }
      `}</style>
    </div>
  );
}

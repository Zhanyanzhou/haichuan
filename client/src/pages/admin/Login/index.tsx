import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Form, Input, Checkbox } from 'antd';
import type { InputRef } from 'antd';
import { UserOutlined, LockOutlined, EyeInvisibleOutlined, EyeOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/services/api';
import { requestErrorCode, requestStatus } from '@/services/httpClient';
import { USE_MOCK } from '@/services/mockData';
import { unwrapResponse } from '@/utils/unwrap';
import { ADMIN_COLORS } from '@/styles/antdTheme';
import { resolveAdminReturnPath } from '@/utils/adminReturnPath';
import type { User } from '@/types';

/* ═══════ 局部视觉令牌 — 仅作用于登录页 ═══════ */
const TOKENS = {
  bg: ADMIN_COLORS.canvasSubtle,
  bgLight: '#F4F5F5',
  card: '#FFFFFF',
  title: ADMIN_COLORS.ink,
  text: ADMIN_COLORS.textStrong,
  muted: ADMIN_COLORS.muted,
  border: ADMIN_COLORS.line,
  accent: ADMIN_COLORS.action,
  accentHover: ADMIN_COLORS.actionHover,
  accentActive: ADMIN_COLORS.actionActive,
  accentDisabled: '#B8BEC1',
  inputBg: '#F7F8F8',
  placeholder: ADMIN_COLORS.muted,
  error: ADMIN_COLORS.error,
  hint: ADMIN_COLORS.muted,
} as const;

const REMEMBER_KEY = 'haichuan_remembered_user';

function loginErrorMessage(error: unknown): string {
  const status = requestStatus(error);
  const errorCode = requestErrorCode(error);
  const message = error instanceof Error ? error.message : '';

  if (errorCode === 'ADMIN_LOGIN_TEMPORARILY_LOCKED') {
    return message || '登录失败次数过多，账号已临时锁定，请稍后重试';
  }
  if (status === 429) return '登录尝试过于频繁，请稍后再试';
  if (!status && (message.includes('Network') || message.includes('网络'))) {
    return '暂时无法连接服务器，请稍后重试';
  }
  if (status && status >= 500) return '服务器暂时无法完成登录，请稍后重试';
  return '账号或密码不正确，请检查后重试';
}

export default function Login() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const usernameInputRef = useRef<InputRef>(null);
  const passwordInputRef = useRef<InputRef>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);

  // 页面加载时恢复记住的账号；密码和会话令牌不写入 Web Storage。
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
      const data = unwrapResponse<{ user: User }>(res);
      if (!data?.user) throw new Error('账户认证失败');
      setAuth(data.user);

      // 仅记住账号；登录状态由服务端 HttpOnly Cookie 会话保持。
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, values.username);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      const stateFrom = (location.state as { from?: unknown } | null)?.from;
      navigate(resolveAdminReturnPath(location.search, stateFrom), { replace: true });
    } catch (error: unknown) {
      setError(loginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="admin-login-page min-h-screen flex items-center justify-center px-5 overflow-y-auto py-8"
      style={{ background: TOKENS.bg }}
    >
      {/* 卡片 */}
      <div
        className="w-full"
        style={{
          maxWidth: 520,
          background: TOKENS.card,
          borderRadius: 4,
          border: `1px solid ${TOKENS.border}`,
          boxShadow: 'none',
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
            style={{ width: 30, height: 2, background: TOKENS.accent }}
          />
        </div>

        {USE_MOCK ? (
          <div
            role="status"
            aria-label="当前为 Mock 模式，输入任意非空用户名和密码即可进入，数据仅保存在本机"
            className="mb-5"
            style={{
              padding: '10px 12px',
              border: `1px solid ${ADMIN_COLORS.infoBorder}`,
              borderRadius: 6,
              color: ADMIN_COLORS.info,
              background: ADMIN_COLORS.infoBg,
              fontSize: 13,
              lineHeight: '20px',
              textAlign: 'left',
            }}
          >
            Mock 模式：输入任意非空用户名和密码即可进入；数据仅保存在本机。
          </div>
        ) : null}

        {/* ═══ 表单 ═══ */}
        <Form form={form} onFinish={onFinish} autoComplete="on" layout="vertical" size="large">

          {/* 用户名 */}
          <Form.Item
            name="username"
            rules={[
              { required: true, whitespace: true, message: '请输入用户名' },
              { max: 50, message: '用户名不能超过 50 个字符' },
            ]}
            label={<span style={{ fontSize: 14, fontWeight: 500, color: TOKENS.text }}>用户名</span>}
            style={{ marginBottom: 20 }}
          >
            <Input
              ref={usernameInputRef}
              id="admin-login-username"
              autoComplete="username"
              prefix={<UserOutlined style={{ color: TOKENS.placeholder }} />}
              placeholder="输入用户名"
              autoFocus
              maxLength={50}
              onChange={(e) => {
                setCredentials((current) => ({ ...current, username: e.target.value }));
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
              autoComplete="current-password"
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

          {/* 只记住账号，不在前端持久化密码或令牌。 */}
          <div className="flex items-center mb-5 -mt-1">
            <Checkbox
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ color: TOKENS.muted, fontSize: 13 }}
            >
              <span style={{ color: TOKENS.muted, fontSize: 13 }}>记住账号</span>
            </Checkbox>
          </div>

          {/* 错误提示 */}
          {error && (
            <div
              role="alert"
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
              const username = usernameElement?.value ?? credentials.username;
              const password = passwordElement?.value || credentials.password;
              if (!username.trim() || !password) {
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
          box-shadow: 0 0 0 3px rgba(24,26,27,0.16) !important;
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
        .ant-input-affix-wrapper input:-webkit-autofill,
        .ant-input-affix-wrapper input:-webkit-autofill:hover,
        .ant-input-affix-wrapper input:-webkit-autofill:focus {
          -webkit-text-fill-color: ${TOKENS.text} !important;
          box-shadow: 0 0 0 1000px ${TOKENS.inputBg} inset !important;
          caret-color: ${TOKENS.text};
          transition: background-color 9999s ease-out 0s;
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

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Checkbox } from 'antd';
import { UserOutlined, LockOutlined, EyeInvisibleOutlined, EyeOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';

/* ═══════ 局部视觉令牌 — 仅作用于登录页 ═══════ */
const TOKENS = {
  bg: '#F2EFEA',
  bgLight: '#F8F6F2',
  card: 'rgba(255,255,255,0.88)',
  title: '#5A5048',
  text: '#3F3934',
  muted: '#8C847C',
  border: '#DCD6CF',
  accent: '#C3A06A',
  accentHover: '#B58F58',
  accentActive: '#A9824E',
  accentDisabled: '#D8C7AC',
  inputBg: '#FBFAF8',
  placeholder: '#AAA39B',
  error: '#A85D58',
  hint: '#AAA39C',
} as const;

const REMEMBER_KEY = 'haichuan_remembered_user';

export default function Login() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  // 页面加载时恢复记住的用户名
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setRemember(true);
      form.setFieldsValue({ username: saved });
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
      className="min-h-screen flex items-center justify-center px-5"
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
            className="text-[32px] font-medium tracking-[0.04em] m-0"
            style={{ color: TOKENS.title, fontFamily: '"Noto Serif SC", "PingFang SC", serif' }}
          >
            欢迎登录
          </h1>
          <div
            className="mx-auto mt-4"
            style={{ width: 30, height: 2, background: TOKENS.accent, borderRadius: 1 }}
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
              prefix={<UserOutlined style={{ color: TOKENS.placeholder }} />}
              placeholder="输入用户名"
              autoFocus
              onChange={(e) => {
                // 实时过滤：只保留英文和数字
                e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
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
              prefix={<LockOutlined style={{ color: TOKENS.placeholder }} />}
              placeholder="输入密码"
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
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            style={{
              height: 54,
              borderRadius: 8,
              background: TOKENS.accent,
              border: 'none',
              fontWeight: 500,
              fontSize: 16,
              letterSpacing: '0.06em',
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
          </Button>
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
        /* 聚焦样式 — 低饱和香槟金 */
        .ant-input-affix-wrapper:focus-within,
        .ant-input-affix-wrapper:hover,
        .ant-input:focus,
        .ant-input:hover {
          border-color: #B99763 !important;
          box-shadow: 0 0 0 3px rgba(185,151,99,0.12) !important;
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
          h1 { font-size: 28px !important; }
        }
      `}</style>
    </div>
  );
}

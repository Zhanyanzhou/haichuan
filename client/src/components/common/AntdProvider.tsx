import type { ReactNode } from 'react';
import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import antdTheme from '@/styles/antdTheme';

const brandLoadingIndicator = (
  <span className="hc-spin-mark" aria-hidden="true">
    <span className="hc-spin-mark__ring" />
    <img src="/favicon.svg?v=20261027c" alt="" width="9" height="9" />
  </span>
);

/**
 * Ant Design 仅在实际使用组件库的路由加载。
 *
 * 这样纯展示型前台页面不会下载后台组件库，使用 Ant Design 的页面仍保持中文语言包与统一品牌主题。
 * 按钮和表格自带的等待也使用 H 标记，不再使用默认圆点。
 * 点击水波在 ResizeObserver 回调里回写尺寸，会在编辑画布触发浏览器 loop 告警，因此关闭。
 */
export default function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={zhCN} theme={antdTheme} spin={{ indicator: brandLoadingIndicator }} wave={{ disabled: true }}>
      <App component={false}>{children}</App>
    </ConfigProvider>
  );
}

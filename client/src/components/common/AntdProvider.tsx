import type { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import antdTheme from '@/styles/antdTheme';

/**
 * Ant Design 仅在实际使用组件库的路由加载。
 *
 * 这样纯展示型前台页面不会下载后台组件库，使用 Ant Design 的页面仍保持中文语言包与统一品牌主题。
 */
export default function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      {children}
    </ConfigProvider>
  );
}

import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, Button, Dropdown, Badge, Avatar, Drawer } from 'antd';
import {
  DashboardOutlined, ShoppingOutlined, AppstoreOutlined, PictureOutlined,
  DollarOutlined, OrderedListOutlined, TeamOutlined,
  SettingOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  BellOutlined, LogoutOutlined, UserOutlined, HomeOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import Logo from '@/components/common/Logo';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';

const { Header, Sider, Content } = Layout;

const adminMenus = [
  { type: 'group' as const, label: '工作台', children: [
    { key: '/admin/dashboard', icon: <DashboardOutlined />, label: '工作台' },
  ]},
  { type: 'group' as const, label: '商品中心', children: [
    { key: '/admin/products', icon: <ShoppingOutlined />, label: '商品管理' },
    { key: '/admin/categories', icon: <AppstoreOutlined />, label: '分类与属性' },
    { key: '/admin/media', icon: <PictureOutlined />, label: '商品素材' },
  ]},
  { type: 'group' as const, label: '内容中心', children: [
    { key: '/admin/homepage', icon: <HomeOutlined />, label: '页面构建器' },
    { key: '/admin/site-content', icon: <SettingOutlined />, label: '网站设置' },
  ]},
  { type: 'group' as const, label: '客户中心', children: [
    { key: '/admin/inquiries', icon: <OrderedListOutlined />, label: '客户线索' },
  ]},
  { type: 'group' as const, label: '系统管理', children: [
    { key: '/admin/users', icon: <TeamOutlined />, label: '管理员与权限' },
    { key: '/admin/audit-logs', icon: <OrderedListOutlined />, label: '操作日志' },
    { key: '/admin/settings', icon: <SettingOutlined />, label: '系统维护' },
  ]},
];

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isLoggedIn } = useAuthStore();
  const { goldPrice, goldPriceChange } = useAppStore();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { if (!isLoggedIn) navigate('/admin/login'); }, [isLoggedIn]);

  const handleLogout = () => { logout(); navigate('/admin/login'); };

  const handleMenuClick = (key: string) => {
    navigate(key);
    if (isMobile) setMobileDrawerOpen(false);
  };

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: '个人资料' },
    { key: 'divider', type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* 品牌区 — 精简 */}
      <div className="flex items-center gap-2.5 h-[72px] px-4 border-b" style={{ borderColor: '#E7E6E2' }}>
        <Logo size={28} iconOnly={collapsed && !isMobile} fontSize={collapsed && !isMobile ? '0px' : '1rem'} />
      </div>

      {/* 导航菜单 */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        <Menu mode="inline" selectedKeys={[location.pathname]} items={adminMenus}
          onClick={({ key }) => handleMenuClick(key)}
          style={{ background: 'transparent', borderRight: 'none' }} />
      </div>

      {/* 底部分组标题不再显示金价卡片 */}
    </div>
  );

  return (
    <Layout className="min-h-screen" style={{ background: '#F7F7F5' }}>
      {/* 侧边栏 */}
      {isMobile ? (
        <Drawer
          placement="left"
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          width={240}
          styles={{ body: { padding: 0, background: '#FCFCFB' }, header: { display: 'none' } }}
        >
          {sidebarContent}
        </Drawer>
      ) : (
        <Sider trigger={null} collapsible collapsed={collapsed} width={232} collapsedWidth={72}
          style={{ background: '#FCFCFB', borderRight: '1px solid #E7E6E2' }}>
          {sidebarContent}
        </Sider>
      )}

      {/* 主区域 */}
      <Layout>
        {/* 顶栏 */}
        <Header style={{ background: '#FFFFFF', borderBottom: '1px solid #E7E6E2', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
          <Button
            type="text"
            icon={isMobile ? <MenuUnfoldOutlined /> : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
            onClick={() => isMobile ? setMobileDrawerOpen(true) : setCollapsed(!collapsed)}
            style={{ color: '#66645F' }}
          />
          <div className="flex items-center gap-5">
            <Link to="/" target="_blank" style={{ color: '#66645F', fontSize: 13 }} className="hover:text-[#9F7941] transition-colors"><HomeOutlined className="mr-1" />预览网站</Link>
            <Badge count={3} size="small"><BellOutlined style={{ color: '#66645F', cursor: 'pointer' }} /></Badge>
            <Dropdown menu={{ items: userMenuItems, onClick: ({ key }) => { if (key === 'logout') handleLogout(); } }}>
              <div className="flex items-center gap-2 cursor-pointer px-2">
                <Avatar size={28} icon={<UserOutlined />} style={{ backgroundColor: '#F3EFE7', color: '#B69052' }} />
                <span style={{ color: '#252522', fontSize: 13 }}>{user?.realName || '管理员'}</span>
              </div>
            </Dropdown>
          </div>
        </Header>

        {/* 内容区 */}
        <Content style={{ margin: 32, minHeight: 'calc(100vh - 136px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

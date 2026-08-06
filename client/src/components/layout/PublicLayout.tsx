import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

const primaryLinks = [
  { label: '关于海川', description: '认识海川珠宝与东方工艺', href: '/about' },
  { label: '珠宝作品', description: '浏览黄金珠宝作品', href: '/products' },
  { label: '选款中心', description: '按品类与货号快速选款', href: '/catalog' },
  { label: '珠宝定制', description: '了解专属定制流程', href: '/custom' },
  { label: '预约咨询', description: '一对一顾问服务', href: '/contact' },
];

/* ═══════ 内联图标 ═══════ */
const MenuIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><line x1="4" y1="7" x2="26" y2="7" /><line x1="4" y1="15" x2="26" y2="15" /><line x1="4" y1="23" x2="26" y2="23" /></svg>
);
const CloseIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><line x1="7" y1="7" x2="23" y2="23" /><line x1="23" y1="7" x2="7" y2="23" /></svg>
);
const SearchIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="13" cy="13" r="8" /><line x1="19" y1="19" x2="27" y2="27" /></svg>
);
const DiamondIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M15 3 L23 13.5 L15 27 L7 13.5 Z" /></svg>
);
const CalendarIcon = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5.5" width="24" height="21" rx="2" /><line x1="3" y1="14" x2="27" y2="14" /><line x1="9" y1="2" x2="9" y2="9" /><line x1="21" y1="2" x2="21" y2="9" /></svg>
);

export default function PublicLayout() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle('home-route', isHome);
    document.body.classList.toggle('nav-locked', menuOpen);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    if (menuOpen) window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('home-route');
      document.body.classList.remove('nav-locked');
      window.removeEventListener('keydown', onKey);
    };
  }, [isHome, menuOpen]);

  const isTransparent = isHome && !scrolled && !menuOpen;
  const headerBg = isTransparent ? 'transparent' : 'rgba(255,255,255,0.92)';
  const headerBorder = isTransparent ? 'transparent' : 'rgba(41,36,31,0.06)';
  const navColor = 'rgba(41,36,31,0.78)';

  return (
    <div className={isHome ? 'editorial-shell' : 'site-shell'}>
      {/* ═══════ Header ═══════ */}
      <header
        className="site-header"
        style={{
          background: headerBg,
          borderBottomColor: headerBorder,
          backdropFilter: isTransparent ? 'none' : 'blur(8px)',
          WebkitBackdropFilter: isTransparent ? 'none' : 'blur(8px)',
        }}
      >
        <div className="site-header__inner">
          <div className="site-header__left" />

          <Link to="/" className="site-header__brand" aria-label="海川珠宝首页">
            <img src="/images/brand-logo.svg" alt="海川珠宝" className="site-header__logo"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <span className="site-header__brand-text">海川珠宝</span>
          </Link>

          <div className="site-header__right">
            <Link to="/catalog" aria-label="选款中心" className="site-header__nav-item"
              style={{ color: navColor }}
              onMouseEnter={e => e.currentTarget.style.color = '#211E1A'}
              onMouseLeave={e => e.currentTarget.style.color = navColor}
            >
              <DiamondIcon />
              <span className="site-header__nav-label hidden sm:inline">选款</span>
            </Link>
            <Link to="/contact" aria-label="预约咨询" className="site-header__nav-item"
              style={{ color: navColor }}
              onMouseEnter={e => e.currentTarget.style.color = '#211E1A'}
              onMouseLeave={e => e.currentTarget.style.color = navColor}
            >
              <CalendarIcon />
              <span className="site-header__nav-label hidden sm:inline">预约</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ═══════ 左侧组合：菜单 + 搜索 ═══════ */}
      <div className="site-header__left-group">
        <button
          type="button"
          className="site-menu-toggle"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="brand-menu"
          aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
        >
          {menuOpen ? (
            <>
              <CloseIcon />
              <span className="site-menu-toggle__label">关闭</span>
            </>
          ) : (
            <>
              <MenuIcon />
              <span className="site-menu-toggle__label">菜单</span>
            </>
          )}
        </button>
        <Link to="/search" aria-label="搜索" className="site-header__nav-item"
          style={{ color: navColor }}
          onMouseEnter={e => e.currentTarget.style.color = '#211E1A'}
          onMouseLeave={e => e.currentTarget.style.color = navColor}
        >
          <SearchIcon />
          <span className="site-header__nav-label hidden sm:inline">搜索</span>
        </Link>
      </div>

      {/* ═══════ 菜单面板 ═══════ */}
      <div id="brand-menu" className={`brand-menu${menuOpen ? ' is-open' : ''}`} aria-hidden={!menuOpen} onClick={() => setMenuOpen(false)}>
        <div className="brand-menu__inner" onClick={e => e.stopPropagation()}>
          <nav className="brand-menu__primary" aria-label="品牌菜单">
            {primaryLinks.map((item) => (
              <Link key={item.href} to={item.href} tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="brand-menu__footer">
            <div className="brand-menu__contact">
              <Link to="/search" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="5"/><line x1="10" y1="10" x2="15" y2="15"/></svg>
                货号搜索
              </Link>
              <a href="tel:400-888-8888" tabIndex={menuOpen ? 0 : -1}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 11.5v2a1.33 1.33 0 01-1.45 1.33A11.8 11.8 0 011.5 3.45 1.33 1.33 0 012.83 2h2a1.33 1.33 0 011.33 1.15c.08.63.23 1.24.43 1.82a1.33 1.33 0 01-.3 1.4L5.13 7.54a10.67 10.67 0 004 4l1.17-1.17a1.33 1.33 0 011.4-.3c.58.2 1.19.35 1.82.43a1.33 1.33 0 011.15 1.33z"/></svg>
                400-888-8888
              </a>
              <span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5a5.5 5.5 0 00-5.5 5.5c0 4.13 5.5 9.5 5.5 9.5s5.5-5.37 5.5-9.5A5.5 5.5 0 008 1.5z"/><circle cx="8" cy="7" r="2"/></svg>
                深圳市罗湖区珠宝产业园
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ Main ═══════ */}
      <main className={isHome ? 'editorial-main' : 'site-main'}>
        <Outlet />
      </main>

      {/* ═══════ Footer ═══════ */}
      {!isHome && (
        <footer className="site-footer">
          <div className="site-footer__inner">
            {/* 第一列：品牌 */}
            <div>
              <p className="site-footer__brand-label">HAICHUAN JEWELRY</p>
              <p className="site-footer__brand-name">海川珠宝</p>
              <p className="site-footer__brand-desc">黄金珠宝作品与选款服务</p>
            </div>
            {/* 第二列：导航 */}
            <div>
              <p className="site-footer__col-title">探索</p>
              <nav>
                <Link to="/products">珠宝作品</Link>
                <Link to="/catalog">选款中心</Link>
                <Link to="/custom">定制服务</Link>
                <Link to="/about">品牌故事</Link>
                <Link to="/contact">预约咨询</Link>
              </nav>
            </div>
            {/* 第三列：服务入口 */}
            <div>
              <p className="site-footer__col-title">联系</p>
              <a href="tel:400-888-8888" className="site-footer__link">☎ 400-888-8888</a>
              <a href="mailto:contact@haichuan.com" className="site-footer__link">✉ contact@haichuan.com</a>
            </div>
          </div>
          <p className="site-footer__copyright">© {new Date().getFullYear()} 海川珠宝</p>
        </footer>
      )}
    </div>
  );
}

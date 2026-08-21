import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** 路由切换时的顶部进度条（纯 CSS 替代 NProgress） */
const ProgressBar: React.FC = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    setLoading(true);
    setWidth(0);

    // 模拟进度增长
    let progress = 0;
    timerRef.current = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 85) {
        progress = 85;
        clearInterval(timerRef.current);
      }
      setWidth(progress);
    }, 150);

    // 路由加载完成后完成进度
    const timeout = setTimeout(() => {
      clearInterval(timerRef.current);
      setWidth(100);
      setTimeout(() => {
        setLoading(false);
        setWidth(0);
      }, 300);
    }, 600);

    return () => {
      clearInterval(timerRef.current);
      clearTimeout(timeout);
    };
  }, [location.pathname]);

  if (!loading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px]">
      <div
        className="h-full bg-brand-gold transition-all duration-300 ease-out"
        style={{
          width: `${width}%`,
          opacity: width === 100 ? 0 : 1,
          boxShadow: '0 0 10px rgba(24,26,27,0.22)',
        }}
      />
    </div>
  );
};

export default ProgressBar;

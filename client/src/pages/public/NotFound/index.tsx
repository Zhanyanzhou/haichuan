import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageMetaStore } from "@/store/pageMetaStore";
import "./styles.css";

export default function NotFound() {
  const setPageMeta = usePageMetaStore((state) => state.setMeta);
  const clearPageMeta = usePageMetaStore((state) => state.clear);

  useEffect(() => {
    setPageMeta({
      title: "页面未找到 | 海川珠宝",
      description: "您访问的页面不存在、已移动或暂未公开。",
      noIndex: true,
      canonicalPath: null,
    });
    return clearPageMeta;
  }, [clearPageMeta, setPageMeta]);

  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <div className="not-found-page__content">
        <p className="not-found-page__eyebrow">页面不存在</p>
        <h1 id="not-found-title">此页未被找到</h1>
        <p className="not-found-page__description">
          页面可能已移动、尚未公开，或链接已经失效。您可以返回首页，或前往选款中心查看当前公开内容。
        </p>
        <div className="not-found-page__actions">
          <Link className="not-found-page__primary" to="/">
            返回首页
          </Link>
          <Link className="not-found-page__secondary" to="/catalog">
            前往选款中心
          </Link>
        </div>
      </div>
    </section>
  );
}

import { Link } from "react-router-dom";

/** 国内公网上线完成备案后填写；空值时不渲染占位信息。 */
const FOOTER_ICP_NUMBER = "";

type StorefrontFooterProps = {
  siteName: string;
  preview?: boolean;
  onPreviewNavigate?: (path: string) => void;
};

const footerLinks = [
  { label: "珠宝作品", path: "/products" },
  { label: "定制服务", path: "/custom" },
  { label: "品牌故事", path: "/about" },
  { label: "隐私说明", path: "/privacy" },
  { label: "经营主体信息", path: "/business-info" },
] as const;

/** 公开网站与装修画布共用的唯一页脚。 */
export default function StorefrontFooter({
  siteName,
  preview = false,
  onPreviewNavigate,
}: StorefrontFooterProps) {
  const previewLinkProps = (path: string) =>
    preview
      ? {
          onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            onPreviewNavigate?.(path);
          },
          title: "画布预览，点击不离开编辑器",
        }
      : undefined;

  return (
    <footer className="site-footer" aria-label={preview ? "页脚预览" : undefined}>
      <div className="site-footer__inner">
        <div className="site-footer__service">
          <p className="site-footer__service-label">PRIVATE APPOINTMENT</p>
          <Link
            to="/contact"
            className="site-footer__service-link"
            {...previewLinkProps("/contact")}
          >
            <span>预约私人珠宝顾问</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        <nav className="site-footer__links" aria-label="页脚导航">
          {footerLinks.map((item) => (
            <Link key={item.path} to={item.path} {...previewLinkProps(item.path)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="site-footer__signature">
          <span className="site-footer__brandmark">HAICHUAN JEWELRY</span>
          <span aria-hidden="true" className="site-footer__signature-divider" />
          <span>© {new Date().getFullYear()} {siteName}</span>
        </div>

        {!preview && FOOTER_ICP_NUMBER ? (
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="site-footer__filing"
          >
            {FOOTER_ICP_NUMBER}
          </a>
        ) : null}
      </div>
    </footer>
  );
}

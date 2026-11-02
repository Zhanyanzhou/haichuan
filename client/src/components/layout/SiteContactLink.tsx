import { Link } from "react-router-dom";

export default function SiteContactLink({
  preview = false,
  onPreviewNavigate,
}: {
  preview?: boolean;
  onPreviewNavigate?: (path: string) => void;
}) {
  return (
    <Link to="/contact" className="site-header__nav-item site-header__nav-item--contact" aria-label="联系与预约"
      onClick={preview ? (event) => { event.preventDefault(); onPreviewNavigate?.("/contact"); } : undefined}>
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8.6 3.5H5.3a1.8 1.8 0 0 0-1.8 1.9c.8 11.4 9.2 19.8 20.6 20.6a1.8 1.8 0 0 0 1.9-1.8v-3.3a1.8 1.8 0 0 0-1.5-1.8l-4.2-.7a1.8 1.8 0 0 0-1.6.5l-1.8 1.8a18.2 18.2 0 0 1-7.6-7.6l1.8-1.8a1.8 1.8 0 0 0 .5-1.6l-.7-4.2A1.8 1.8 0 0 0 8.6 3.5Z" />
      </svg>
      <span className="site-header__nav-label">联系</span>
    </Link>
  );
}

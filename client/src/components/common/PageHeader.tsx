import { Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  title: string;
  path?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: BreadcrumbItem[];
  extra?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, breadcrumb, extra }) => {
  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb className="mb-2 text-sm">
          {breadcrumb.map((item, index) => (
            <Breadcrumb.Item key={index}>
              {item.path ? (
                <Link to={item.path} className="text-brand-muted hover:text-brand-gold">
                  {item.title}
                </Link>
              ) : (
                <span className="text-brand-text">{item.title}</span>
              )}
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-text">{title}</h1>
          {subtitle && <p className="text-sm text-brand-muted mt-1">{subtitle}</p>}
        </div>
        {extra && <div className="flex-shrink-0">{extra}</div>}
      </div>
    </div>
  );
};

export default PageHeader;

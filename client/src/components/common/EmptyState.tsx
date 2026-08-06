import { Empty, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCartOutlined,
  SearchOutlined,
  InboxOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';

type EmptyType = 'cart' | 'search' | 'order' | 'product' | 'default';

interface EmptyStateProps {
  type?: EmptyType;
  keyword?: string;
}

const emptyConfig: Record<EmptyType, {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionText?: string;
  actionPath?: string;
}> = {
  cart: {
    icon: <ShoppingCartOutlined style={{ fontSize: 64, color: '#B8944E' }} />,
    title: '购物车是空的',
    description: '快去挑选心仪的珠宝吧~',
    actionText: '去选购',
    actionPath: '/products',
  },
  search: {
    icon: <SearchOutlined style={{ fontSize: 64, color: '#B8944E' }} />,
    title: '未找到相关商品',
    description: '试试其他关键词，或浏览全部分类',
    actionText: '浏览分类',
    actionPath: '/catalog',
  },
  order: {
    icon: <InboxOutlined style={{ fontSize: 64, color: '#B8944E' }} />,
    title: '暂无订单',
    description: '选购心仪的珠宝，您的第一个订单即将诞生',
    actionText: '去选购',
    actionPath: '/products',
  },
  product: {
    icon: <AppstoreOutlined style={{ fontSize: 64, color: '#B8944E' }} />,
    title: '暂无商品',
    description: '此分类下暂无商品，敬请期待新品上架',
  },
  default: {
    icon: <InboxOutlined style={{ fontSize: 64, color: '#B8944E' }} />,
    title: '暂无数据',
    description: '',
  },
};

const EmptyState: React.FC<EmptyStateProps> = ({ type = 'default', keyword }) => {
  const navigate = useNavigate();
  const config = emptyConfig[type];

  const desc = type === 'search' && keyword
    ? `未找到与"${keyword}"相关的商品，试试其他关键词`
    : config.description;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <Empty
        image={config.icon}
        description={
          <div className="mt-4">
            <p className="text-lg font-medium text-brand-text mb-2">{config.title}</p>
            <p className="text-sm text-brand-muted">{desc}</p>
          </div>
        }
      >
        {config.actionText && config.actionPath && (
          <Button
            type="primary"
            onClick={() => navigate(config.actionPath!)}
            className="bg-brand-gold border-brand-gold hover:bg-brand-goldD"
          >
            {config.actionText}
          </Button>
        )}
      </Empty>
    </div>
  );
};

export default EmptyState;

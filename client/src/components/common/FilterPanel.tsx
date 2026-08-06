import { Select, Input, Button, Space } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { MaterialType } from '@/types';

interface FilterPanelProps {
  keyword: string;
  onKeywordChange: (value: string) => void;
  materialType?: string;
  onMaterialTypeChange?: (value: string) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  onReset?: () => void;
  onSearch?: () => void;
  showMaterial?: boolean;
  showSort?: boolean;
}

const materialOptions = [
  { label: '全部材质', value: '' },
  { label: '足金999', value: 'GOLD_999' },
  { label: '足金9999', value: 'GOLD_9999' },
  { label: '18K金', value: 'AU750' },
  { label: '铂金PT950', value: 'PT950' },
  { label: '镶钻', value: 'DIAMOND' },
  { label: '玉石', value: 'JADE' },
  { label: '珍珠', value: 'PEARL' },
];

const sortOptions = [
  { label: '默认排序', value: 'createdAt_desc' },
  { label: '价格从低到高', value: 'price_asc' },
  { label: '价格从高到低', value: 'price_desc' },
  { label: '销量优先', value: 'salesCount_desc' },
];

const FilterPanel: React.FC<FilterPanelProps> = ({
  keyword, onKeywordChange,
  materialType, onMaterialTypeChange,
  sortBy, sortOrder, onSortChange,
  onReset, onSearch,
  showMaterial = true, showSort = true,
}) => {
  const currentSort = sortBy && sortOrder ? `${sortBy}_${sortOrder}` : undefined;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-white border border-brand-line">
      <Input
        placeholder="搜索商品名称或编码..."
        prefix={<SearchOutlined className="text-brand-muted" />}
        value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
        onPressEnter={() => onSearch?.()}
        className="w-full sm:w-64"
        allowClear
      />
      {showMaterial && onMaterialTypeChange && (
        <Select
          value={materialType || ''}
          onChange={onMaterialTypeChange}
          options={materialOptions}
          className="w-full sm:w-36"
        />
      )}
      {showSort && onSortChange && (
        <Select
          value={currentSort}
          onChange={(val: string) => {
            const [by, order] = val.split('_');
            onSortChange(by, order as 'asc' | 'desc');
          }}
          options={sortOptions}
          className="w-full sm:w-40"
        />
      )}
      <Space>
        {onSearch && (
          <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}
            className="bg-brand-gold border-brand-gold hover:bg-brand-goldD">
            搜索
          </Button>
        )}
        {onReset && (
          <Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button>
        )}
      </Space>
    </div>
  );
};

export default FilterPanel;

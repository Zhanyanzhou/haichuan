import { Select, Input, Space } from 'antd';

interface LinkSelectorProps {
  value?: string;
  onChange?: (url: string) => void;
  placeholder?: string;
}

const PRESET_LINKS = [
  { value: '/', label: '首页 /' },
  { value: '/products', label: '全部产品 /products' },
  { value: '/catalog', label: '选款中心 /catalog' },
  { value: '/about', label: '关于我们 /about' },
  { value: '/contact', label: '联系我们 /contact' },
  { value: '/custom', label: '定制服务 /custom' },
  { value: '/search', label: '搜索页 /search' },
];

function classify(value?: string): 'preset' | 'custom' {
  if (!value) return 'preset';
  return PRESET_LINKS.some(l => l.value === value) ? 'preset' : 'custom';
}

/**
 * 链接选择器 — 预设常用内部链接 + 自定义URL
 */
export default function LinkSelector({ value, onChange, placeholder = '选择链接' }: LinkSelectorProps) {
  const mode = classify(value);

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Select
        size="small"
        style={{ width: 140 }}
        value={mode === 'preset' ? (value || '') : '__custom__'}
        onChange={v => {
          if (v === '__custom__') {
            onChange?.('');
          } else {
            onChange?.(v);
          }
        }}
        options={[
          ...PRESET_LINKS.map(l => ({ value: l.value, label: l.label })),
          { value: '__custom__', label: '自定义...' },
        ]}
      />
      {mode === 'custom' && (
        <Input
          size="small"
          style={{ flex: 1 }}
          value={value || ''}
          onChange={e => onChange?.(e.target.value)}
          placeholder="输入完整URL或路径"
        />
      )}
    </Space.Compact>
  );
}

import { useState } from 'react';
import { Button, Input, InputNumber, message, Popconfirm, Select, Slider, Spin, Tabs, Upload } from 'antd';
import type { UploadProps } from 'antd';
import {
  PlusOutlined, DeleteOutlined, CopyOutlined, EyeOutlined, EyeInvisibleOutlined,
  ArrowUpOutlined, ArrowDownOutlined, PictureOutlined, ReloadOutlined, SendOutlined,
} from '@ant-design/icons';
import { pageModulesApi, uploadApi } from '@/services/api';
import { useAdminModules } from '@/hooks/usePageModules';
import { unwrapResponse } from '@/utils/unwrap';
import type { PageModule } from '@/types/pageModule';

const DEVICES = { desktop: 1440, tablet: 768, mobile: 390 } as const;
type Device = keyof typeof DEVICES;

const MODULE_TYPES = [
  { value: 'hero', label: '首屏主视觉 (Hero)' },
  { value: 'doublePoster', label: '双图海报 (Double Poster)' },
];

function ImageUpload({ value, onChange }: { value?: string; onChange: (url: string) => void }) {
  const [up, setUp] = useState(false);
  const beforeUpload: UploadProps['beforeUpload'] = async (file) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { message.error('仅支持 JPG/PNG/WebP/GIF'); return Upload.LIST_IGNORE; }
    setUp(true);
    try { const res = await uploadApi.uploadImage(file); onChange(unwrapResponse<{ url: string }>(res).url); message.success('上传成功'); } catch { }
    finally { setUp(false); }
    return Upload.LIST_IGNORE;
  };
  return (
    <div>
      {value && <img src={value} alt="" style={{ width: '100%', maxHeight: 90, objectFit: 'cover', marginBottom: 4, border: '1px solid #E8E7E3' }} />}
      <Upload accept="image/*" showUploadList={false} beforeUpload={beforeUpload}>
        <Button loading={up} icon={<PictureOutlined />} block size="small">{value ? '替换' : '上传'}</Button>
      </Upload>
    </div>
  );
}

function EditPanel({ module, onSave, onClose }: { module: PageModule | null; onSave: () => void; onClose: () => void }) {
  if (!module) return null;

  const [content, setContent] = useState<any>({ ...module.content });
  const [layout, setLayout] = useState<any>({ ...module.layoutConfig });
  const [style, setStyle] = useState<any>({ ...module.styleConfig });
  const [activeTab, setActiveTab] = useState('content');
  const [saving, setSaving] = useState(false);
  const [pub, setPub] = useState(false);

  const setC = (k: string, v: any) => setContent((c: any) => ({ ...c, [k]: v }));
  const setL = (k: string, v: any) => setLayout((l: any) => ({ ...l, [k]: v }));
  const setS = (k: string, v: any) => setStyle((s: any) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await pageModulesApi.saveDraft({
        id: module.id, pageKey: 'home', moduleType: module.moduleType,
        sortOrder: module.sortOrder, content, layoutConfig: layout,
        styleConfig: style, isVisible: module.isVisible,
      });
      message.success('草稿已保存'); onSave();
    } catch { message.error('保存失败'); }
    finally { setSaving(false); }
  };

  const publishNow = async () => {
    setPub(true);
    try { await save(); await pageModulesApi.publish('home'); message.success('已发布！'); onSave(); }
    catch { message.error('发布失败'); }
    finally { setPub(false); }
  };

  const isHero = module.moduleType === 'hero';
  const isDouble = module.moduleType === 'doublePoster';

  const tabItems = [
    {
      key: 'content', label: '内容',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isHero && (
            <>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>标题</span>
                <Input.TextArea size="small" rows={2} value={content.title || ''} onChange={e => setC('title', e.target.value)} placeholder="东方之形，自有光华。" /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>副标题 / 眉题</span>
                <Input size="small" value={content.subtitle || ''} onChange={e => setC('subtitle', e.target.value)} placeholder="CAMPAIGN / 01" /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>描述</span>
                <Input.TextArea size="small" rows={2} value={content.description || ''} onChange={e => setC('description', e.target.value)} /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>桌面端图片</span>
                <ImageUpload value={content.desktopImage} onChange={url => setC('desktopImage', url)} /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>移动端图片</span>
                <ImageUpload value={content.mobileImage} onChange={url => setC('mobileImage', url)} /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>按钮文字</span>
                <Input size="small" value={content.actionText || ''} onChange={e => setC('actionText', e.target.value)} placeholder="EXPLORE THE COLLECTION" /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>链接地址</span>
                <Input size="small" value={content.linkUrl || ''} onChange={e => setC('linkUrl', e.target.value)} placeholder="/products" /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>Alt 文本</span>
                <Input size="small" value={content.altText || ''} onChange={e => setC('altText', e.target.value)} /></div>
            </>
          )}
          {isDouble && (
            <>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>主图</span>
                <ImageUpload value={content.mainImage} onChange={url => setC('mainImage', url)} /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>细节图</span>
                <ImageUpload value={content.detailImage} onChange={url => setC('detailImage', url)} /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>编号</span>
                <Input size="small" value={content.number || ''} onChange={e => setC('number', e.target.value)} placeholder="02" /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>标签</span>
                <Input size="small" value={content.label || ''} onChange={e => setC('label', e.target.value)} placeholder="FORM" /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>标题</span>
                <Input size="small" value={content.title || ''} onChange={e => setC('title', e.target.value)} placeholder="金环有序" /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>副标题</span>
                <Input size="small" value={content.subtitle || ''} onChange={e => setC('subtitle', e.target.value)} placeholder="02 / FORM" /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>描述</span>
                <Input.TextArea size="small" rows={2} value={content.description || ''} onChange={e => setC('description', e.target.value)} placeholder="线条、比例与轮廓的共同表达。" /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>链接地址</span>
                <Input size="small" value={content.linkUrl || ''} onChange={e => setC('linkUrl', e.target.value)} placeholder="/products?categoryId=17" /></div>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'layout', label: '布局',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div><span style={{ fontSize: 10, color: '#8A7F72' }}>预设</span>
            <Select size="small" style={{ width: '100%' }} value={layout.template || (isHero ? 'overlay' : 'leftBigRightSmall')} onChange={v => setL('template', v)}
              options={isHero
                ? [{ value: 'overlay', label: '全屏覆盖（文字叠加）' }, { value: 'leftTextRightImage', label: '左文右图' }, { value: 'rightTextLeftImage', label: '左图右文' }]
                : [{ value: 'leftBigRightSmall', label: '左大右小 (8:4)' }, { value: 'leftSmallRightBig', label: '左小右大 (4:8)' }, { value: 'equal', label: '1:1 等分 (6:6)' }]
              } />
          </div>
          {isHero && (
            <>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>文字位置</span>
                <Select size="small" style={{ width: '100%' }} value={layout.textPosition || 'overlay'} onChange={v => setL('textPosition', v)}
                  options={[{ value: 'overlay', label: '叠加在图上' }, { value: 'left', label: '左侧' }, { value: 'right', label: '右侧' }]} />
              </div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>模块高度 (px)</span>
                <InputNumber size="small" style={{ width: '100%' }} min={400} max={1200} value={layout.height || 680} onChange={v => setL('height', v)} placeholder="680" /></div>
            </>
          )}
          {isDouble && (
            <div><span style={{ fontSize: 10, color: '#8A7F72' }}>桌面列分布</span>
              <Select size="small" style={{ width: '100%' }} value={layout.desktopColumns || '8-4'} onChange={v => setL('desktopColumns', v)}
                options={[{ value: '8-4', label: '8:4 左大右小' }, { value: '4-8', label: '4:8 左小右大' }, { value: '6-6', label: '6:6 等分' }]} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'settings', label: '设置',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div><span style={{ fontSize: 10, color: '#8A7F72' }}>内部名称</span>
            <Input size="small" value={content.internalName || ''} onChange={e => setC('internalName', e.target.value)}
              placeholder={isHero ? '首页 Hero' : '双海报区块'} /></div>
          <div><span style={{ fontSize: 10, color: '#8A7F72' }}>显示状态</span>
            <Select size="small" style={{ width: '100%' }} value={module.isVisible} onChange={async v => {
              try { await pageModulesApi.toggleVisibility(module.id, v); onSave(); } catch { }
            }} options={[{ value: true, label: '显示' }, { value: false, label: '隐藏' }]} />
          </div>
          <div><span style={{ fontSize: 10, color: '#8A7F72' }}>间距</span>
            <Select size="small" style={{ width: '100%' }} value={style.spacing || 'normal'} onChange={v => setS('spacing', v)}
              options={[{ value: 'compact', label: '紧凑' }, { value: 'normal', label: '标准' }, { value: 'spacious', label: '宽松' }]} />
          </div>

          {/* 图片焦点 */}
          {isHero && (
            <>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>焦点X {style.focusX ?? 50}%</span>
                <Slider size="small" min={0} max={100} value={style.focusX ?? 50} onChange={v => setS('focusX', v)} /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>焦点Y {style.focusY ?? 50}%</span>
                <Slider size="small" min={0} max={100} value={style.focusY ?? 50} onChange={v => setS('focusY', v)} /></div>
            </>
          )}
          {isDouble && (
            <>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>主图焦点X {style.mainFocusX ?? 50}%</span>
                <Slider size="small" min={0} max={100} value={style.mainFocusX ?? 50} onChange={v => setS('mainFocusX', v)} /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>主图焦点Y {style.mainFocusY ?? 50}%</span>
                <Slider size="small" min={0} max={100} value={style.mainFocusY ?? 50} onChange={v => setS('mainFocusY', v)} /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>细节图焦点X {style.detailFocusX ?? 50}%</span>
                <Slider size="small" min={0} max={100} value={style.detailFocusX ?? 50} onChange={v => setS('detailFocusX', v)} /></div>
              <div><span style={{ fontSize: 10, color: '#8A7F72' }}>细节图焦点Y {style.detailFocusY ?? 50}%</span>
                <Slider size="small" min={0} max={100} value={style.detailFocusY ?? 50} onChange={v => setS('detailFocusY', v)} /></div>
            </>
          )}

          <div style={{ borderTop: '1px solid #E8E7E3', paddingTop: 8, marginTop: 4 }}>
            <Button size="small" icon={<CopyOutlined />} block style={{ marginBottom: 4 }}
              onClick={async () => { try { await pageModulesApi.duplicate(module.id); message.success('已复制'); onSave(); } catch { } }}>
              复制模块
            </Button>
            <Popconfirm title="确定删除此模块？" onConfirm={async () => { try { await pageModulesApi.remove(module.id); message.success('已删除'); onClose(); onSave(); } catch { } }}>
              <Button size="small" danger icon={<DeleteOutlined />} block>删除模块</Button>
            </Popconfirm>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13 }}>编辑 {isHero ? '🖼️ Hero' : '🖼️🖼️ 双海报'}</h4>
        <Button type="text" size="small" onClick={onClose}>✕</Button>
      </div>
      <Tabs size="small" activeKey={activeTab} onChange={setActiveTab} items={tabItems}
        style={{ flex: 1, overflow: 'auto' }}
        tabBarStyle={{ marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 6, paddingTop: 10, borderTop: '1px solid #E8E7E3' }}>
        <Button onClick={save} loading={saving} size="small" style={{ flex: 1 }}>保存草稿</Button>
        <Button type="primary" onClick={publishNow} loading={pub} icon={<SendOutlined />} size="small" style={{ flex: 1 }}>发布</Button>
      </div>
    </div>
  );
}

export default function HomepageConfig() {
  const { modules, loading, refresh } = useAdminModules('home');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [previewKey, setPreviewKey] = useState(0);

  const selected = modules.find(m => m.id === selectedId) || null;
  const iframeWidth = DEVICES[device];

  const addModule = async (type: string) => {
    const defaultContent = type === 'hero' ? {
      title: '新 Hero 标题', subtitle: 'CAMPAIGN / NEW', description: '',
      desktopImage: '', mobileImage: '', actionText: '探索更多', linkUrl: '/products', altText: '',
    } : {
      mainImage: '', detailImage: '', number: '00', label: 'NEW',
      title: '新双海报', subtitle: '00 / NEW', description: '添加描述文案', linkUrl: '/products',
    };
    const defaultLayout = type === 'hero'
      ? { template: 'overlay', textPosition: 'overlay' }
      : { template: 'leftBigRightSmall', desktopColumns: '8-4' };
    try {
      await pageModulesApi.saveDraft({
        pageKey: 'home', moduleType: type, sortOrder: modules.length + 1,
        content: defaultContent, layoutConfig: defaultLayout,
        styleConfig: type === 'hero' ? { focusX: 50, focusY: 50 } : { mainFocusX: 50, mainFocusY: 50, detailFocusX: 50, detailFocusY: 50 },
      });
      refresh();
    } catch { message.error('添加失败'); }
  };
  const move = async (id: number, dir: -1 | 1) => {
    const idx = modules.findIndex(m => m.id === id);
    if (idx < 0 || idx + dir < 0 || idx + dir >= modules.length) return;
    const items = [...modules]; [items[idx], items[idx + dir]] = [items[idx + dir], items[idx]];
    try { await pageModulesApi.reorder(items.map((m, i) => ({ id: m.id, sortOrder: i + 1 }))); refresh(); } catch { }
  };
  const toggleVis = async (id: number, vis: boolean) => { try { await pageModulesApi.toggleVisibility(id, vis); refresh(); } catch { } };
  const dup = async (id: number) => { try { await pageModulesApi.duplicate(id); refresh(); } catch { } };
  const del = async (id: number) => { try { await pageModulesApi.remove(id); refresh(); setSelectedId(null); } catch { } };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;

  return (
    <div style={{ height: 'calc(100vh - 64px - 48px)', display: 'flex', flexDirection: 'column', background: '#F5F2ED' }}>
      <div style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #E8E7E3', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>页面构建器</span>
        <div style={{ display: 'flex', border: '1px solid #E8E7E3', borderRadius: 3, overflow: 'hidden' }}>
          {(Object.keys(DEVICES) as Device[]).map(d => (
            <button key={d} onClick={() => setDevice(d)} style={{ padding: '3px 10px', border: 'none', cursor: 'pointer', fontSize: 11, background: device === d ? '#2c2824' : '#fff', color: device === d ? '#fff' : '#8A7F72' }}>
              {d === 'desktop' ? '桌面' : d === 'tablet' ? '平板' : '手机'} {DEVICES[d]}
            </button>
          ))}
        </div>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => { refresh(); setPreviewKey(k => k + 1); }}>刷新</Button>
        <div style={{ flex: 1 }} />
        <Button size="small" type="primary" icon={<SendOutlined />} onClick={async () => { try { await pageModulesApi.publish('home'); message.success('已发布'); refresh(); } catch { } }}>一键发布</Button>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 200, flexShrink: 0, background: '#fff', borderRight: '1px solid #E8E7E3', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #E8E7E3', fontSize: 11, color: '#8A7F72', fontWeight: 500 }}>模块列表 ({modules.length})</div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {modules.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#8A7F72', fontSize: 12 }}>
                <p style={{ marginBottom: 12 }}>暂无模块，首页将使用默认内容</p>
                <p style={{ fontSize: 11, color: '#BFB8A8' }}>点击下方「添加模块」开始构建</p>
              </div>
            ) : (
              modules.map((m, idx) => (
              <div key={m.id} onClick={() => setSelectedId(m.id)}
                style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #F5F2ED', background: selectedId === m.id ? '#F5F2ED' : '#fff', borderLeft: selectedId === m.id ? '3px solid #B8944E' : '3px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, color: '#8A7F72' }}>{idx + 1}.</span>
                  <span style={{ fontSize: 11, flex: 1 }}>{m.moduleType === 'hero' ? '🖼️ Hero' : '🖼️🖼️ 双海报'}</span>
                  {!m.isVisible && <EyeInvisibleOutlined style={{ fontSize: 10, color: '#ccc' }} />}
                </div>
                {selectedId === m.id && (
                  <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                    <Button size="small" type="text" disabled={idx === 0} icon={<ArrowUpOutlined />} onClick={e => { e.stopPropagation(); move(m.id, -1); }} />
                    <Button size="small" type="text" disabled={idx === modules.length - 1} icon={<ArrowDownOutlined />} onClick={e => { e.stopPropagation(); move(m.id, 1); }} />
                    <Button size="small" type="text" icon={<CopyOutlined />} onClick={e => { e.stopPropagation(); dup(m.id); }} />
                    <Button size="small" type="text" icon={m.isVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />} onClick={e => { e.stopPropagation(); toggleVis(m.id, !m.isVisible); }} />
                    <Popconfirm title="删除？" onConfirm={() => del(m.id)}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
                  </div>
                )}
              </div>
            ))
            )}
          </div>
          <div style={{ padding: 6, borderTop: '1px solid #E8E7E3' }}>
            <Select size="small" style={{ width: '100%' }} placeholder="+ 添加模块" onChange={v => addModule(v)} value={undefined} options={MODULE_TYPES} />
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', background: '#E8E4DD', display: 'flex', justifyContent: 'center', padding: 10 }}>
          <div style={{ width: iframeWidth, height: '100%', minHeight: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', background: '#fff' }}>
            <iframe key={previewKey} src="/" style={{ width: '100%', height: '100%', border: 'none' }} title="预览" />
          </div>
        </div>
        <div style={{ width: 300, flexShrink: 0, background: '#fff', borderLeft: '1px solid #E8E7E3', overflow: 'auto', padding: 14 }}>
          {selected ? <EditPanel module={selected} onSave={refresh} onClose={() => setSelectedId(null)} /> : <div style={{ textAlign: 'center', paddingTop: 60, color: '#8A7F72', fontSize: 12 }}>点击左侧模块编辑</div>}
        </div>
      </div>
    </div>
  );
}

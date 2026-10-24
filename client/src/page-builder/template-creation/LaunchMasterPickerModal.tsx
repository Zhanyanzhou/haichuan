import { useState, type CSSProperties } from "react";
import { Button, Modal, theme } from "antd";
import type { TemplateDefinitionV2 } from "../template-definition/generated/templateDefinition.generated";
import {
  instantiateLaunchTemplateMaster,
  LAUNCH_TEMPLATE_MASTER_ENTRIES,
  type LaunchTemplateMasterEntry,
} from "./launchTemplateSet";
import "./LaunchMasterPickerModal.css";

/**
 * 首发七母模板的选取入口：把 `launchTemplateSet.ts` 里的七份定义交给模板编辑器。
 *
 * 与七步向导（`NewTemplateRecipeModal`）的分工：向导从零配一块新模板，这里从已写好的
 * `TemplateDefinitionV2` 起步——正是 `launch-template-set.md` 第 5 节说的"直接改机器合同"
 * 那条路。两条路最终都汇进编辑器的 `dynamic-new` 分支，不各自造一条创建链路。
 *
 * 本面板只做选择：选中后调用 `onSelect` 把派生出的定义交出去，自己不写任何东西。
 */
export default function LaunchMasterPickerModal({ onCancel, onSelect }: {
  onCancel: () => void;
  onSelect: (definition: TemplateDefinitionV2) => void;
}) {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<LaunchTemplateMasterEntry["role"] | null>(null);
  // 动态挂载的 Modal 没有稳定 trigger 节点，显式记住本次打开前的键盘位置（同 NewTemplateRecipeModal）。
  const [trigger] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const close = () => {
    setOpen(false);
    onCancel();
    // 调用方会连同本面板一起卸载，关闭动画与 afterClose 都不保证跑得到，键盘位置得在这里自己还回去。
    requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
  };
  const begin = () => {
    if (!selected) return;
    const definition = instantiateLaunchTemplateMaster(selected);
    if (!definition) return;
    // 不在这里 setOpen(false)：调用方要等目标真正打开（可能隔着未保存确认框）才卸载本面板，
    // 否则用户在那里点"取消"就成了"面板没了、什么都没发生"。
    onSelect(definition);
  };
  return <Modal open={open} title="选择首发母版" centered width={1080} maskClosable={false}
    className="launch-master-picker"
    style={{ maxWidth: "calc(100vw - 24px)", "--picker-bg": token.colorBgContainer, "--picker-ink": token.colorText,
      "--picker-border": token.colorBorder, "--picker-muted": token.colorTextSecondary,
      "--picker-fill": token.colorFillSecondary, "--picker-primary": token.colorPrimary } as CSSProperties}
    onCancel={close}
    afterClose={() => { requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); }); }}
    footer={<div className="launch-master-picker__footer">
      <Button aria-label="取消" onClick={close}>取消</Button>
      <Button type="primary" aria-label="用这块母版开始" disabled={!selected} onClick={begin}>用这块母版开始</Button>
    </div>}>
    <p className="launch-master-picker__intro">
      每块母版是一份可以直接精修的结构起点：进入模板设计后仍可增删槽位、调整响应式与样式；未主动保存前不会产生任何模板草稿。
    </p>
    <ul className="launch-master-picker__list">
      {LAUNCH_TEMPLATE_MASTER_ENTRIES.map((entry) => <li key={entry.role}>
        <button type="button" className="launch-master-picker__card" aria-label={`母版 ${entry.name}`}
          aria-pressed={selected === entry.role} onClick={() => setSelected(entry.role)}>
          <span className="launch-master-picker__role">{entry.roleLabel}</span>
          <strong className="launch-master-picker__name">{entry.name}</strong>
          <span className="launch-master-picker__meta">{entry.layoutType} · 桌面画幅 {entry.desktopRatio}</span>
          <span className="launch-master-picker__slots">{entry.slotSummary}</span>
          <span className="launch-master-picker__why">{entry.description}</span>
        </button>
      </li>)}
    </ul>
    <p className="launch-master-picker__note">
      这七块是母版定义，尚未完成逐块上线验收，也不会自动出现在模板目录里。同一账号下同名模板只能有一份——重复从同一块母版起步时，需要在保存草稿前改名。
    </p>
  </Modal>;
}

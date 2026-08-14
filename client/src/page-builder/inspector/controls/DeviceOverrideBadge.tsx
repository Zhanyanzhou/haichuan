/**
 * DeviceOverrideBadge.tsx — 响应式「继承 / 覆盖」指示器。
 *
 * 「空值即继承」模型的 UI 呈现：
 * - mobile 键为空：显示继承值摘要 + [单独设置手机端]（首写拷贝继承值为初值）
 * - mobile 键非空：显示 [恢复继承]（清空 mobile 键）
 * - desktop 档不渲染本组件。
 */
interface DeviceOverrideBadgeProps {
  /** 继承来源的展示文案，如 "继承电脑端海报" */
  label: string;
  /** 当前是否处于覆盖态（mobile 键非空） */
  overridden: boolean;
  /** 覆盖态时恢复继承（清空 mobile 键） */
  onInherit: () => void;
  /** 继承态时开始单独设置（拷贝继承值为初值） */
  onOverride: () => void;
  /** 继承值是否存在（不存在时仍允许单独设置） */
  hasBaseValue?: boolean;
}

export default function DeviceOverrideBadge({
  label,
  overridden,
  onInherit,
  onOverride,
  hasBaseValue = true,
}: DeviceOverrideBadgeProps) {
  return (
    <div
      className={`homepage-editor__device-override${overridden ? " is-overridden" : ""}`}
      role="status"
    >
      {overridden ? (
        <>
          <span>已覆盖电脑端设置</span>
          <button type="button" onClick={onInherit}>
            恢复继承
          </button>
        </>
      ) : (
        <>
          <span>{hasBaseValue ? label : "尚未设置"}</span>
          <button type="button" onClick={onOverride}>
            单独设置手机端
          </button>
        </>
      )}
    </div>
  );
}

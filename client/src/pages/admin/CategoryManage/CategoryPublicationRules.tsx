import { useState } from "react";
import { Button, Checkbox, Radio, Space } from "antd";
import type { CategoryPublicationRule } from "@/types";

const sizeRules = [
  { value: "RING_SIZE", label: "戒指圈口" },
  { value: "INNER_DIAMETER", label: "手镯内径或圈口" },
  { value: "CHAIN_LENGTH", label: "链长或可调范围" },
] as const;

const factRules: { value: CategoryPublicationRule; label: string }[] = [
  { value: "PRECIOUS_METAL", label: "贵金属材质和纯度" },
  { value: "GOLD_WEIGHT", label: "实际金重" },
  { value: "GEMSTONE", label: "主石与镶托材质" },
  { value: "GEM_DISCLOSURE", label: "宝石来源与处理说明" },
  { value: "GEM_CARAT", label: "主石克拉" },
  { value: "GEM_GRADING", label: "主石净度等级" },
];

function matchRules(left: CategoryPublicationRule[], right: CategoryPublicationRule[]) {
  return left.length === right.length && left.every((rule) => right.includes(rule));
}

export default function CategoryPublicationRules({
  saved,
  disabled,
  onDirtyChange,
  onSave,
}: Readonly<{
  saved?: CategoryPublicationRule[] | null;
  disabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (rules: CategoryPublicationRule[], expected: CategoryPublicationRule[] | null) => Promise<boolean>;
}>) {
  const current = saved ?? [];
  const [draft, setDraft] = useState<{ base: CategoryPublicationRule[]; rules: CategoryPublicationRule[] }>();
  const rules = draft?.rules ?? current;
  const groupOnly = rules.includes("GROUP_ONLY");
  const conflicted = Boolean(draft && !matchRules(draft.base, current));
  const selectedSize = sizeRules.find(({ value }) => rules.includes(value))?.value ?? "NONE";

  function changeRules(next: CategoryPublicationRule[]) {
    const base = draft?.base ?? current;
    const dirty = !matchRules(next, base);
    setDraft(dirty ? { base, rules: next } : undefined);
    onDirtyChange(dirty);
  }

  function discardDraft() {
    setDraft(undefined);
    onDirtyChange(false);
  }

  function toggleRule(rule: CategoryPublicationRule, checked: boolean) {
    changeRules(checked ? [...rules, rule] : rules.filter((value) => value !== rule));
  }

  return (
    <section className="cat-editor__section" aria-labelledby="category-publication-heading">
      <h2 id="category-publication-heading">商品发布规则</h2>
      <p>适用于直接归入此分类的商品。发布时会检查新要求，已采用新规则的在售商品后续保存或调整库存时也会复核。</p>
      <Radio.Group
        aria-label="分类用途"
        value={groupOnly ? "group" : "product"}
        disabled={disabled || conflicted}
        onChange={(event) => changeRules(event.target.value === "group" ? ["GROUP_ONLY"] : [])}
      >
        <Space direction="vertical">
          <Radio value="product">允许商品上架</Radio>
          <Radio value="group">仅组织分类</Radio>
        </Space>
      </Radio.Group>
      {!groupOnly ? (
        <>
          <Checkbox
            checked={rules.includes("CERTIFICATE")}
            disabled={disabled || conflicted}
            onChange={(event) => toggleRule("CERTIFICATE", event.target.checked)}
          >
            对客发布须有有效鉴定证书
          </Checkbox>
          <fieldset className="cat-editor__rule-field">
            <legend>直接销售的尺寸要求</legend>
            <Radio.Group
              value={selectedSize}
              disabled={disabled || conflicted}
              onChange={(event) => changeRules([
                ...rules.filter((rule) => !sizeRules.some(({ value }) => value === rule)),
                ...(event.target.value === "NONE" ? [] : [event.target.value]),
              ])}
            >
              <Space direction="vertical">
                <Radio value="NONE">按商品情况填写</Radio>
                {sizeRules.map(({ value, label }) => <Radio key={value} value={value}>{label}</Radio>)}
              </Space>
            </Radio.Group>
          </fieldset>
          <fieldset className="cat-editor__rule-field">
            <legend>直接销售的必填资料</legend>
            <Space direction="vertical">
              {factRules.map(({ value, label }) => (
                <Checkbox
                  key={value}
                  checked={rules.includes(value)}
                  disabled={disabled || conflicted}
                  onChange={(event) => toggleRule(value, event.target.checked)}
                >
                  {label}
                </Checkbox>
              ))}
            </Space>
          </fieldset>
        </>
      ) : null}
      {conflicted ? <p role="alert">此分类的发布规则已更新。请载入最新规则后重新调整。</p> : null}
      {draft && !conflicted ? <p role="status">规则有未保存的修改</p> : null}
      <Space wrap>
        <Button
          type="primary"
          disabled={disabled || !draft || conflicted}
          onClick={async () => {
            if (draft && await onSave(rules, draft.base.length ? draft.base : null)) discardDraft();
          }}
        >
          保存发布规则
        </Button>
        {draft ? (
          <Button disabled={disabled} onClick={discardDraft}>
            {conflicted ? "载入最新规则" : "撤销规则修改"}
          </Button>
        ) : null}
      </Space>
    </section>
  );
}

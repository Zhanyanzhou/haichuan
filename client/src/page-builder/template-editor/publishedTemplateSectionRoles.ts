import { create } from "zustand";

import type { TemplateCatalogItemResource } from "@/services/clients/dynamicTemplateClient";
import type { TemplateDefinitionV2 } from "@/page-builder/template-definition";

type PublishedTemplateSectionRoleState = {
  rolesByTemplateId: Record<string, string>;
  remember: (entries: Array<{ templateId: string; sectionRole?: string | null }>) => void;
};

/** 目录卡片已经解析出的区块角色。页面结构按 templateId 回退到这里，与组件库使用同一显示名。 */
export const usePublishedTemplateSectionRoles = create<PublishedTemplateSectionRoleState>((set) => ({
  rolesByTemplateId: {},
  remember(entries) {
    set((state) => {
      let changed = false;
      const next = { ...state.rolesByTemplateId };
      for (const entry of entries) {
        if (!entry.templateId || !entry.sectionRole) continue;
        if (next[entry.templateId] === entry.sectionRole) continue;
        next[entry.templateId] = entry.sectionRole;
        changed = true;
      }
      return changed ? { rolesByTemplateId: next } : state;
    });
  },
}));

function sectionRoleOf(definition?: TemplateDefinitionV2 | null) {
  return definition?.metadata.sectionRole ?? definition?.templateRecipe?.sectionRole;
}

export function rememberCatalogTemplateRoles(items: TemplateCatalogItemResource[]) {
  usePublishedTemplateSectionRoles.getState().remember(items.flatMap((item) => {
    if (item.kind === "published") {
      return [{
        templateId: item.template.templateId,
        sectionRole: sectionRoleOf(item.template.definition),
      }];
    }
    return [{
      templateId: item.template.templateId,
      sectionRole: sectionRoleOf(item.template.draft?.definition),
    }];
  }));
}

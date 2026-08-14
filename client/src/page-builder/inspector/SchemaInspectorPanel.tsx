/**
 * SchemaInspectorPanel.tsx — 由模块 Schema 驱动的统一编辑面板。
 *
 * 结构：TopBar（模块上下文）→ 完成度横幅 →
 *       按层排序的分区（内容→布局→样式→交互，折叠区默认收起）→
 *       FooterBar（撤销本模块修改 / 保存整页草稿）。
 * 与 InspectorPanel 的三级分派配合：仅在 registry 命中时渲染。
 */
import { useMemo } from "react";
import { message, Modal } from "antd";
import { useHomepagePuck } from "../../pages/admin/HomepageConfig/editor-store";
import {
  cloneModuleProps,
  getModuleDisplayName,
} from "../../pages/admin/HomepageConfig/editor-utils";
import InspectorTopBar from "./InspectorTopBar";
import InspectorFooterBar from "./InspectorFooterBar";
import SectionRenderer from "./SectionRenderer";
import FieldRenderer, { isFieldVisible } from "./FieldRenderer";
import ContractStatusBanner from "./ContractStatusBanner";
import { useInspectorModuleEditor } from "./useInspectorModuleEditor";
import {
  INSPECTOR_LAYER_ORDER,
  type InspectorContext,
  type ModuleInspectorSchema,
} from "./schema/types";

interface SchemaInspectorPanelProps {
  schema: ModuleInspectorSchema;
}

export default function SchemaInspectorPanel({
  schema,
}: SchemaInspectorPanelProps) {
  const editor = useInspectorModuleEditor();
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);

  const ctx: InspectorContext | null = useMemo(
    () =>
      editor
        ? {
            props: editor.props,
            device: editor.device,
            viewportWidth: viewports.current.width,
          }
        : null,
    [editor?.props, editor?.device, viewports.current.width],
  );

  const status = useMemo(
    () => (schema.evaluate && editor ? schema.evaluate(editor.props) : null),
    [schema, editor?.props],
  );

  if (!editor || !ctx) return null;

  const sections = [...schema.sections]
    .filter((section) => !section.visibleWhen || section.visibleWhen(ctx))
    .sort(
      (a, b) =>
        INSPECTOR_LAYER_ORDER.indexOf(a.layer) -
        INSPECTOR_LAYER_ORDER.indexOf(b.layer),
    );

  const renameModule = (moduleName: string) => {
    editor.update({ moduleName });
  };

  const removeModule = () => {
    const content = appData.content as Array<{
      type: string;
      props: Record<string, any>;
    }>;
    const index = content.findIndex(
      (item) => item.props?.id === editor.props.id,
    );
    if (index < 0) return;
    if (content[index].props?.locked) {
      message.info("此模块已锁定，不能删除");
      return;
    }
    Modal.confirm({
      title: `删除“${getModuleDisplayName(editor.moduleType, editor.props)}”？`,
      content: "删除后可从模块库重新添加；尚未发布的修改可通过版本记录恢复。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        dispatch({
          type: "setData",
          data: {
            ...appData,
            content: content.filter((_, i) => i !== index),
          },
        });
        dispatch({ type: "setUi", ui: { itemSelector: null } });
      },
    });
  };

  const toggleVisibility = () => {
    editor.update({ isVisible: editor.props.isVisible === false });
  };

  const resetToDefaults = () => {
    const defaults = schema.defaults
      ? cloneModuleProps(schema.defaults)
      : undefined;
    if (!defaults) {
      message.info("该模块暂不支持恢复默认");
      return;
    }
    Modal.confirm({
      title: "恢复默认设置？",
      content: "当前模块的全部配置将重置为模板默认值，此操作可通过「撤销修改」回退。",
      okText: "恢复默认",
      cancelText: "取消",
      onOk: () => editor.update({ ...defaults, id: editor.props.id }),
    });
  };

  return (
    <section
      className="homepage-editor__inspector"
      data-active-device={editor.device}
      data-module-type={editor.moduleType}
      aria-label="模块属性"
    >
      <InspectorTopBar
        displayName={schema.displayName}
        moduleName={
          typeof editor.props.moduleName === "string"
            ? editor.props.moduleName
            : ""
        }
        deviceLabel={
          schema.sections.every((section) =>
            section.fields.every((field) => !field.device || field.device === "shared"),
          )
            ? "全设备"
            : editor.device === "mobile"
              ? "移动端"
              : "桌面端"
        }
        dirty={editor.dirty}
        onClose={editor.close}
        onRename={renameModule}
        actions={[
          {
            key: "duplicate",
            label: "复制模块",
            onClick: () => message.info("复制模块将在后续版本提供"),
          },
          {
            key: "visibility",
            label:
              editor.props.isVisible === false ? "取消隐藏模块" : "隐藏模块",
            onClick: toggleVisibility,
          },
          { key: "reset", label: "恢复默认", onClick: resetToDefaults },
          { key: "remove", label: "删除模块", danger: true, onClick: removeModule },
        ]}
      />

      <div className="homepage-editor__inspector-scroll">
        {schema.purpose ? (
          <p className="homepage-editor__properties-helper">{schema.purpose}</p>
        ) : null}
        {status ? <ContractStatusBanner status={status} /> : null}

        {sections.map((section) => (
          <SectionRenderer
            key={section.id}
            title={section.title}
            description={section.description}
            collapsible={section.collapsible}
            defaultCollapsed={section.defaultCollapsed}
          >
            {section.fields
              .filter(
                (field) =>
                  isFieldVisible(field, ctx) &&
                  (!field.device ||
                    field.device === "shared" ||
                    field.device === editor.device),
              )
              .map((field, fieldIndex) => (
                <FieldRenderer
                  key={`${section.id}-${field.key}-${fieldIndex}`}
                  def={field}
                  ctx={ctx}
                  update={editor.update}
                />
              ))}
          </SectionRenderer>
        ))}
      </div>

      <InspectorFooterBar dirty={editor.dirty} onRevert={editor.revert} />
    </section>
  );
}

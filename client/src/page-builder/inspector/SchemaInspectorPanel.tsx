/**
 * SchemaInspectorPanel.tsx — 由模块 Schema 驱动的统一编辑面板。
 *
 * 结构：TopBar（当前实例）→
 *       连续任务分区（素材→内容→跳转→构图，全部直接展示）→
 *       FooterBar（手动保存整页草稿）。
 * 与 InspectorPanel 的三级分派配合：仅在 registry 命中时渲染。
 */
import { DesktopOutlined, MobileOutlined } from "@ant-design/icons";
import { message, Modal } from "antd";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import { useHomepagePuck } from "../../pages/admin/HomepageConfig/editor-store";
import {
  cloneModuleProps,
  getModuleDisplayName,
} from "../../pages/admin/HomepageConfig/editor-utils";
import InspectorTopBar from "./InspectorTopBar";
import InspectorFooterBar from "./InspectorFooterBar";
import SectionRenderer from "./SectionRenderer";
import FieldRenderer, { isFieldVisible } from "./FieldRenderer";
import { useInspectorModuleEditor } from "./useInspectorModuleEditor";
import {
  type FieldDef,
  type InspectorContext,
  type InspectorLayer,
  type ModuleInspectorSchema,
} from "./schema/types";

interface SchemaInspectorPanelProps {
  schema: ModuleInspectorSchema;
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSaveDraft: () => void;
}

type InspectorTaskGroup =
  "content" | "media" | "link" | "composition" | "feature";

interface VisibleFieldEntry {
  sectionId: string;
  field: FieldDef;
}

const TASK_GROUP_ORDER: InspectorTaskGroup[] = [
  "media",
  "content",
  "link",
  "composition",
  "feature",
];

const TASK_GROUP_META: Record<
  InspectorTaskGroup,
  { label: string; description: string }
> = {
  media: {
    label: "图片素材",
    description: "替换图片并检查双端裁切、清晰度与替代文字。",
  },
  content: {
    label: "文字内容",
    description: "先完成页面上真正展示的文字，修改会立即同步到画布。",
  },
  link: {
    label: "行动与关联",
    description: "设置当前区块的行动入口与站内去向。",
  },
  composition: {
    label: "构图与设备素材",
    description: "仅使用模板允许的布局、留白和视觉预设。",
  },
  feature: {
    label: "模板专属功能",
    description: "仅本模板具备的受控能力，修改会立即同步到画布。",
  },
};

function getTaskGroup(
  field: FieldDef,
  layer: InspectorLayer,
): InspectorTaskGroup {
  if (layer === "feature") {
    return "feature";
  }
  if (
    field.control === "media" ||
    layer === "media" ||
    field.key.toLowerCase().includes("alt")
  ) {
    return "media";
  }
  if (field.control === "linkTarget" || layer === "interaction") {
    return "link";
  }
  if (layer === "layout" || layer === "style") {
    return "composition";
  }
  return "content";
}

export default function SchemaInspectorPanel({
  schema,
  hasUnsavedChanges,
  saving,
  onSaveDraft,
}: SchemaInspectorPanelProps) {
  const editor = useInspectorModuleEditor();
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);

  const ctx: InspectorContext | null = editor
    ? {
        props: editor.props,
        device: editor.device,
        viewportWidth: viewports.current.width,
      }
    : null;

  if (!editor || !ctx) return null;

  const content = appData.content as Array<{
    type: string;
    props: Record<string, any>;
  }>;

  const visibleFields = schema.sections
    .filter((section) => !section.visibleWhen || section.visibleWhen(ctx))
    .flatMap((section) =>
      section.fields
        .filter(
          (field) =>
            field.key !== "moduleName" &&
            isFieldVisible(field, ctx) &&
            (!field.device ||
              field.device === "shared" ||
              field.device === editor.device),
        )
        .map((field) => ({
          sectionId: section.id,
          layer: section.layer,
          field,
        })),
    );

  const taskGroups = TASK_GROUP_ORDER.map((group) => ({
    group,
    entries: visibleFields
      .filter((entry) => getTaskGroup(entry.field, entry.layer) === group)
      .map<VisibleFieldEntry>(({ layer: _layer, ...entry }) => entry),
  })).filter((item) => item.entries.length > 0);

  const deviceMediaFields = schema.sections
    .flatMap((section) => section.fields)
    .filter((field) => field.control === "media");
  const hasDesktopMedia = deviceMediaFields.some(
    (field) =>
      !field.device || field.device === "shared" || field.device === "desktop",
  );
  const hasMobileMedia = deviceMediaFields.some(
    (field) =>
      !field.device || field.device === "shared" || field.device === "mobile",
  );
  const hasDeviceMedia = deviceMediaFields.length > 0;

  const setInspectorDevice = (device: "desktop" | "mobile") => {
    const preset = RESPONSIVE_CANVAS[device];
    dispatch({
      type: "setUi",
      ui: {
        viewports: {
          ...viewports,
          current: { width: preset.width, height: preset.height },
        },
      },
    });
  };

  const removeModule = () => {
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
      content: "删除后可通过顶部撤销恢复；保存草稿前不会影响前台页面。",
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
      content:
        "当前模块的全部配置将重置为模板默认值，此操作可通过「撤销修改」回退。",
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
      aria-label="模块设置"
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
            section.fields.every(
              (field) => !field.device || field.device === "shared",
            ),
          )
            ? "全设备"
            : editor.device === "mobile"
              ? "移动端"
              : "桌面端"
        }
        dirty={hasUnsavedChanges}
        onClose={editor.close}
        actions={[
          ...(editor.dirty
            ? [
                {
                  key: "revert",
                  label: "撤销本区修改",
                  onClick: editor.revert,
                },
              ]
            : []),
          // 系统区块(全局设置/业务功能区)只读或仅提供管理入口,不给破坏性动作
          ...(schema.systemBlock
            ? []
            : [
                {
                  key: "visibility",
                  label:
                    editor.props.isVisible === false
                      ? "取消隐藏模块"
                      : "隐藏模块",
                  onClick: toggleVisibility,
                },
                { key: "reset", label: "恢复默认", onClick: resetToDefaults },
                {
                  key: "remove",
                  label: "删除模块",
                  danger: true,
                  onClick: removeModule,
                },
              ]),
        ]}
      />

      {/* 完成度横幅:让 evaluate 契约检查真正可见,编辑不迷失 */}
      {schema.evaluate
        ? (() => {
            const status = schema.evaluate(editor.props);
            const ratio = status.total
              ? Math.round((status.completed / status.total) * 100)
              : 100;
            const blocked = status.errors.length > 0;
            return (
              <div
                className={`homepage-editor__module-status${blocked ? " is-blocked" : " is-ok"}`}
                role="status"
                aria-label={`完成度 ${status.completed}/${status.total}`}
              >
                <span
                  className="homepage-editor__module-status-meter"
                  aria-hidden="true"
                >
                  <i style={{ width: `${ratio}%` }} />
                </span>
                <strong>
                  {blocked
                    ? `待完善 ${status.total - status.completed} 项`
                    : "内容齐备"}
                </strong>
                {blocked ? (
                  <span>
                    {status.errors[0]}
                    {status.errors.length > 1
                      ? ` 等 ${status.errors.length} 项`
                      : ""}
                  </span>
                ) : status.warnings.length > 0 ? (
                  <span>{status.warnings[0]}</span>
                ) : null}
              </div>
            );
          })()
        : null}

      <div className="homepage-editor__inspector-scroll">
        {taskGroups.map(({ group, entries }) => {
          const meta = TASK_GROUP_META[group];
          const groupTitle = schema.groupTitles?.[group] ?? meta.label;
          return (
            <div
              key={group}
              className="homepage-editor__task-group"
              data-task-group={group}
            >
              <SectionRenderer
                title={groupTitle}
                description={meta.description}
              >
                {group === "media" && hasDeviceMedia ? (
                  <div
                    className="homepage-editor__media-device-switcher"
                    role="group"
                    aria-label="切换图片编辑设备"
                  >
                    <button
                      type="button"
                      className={editor.device === "desktop" ? "is-active" : ""}
                      aria-pressed={editor.device === "desktop"}
                      disabled={!hasDesktopMedia}
                      onClick={() => setInspectorDevice("desktop")}
                    >
                      <DesktopOutlined />
                      <span>桌面端</span>
                    </button>
                    <button
                      type="button"
                      className={editor.device === "mobile" ? "is-active" : ""}
                      aria-pressed={editor.device === "mobile"}
                      disabled={!hasMobileMedia}
                      onClick={() => setInspectorDevice("mobile")}
                    >
                      <MobileOutlined />
                      <span>移动端</span>
                    </button>
                  </div>
                ) : null}
                {entries.map((entry, fieldIndex) => (
                  <div
                    key={`${entry.sectionId}-${entry.field.key}-${fieldIndex}`}
                    className="homepage-editor__task-field"
                  >
                    <FieldRenderer
                      def={entry.field}
                      ctx={ctx}
                      update={editor.update}
                    />
                  </div>
                ))}
              </SectionRenderer>
            </div>
          );
        })}
      </div>

      <InspectorFooterBar
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        onSaveDraft={onSaveDraft}
      />
    </section>
  );
}

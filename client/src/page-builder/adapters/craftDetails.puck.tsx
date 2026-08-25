import CraftDetailsBlock from "@/components/blocks/CraftDetailsBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";
import {
  createContentTemplateMarker,
  type ContentTemplateMarker,
} from "../generated/contentTemplates.generated";

export interface CraftDetailsPuckProps {
  eyebrow: string;
  title: string;
  body: string;
  leadImage: string;
  leadAltText: string;
  detailImageOne: string;
  detailOneAltText: string;
  detailImageTwo: string;
  detailTwoAltText: string;
  leadImageRatio: string;
  detailOneRatio: string;
  detailTwoRatio: string;
  leadFocusX: number;
  leadFocusY: number;
  detailOneFocusX: number;
  detailOneFocusY: number;
  detailTwoFocusX: number;
  detailTwoFocusY: number;
  bgColor: string;
  __contentTemplate?: ContentTemplateMarker;
  locked?: boolean;
}

export const craftDetailsPuckConfig = {
  render: (props: CraftDetailsPuckProps) => (
    <CraftDetailsBlock module={convertPuckProps("工艺细节", props as any)!} editMode />
  ),
  defaultProps: {
    eyebrow: "CRAFT STUDY",
    title: "工艺细节",
    body: "请填写已经核验的材质、结构或制作说明。",
    leadImage: "",
    leadAltText: "",
    detailImageOne: "",
    detailOneAltText: "",
    detailImageTwo: "",
    detailTwoAltText: "",
    leadImageRatio: "3:2",
    detailOneRatio: "1:1",
    detailTwoRatio: "1:1",
    leadFocusX: 50,
    leadFocusY: 50,
    detailOneFocusX: 50,
    detailOneFocusY: 50,
    detailTwoFocusX: 50,
    detailTwoFocusY: 50,
    bgColor: "#FFFFFF",
    __contentTemplate: createContentTemplateMarker("工艺细节"),
    locked: false,
  } satisfies CraftDetailsPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};

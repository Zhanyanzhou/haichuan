import TestimonialBlock from "@/components/blocks/TestimonialBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface TestimonialPuckProps {
  title: string;
  subtitle: string;
  testimonials: Array<{ name: string; meta: string; content: string; image: string; authorizationConfirmed: boolean }>;
  bgColor: string;
  locked?: boolean;
}

export const testimonialPuckConfig = {
  render: (props: TestimonialPuckProps) => {
    const module = convertPuckProps("真实评价与实拍", props);
    return <TestimonialBlock module={module as NonNullable<typeof module>} editMode />;
  },
  defaultProps: {
    title: "",
    subtitle: "",
    testimonials: [],
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies TestimonialPuckProps,
  resolvePermissions: (data: { props?: TestimonialPuckProps }) => data.props?.locked ? { delete: false, drag: false } : {},
};

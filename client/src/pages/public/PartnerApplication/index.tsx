import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Spin,
  message,
} from "antd";
import { partnerApi } from "@/services/api";
import type { PartnerApplicationInput, PartnerApplicationStatus } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { useCommerceCapabilities } from "@/store/featureFlags";

// 合作商家入驻协议（草案，待法务终审；页面内可读，供申请人勾选同意）
const AGREEMENT_TEXT = `合作商家入驻协议（草案 v0.1）

一、协议说明
本协议由海川珠宝（以下简称“甲方”）与提交合作申请的商家或个人（以下简称“乙方”）共同订立。乙方提交申请并勾选同意，即视为认可本协议全部条款。

二、合作内容
1. 审核通过后，乙方可访问甲方提供的合作商家专属商品资料（含预览水印）。
2. 合作资料仅供乙方选款与采购参考，不得对外公开、传播、转售或用于其他商业用途。

三、乙方义务
1. 乙方应保证所填申请信息真实、准确、完整；信息变更应及时告知甲方。
2. 乙方不得利用合作资料从事侵犯甲方知识产权或其他合法权益的行为。

四、知识产权
甲方提供的全部商品图片、描述与资料的知识产权归甲方所有。乙方不得复制、修改、传播或用于本协议约定之外的目的。

五、保密
乙方对因合作而知悉的甲方未公开信息（含价格、库存、资料）负有保密义务，未经甲方书面同意不得向任何第三方披露。

六、审核与终止
1. 甲方有权根据审核结果批准、要求补充资料或驳回乙方的申请。
2. 乙方违反本协议任一条款的，甲方有权暂停或终止其合作资格，并保留追究法律责任的权利。

七、其他
1. 本协议为草案版本，最终条款以甲方正式发布并完成法务复核的版本为准；正式版本发布后自动取代本草案。
2. 因本协议产生的争议，双方应友好协商解决；协商不成的，提交甲方所在地有管辖权的人民法院处理。

版本：v0.1（草案，待法务终审）`;

const STATUS_HINT: Record<string, string> = {
  PENDING: "您的合作申请正在审核中，我们将在 3 个工作日内与您联系。",
  NEEDS_SUPPLEMENT: "您的申请需要补充资料，请完善以下信息后重新提交。",
  REJECTED: "很抱歉，您的上次申请未通过，可修改资料后重新提交。",
  SUSPENDED: "您的合作资格目前处于暂停状态，如需恢复请先联系您的专属顾问。",
};

type PartnerState = {
  customer?: {
    accountType?: string;
    partnerStatus?: string;
    partnerApprovedAt?: string | null;
  } | null;
  latest?: (PartnerApplicationInput & {
    reviewNote?: string | null;
    status?: PartnerApplicationStatus;
  }) | null;
} | null;

export default function PartnerApplication() {
  const navigate = useNavigate();
  const { flags, loading: flagsLoading } = useCommerceCapabilities();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [state, setState] = useState<PartnerState>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const partnerStatus = state?.customer?.partnerStatus || "NONE";
  // 后台审核说明（驳回/要求补充/暂停时回显给客户）
  const latestReviewNote = state?.latest?.reviewNote as
    string | null | undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await partnerApi.getMine();
      const data = unwrapResponse<PartnerState>(res);
      setState(data || null);
      const latest = data?.latest;
      if (latest) {
        form.setFieldsValue({
          applicantName: latest.applicantName,
          applicantPhone: latest.applicantPhone,
          companyName: latest.companyName,
          city: latest.city,
          businessType: latest.businessType,
          channelType: latest.channelType,
          businessDescription: latest.businessDescription,
          expectedPurchaseRange: latest.expectedPurchaseRange,
          contactWechat: latest.contactWechat,
        });
      }
    } catch {
      setLoadError("合作状态暂时无法确认，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (values: PartnerApplicationInput) => {
    if (flags?.partnerApplicationsWriteEnabled !== true) {
      message.info("合作申请暂未开放，请通过联系页面咨询");
      return;
    }
    setSubmitting(true);
    try {
      const payload = { ...values, agreementAccepted: true };
      if (
        partnerStatus === "NEEDS_SUPPLEMENT" ||
        partnerStatus === "REJECTED"
      ) {
        await partnerApi.resubmit(payload);
      } else {
        await partnerApi.submit(payload);
      }
      message.success("合作申请已提交，请等待审核");
      await load();
    } catch {
      message.error("提交失败，请检查填写内容后重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || flagsLoading || !flags) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Result
          status="error"
          title="合作状态暂时无法确认"
          subTitle="为避免重复申请，当前不会显示新的申请表。请重新加载后再继续。"
          extra={[
            <Button key="retry" type="primary" size="large" onClick={() => void load()}>
              重新加载
            </Button>,
            <Button key="home" size="large" onClick={() => navigate("/")}>
              返回首页
            </Button>,
          ]}
        />
      </div>
    );
  }

  if (partnerStatus === "APPROVED") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Result
          status="success"
          title="您已是认证合作商家"
          subTitle="您可访问合作商家专属作品资料。"
          extra={[
            <Button
              key="catalog"
              type="primary"
              size="large"
              onClick={() => navigate("/catalog")}
            >
              前往合作作品目录
            </Button>,
            <Button key="home" size="large" onClick={() => navigate("/")}>
              返回首页
            </Button>,
          ]}
        />
      </div>
    );
  }

  if (partnerStatus === "PENDING") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Result
          status="info"
          title="合作申请审核中"
          subTitle={STATUS_HINT.PENDING}
          extra={[
            <Button key="home" size="large" onClick={() => navigate("/")}>
              返回首页
            </Button>,
          ]}
        />
      </div>
    );
  }

  if (partnerStatus === "SUSPENDED") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Result
          status="warning"
          title="合作资格已暂停"
          subTitle={
            latestReviewNote
              ? `${STATUS_HINT.SUSPENDED}（审核说明：${latestReviewNote}）`
              : STATUS_HINT.SUSPENDED
          }
          extra={[
            <Button
              key="contact"
              type="primary"
              size="large"
              onClick={() => navigate("/contact")}
            >
              联系专属顾问
            </Button>,
          ]}
        />
      </div>
    );
  }

  if (!flags.partnerApplicationsWriteEnabled) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Result
          status="info"
          title="合作申请暂未开放"
          subTitle="我们正在完善合作协议与服务流程。当前可通过联系页面提交合作意向，已提交申请仍可在此查看状态。"
          extra={[
            <Button
              key="contact"
              type="primary"
              size="large"
              onClick={() => navigate("/contact")}
            >
              联系合作顾问
            </Button>,
            <Button key="home" size="large" onClick={() => navigate("/")}>
              返回首页
            </Button>,
          ]}
        />
      </div>
    );
  }

  const showHint =
    partnerStatus === "NEEDS_SUPPLEMENT" || partnerStatus === "REJECTED";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-8 text-center">
        <p className="text-[#5f6568] text-xs tracking-[0.18em] mb-3">
          HAICHUAN PARTNER PROGRAM
        </p>
        <h1 className="text-4xl font-serif mb-3">申请成为合作商家</h1>
        <p className="text-gray-500 text-sm">
          填写以下信息，审核通过后即可查看合作商家专属作品资料。
        </p>
      </header>

      {showHint && (
        <Alert
          type={partnerStatus === "REJECTED" ? "warning" : "info"}
          showIcon
          className="mb-6"
          message={STATUS_HINT[partnerStatus]}
          description={
            latestReviewNote ? `审核说明：${latestReviewNote}` : undefined
          }
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <Form.Item
            name="applicantName"
            label="申请人姓名"
            rules={[
              { required: true, message: "请填写申请人姓名" },
              { max: 50, message: "不超过 50 个字符" },
            ]}
          >
            <Input placeholder="您的姓名" />
          </Form.Item>
          <Form.Item
            name="applicantPhone"
            label="联系电话"
            rules={[
              { required: true, message: "请填写联系电话" },
              { pattern: /^1\d{10}$/, message: "请填写有效的 11 位手机号" },
            ]}
          >
            <Input placeholder="11 位手机号" maxLength={11} />
          </Form.Item>
          <Form.Item
            name="companyName"
            label="公司名称（选填）"
            rules={[{ max: 200, message: "公司名称过长" }]}
          >
            <Input placeholder="公司或工作室名称" />
          </Form.Item>
          <Form.Item
            name="city"
            label="所在城市（选填）"
            rules={[{ max: 100, message: "城市名称过长" }]}
          >
            <Input placeholder="例如：深圳" />
          </Form.Item>
          <Form.Item name="businessType" label="经营类型（选填）">
            <Select
              allowClear
              placeholder="请选择"
              options={[
                { value: "线下门店", label: "线下门店" },
                { value: "电商", label: "电商" },
                { value: "直播带货", label: "直播带货" },
                { value: "批发采购", label: "批发采购" },
                { value: "设计师/工作室", label: "设计师 / 工作室" },
                { value: "其他", label: "其他" },
              ]}
            />
          </Form.Item>
          <Form.Item name="channelType" label="主要销售渠道（选填）">
            <Select
              allowClear
              placeholder="请选择"
              options={[
                { value: "线下", label: "线下" },
                { value: "线上", label: "线上" },
                { value: "线下+线上", label: "线下 + 线上" },
              ]}
            />
          </Form.Item>
          <Form.Item name="expectedPurchaseRange" label="预计采购规模（选填）">
            <Select
              allowClear
              placeholder="请选择"
              options={[
                { value: "10万以下", label: "10 万以下" },
                { value: "10-50万", label: "10 - 50 万" },
                { value: "50-100万", label: "50 - 100 万" },
                { value: "100万以上", label: "100 万以上" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="contactWechat"
            label="联系微信（选填）"
            rules={[{ max: 50, message: "微信过长" }]}
          >
            <Input placeholder="便于顾问联系" />
          </Form.Item>
        </div>

        <Form.Item name="businessDescription" label="业务简介（选填）">
          <Input.TextArea
            rows={4}
            placeholder="简要介绍您的业务情况与合作需求"
          />
        </Form.Item>

        <Form.Item
          name="agreementAccepted"
          valuePropName="checked"
          rules={[
            {
              validator: (_, value) =>
                value
                  ? Promise.resolve()
                  : Promise.reject(new Error("请阅读并同意合作协议")),
            },
          ]}
        >
          <Checkbox>
            我已阅读并同意
            <Button
              type="link"
              size="small"
              onClick={() => setAgreementOpen(true)}
              style={{ padding: "0 4px" }}
            >
              《合作商家入驻协议》
            </Button>
          </Checkbox>
        </Form.Item>

        <Button
          type="primary"
          size="large"
          htmlType="submit"
          loading={submitting}
          block
        >
          提交申请
        </Button>
      </Form>

      <Modal
        open={agreementOpen}
        title="合作商家入驻协议"
        onCancel={() => setAgreementOpen(false)}
        footer={[
          <Button
            key="close"
            type="primary"
            onClick={() => setAgreementOpen(false)}
          >
            我已阅读
          </Button>,
        ]}
        width={640}
      >
        <div className="max-h-[60vh] overflow-y-auto text-sm leading-6 text-gray-600 whitespace-pre-wrap">
          {AGREEMENT_TEXT}
        </div>
      </Modal>
    </div>
  );
}

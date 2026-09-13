import { useCallback, useEffect, useState } from "react";
import {
  App as AntdApp,
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Upload,
} from "antd";
import type { UploadFile } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import {
  quotationConfigurationApi,
  type CooperationDesignFileResource,
  type PartnerPriceAgreementResource,
  type QuotationFeeRuleResource,
  type TradeResourceBucketResource,
} from "@/services/clients/quotationConfigurationClient";
import {
  quotationApi,
  type QuotationIssueCustomerPage,
} from "@/services/api";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { unwrapResponse } from "@/utils/unwrap";
import type { QuoteChannel, WaxType } from "@/types";

type CustomerOption = {
  value: number;
  label: string;
  accountType: "MEMBER" | "PARTNER";
  partnerStatus: string;
};

type PartnerPriceForm = {
  customerId: number;
  redWaxRate: number;
  purpleWaxRate: number;
  effectiveRange: [Dayjs, Dayjs?];
  reason: string;
};

type FeeRuleForm = {
  code: string;
  channel: QuoteChannel;
  waxType?: WaxType;
  calculationMethod: "FIXED" | "PER_GRAM" | "PER_ORDER";
  unitAmount: number;
  enabled: boolean;
  displayText: string;
  effectiveRange: [Dayjs, Dayjs?];
  reason?: string;
};

type ResourceBucketForm = {
  channel: "CUSTOM" | "PARTNER_WAX";
  kind: "CAPACITY" | "MATERIAL";
  code: string;
  bucketKey: string;
  displayName: string;
  unit: string;
  availableQuantity: number;
  activeRange?: [Dayjs, Dayjs?];
};

type DesignFileForm = {
  customerId: number;
  productId?: number;
  referenceNo: string;
};

type DesignVersionForm = {
  fileId: number;
  file: UploadFile[];
  targetGoldWeight?: number;
  redWaxWeight?: number;
  purpleWaxWeight?: number;
};

function iso(value: Dayjs | undefined) {
  return value?.startOf("second").toISOString();
}

export default function QuotationConfigurationDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [partnerPriceForm] = Form.useForm<PartnerPriceForm>();
  const [feeRuleForm] = Form.useForm<FeeRuleForm>();
  const [resourceBucketForm] = Form.useForm<ResourceBucketForm>();
  const [designFileForm] = Form.useForm<DesignFileForm>();
  const [designVersionForm] = Form.useForm<DesignVersionForm>();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number>();
  const [selectedDesignCustomerId, setSelectedDesignCustomerId] = useState<number>();
  const [partnerPrices, setPartnerPrices] = useState<PartnerPriceAgreementResource[]>([]);
  const [feeRules, setFeeRules] = useState<QuotationFeeRuleResource[]>([]);
  const [resourceBuckets, setResourceBuckets] = useState<TradeResourceBucketResource[]>([]);
  const [designFiles, setDesignFiles] = useState<CooperationDesignFileResource[]>([]);

  const searchCustomers = async (keyword: string) => {
    if (!keyword.trim()) return;
    setCustomerSearching(true);
    try {
      const response = await quotationApi.searchIssueCustomers({ keyword: keyword.trim(), pageSize: 20 });
      const data = unwrapResponse<QuotationIssueCustomerPage>(response);
      setCustomers((data?.list ?? []).map((customer) => ({
        value: customer.id,
        label: `${customer.name || "未命名客户"} · ${customer.phone}`,
        accountType: customer.accountType,
        partnerStatus: customer.partnerStatus,
      })));
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "客户搜索失败，请稍后重试。"));
    } finally {
      setCustomerSearching(false);
    }
  };

  const loadGlobalConfiguration = useCallback(async () => {
    setLoading(true);
    try {
      const [feeResponse, resourceResponse] = await Promise.all([
        quotationConfigurationApi.listFeeRules(),
        quotationConfigurationApi.listResourceBuckets(),
      ]);
      setFeeRules(unwrapResponse<QuotationFeeRuleResource[]>(feeResponse) ?? []);
      setResourceBuckets(unwrapResponse<TradeResourceBucketResource[]>(resourceResponse) ?? []);
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "报价全局配置加载失败，请稍后重试。"));
    } finally {
      setLoading(false);
    }
  }, [message]);

  const loadPartnerPrices = async (customerId: number) => {
    setSelectedPartnerId(customerId);
    try {
      const response = await quotationConfigurationApi.listPartnerPrices(customerId);
      setPartnerPrices(unwrapResponse<PartnerPriceAgreementResource[]>(response) ?? []);
    } catch (error: unknown) {
      setPartnerPrices([]);
      message.error(getSafeAdminErrorMessage(error, "合作蜡价历史加载失败，请稍后重试。"));
    }
  };

  const loadDesignFiles = async (customerId: number) => {
    setSelectedDesignCustomerId(customerId);
    try {
      const response = await quotationConfigurationApi.listDesignFiles(customerId);
      setDesignFiles(unwrapResponse<CooperationDesignFileResource[]>(response) ?? []);
    } catch (error: unknown) {
      setDesignFiles([]);
      message.error(getSafeAdminErrorMessage(error, "3D 文件历史加载失败，请稍后重试。"));
    }
  };

  useEffect(() => {
    if (open) void loadGlobalConfiguration();
  }, [loadGlobalConfiguration, open]);

  const submitPartnerPrice = async () => {
    let values: PartnerPriceForm;
    try {
      values = await partnerPriceForm.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      await quotationConfigurationApi.createPartnerPrice({
        customerId: values.customerId,
        redWaxRate: values.redWaxRate,
        purpleWaxRate: values.purpleWaxRate,
        effectiveFrom: iso(values.effectiveRange[0])!,
        effectiveUntil: iso(values.effectiveRange[1]),
        reason: values.reason,
      });
      message.success("合作蜡价新版本已创建");
      partnerPriceForm.resetFields(["redWaxRate", "purpleWaxRate", "effectiveRange", "reason"]);
      await loadPartnerPrices(values.customerId);
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "合作蜡价版本创建失败，请核对生效区间。"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitFeeRule = async () => {
    let values: FeeRuleForm;
    try {
      values = await feeRuleForm.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      await quotationConfigurationApi.createFeeRule({
        code: values.code.trim().toUpperCase(),
        channel: values.channel,
        waxType: values.waxType,
        calculationMethod: values.calculationMethod,
        unitAmount: values.unitAmount,
        enabled: values.enabled,
        displayText: values.displayText,
        effectiveFrom: iso(values.effectiveRange[0])!,
        effectiveUntil: iso(values.effectiveRange[1]),
        reason: values.reason,
      });
      message.success("费用规则新版本已创建");
      feeRuleForm.resetFields();
      await loadGlobalConfiguration();
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "费用规则版本创建失败，请核对代码和生效区间。"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitResourceBucket = async () => {
    let values: ResourceBucketForm;
    try {
      values = await resourceBucketForm.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      await quotationConfigurationApi.createResourceBucket({
        channel: values.channel,
        kind: values.kind,
        code: values.code.trim().toUpperCase(),
        bucketKey: values.bucketKey,
        displayName: values.displayName,
        unit: values.unit,
        bucketStart: iso(values.activeRange?.[0]),
        bucketEnd: iso(values.activeRange?.[1]),
        availableQuantity: values.availableQuantity,
      });
      message.success("资源桶已创建");
      resourceBucketForm.resetFields();
      await loadGlobalConfiguration();
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "资源桶创建失败，请核对唯一代码与时间区间。"));
    } finally {
      setSubmitting(false);
    }
  };

  const updateResourceBucket = async (
    bucket: TradeResourceBucketResource,
    patch: { availableQuantity?: number; isActive?: boolean },
  ) => {
    setSubmitting(true);
    try {
      await quotationConfigurationApi.updateResourceBucket(bucket.id, {
        expectedVersion: bucket.version,
        ...patch,
      });
      message.success("资源桶版本已更新");
      await loadGlobalConfiguration();
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "资源桶更新失败，可能已被其他管理员修改，请刷新后重试。"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitDesignFile = async () => {
    let values: DesignFileForm;
    try {
      values = await designFileForm.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      await quotationConfigurationApi.createDesignFile(values);
      message.success("3D 文件档案已创建");
      designFileForm.resetFields(["productId", "referenceNo"]);
      await loadDesignFiles(values.customerId);
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "3D 文件档案创建失败，请核对合作客户和编号。"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitDesignVersion = async () => {
    let values: DesignVersionForm;
    try {
      values = await designVersionForm.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      const file = values.file?.[0]?.originFileObj;
      if (!file) {
        message.error("请先选择需要客户确认的真实 3D 文件。");
        return;
      }
      await quotationConfigurationApi.createDesignFileVersionFromUpload(values.fileId, file, {
        targetGoldWeight: values.targetGoldWeight,
        redWaxWeight: values.redWaxWeight,
        purpleWaxWeight: values.purpleWaxWeight,
      });
      message.success("3D 文件新版本已创建，等待客户本人确认");
      designVersionForm.resetFields();
      if (selectedDesignCustomerId) await loadDesignFiles(selectedDesignCustomerId);
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "3D 文件版本创建失败，请核对文件格式、文件完整性与蜡重。"));
    } finally {
      setSubmitting(false);
    }
  };

  const customerSelect = (onSelect?: (customerId: number) => void) => (
    <Select
      showSearch
      filterOption={false}
      onSearch={(value) => void searchCustomers(value)}
      onSelect={onSelect}
      loading={customerSearching}
      options={customers}
      placeholder="搜索已注册客户"
      notFoundContent={customerSearching ? "正在搜索客户…" : "输入姓名或手机号搜索"}
    />
  );

  return (
    <Drawer
      title="报价基础配置与版本"
      open={open}
      onClose={onClose}
      width={920}
      destroyOnHidden
    >
      <Alert
        className="mb-4"
        type="info"
        showIcon
        message="配置采用追加版本和乐观锁"
        description="已发出的报价保存不可变快照。修改当前蜡价、费用或资源，不会回写历史报价；3D 文件新版本仍需客户本人确认。"
      />
      <Tabs
        items={[
          {
            key: "partner-prices",
            label: "合作蜡价",
            children: (
              <Space direction="vertical" size="middle" className="w-full">
                <Form form={partnerPriceForm} layout="vertical">
                  <div className="grid grid-cols-2 gap-3">
                    <Form.Item name="customerId" label="已审核合作客户" rules={[{ required: true, message: "请选择客户" }]}>
                      {customerSelect((customerId) => {
                        const option = customers.find((item) => item.value === customerId);
                        if (option && (option.accountType !== "PARTNER" || option.partnerStatus !== "APPROVED")) {
                          message.warning("该客户当前不是已通过审核的合作客户。", 5);
                        }
                        void loadPartnerPrices(customerId);
                      })}
                    </Form.Item>
                    <Form.Item name="effectiveRange" label="生效区间" rules={[{ required: true, message: "请选择生效时间" }]}>
                      <DatePicker.RangePicker showTime className="w-full" allowEmpty={[false, true]} />
                    </Form.Item>
                    <Form.Item name="redWaxRate" label="红蜡克价（元/克）" rules={[{ required: true, message: "请输入红蜡克价" }]}>
                      <InputNumber min={0.01} precision={2} className="w-full" />
                    </Form.Item>
                    <Form.Item name="purpleWaxRate" label="紫蜡克价（元/克）" rules={[{ required: true, message: "请输入紫蜡克价" }]}>
                      <InputNumber min={0.01} precision={2} className="w-full" />
                    </Form.Item>
                  </div>
                  <Form.Item name="reason" label="版本原因" rules={[{ required: true, message: "请输入版本原因" }]}>
                    <Input.TextArea maxLength={1000} rows={2} />
                  </Form.Item>
                  <Button type="primary" loading={submitting} onClick={() => void submitPartnerPrice()}>创建蜡价版本</Button>
                </Form>
                <Table
                  rowKey="id"
                  size="small"
                  loading={loading}
                  dataSource={partnerPrices}
                  locale={{ emptyText: selectedPartnerId ? "该客户暂无蜡价历史" : "先选择合作客户查看版本历史" }}
                  pagination={false}
                  columns={[
                    { title: "版本", dataIndex: "version", render: (value: number) => `V${value}` },
                    { title: "红蜡", dataIndex: "redWaxRate", render: (value) => `¥${Number(value).toFixed(2)}/克` },
                    { title: "紫蜡", dataIndex: "purpleWaxRate", render: (value) => `¥${Number(value).toFixed(2)}/克` },
                    { title: "生效时间", dataIndex: "effectiveFrom", render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm") },
                    { title: "原因", dataIndex: "reason" },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: "fee-rules",
            label: "费用规则",
            children: (
              <Space direction="vertical" size="middle" className="w-full">
                <Form form={feeRuleForm} layout="vertical" initialValues={{ channel: "CUSTOM", calculationMethod: "FIXED", enabled: true }}>
                  <div className="grid grid-cols-3 gap-3">
                    <Form.Item name="code" label="规则代码" rules={[{ required: true, pattern: /^[A-Za-z][A-Za-z0-9_]{1,49}$/, message: "使用大写字母、数字和下划线" }]}>
                      <Input placeholder="CUSTOM_SERVICE" />
                    </Form.Item>
                    <Form.Item name="channel" label="渠道" rules={[{ required: true }]}>
                      <Select options={[
                        { value: "RETAIL", label: "标准零售" },
                        { value: "CUSTOM", label: "高级定制" },
                        { value: "PARTNER_WAX", label: "合作蜡模" },
                      ]} />
                    </Form.Item>
                    <Form.Item name="waxType" label="蜡种（选填）">
                      <Select allowClear options={[{ value: "RED", label: "红蜡" }, { value: "PURPLE", label: "紫蜡" }]} />
                    </Form.Item>
                    <Form.Item name="calculationMethod" label="计算方式" rules={[{ required: true }]}>
                      <Select options={[
                        { value: "FIXED", label: "固定金额" },
                        { value: "PER_ORDER", label: "按单" },
                        { value: "PER_GRAM", label: "按克（仅合作蜡模）" },
                      ]} />
                    </Form.Item>
                    <Form.Item name="unitAmount" label="单位金额（元）" rules={[{ required: true }]}>
                      <InputNumber min={0} precision={2} className="w-full" />
                    </Form.Item>
                    <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
                    <Form.Item className="col-span-2" name="displayText" label="客户可见说明" rules={[{ required: true }]}>
                      <Input maxLength={200} />
                    </Form.Item>
                    <Form.Item name="effectiveRange" label="生效区间" rules={[{ required: true }]}>
                      <DatePicker.RangePicker showTime className="w-full" allowEmpty={[false, true]} />
                    </Form.Item>
                  </div>
                  <Form.Item name="reason" label="版本原因（选填）"><Input.TextArea maxLength={1000} rows={2} /></Form.Item>
                  <Button type="primary" loading={submitting} onClick={() => void submitFeeRule()}>创建费用规则版本</Button>
                </Form>
                <Table
                  rowKey="id"
                  size="small"
                  loading={loading}
                  dataSource={feeRules}
                  pagination={{ pageSize: 8 }}
                  columns={[
                    { title: "代码", dataIndex: "code" },
                    { title: "版本", dataIndex: "version", render: (value: number) => `V${value}` },
                    { title: "渠道", dataIndex: "channel" },
                    { title: "方式", dataIndex: "calculationMethod" },
                    { title: "金额", dataIndex: "unitAmount", render: (value) => `¥${Number(value).toFixed(2)}` },
                    { title: "状态", dataIndex: "enabled", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: "resources",
            label: "产能与材料",
            children: (
              <Space direction="vertical" size="middle" className="w-full">
                <Form form={resourceBucketForm} layout="vertical" initialValues={{ channel: "CUSTOM", kind: "CAPACITY", unit: "件", availableQuantity: 0 }}>
                  <div className="grid grid-cols-3 gap-3">
                    <Form.Item name="channel" label="渠道" rules={[{ required: true }]}>
                      <Select options={[{ value: "CUSTOM", label: "高级定制" }, { value: "PARTNER_WAX", label: "合作蜡模" }]} />
                    </Form.Item>
                    <Form.Item name="kind" label="资源类型" rules={[{ required: true }]}>
                      <Select options={[{ value: "CAPACITY", label: "产能" }, { value: "MATERIAL", label: "材料" }]} />
                    </Form.Item>
                    <Form.Item name="code" label="资源代码" rules={[{ required: true, pattern: /^[A-Za-z][A-Za-z0-9_]{1,49}$/, message: "使用大写字母、数字和下划线" }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="bucketKey" label="资源桶键" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item>
                    <Form.Item name="displayName" label="显示名称" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item>
                    <Form.Item name="unit" label="单位" rules={[{ required: true }]}><Input maxLength={30} /></Form.Item>
                    <Form.Item name="availableQuantity" label="可用量" rules={[{ required: true }]}><InputNumber min={0} precision={3} className="w-full" /></Form.Item>
                    <Form.Item className="col-span-2" name="activeRange" label="资源有效区间（选填）">
                      <DatePicker.RangePicker showTime className="w-full" allowEmpty={[true, true]} />
                    </Form.Item>
                  </div>
                  <Button type="primary" loading={submitting} onClick={() => void submitResourceBucket()}>创建资源桶</Button>
                </Form>
                <Table
                  rowKey="id"
                  size="small"
                  loading={loading}
                  dataSource={resourceBuckets}
                  pagination={{ pageSize: 8 }}
                  columns={[
                    { title: "名称", dataIndex: "displayName" },
                    { title: "渠道/类型", render: (_, row) => `${row.channel} / ${row.kind}` },
                    { title: "可用/已占", render: (_, row) => `${Number(row.availableQuantity).toFixed(3)} / ${Number(row.reservedQuantity).toFixed(3)} ${row.unit}` },
                    { title: "版本", dataIndex: "version", render: (value: number) => `V${value}` },
                    {
                      title: "启用",
                      dataIndex: "isActive",
                      render: (value: boolean, row) => (
                        <Switch
                          checked={value}
                          loading={submitting}
                          aria-label={`${row.displayName}启用状态`}
                          onChange={(checked) => void updateResourceBucket(row, { isActive: checked })}
                        />
                      ),
                    },
                    {
                      title: "调整可用量",
                      render: (_, row) => (
                        <InputNumber
                          min={0}
                          precision={3}
                          defaultValue={Number(row.availableQuantity)}
                          disabled={submitting}
                          aria-label={`${row.displayName}可用量`}
                          onPressEnter={(event) => {
                            const value = Number(event.currentTarget.value);
                            if (Number.isFinite(value)) void updateResourceBucket(row, { availableQuantity: value });
                          }}
                        />
                      ),
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: "design-files",
            label: "合作 3D 文件",
            children: (
              <Space direction="vertical" size="middle" className="w-full">
                <Form form={designFileForm} layout="vertical">
                  <div className="grid grid-cols-3 gap-3">
                    <Form.Item name="customerId" label="已审核合作客户" rules={[{ required: true }]}>
                      {customerSelect((customerId) => void loadDesignFiles(customerId))}
                    </Form.Item>
                    <Form.Item name="referenceNo" label="文件档案编号" rules={[{ required: true }]}><Input maxLength={50} /></Form.Item>
                    <Form.Item name="productId" label="关联商品 ID（选填）"><InputNumber min={1} precision={0} className="w-full" /></Form.Item>
                  </div>
                  <Button type="primary" loading={submitting} onClick={() => void submitDesignFile()}>创建文件档案</Button>
                </Form>
                <Table
                  rowKey="id"
                  size="small"
                  loading={loading}
                  dataSource={designFiles}
                  pagination={false}
                  locale={{ emptyText: selectedDesignCustomerId ? "该客户暂无 3D 文件" : "先选择合作客户查看文件历史" }}
                  columns={[
                    { title: "编号", dataIndex: "referenceNo" },
                    { title: "当前版本", dataIndex: "currentVersion", render: (value: number) => `V${value}` },
                    {
                      title: "版本历史",
                      render: (_, row) => (row.versions ?? []).map((version) => (
                        <Tag key={version.id}>{`#${version.id} V${version.version} ${version.status}`}</Tag>
                      )),
                    },
                  ]}
                />
                <Form form={designVersionForm} layout="vertical">
                  <div className="grid grid-cols-3 gap-3">
                    <Form.Item name="fileId" label="文件档案" rules={[{ required: true }]}>
                      <Select options={designFiles.map((file) => ({ value: file.id, label: `${file.referenceNo} · 当前 V${file.currentVersion}` }))} />
                    </Form.Item>
                    <Form.Item
                      name="file"
                      label="3D 文件"
                      valuePropName="fileList"
                      getValueFromEvent={(event) => event?.fileList ?? []}
                      rules={[{ required: true, message: "请选择真实 3D 文件" }]}
                    >
                      <Upload
                        accept=".3dm,.3mf,.obj,.step,.stl,.stp"
                        beforeUpload={() => false}
                        maxCount={1}
                      >
                        <Button>选择 3D 文件</Button>
                      </Upload>
                    </Form.Item>
                    <Form.Item name="targetGoldWeight" label="目标金重（克）"><InputNumber min={0.001} precision={3} className="w-full" /></Form.Item>
                    <Form.Item name="redWaxWeight" label="红蜡重（克）"><InputNumber min={0.001} precision={3} className="w-full" /></Form.Item>
                    <Form.Item name="purpleWaxWeight" label="紫蜡重（克）"><InputNumber min={0.001} precision={3} className="w-full" /></Form.Item>
                  </div>
                  <Button type="primary" loading={submitting} onClick={() => void submitDesignVersion()}>创建文件版本</Button>
                </Form>
              </Space>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

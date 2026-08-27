import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  message,
  Tag,
  Space,
  Tabs,
  Popconfirm,
  Alert,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import {
  marketingApi,
  type CouponType,
  type CreateCouponInput,
  type CreatePromotionInput,
  type PromotionType,
} from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

interface PromotionRecord extends CreatePromotionInput {
  id: number;
}

interface PromotionFormValues {
  name: string;
  type: PromotionType;
  rule: string;
  range: [Dayjs, Dayjs];
  description?: string;
  isActive?: boolean;
}

interface CouponRecord extends Omit<CreateCouponInput, "startTime" | "endTime"> {
  id: number;
  startTime: string;
  endTime: string;
  usedCount: number;
}

interface CouponFormValues
  extends Omit<CreateCouponInput, "startTime" | "endTime"> {
  startTime: Dayjs;
  endTime: Dayjs;
}

interface CouponStats {
  total?: number;
  active?: number;
  totalUsed?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFormErrorFields(error: unknown): boolean {
  return isRecord(error) && Array.isArray(error.errorFields);
}

const PROMO_TYPE: Record<string, string> = {
  FULL_REDUCTION: "满减",
  DISCOUNT: "折扣",
  GIFT: "赠品",
};
const COUPON_TYPE: Record<string, string> = {
  fixed: "固定金额",
  percent: "立减比例（%）",
};

export default function MarketingManage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = requestedTab === "coupons" ? "coupons" : "promotions";

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            lineHeight: "34px",
            color: "var(--admin-ink)",
            margin: 0,
          }}
        >
          营销管理
        </h1>
        <p
          style={{
            fontSize: 12,
            lineHeight: "20px",
            color: "var(--admin-muted)",
            margin: "4px 0 0 0",
          }}
        >
          促销活动 · 优惠券
        </p>
      </div>
      <Alert
        type="info"
        showIcon
        message="优惠券已接入下单结算；促销活动当前仅作记录管理"
        description="后台人工建单时可选可用券（服务端试算与核销，单一公式口径）；促销活动暂不自动改价。线上支付是客户标准零售主链，线下收款仅用于受限异常场景；真实渠道仍受交易开关与目标环境门禁约束。"
        style={{ maxWidth: 680, marginBottom: 20 }}
      />
      <Tabs
        activeKey={tab}
        onChange={(nextTab) => setSearchParams({ tab: nextTab })}
        items={[
          { key: "promotions", label: "促销活动", children: <PromotionsTab /> },
          { key: "coupons", label: "优惠券", children: <CouponsTab /> },
        ]}
      />
    </div>
  );
}

function PromotionsTab() {
  const [list, setList] = useState<PromotionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<PromotionFormValues>();

  const load = async () => {
    setLoading(true);
    try {
      const res = await marketingApi.getPromotions();
      setList(unwrapResponse<PromotionRecord[]>(res) || []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      // P1-38：rule 为 JSON 字符串，提交前 parse 为对象（后端 rule: Json）；parse 失败给提示
      let parsedRule: unknown = values.rule;
      if (typeof values.rule === "string" && values.rule.trim() !== "") {
        try {
          parsedRule = JSON.parse(values.rule);
        } catch {
          message.error("规则(JSON) 格式错误，请检查");
          return;
        }
      }
      if (!isRecord(parsedRule)) {
        message.error("规则(JSON) 必须是对象");
        return;
      }
      const data: CreatePromotionInput = {
        name: values.name,
        type: values.type,
        rule: parsedRule,
        startTime: values.range[0].toISOString(),
        endTime: values.range[1].toISOString(),
        description: values.description,
        isActive: values.isActive,
      };
      if (editing) await marketingApi.updatePromotion(editing.id, data);
      else await marketingApi.createPromotion(data);
      message.success(editing ? "营销活动已更新" : "营销活动已创建");
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch (e: unknown) {
      // P1-37：校验失败（errorFields）由 antd 字段内提示，不重复弹；其余失败给反馈，避免 Modal 卡 loading
      if (hasFormErrorFields(e)) return;
      message.error(getSafeAdminErrorMessage(e, "营销活动保存失败，请检查填写内容后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setSaving(true);
    try {
      await marketingApi.deletePromotion(id);
      message.success("营销活动已删除");
      load();
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, "营销活动删除失败，请重新加载后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (record: PromotionRecord) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      // P1-38：后端 rule 是 Json 对象，编辑时序列化为字符串供 TextArea 显示，避免渲染成 [object Object]
      rule:
        record.rule && typeof record.rule === "object"
          ? JSON.stringify(record.rule, null, 2)
          : (record.rule ?? "{}"),
      range: [dayjs(record.startTime), dayjs(record.endTime)],
    });
    setModalOpen(true);
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            form.resetFields();
            setModalOpen(true);
          }}
        >
          新建活动
        </Button>
      </div>
      <Table
        dataSource={list}
        rowKey="id"
        loading={loading}
        pagination={false}
        columns={[
          { title: "名称", dataIndex: "name" },
          {
            title: "类型",
            dataIndex: "type",
            render: (v: string) => <Tag>{PROMO_TYPE[v] || v}</Tag>,
          },
          {
            title: "开始",
            dataIndex: "startTime",
            render: (v: string) =>
              v ? new Date(v).toLocaleDateString("zh-CN") : "-",
          },
          {
            title: "结束",
            dataIndex: "endTime",
            render: (v: string) =>
              v ? new Date(v).toLocaleDateString("zh-CN") : "-",
          },
          {
            title: "状态",
            dataIndex: "isActive",
            render: (v: boolean) => (
              <Tag color={v ? "green" : "default"}>
                {v ? "进行中" : "已停止"}
              </Tag>
            ),
          },
          {
            title: "操作",
            render: (_: unknown, r: PromotionRecord) => (
              <Space>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(r)}
                >
                  编辑
                </Button>
                <Popconfirm
                  title="删除该营销活动？"
                  onConfirm={() => handleDelete(r.id)}
                  okText="删除活动"
                  cancelText="取消"
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? "编辑活动" : "新建活动"}
        open={modalOpen}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="活动名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="type"
            label="活动类型"
            rules={[{ required: true }]}
            initialValue="FULL_REDUCTION"
          >
            <Select
              options={Object.entries(PROMO_TYPE).map(([k, v]) => ({
                value: k,
                label: v,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="rule"
            label="规则(JSON)"
            rules={[{ required: true }]}
            initialValue="{}"
          >
            <Input.TextArea
              rows={3}
              placeholder='例: {"threshold":5000,"discount":500}'
            />
          </Form.Item>
          <Form.Item name="range" label="活动时间" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function CouponsTab() {
  const [list, setList] = useState<CouponRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRecord | null>(null);
  const [form] = Form.useForm<CouponFormValues>();
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<CouponStats>({});
  const couponType: CouponType = Form.useWatch("type", form) || "fixed";
  const economicFieldsLocked = Number(editing?.usedCount || 0) > 0;

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        marketingApi.getCoupons(),
        marketingApi.getCouponStats(),
      ]);
      setList(unwrapResponse<CouponRecord[]>(cRes) || []);
      setStats(unwrapResponse<CouponStats>(sRes) || {});
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload: CreateCouponInput = {
        ...values,
        startTime: values.startTime.toISOString(),
        endTime: values.endTime.toISOString(),
      };
      if (editing) {
        await marketingApi.updateCoupon(
          editing.id,
          economicFieldsLocked ? { isActive: values.isActive } : payload,
        );
      } else {
        await marketingApi.createCoupon(payload);
      }
      message.success(editing ? "优惠券已更新" : "优惠券已创建");
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch (e: unknown) {
      // P1-37：校验失败由 antd 字段提示；其余失败给反馈，避免 Modal 卡 loading
      if (hasFormErrorFields(e)) return;
      message.error(getSafeAdminErrorMessage(e, "优惠券保存失败，请检查填写内容后重试。"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--admin-line)",
            borderRadius: 4,
            padding: "12px 20px",
            flex: 1,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>
            总计
          </span>
          <p style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            {stats.total || 0}
          </p>
        </div>
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--admin-line)",
            borderRadius: 4,
            padding: "12px 20px",
            flex: 1,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>
            进行中
          </span>
          <p
            style={{
              fontSize: 20,
              fontWeight: 600,
              margin: 0,
              color: "var(--admin-success)",
            }}
          >
            {stats.active || 0}
          </p>
        </div>
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--admin-line)",
            borderRadius: 4,
            padding: "12px 20px",
            flex: 1,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>
            已使用
          </span>
          <p style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            {stats.totalUsed || 0}
          </p>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            form.resetFields();
            setModalOpen(true);
          }}
        >
          新建优惠券
        </Button>
      </div>
      <Table
        dataSource={list}
        rowKey="id"
        loading={loading}
        pagination={false}
        columns={[
          { title: "名称", dataIndex: "name" },
          {
            title: "类型",
            dataIndex: "type",
            render: (v: string) => COUPON_TYPE[v] || v,
          },
          {
            title: "面值",
            dataIndex: "value",
            render: (v: number, r: CouponRecord) =>
              r.type === "percent" ? `${v}%` : `¥${v}`,
          },
          {
            title: "最低消费",
            dataIndex: "minAmount",
            render: (v: number) => `¥${v}`,
          },
          {
            title: "已用/总量",
            render: (_: unknown, r: CouponRecord) => `${r.usedCount}/${r.totalCount}`,
          },
          {
            title: "有效期",
            render: (_: unknown, r: CouponRecord) =>
              `${new Date(r.startTime).toLocaleDateString("zh-CN")} ~ ${new Date(r.endTime).toLocaleDateString("zh-CN")}`,
          },
          {
            title: "状态",
            dataIndex: "isActive",
            render: (v: boolean) => (
              <Tag color={v ? "green" : "default"}>{v ? "启用" : "停用"}</Tag>
            ),
          },
          {
            title: "操作",
            render: (_: unknown, r: CouponRecord) => (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditing(r);
                  form.setFieldsValue({
                    ...r,
                    startTime: r.startTime ? dayjs(r.startTime) : undefined,
                    endTime: r.endTime ? dayjs(r.endTime) : undefined,
                  });
                  setModalOpen(true);
                }}
              >
                编辑
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? "编辑优惠券" : "新建优惠券"}
        open={modalOpen}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        width={480}
      >
        <Form form={form} layout="vertical">
          {economicFieldsLocked ? (
            <Alert
              type="info"
              showIcon
              message="该优惠券已有使用记录，经济条款已冻结"
              description="如需调整名称、面值、门槛、发行量或有效期，请创建新券；当前仅可启用或停用。"
              style={{ marginBottom: 16 }}
            />
          ) : null}
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input disabled={economicFieldsLocked} />
          </Form.Item>
          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true }]}
            initialValue="fixed"
          >
            <Select
              disabled={economicFieldsLocked}
              options={Object.entries(COUPON_TYPE).map(([k, v]) => ({
                value: k,
                label: v,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="value"
            label={couponType === "percent" ? "立减比例（%）" : "固定减免金额（元）"}
            extra={couponType === "percent" ? "10 表示减免订单金额的 10%" : undefined}
            rules={[
              { required: true },
              couponType === "percent"
                ? { type: "integer", min: 1, max: 99, message: "请输入 1-99 的整数立减比例" }
                : { type: "number", min: 0.01, message: "请输入大于 0 的减免金额" },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              min={couponType === "percent" ? 1 : 0.01}
              max={couponType === "percent" ? 99 : undefined}
              precision={couponType === "percent" ? 0 : 2}
              disabled={economicFieldsLocked}
            />
          </Form.Item>
          <Form.Item name="minAmount" label="最低消费" initialValue={0}>
            <InputNumber style={{ width: "100%" }} min={0} precision={2} disabled={economicFieldsLocked} />
          </Form.Item>
          <Form.Item name="totalCount" label="发行量" initialValue={100}>
            <InputNumber style={{ width: "100%" }} min={1} precision={0} disabled={economicFieldsLocked} />
          </Form.Item>
          <Form.Item
            name="startTime"
            label="开始时间"
            rules={[{ required: true }]}
          >
            <DatePicker showTime style={{ width: "100%" }} disabled={economicFieldsLocked} />
          </Form.Item>
          <Form.Item
            name="endTime"
            label="结束时间"
            rules={[{ required: true }]}
          >
            <DatePicker showTime style={{ width: "100%" }} disabled={economicFieldsLocked} />
          </Form.Item>
          <Form.Item name="isActive" label="状态" initialValue={true}>
            <Select
              options={[
                { value: true, label: "启用" },
                { value: false, label: "停用" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

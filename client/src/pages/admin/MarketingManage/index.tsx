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
  GiftOutlined,
} from "@ant-design/icons";
import { marketingApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import dayjs from "dayjs";

const PROMO_TYPE: Record<string, string> = {
  FULL_REDUCTION: "满减",
  DISCOUNT: "折扣",
  GIFT: "赠品",
};
const COUPON_TYPE: Record<string, string> = {
  fixed: "固定金额",
  percent: "百分比",
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
            fontSize: 24,
            fontWeight: 600,
            lineHeight: "32px",
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
        description="后台人工建单时可选可用券（服务端试算与核销，单一公式口径）；促销活动暂不自动改价。客户侧线上交易仍处于冻结期。"
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
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await marketingApi.getPromotions();
      setList(unwrapResponse<any[]>(res) || []);
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
      const data = {
        ...values,
        rule: parsedRule,
        startTime: values.range[0].toISOString(),
        endTime: values.range[1].toISOString(),
      };
      delete data.range;
      if (editing) await marketingApi.updatePromotion(editing.id, data);
      else await marketingApi.createPromotion(data);
      message.success(editing ? "已更新" : "已创建");
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch (e: any) {
      // P1-37：校验失败（errorFields）由 antd 字段内提示，不重复弹；其余失败给反馈，避免 Modal 卡 loading
      if (e?.errorFields) return;
      message.error(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setSaving(true);
    try {
      await marketingApi.deletePromotion(id);
      message.success("已删除");
      load();
    } catch (e: any) {
      message.error(e?.message || "删除失败");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (record: any) => {
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
            render: (_: any, r: any) => (
              <Space>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(r)}
                >
                  编辑
                </Button>
                <Popconfirm
                  title="确认删除该促销活动？"
                  onConfirm={() => handleDelete(r.id)}
                  okText="删除"
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
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<any>({});

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        marketingApi.getCoupons(),
        marketingApi.getCouponStats(),
      ]);
      setList(unwrapResponse<any[]>(cRes) || []);
      setStats(unwrapResponse<any>(sRes) || {});
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
      if (editing) await marketingApi.updateCoupon(editing.id, values);
      else await marketingApi.createCoupon(values);
      message.success(editing ? "已更新" : "已创建");
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch (e: any) {
      // P1-37：校验失败由 antd 字段提示；其余失败给反馈，避免 Modal 卡 loading
      if (e?.errorFields) return;
      message.error(e?.message || "保存失败");
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
              color: "#52c41a",
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
            render: (v: number, r: any) =>
              r.type === "percent" ? `${v}%` : `¥${v}`,
          },
          {
            title: "最低消费",
            dataIndex: "minAmount",
            render: (v: number) => `¥${v}`,
          },
          {
            title: "已用/总量",
            render: (_: any, r: any) => `${r.usedCount}/${r.totalCount}`,
          },
          {
            title: "有效期",
            render: (_: any, r: any) =>
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
            render: (_: any, r: any) => (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditing(r);
                  form.setFieldsValue(r);
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
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true }]}
            initialValue="fixed"
          >
            <Select
              options={Object.entries(COUPON_TYPE).map(([k, v]) => ({
                value: k,
                label: v,
              }))}
            />
          </Form.Item>
          <Form.Item name="value" label="面值" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} min={1} />
          </Form.Item>
          <Form.Item name="minAmount" label="最低消费" initialValue={0}>
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item name="totalCount" label="发行量" initialValue={100}>
            <InputNumber style={{ width: "100%" }} min={1} />
          </Form.Item>
          <Form.Item
            name="startTime"
            label="开始时间"
            rules={[{ required: true }]}
          >
            <DatePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="endTime"
            label="结束时间"
            rules={[{ required: true }]}
          >
            <DatePicker showTime style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

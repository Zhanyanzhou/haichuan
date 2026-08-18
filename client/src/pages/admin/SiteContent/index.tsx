import { useState, useEffect } from "react";
import {
  Alert,
  Card,
  Form,
  Input,
  Button,
  Upload,
  message,
  Spin,
  Divider,
} from "antd";
import { SaveOutlined, UploadOutlined } from "@ant-design/icons";
import { settingsApi, uploadApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import { AdminLoadingState } from "@/components/common/AdminDataStates";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";

export default function SiteContent() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await settingsApi.getSettings();
        const data = unwrapResponse<any>(res);
        form.setFieldsValue(data);
      } catch {
        // Keep the form empty when remote settings are unavailable.
      } finally {
        setLoading(false);
      }
    })();
  }, [form]);

  const onFinish = async (values: any) => {
    setSaving(true);
    try {
      // 保存站点内容字段（品牌/联系方式/营业时间/SEO，含 siteName）
      await settingsApi.updateSettings(values);
      message.success("店铺资料已保存");
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "店铺资料保存失败，请检查填写内容后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      const res = await uploadApi.uploadImage(file);
      const data = unwrapResponse<{ url: string }>(res as any);
      if (data?.url) {
        form.setFieldsValue({ logo: data.url });
        message.success("Logo 已上传，保存后生效");
      }
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "Logo 上传失败，请检查文件格式和网络后重试。"));
    }
    return false; // 阻止默认上传行为
  };

  if (loading) return <AdminLoadingState subject="店铺资料" />;

  return (
    <div>
      <AdminPageHeader
        title="店铺资料与品牌设置"
        subtitle="管理客户可见的店铺信息与全站默认 SEO"
      />
      <Alert
        type="info"
        showIcon
        message="这些资料会用于网站页眉、页脚、联系入口及浏览器默认搜索信息。"
        style={{ maxWidth: 680, marginBottom: 20 }}
      />
      <Form
        form={form}
        onFinish={onFinish}
        layout="vertical"
        style={{ maxWidth: 680 }}
      >
        <Card
          title="品牌基础信息"
          style={{
            borderRadius: 10,
            border: "1px solid #E7E6E2",
            boxShadow: "0 6px 20px rgba(40,36,30,0.035)",
            marginBottom: 20,
          }}
        >
          <Form.Item name="siteName" label="网站名称">
            <Input placeholder="海川珠宝" />
          </Form.Item>
          <Form.Item name="siteDescription" label="网站描述">
            <Input.TextArea
              rows={2}
              placeholder="品牌简介，用于浏览器默认描述"
            />
          </Form.Item>
          <Form.Item name="logo" label="网站 Logo">
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                handleLogoUpload(file);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>上传 Logo</Button>
            </Upload>
          </Form.Item>
        </Card>

        <Card
          title="联系方式"
          style={{
            borderRadius: 10,
            border: "1px solid #E7E6E2",
            boxShadow: "0 6px 20px rgba(40,36,30,0.035)",
            marginBottom: 20,
          }}
        >
          <Form.Item name="contactPhone" label="联系电话">
            <Input placeholder="400-xxx-xxxx" />
          </Form.Item>
          <Form.Item name="contactEmail" label="联系邮箱">
            <Input placeholder="name@example.com" />
          </Form.Item>
          <Form.Item name="contactAddress" label="公司地址">
            <Input placeholder="详细地址" />
          </Form.Item>
        </Card>

        <Card
          title="营业信息"
          style={{
            borderRadius: 10,
            border: "1px solid #E7E6E2",
            boxShadow: "0 6px 20px rgba(40,36,30,0.035)",
            marginBottom: 20,
          }}
        >
          <Form.Item name="businessHours" label="营业时间">
            <Input placeholder="周一至周日 10:00-22:00" />
          </Form.Item>
        </Card>

        <Card
          title="SEO 默认设置"
          style={{
            borderRadius: 10,
            border: "1px solid #E7E6E2",
            boxShadow: "0 6px 20px rgba(40,36,30,0.035)",
            marginBottom: 20,
          }}
        >
          <Form.Item name="seoTitle" label="默认页面标题">
            <Input placeholder="海川珠宝 - 高端珠宝臻品平台" />
          </Form.Item>
          <Form.Item name="seoDescription" label="默认页面描述">
            <Input.TextArea rows={3} placeholder="描述文字" />
          </Form.Item>
          <Form.Item name="seoKeywords" label="默认关键词">
            <Input placeholder="珠宝,首饰,黄金" />
          </Form.Item>
        </Card>

        <Button
          type="primary"
          htmlType="submit"
          loading={saving}
          icon={<SaveOutlined />}
          style={{
            height: 44,
            paddingInline: 32,
          }}
        >
          保存设置
        </Button>
      </Form>
    </div>
  );
}

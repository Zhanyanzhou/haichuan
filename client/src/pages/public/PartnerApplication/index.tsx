import { useNavigate } from "react-router-dom";
import { Button, Result } from "antd";

/**
 * 合作商家申请页 —— 当前为安全降级状态
 *
 * 降级原因：目前没有可公开、可访问的正式《合作商家协议》正文、链接或版本号，
 * 也未取得法务确认。因此无法向申请者提供可阅读的协议，
 * 故不再渲染“我已阅读并同意协议”复选框，也不收集任何合作申请数据。
 *
 * 该页面以说明页形式告知用户“合作咨询暂未开放”，
 * 并引导至已有的通用咨询入口（/contact，预约私人顾问）。
 *
 * 注意：在正式协议（公开正文 + 版本号 + 法务确认）落地前，
 * 不得在此页面恢复可提交表单、同意复选框或伪造的协议链接。
 * 路由、后端、数据库、协议 Schema 与导航配置均不在本页职责范围内。
 */
export default function PartnerApplication() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Result
        status="info"
        title="合作咨询暂未开放"
        subTitle={
          <div className="text-gray-500">
            <p className="mb-2">
              抱歉，合作商家申请通道暂未开放，我们暂时无法接收新的合作申请。
            </p>
            <p>
              如需选购珠宝或有其他咨询需求，您可通过「预约私人顾问」页面与我们联系。
            </p>
          </div>
        }
        extra={[
          <Button
            key="contact"
            type="primary"
            size="large"
            onClick={() => navigate("/contact")}
          >
            前往预约咨询
          </Button>,
          <Button key="home" size="large" onClick={() => navigate("/")}>
            返回首页
          </Button>,
        ]}
      />
    </div>
  );
}

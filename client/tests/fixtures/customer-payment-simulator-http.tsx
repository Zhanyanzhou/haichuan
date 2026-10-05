import { useState } from "react";
import { App as AntdApp, ConfigProvider } from "antd";
import { createRoot } from "react-dom/client";
import CustomerPaymentDialog from "../../src/components/commerce/CustomerPaymentDialog";
import "../../src/styles/globals.css";

function Fixture() {
  const [open, setOpen] = useState(true);
  const [paid, setPaid] = useState(false);

  return (
    <ConfigProvider>
      <AntdApp>
        <main className="min-h-screen bg-brand-bg p-6 text-brand-text">
          <h1 className="text-xl font-semibold">客户支付真实 HTTP 候选</h1>
          <p className="mt-2 text-sm text-brand-muted">
            本页面只连接本机隔离支付模拟器，不连接或触发真实资金。
          </p>
          {paid ? <p role="status" className="mt-6">支付已确认</p> : null}
          {!open && !paid ? <p role="status" className="mt-6">支付窗口已关闭</p> : null}
          <CustomerPaymentDialog
            open={open}
            order={{ id: 9, orderNo: "ORD-HTTP-SIM-9", finalAmount: 88.8 }}
            onClose={() => setOpen(false)}
            onPaid={() => {
              setPaid(true);
              setOpen(false);
            }}
          />
        </main>
      </AntdApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);

import { CreditCard, FileCheck2, HandCoins, ReceiptText, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";

import { SectionHeading, spring } from "./Primitives";

interface PlatformDashboardProps {
  paymentMode: "test" | "production";
  onRequestModeChange: () => void;
  onNotice: (message: string) => void;
}

/** Platform data is owned by the root APIs; the plugin never invents metrics or transactions. */
export function PlatformDashboard({ paymentMode, onRequestModeChange, onNotice }: PlatformDashboardProps) {
  return (
    <div className="dashboard platform-dashboard">
      <section className="workspace-heading platform-heading">
        <div>
          <p className="eyebrow">平台管理</p>
          <h1>管理当前子平台的接入与撮合能力。</h1>
          <p>支付、发票、退款、权限和审计数据由根平台 API 提供；本插件只负责呈现当前子平台的入口。</p>
        </div>
        <div className={`mode-summary mode-${paymentMode}`}>
          <span className="status-orb" aria-hidden="true" />
          <div><small>当前支付模式</small><strong>{paymentMode === "test" ? "测试模式" : "生产模式"}</strong></div>
          <motion.button type="button" onClick={onRequestModeChange} whileTap={{ scale: 0.94 }} transition={spring}>切换</motion.button>
        </div>
      </section>

      <div className="platform-layout">
        <section className="surface gateway-panel" aria-labelledby="plugin-gateway-title">
          <SectionHeading eyebrow="标准化接口" title="支付与结算" />
          <div className="gateway-empty">
            <CreditCard size={24} aria-hidden="true" />
            <strong>等待根平台返回已配置网关</strong>
            <p>未配置的网关和金额会保持空白，不会显示虚构数据。</p>
            <button type="button" onClick={() => onNotice("请在根平台管理入口配置支付网关")}>打开根平台管理</button>
          </div>
        </section>

        <section className="surface commission-panel" aria-labelledby="plugin-commission-title">
          <SectionHeading eyebrow="结算规则" title="平台服务费" />
          <div className="commission-empty"><HandCoins size={23} aria-hidden="true" /><p>成交、线下撮合和服务费由根平台按真实记录计算。</p></div>
          <div className="commission-note"><ShieldCheck size={18} aria-hidden="true" /><p>没有 API 数据时保持空状态，不用静态数字代替真实业务指标。</p></div>
        </section>

        <section className="surface finance-activity" aria-labelledby="plugin-finance-title">
          <SectionHeading eyebrow="财务与审计" title="发票、退款和审计" />
          <div className="finance-empty"><ReceiptText size={22} aria-hidden="true" /><p>等待根平台返回财务事件。</p></div>
          <div className="finance-actions">
            <button type="button" onClick={() => onNotice("请在根平台管理入口处理发票") }><ReceiptText size={18} aria-hidden="true" /><span><strong>发票管理</strong><small>由根平台处理</small></span></button>
            <button type="button" onClick={() => onNotice("请在根平台管理入口处理退款") }><FileCheck2 size={18} aria-hidden="true" /><span><strong>退款管理</strong><small>由根平台处理</small></span></button>
          </div>
        </section>
      </div>
    </div>
  );
}

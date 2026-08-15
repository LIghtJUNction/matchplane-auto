import { FormEvent, useState } from "react";
import { ArrowRight, FileUp, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { MetricCard, SectionHeading, spring } from "./Primitives";

interface SellerDashboardProps {
  onNotice: (message: string) => void;
  onSubmitSupply?: (supply: {
    externalKey: string;
    displayName: string;
    askingAmount: string;
    currency: string;
    attributes: Record<string, unknown>;
  }) => Promise<void> | void;
}

/** Automotive presentation adapter. Inventory is always supplied by the root API. */
export function SellerDashboard({ onNotice, onSubmitSupply }: SellerDashboardProps) {
  const [externalKey, setExternalKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [askingAmount, setAskingAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [attributes, setAttributes] = useState("{}");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const parsed = JSON.parse(attributes || "{}");
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("资料必须是 JSON 对象");
      if (!externalKey.trim() || !displayName.trim() || !askingAmount.trim() || !currency.trim()) {
        throw new Error("请完整填写供给名称、内部编号、报价和币种");
      }
      setSubmitting(true);
      await onSubmitSupply?.({
        externalKey: externalKey.trim(),
        displayName: displayName.trim(),
        askingAmount: askingAmount.trim(),
        currency: currency.trim().toUpperCase(),
        attributes: parsed as Record<string, unknown>,
      });
      setExternalKey("");
      setDisplayName("");
      setAskingAmount("");
      setCurrency("");
      setAttributes("{}");
      onNotice(onSubmitSupply ? "车辆资料已提交审核" : "请先连接根平台的供给上传接口");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "车辆资料格式无效");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard seller-dashboard">
      <section className="workspace-heading">
        <div>
          <p className="eyebrow">汽车子平台 · 卖家工作台</p>
          <h1>由卖家上传真实车源，平台负责找到合适的买家。</h1>
          <p>这里不放演示车辆。车源字段由子平台 schema 和卖家资料共同决定，提交后先进入根平台审核。</p>
        </div>
        <span className="seller-mode-note"><ShieldCheck size={16} aria-hidden="true" /> 根平台账号与联系方式保护</span>
      </section>

      <section className="metric-grid" aria-label="卖家核心指标">
        <MetricCard icon={Sparkles} label="有效曝光" value="—" detail="等待实时数据" tone="cactus" />
        <MetricCard icon={FileUp} label="已提交车源" value="—" detail="由根 API 返回" />
        <MetricCard icon={Sparkles} label="高意向匹配" value="—" detail="审核通过后统计" tone="heather" />
        <MetricCard icon={ShieldCheck} label="已解锁联系" value="—" detail="双方同意后显示" tone="clay" />
      </section>

      <section className="surface seller-upload" aria-labelledby="auto-upload-title">
        <SectionHeading eyebrow="卖家上传" title="提交一份车源资料" />
        <p className="seller-upload-intro">车辆字段由本子平台 manifest 注册的 schema 定义；根平台只接收结构化资料，不替卖家生成品牌、价格或车况。</p>
        <form className="seller-upload-form" onSubmit={submit}>
          <label>
            <span>供给名称</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="由你填写" maxLength={500} />
          </label>
          <label>
            <span>内部编号</span>
            <input value={externalKey} onChange={(event) => setExternalKey(event.target.value)} placeholder="用于更新同一份资料" maxLength={256} />
          </label>
          <label>
            <span>报价（最小货币单位）</span>
            <input value={askingAmount} onChange={(event) => setAskingAmount(event.target.value)} inputMode="numeric" placeholder="例如 100000" />
          </label>
          <label>
            <span>币种</span>
            <input value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="ISO 4217，例如 CNY" maxLength={3} />
          </label>
          <label className="seller-upload-wide" htmlFor="auto-attributes">
            <span>车源资料（JSON）</span>
            <textarea id="auto-attributes" value={attributes} onChange={(event) => setAttributes(event.target.value)} rows={10} spellCheck={false} />
          </label>
          <div className="seller-upload-actions seller-upload-wide">
            <p><FileUp size={17} aria-hidden="true" /> 上传后状态为“待审核”，审核通过才进入买家匹配。</p>
            <motion.button className="button button-dark" type="submit" disabled={submitting} whileTap={{ scale: 0.97 }} transition={spring}>
              {submitting ? "正在提交…" : "上传并提交审核"}
              {!submitting ? <ArrowRight size={18} aria-hidden="true" /> : null}
            </motion.button>
          </div>
        </form>
      </section>
    </div>
  );
}

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, FileUp, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { motion } from "motion/react";

import { SectionHeading, spring } from "./Primitives";

export interface SupplyField {
  key: string;
  label: string;
  type?: "text" | "number" | "url" | "date" | "select";
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

interface SellerDashboardProps {
  onNotice: (message: string) => void;
  onSubmitSupply?: (supply: {
    externalKey: string;
    displayName: string;
    askingAmount: string;
    currency: string;
    attributes: Record<string, unknown>;
  }) => Promise<void> | void;
  currency?: string;
  currencyScale?: number;
  supplyFields?: SupplyField[];
  assetSchema?: Record<string, unknown>;
  agentDraft?: {
    narrative: string;
    intentId?: string;
    attributes: Record<string, unknown>;
    terms: Record<string, unknown>;
  } | null;
}

/** The host supplies all domain fields. This adapter only renders the shared supply contract. */
export function SellerDashboard({
  onNotice,
  onSubmitSupply,
  currency: configuredCurrency = "",
  currencyScale = 0,
  supplyFields = [],
  assetSchema,
  agentDraft = null,
}: SellerDashboardProps) {
  const [externalKey, setExternalKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [askingAmount, setAskingAmount] = useState("");
  const [currency, setCurrency] = useState(configuredCurrency);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [customFields, setCustomFields] = useState<Array<{ id: string; key: string; value: string }>>([]);
  const [advancedAttributes, setAdvancedAttributes] = useState("{}");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draftImported, setDraftImported] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fields = useMemo(() => supplyFields.length ? supplyFields : fieldsFromSchema(assetSchema), [assetSchema, supplyFields]);

  useEffect(() => {
    setDraftImported(false);
  }, [agentDraft?.intentId, agentDraft?.narrative]);

  const importAgentDraft = () => {
    if (!agentDraft) return;
    setAdvancedAttributes(JSON.stringify({
      conversation: {
        narrative: agentDraft.narrative,
        intent_id: agentDraft.intentId ?? null,
      },
      ...agentDraft.attributes,
      _terms: agentDraft.terms,
    }, null, 2));
    setAdvancedOpen(true);
    setDraftImported(true);
    onNotice("已把对话草稿放入编辑器，请检查并补齐字段后提交");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = displayName.trim();
    const normalizedKey = externalKey.trim();
    const normalizedCurrency = currency.trim().toUpperCase();
    const normalizedAmount = toMinorUnits(askingAmount, currencyScale);
    const resolvedKey = normalizedKey || `offer-${crypto.randomUUID()}`;
    if (!normalizedName || !normalizedAmount || !normalizedCurrency) {
      onNotice("请完整填写名称、报价和结算币种");
      return;
    }
    const missing = fields.find((field) => field.required && !fieldValues[field.key]?.trim());
    if (missing) {
      onNotice(`请填写${missing.label}`);
      return;
    }
    const attributes = attributesFromForm(fieldValues, customFields, fields, advancedOpen ? advancedAttributes : null);
    if (!attributes) {
      onNotice("高级资料必须是有效的 JSON 对象");
      return;
    }
    setSubmitting(true);
    try {
      if (!onSubmitSupply) throw new Error("当前页面未连接供给提交接口");
      await onSubmitSupply({
        externalKey: resolvedKey,
        displayName: normalizedName,
        askingAmount: normalizedAmount,
        currency: normalizedCurrency,
        attributes,
      });
      setExternalKey("");
      setDisplayName("");
      setAskingAmount("");
      setCurrency(configuredCurrency);
      setFieldValues({});
      setCustomFields([]);
      setAdvancedAttributes("{}");
      setAdvancedOpen(false);
      onNotice("资料已提交，等待平台审核后展示");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "供给提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard seller-dashboard">
      <section className="workspace-heading">
        <div>
          <p className="eyebrow">供给方工作台</p>
          <h1>上传你的资料，平台负责找到合适的需求。</h1>
          <p>页面字段来自当前子平台 manifest；根平台只负责校验、审核和撮合，不替你生成业务内容。</p>
        </div>
        <span className="seller-mode-note"><ShieldCheck size={16} aria-hidden="true" /> 账号和联系方式由根平台保护</span>
      </section>

      <section className="seller-status-summary" aria-label="供给资料状态">
        <FileUp size={19} aria-hidden="true" />
        <div><strong>资料提交</strong><small>提交后进入当前子平台的审核流程</small></div>
      </section>

      <section className="surface seller-upload" aria-labelledby="seller-upload-title">
        <SectionHeading eyebrow="资料上传" title="提交一份新的供给资料" />
        <p className="seller-upload-intro">业务字段由子平台配置；高级 JSON 只用于补充未在表单中呈现的结构化属性。</p>
        {agentDraft ? (
          <div className="seller-agent-draft" role="status">
            <div>
              <strong>对话草稿已准备好</strong>
              <p>{agentDraft.narrative}</p>
            </div>
            <button className="text-action" type="button" onClick={importAgentDraft} disabled={draftImported}>
              {draftImported ? "已放入编辑器" : "放入编辑器"}
            </button>
          </div>
        ) : null}
        <form className="seller-upload-form" onSubmit={submit}>
          <label htmlFor="plugin-seller-display-name"><span>供给名称</span><input id="plugin-seller-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="由你填写" maxLength={500} required /></label>
          <label htmlFor="plugin-seller-external-key"><span>内部编号</span><input id="plugin-seller-external-key" value={externalKey} onChange={(event) => setExternalKey(event.target.value)} placeholder="留空则由平台生成" maxLength={256} /></label>
          <label htmlFor="plugin-seller-asking-amount"><span>报价{currency ? `（${currency}）` : ""}</span><input id="plugin-seller-asking-amount" value={askingAmount} onChange={(event) => setAskingAmount(event.target.value)} inputMode="decimal" placeholder={amountPlaceholder(currencyScale)} required /></label>
          <label htmlFor="plugin-seller-currency"><span>币种</span><input id="plugin-seller-currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="由子平台配置" maxLength={3} readOnly={Boolean(configuredCurrency)} required /></label>
          {fields.map((field) => (
            <label key={field.key} htmlFor={`plugin-seller-attribute-${field.key}`}>
              <span>{field.label}{field.required ? " *" : ""}</span>
              {field.type === "select" ? (
                <select id={`plugin-seller-attribute-${field.key}`} value={fieldValues[field.key] ?? ""} onChange={(event) => setFieldValues((current) => ({ ...current, [field.key]: event.target.value }))}>
                  <option value="">请选择</option>
                  {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : <input id={`plugin-seller-attribute-${field.key}`} type={field.type ?? "text"} value={fieldValues[field.key] ?? ""} onChange={(event) => setFieldValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} required={field.required} />}
            </label>
          ))}
          {customFields.map((field) => (
            <div className="seller-custom-field" key={field.id}>
              <input aria-label="自定义字段名" value={field.key} onChange={(event) => setCustomFields((current) => current.map((item) => item.id === field.id ? { ...item, key: event.target.value } : item))} placeholder="字段名" />
              <input aria-label="自定义字段值" value={field.value} onChange={(event) => setCustomFields((current) => current.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item))} placeholder="字段值" />
              <button type="button" aria-label="删除自定义字段" onClick={() => setCustomFields((current) => current.filter((item) => item.id !== field.id))}><Trash2 size={16} aria-hidden="true" /></button>
            </div>
          ))}
          <div className="seller-upload-wide seller-form-tools">
            <button className="text-action" type="button" onClick={() => setCustomFields((current) => [...current, { id: crypto.randomUUID(), key: "", value: "" }])}><Plus size={16} aria-hidden="true" /> 添加字段</button>
            <button className="text-action" type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}>{advancedOpen ? "收起高级资料" : "使用高级 JSON"}</button>
          </div>
          {advancedOpen ? <label className="seller-upload-wide" htmlFor="plugin-seller-attributes"><span>高级资料（JSON）</span><textarea id="plugin-seller-attributes" value={advancedAttributes} onChange={(event) => setAdvancedAttributes(event.target.value)} rows={8} spellCheck={false} /></label> : null}
          <div className="seller-upload-actions seller-upload-wide">
            <p><FileUp size={17} aria-hidden="true" /> 提交后状态为“待审核”，平台不会自动发布未经确认的资料。</p>
            <motion.button className="button button-dark" type="submit" disabled={submitting} whileTap={{ scale: 0.97 }} transition={spring}>{submitting ? "正在提交…" : "上传并提交审核"}{!submitting ? <ArrowRight size={18} aria-hidden="true" /> : null}</motion.button>
          </div>
        </form>
      </section>
    </div>
  );
}

function fieldsFromSchema(schema: Record<string, unknown> | undefined): SupplyField[] {
  if (!schema || typeof schema.properties !== "object" || !schema.properties || Array.isArray(schema.properties)) return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
  return Object.entries(schema.properties).slice(0, 64).flatMap(([key, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const descriptor = value as { title?: unknown; type?: unknown; format?: unknown; description?: unknown; enum?: unknown };
    const type = Array.isArray(descriptor.enum) ? "select" : descriptor.format === "uri" ? "url" : descriptor.type === "number" || descriptor.type === "integer" ? "number" : descriptor.format === "date" ? "date" : "text";
    return [{
      key,
      label: typeof descriptor.title === "string" && descriptor.title.trim() ? descriptor.title : key,
      type,
      required: required.has(key),
      placeholder: typeof descriptor.description === "string" ? descriptor.description : undefined,
      options: Array.isArray(descriptor.enum) ? descriptor.enum.filter((item): item is string => typeof item === "string") : undefined,
    }];
  });
}

function attributesFromForm(
  values: Record<string, string>,
  customFields: Array<{ key: string; value: string }>,
  fields: SupplyField[],
  advancedJson: string | null,
): Record<string, unknown> | null {
  if (advancedJson !== null) {
    try {
      const parsed = JSON.parse(advancedJson || "{}");
      return parsed && !Array.isArray(parsed) && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!value.trim()) continue;
    const field = fields.find((candidate) => candidate.key === key);
    attributes[key] = field?.type === "number" && Number.isFinite(Number(value)) ? Number(value) : value.trim();
  }
  for (const field of customFields) {
    if (field.key.trim() && field.value.trim()) attributes[field.key.trim()] = field.value.trim();
  }
  return attributes;
}

function amountPlaceholder(scale: number): string {
  return scale > 0 ? `例如 1000.${"0".repeat(Math.min(scale, 2))}` : "例如 1000";
}

function toMinorUnits(value: string, scale: number): string | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > scale) return null;
  const result = `${whole}${fraction.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "") || "0";
  return BigInt(result) > 0n ? result : null;
}

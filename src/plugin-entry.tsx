import { FormEvent, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Settings2, X } from "lucide-react";

import { BuyerDashboard } from "./components/BuyerDashboard";
import { PlatformDashboard } from "./components/PlatformDashboard";
import { SellerDashboard } from "./components/SellerDashboard";
import type { VehicleListing, WorkspaceRole } from "./types";
import { localizedCopy, type PluginCopy, type PluginLocale } from "./copy";
import "./styles.css";

type PluginContext = {
  role?: WorkspaceRole;
  path?: string;
  theme?: "light" | "dark";
  locale?: PluginLocale;
  contextToken?: string;
  currency?: string;
  currencyScale?: number;
  assetSchema?: Record<string, unknown>;
  agentDraft?: {
    narrative: string;
    intentId?: string;
    attributes: Record<string, unknown>;
    terms: Record<string, unknown>;
  };
  ui?: {
    copy?: PluginCopy;
    supplyFields?: Array<{
      key: string;
      label: string;
      type?: "text" | "number" | "url" | "date" | "select";
      required?: boolean;
      placeholder?: string;
      options?: string[];
    }>;
    contactFields?: Array<{
      key: string;
      label: string;
      type?: "text" | "tel" | "email";
      required?: boolean;
      placeholder?: string;
    }>;
  };
};

type ParentResponse = { ok: boolean; error?: string };

function AutoPlugin() {
  const [role, setRole] = useState<WorkspaceRole>("buyer");
  const [recommendations, setRecommendations] = useState<VehicleListing[]>([]);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextToken, setContextToken] = useState<string | null>(null);
  const [platformContext, setPlatformContext] = useState<PluginContext>({});
  const contextTokenRef = useRef<string | null>(null);
  const platformContextRef = useRef<PluginContext>({});
  const pendingRequests = useRef(new Map<string, (response: ParentResponse) => void>());

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !isRecord(event.data) || event.data.protocol !== "matchplane.plugin/v1") return;
      if (
        (event.data.type === "listing.submit.result" || event.data.type === "contact.update.result")
        && event.data.contextToken === contextTokenRef.current
        && typeof event.data.requestId === "string"
      ) {
        const resolve = pendingRequests.current.get(event.data.requestId);
        if (resolve) {
          pendingRequests.current.delete(event.data.requestId);
          resolve({
            ok: event.data.ok === true,
            error: typeof event.data.error === "string" ? event.data.error : undefined,
          });
        }
        return;
      }
      if (event.data.type === "match.results" && event.data.contextToken === contextTokenRef.current) {
        const payload = isRecord(event.data.payload) ? event.data.payload : null;
        const hosted = payload && Array.isArray(payload.listings) ? payload.listings : [];
        const context = platformContextRef.current;
        const locale = context.locale ?? "zh";
        setRecommendations(hosted.map((item, index) => mapHostedListing(item, index, locale, context.ui?.copy)).filter((item): item is VehicleListing => item !== null));
        return;
      }
      if (event.data.type !== "platform.context" || !isRecord(event.data.payload)) return;
      const context = event.data.payload as PluginContext;
      platformContextRef.current = context;
      setPlatformContext(context);
      if (context.theme === "light" || context.theme === "dark") {
        document.documentElement.dataset.theme = context.theme;
        document.documentElement.style.colorScheme = context.theme;
      }
      if (context.locale === "zh" || context.locale === "en") {
        document.documentElement.lang = context.locale === "en" ? "en" : "zh-CN";
      }
      if (context.role === "buyer" || context.role === "seller" || context.role === "platform" || context.role === "subplatform_admin") setRole(context.role);
      if (context.contextToken) {
        contextTokenRef.current = context.contextToken;
        setContextToken(context.contextToken);
      }
      setNotice("");
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ protocol: "matchplane.plugin/v1", type: "plugin.ready", version: 1 }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const notify = (message: string) => {
    setNotice(message);
  };

  const openListing = (selected: VehicleListing) => {
    postToParent("listing.open", { listingId: selected.id });
  };

  const submitSupply = (supply: {
    externalKey: string;
    displayName: string;
    askingAmount: string;
    currency: string;
    attributes: Record<string, unknown>;
  }) => new Promise<void>((resolve, reject) => {
    const requestId = createSecureId();
    pendingRequests.current.set(requestId, (response) => {
      if (response.ok) resolve();
      else reject(new Error(response.error || "供给提交失败，请稍后重试"));
    });
    postToParent("listing.submit", supply, requestId);
    window.setTimeout(() => {
      if (!pendingRequests.current.has(requestId)) return;
      pendingRequests.current.delete(requestId);
      reject(new Error("根平台响应超时，请稍后重试"));
    }, 15_000);
  });

  const submitContact = (contact: Record<string, string>) => new Promise<void>((resolve, reject) => {
    const requestId = createSecureId();
    pendingRequests.current.set(requestId, (response) => {
      if (response.ok) resolve();
      else reject(new Error(response.error || "联系方式保存失败，请稍后重试"));
    });
    postToParent("contact.update", { contact }, requestId);
    window.setTimeout(() => {
      if (!pendingRequests.current.has(requestId)) return;
      pendingRequests.current.delete(requestId);
      reject(new Error("根平台响应超时，请稍后重试"));
    }, 15_000);
  });

  const postToParent = (type: string, payload?: unknown, requestId?: string) => {
    window.parent.postMessage({
      protocol: "matchplane.plugin/v1",
      version: 1,
      type,
      ...(contextToken ? { contextToken } : {}),
      ...(requestId ? { requestId } : {}),
      ...(payload === undefined ? {} : { payload }),
    }, "*");
  };

  return (
    <main className="plugin-app">
      <header className="plugin-workspace-header">
        <div className="plugin-workspace-identity">
          <strong>Matx Auto</strong>
          <span>{role === "seller" ? localizedCopy(platformContext.locale ?? "zh", platformContext.ui?.copy, "supplyRoleLabel", "卖方", "Seller") : localizedCopy(platformContext.locale ?? "zh", platformContext.ui?.copy, "demandRoleLabel", "买方", "Buyer")}</span>
        </div>
        <button className="plugin-settings-trigger" type="button" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog" aria-expanded={settingsOpen}>
          <Settings2 size={17} aria-hidden="true" />
          <span>{localizedCopy(platformContext.locale ?? "zh", platformContext.ui?.copy, "settingsLabel", "设置", "Settings")}</span>
        </button>
      </header>
      {notice ? <p className="plugin-notice" role="status">{notice}</p> : null}
      {role === "buyer" ? (
        <BuyerDashboard recommendations={recommendations} onOpenListing={openListing} onNotice={notify} locale={platformContext.locale} copy={platformContext.ui?.copy} />
      ) : role === "seller" ? (
        <SellerDashboard
          locale={platformContext.locale}
          copy={platformContext.ui?.copy}
          onNotice={notify}
          onSubmitSupply={submitSupply}
          currency={platformContext.currency}
          currencyScale={platformContext.currencyScale}
          supplyFields={platformContext.ui?.supplyFields}
          assetSchema={platformContext.assetSchema}
          agentDraft={platformContext.agentDraft}
        />
      ) : (
        <PlatformDashboard
          paymentMode="test"
          onRequestModeChange={() => notify("支付模式切换必须由根平台管理员确认")}
          onNotice={notify}
        />
      )}
      <PluginSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        locale={platformContext.locale}
        copy={platformContext.ui?.copy}
      >
        <ContactProfile locale={platformContext.locale} copy={platformContext.ui?.copy} onNotice={notify} fields={platformContext.ui?.contactFields} submitContact={submitContact} />
      </PluginSettingsDialog>
    </main>
  );
}

function PluginSettingsDialog({
  open,
  onClose,
  locale = "zh",
  copy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  locale?: PluginLocale;
  copy?: PluginCopy;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const text = (key: string, fallbackZh: string, fallbackEn = fallbackZh) => localizedCopy(locale, copy, key, fallbackZh, fallbackEn);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="plugin-settings-overlay">
      <button className="plugin-settings-backdrop" type="button" aria-label={text("closeSettingsDialog", "关闭设置对话框", "Close settings dialog")} onClick={onClose} />
      <section className="plugin-settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <div>
            <p className="eyebrow">{text("settingsEyebrow", "工作台", "Workspace")}</p>
            <h2 id={titleId}>{text("settingsTitle", "设置", "Settings")}</h2>
          </div>
          <button ref={closeRef} className="plugin-settings-close" type="button" aria-label={text("closeSettings", "关闭设置", "Close settings")} onClick={onClose}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapHostedListing(value: unknown, index: number, locale: PluginLocale, copy: PluginCopy | undefined): VehicleListing | null {
  if (!isRecord(value)) return null;
  const id = textValue(value.id);
  const title = textValue(value.title);
  if (!id || !title) return null;
  const facts = Array.isArray(value.facts)
    ? value.facts.filter(isHostedFact).slice(0, 12)
    : [];
  const fact = (...keys: string[]) => {
    const match = facts.find((item) => keys.includes(item.key ?? "") || keys.includes(item.label));
    return match?.value;
  };
  const reasons = textArray(value.reasons);
  const trust = textArray(value.trust);
  const accent = ["cactus", "clay", "heather", "oat"].includes(value.accent as string)
    ? value.accent as VehicleListing["accent"]
    : (["cactus", "clay", "heather", "oat"] as const)[index % 4];
  const score = typeof value.matchScore === "number" && Number.isFinite(value.matchScore)
    ? Math.max(0, Math.min(100, Math.round(value.matchScore)))
    : 0;
  return {
    id,
    title,
    subtitle: textValue(value.subtitle) || "",
    price: textValue(value.price) || localizedCopy(locale, copy, "noPriceLabel", "面议", "Price on request"),
    monthly: textValue(value.priceLabel) || "",
    mileage: fact("mileage", "里程") || "—",
    location: textValue(value.location) || localizedCopy(locale, copy, "locationUnavailableLabel", "未提供", "Not provided"),
    energy: fact("energy", "能源") || "—",
    year: fact("year", "年份") || "—",
    matchScore: score,
    accent,
    reasons: reasons.length ? reasons : [localizedCopy(locale, copy, "defaultMatchReason", "根据当前需求排序", "Ranked against your current need")],
    trust,
    seller: textValue(value.seller) || localizedCopy(locale, copy, "supplySideLabel", "供给方", "Supply side"),
    response: textValue(value.response) || localizedCopy(locale, copy, "matchingInProgressLabel", "平台撮合中", "Matching in progress"),
  };
}

function isHostedFact(value: unknown): value is { key?: string; label: string; value: string } {
  return isRecord(value)
    && typeof value.label === "string"
    && typeof value.value === "string"
    && value.label.length <= 128
    && value.value.length <= 512;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 8)
    : [];
}

function ContactProfile({
  locale = "zh",
  copy,
  fields = [],
  submitContact,
  onNotice,
}: {
  locale?: PluginLocale;
  copy?: PluginCopy;
  fields?: NonNullable<PluginContext["ui"]>["contactFields"];
  submitContact: (contact: Record<string, string>) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const text = (key: string, fallbackZh: string, fallbackEn = fallbackZh) => localizedCopy(locale, copy, key, fallbackZh, fallbackEn);
  const configured = fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const contact = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value.trim()] as const).filter(([, value]) => value),
    );
    const missing = configured.find((field) => field.required && !contact[field.key]);
    if (missing) {
      onNotice(locale === "en" ? `${missing.label} is required` : `${missing.label}不能为空`);
      return;
    }
    if (!Object.keys(contact).length) {
      onNotice(text("contactRequiredNotice", "至少填写一种联系方式", "Add at least one contact channel"));
      return;
    }
    setSaving(true);
    try {
      await submitContact(contact);
      setValues({});
      onNotice(text("contactProfileSavedNotice", "联系方式已加密保存；双方同意后才会交换", "Contact details are encrypted and exchanged only after consent"));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : text("contactSaveFailedNotice", "联系方式保存失败，请稍后重试", "Contact details could not be saved. Try again"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="surface contact-profile-card" aria-labelledby="auto-contact-profile-title">
      <div className="contact-profile-heading">
        <div>
          <p className="eyebrow">{text("contactEyebrow", "联系方式", "Contact")}</p>
          <h3 id="auto-contact-profile-title">{text("contactTitle", "设置双方同意后交换的渠道", "Choose a channel to exchange after consent")}</h3>
          <p>{text("contactDescription", "联系方式字段由当前子平台配置，只有匹配双方同意后才会解锁。", "The fields are configured by this subplatform and unlock only after both sides agree.")}</p>
        </div>
      </div>
      {configured.length ? <form className="contact-profile-form" onSubmit={save}>
        {configured.map((field) => (
          <label key={field.key} htmlFor={`auto-contact-${field.key}`}>
            <span>{field.label}{field.required ? " *" : ""}</span>
            <input
              id={`auto-contact-${field.key}`}
              type={field.type === "tel" ? "tel" : field.type === "email" ? "email" : "text"}
              value={values[field.key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
              placeholder={field.placeholder}
              maxLength={256}
              required={field.required}
            />
          </label>
        ))}
        <div className="contact-profile-footer">
          <span>{text("contactEncryptedLabel", "加密保存 · 双方同意后释放", "Encrypted · released after consent")}</span>
          <button className="button button-dark" type="submit" disabled={saving}>{saving ? text("savingLabel", "保存中…", "Saving…") : text("saveContactLabel", "保存联系方式", "Save contact")}</button>
        </div>
      </form> : <p className="contact-profile-empty" role="status">{text("contactFieldsEmpty", "当前子平台尚未配置联系方式字段。", "This subplatform has not configured contact fields yet.")}</p>}
    </section>
  );
}

function createSecureId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const root = document.getElementById("root");
if (!root) throw new Error("plugin root element is missing");
createRoot(root).render(<AutoPlugin />);

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { BuyerDashboard } from "./components/BuyerDashboard";
import { ListingSheet } from "./components/Overlays";
import { PlatformDashboard } from "./components/PlatformDashboard";
import { SellerDashboard } from "./components/SellerDashboard";
import type { VehicleListing, WorkspaceRole } from "./types";
import "./styles.css";

type PluginContext = {
  role?: WorkspaceRole;
  path?: string;
  contextToken?: string;
  currency?: string;
  currencyScale?: number;
  assetSchema?: Record<string, unknown>;
  ui?: {
    supplyFields?: Array<{
      key: string;
      label: string;
      type?: "text" | "number" | "url" | "date" | "select";
      required?: boolean;
      placeholder?: string;
      options?: string[];
    }>;
  };
};

type ParentResponse = { ok: boolean; error?: string };

function AutoPlugin() {
  const [role, setRole] = useState<WorkspaceRole>("buyer");
  const [listing, setListing] = useState<VehicleListing | null>(null);
  const [notice, setNotice] = useState("等待根平台上下文");
  const [contextToken, setContextToken] = useState<string | null>(null);
  const [platformContext, setPlatformContext] = useState<PluginContext>({});
  const contextTokenRef = useRef<string | null>(null);
  const pendingRequests = useRef(new Map<string, (response: ParentResponse) => void>());

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !isRecord(event.data) || event.data.protocol !== "matchplane.plugin/v1") return;
      if (
        event.data.type === "listing.submit.result"
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
      if (event.data.type !== "platform.context" || !isRecord(event.data.payload)) return;
      const context = event.data.payload as PluginContext;
      setPlatformContext(context);
      if (context.role === "buyer" || context.role === "seller" || context.role === "platform" || context.role === "subplatform_admin") setRole(context.role);
      if (context.contextToken) {
        contextTokenRef.current = context.contextToken;
        setContextToken(context.contextToken);
      }
      setNotice(context.path ? `当前路径：${context.path}` : "已连接根平台");
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ protocol: "matchplane.plugin/v1", type: "plugin.ready", version: 1 }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const notify = (message: string) => {
    setNotice(message);
    postToParent("listing.select", { message });
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
      <div className="plugin-context" role="status">{notice}</div>
      {role === "buyer" ? (
        <BuyerDashboard onOpenListing={setListing} onNotice={notify} />
      ) : role === "seller" ? (
        <SellerDashboard
          onNotice={notify}
          onSubmitSupply={submitSupply}
          currency={platformContext.currency}
          currencyScale={platformContext.currencyScale}
          supplyFields={platformContext.ui?.supplyFields}
          assetSchema={platformContext.assetSchema}
        />
      ) : (
        <PlatformDashboard
          paymentMode="test"
          onRequestModeChange={() => notify("支付模式切换必须由根平台管理员确认")}
          onNotice={notify}
        />
      )}
      <ListingSheet listing={listing} onClose={() => setListing(null)} onContact={(selected) => notify(`已请求联系：${selected.title}`)} />
    </main>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

import { useEffect, useState } from "react";
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
};

function AutoPlugin() {
  const [role, setRole] = useState<WorkspaceRole>("buyer");
  const [listing, setListing] = useState<VehicleListing | null>(null);
  const [notice, setNotice] = useState("等待根平台上下文");

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !isRecord(event.data) || event.data.protocol !== "matchplane.plugin/v1") return;
      if (event.data.type !== "platform.context" || !isRecord(event.data.payload)) return;
      const context = event.data.payload as PluginContext;
      if (context.role === "buyer" || context.role === "seller" || context.role === "platform") setRole(context.role);
      setNotice(context.path ? `当前路径：${context.path}` : "已连接根平台");
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ protocol: "matchplane.plugin/v1", type: "plugin.ready", version: 1 }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const notify = (message: string) => {
    setNotice(message);
    window.parent.postMessage({ protocol: "matchplane.plugin/v1", type: "listing.select", payload: { message } }, "*");
  };

  return (
    <main className="plugin-app">
      <div className="plugin-context" role="status">{notice}</div>
      {role === "buyer" ? (
        <BuyerDashboard onOpenListing={setListing} onNotice={notify} />
      ) : role === "seller" ? (
        <SellerDashboard onNotice={notify} onSubmitSupply={(attributes) => {
          window.parent.postMessage({ protocol: "matchplane.plugin/v1", type: "listing.submit", payload: { attributes } }, "*");
        }} />
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

const root = document.getElementById("root");
if (!root) throw new Error("plugin root element is missing");
createRoot(root).render(<AutoPlugin />);

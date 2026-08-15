import type { ActivityItem, GatewaySummary, VehicleListing } from "./types";

/** Runtime inventory and operational metrics come from the root API. */
export const recommendations: VehicleListing[] = [];
export const gateways: GatewaySummary[] = [];
export const sellerActivity: ActivityItem[] = [];
export const paymentActivity: ActivityItem[] = [];

export type Role = "admin" | "vendor" | "customer";

export interface OrderItem {
  sku: string;
  item_name: string;
  qty: number;
}

export type OrderStatus = "requested" | "delivered" | "undelivered";

export interface Order {
  id: number;
  order_number: string;
  customer_username: string;
  vendor_username: string;
  items: OrderItem[];
  status: OrderStatus;
  undelivered_reason?: string | null;
  requested_at?: string;
  created_at?: string;
  updated_at?: string;
}

export type ClaimStatus = "pending" | "approved" | "rejected";

export interface Claim {
  id: number;
  claim_number: string;
  customer_username: string;
  vendor_username: string;
  order_id: number;
  sku: string;
  damage_type: string;
  damaged_qty: number;
  claim_text: string;
  status: ClaimStatus;
  decision_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface VendorInventoryItem {
  id: number;
  vendor_username: string;
  sku: string;
  item_name: string;
  qty_on_hand: number;
  reorder_threshold: number;
  manufacturing_critical: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerInventoryItem {
  id: number;
  customer_username: string;
  vendor_username: string;
  sku: string;
  item_name: string;
  qty_on_hand: number;
  created_at?: string;
  updated_at?: string;
}

export interface VendorSla {
  id: number;
  vendor_username: string;
  customer_usernames: string[];
  sla_document_filename: string;
  sla_text_cache: string;
  liability_summary: string;
  uploaded_at?: string;
}

export interface SlaAskResponse {
  answer: string | null;
  sources: string[];
  error: string | null;
}

export type AlertAudience = "admin" | "vendor" | "customer";
export type AlertStatus = "unread" | "read";

export interface Alert {
  id: number;
  audience: AlertAudience;
  target_username?: string | null;
  type: string;
  title: string;
  message: string;
  related_id?: number | null;
  status: AlertStatus;
  created_at?: string;
}

export interface CustomerVendorLink {
  id: number;
  customer_username: string;
  vendor_username: string;
  linked_at?: string;
}

export interface User {
  username: string;
  role: Role;
  display_name: string;
  company_name?: string | null;
  email?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Returned by GET /api/vendors/{username}/customers */
export interface MyCustomer {
  username: string;
  display_name: string;
  company_name?: string | null;
  order_count: number;
  claim_count: number;
}

/** Returned by GET /api/customers/{username}/vendors */
export interface MyVendor {
  username: string;
  display_name: string;
  company_name?: string | null;
  order_count: number;
  claim_count: number;
}

export interface AuditLog {
  id: number;
  actor: string;
  action: string;
  module: string;
  record_id?: number | null;
  details?: string;
  timestamp: string;
}

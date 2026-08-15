// Hand-written DB types for the tables/RPCs this app touches.
// (The local `supabase gen types` CLI isn't available in this environment;
// this covers what the app uses and can be regenerated later.)

export type RegistrationStatus = "pending" | "approved" | "rejected" | "cancelled";
export type EventStatusDb = "Open" | "Closed" | "Finished";
export type EventScopeDb = "Provincial" | "Chapter";

export interface EventRow {
  id: string;
  name: string;
  cover: string | null;
  date: string;
  time: string | null;
  venue: string | null;
  organizer: string | null;
  description: string | null;
  registration_deadline: string;
  slots_total: number;
  slots_taken: number;
  status: EventStatusDb;
  scope: EventScopeDb;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  cluster_id: string | null;
}

export interface RegistrationRow {
  id: string;
  registration_id: string;
  event_id: string;
  full_name: string;
  nickname: string | null;
  email: string;
  chapter: string;
  status: RegistrationStatus;
  qr_token: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ClusterRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface AdminRow {
  id: string;
  user_id: string;
  role: string;
  full_name: string | null;
  username: string | null;
  cluster_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type Table<R, I, U> = { Row: R; Insert: I; Update: U; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      events: Table<EventRow, Partial<EventRow>, Partial<EventRow>>;
      event_registrations: Table<RegistrationRow, Partial<RegistrationRow>, Partial<RegistrationRow>>;
      email_log: Table<
        { id: string; registration_id: string | null; to_email: string; status: string; error: string | null; created_at: string },
        { registration_id?: string | null; to_email: string; status?: string; error?: string | null },
        Partial<{ status: string; error: string | null }>
      >;
      audit_log: Table<
        { id: string; actor_user_id: string | null; action: string; entity: string; entity_id: string | null; meta: unknown; created_at: string },
        { actor_user_id?: string | null; action: string; entity: string; entity_id?: string | null; meta?: unknown },
        Partial<{ action: string }>
      >;
      admins: Table<AdminRow, Partial<AdminRow>, Partial<AdminRow>>;
      clusters: Table<ClusterRow, Partial<ClusterRow>, Partial<ClusterRow>>;
    };
    Views: Record<string, never>;
    Functions: {
      register_for_event: { Args: { p: Record<string, unknown> }; Returns: RegisterResult };
      check_registration: { Args: { p_registration_id: string; p_email: string }; Returns: CheckResult };
      check_rate_limit: { Args: { p_ip: string; p_endpoint: string; p_window_seconds: number; p_max: number }; Returns: boolean };
      is_admin: { Args: { uid: string }; Returns: boolean };
      is_pyh: { Args: { uid: string }; Returns: boolean };
      admin_cluster: { Args: { uid: string }; Returns: string | null };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export interface RegisterResult {
  ok: boolean;
  code?: string;
  registration_id?: string;
  qr_token?: string;
  status?: string;
}

export interface CheckResult {
  found: boolean;
  registration_id?: string;
  status?: RegistrationStatus;
  full_name?: string;
  event_name?: string;
  event_date?: string;
  qr_token?: string;
}

export interface SiteSettingsRow {
  id: number;
  name: string;
  full_name: string;
  tagline: string;
  description: string;
  province: string;
  email: string;
  phone: string;
  office: string;
  facebook_url: string | null;
  instagram_url: string | null;
  /** Canonical origin for metadataBase; null on rows predating migration 0018. */
  site_url: string | null;
  footer_explore_heading: string;
  footer_reach_heading: string;
  footer_closing_line: string;
  updated_at: string;
  updated_by: string | null;
}

export interface NavItemRow {
  href: string;
  label: string;
  sort_order: number;
  visible: boolean;
}

export interface PageRow {
  id: string;
  slug: string;
  title: string;
  seo_title: string | null;
  seo_description: string | null;
  og_image_path: string | null;
  is_system: boolean;
  visible: boolean;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
}

export interface PageSectionRow {
  id: string;
  page_id: string;
  type: string;
  content: unknown;
  sort_order: number;
  visible: boolean;
  updated_at: string;
}

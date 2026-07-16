export type AdminRole = "provincial_youth_head" | "cluster_head";

export interface AdminContext {
  userId: string;
  role: AdminRole;
  isPYH: boolean;
  clusterId: string | null;
  fullName: string | null;
}

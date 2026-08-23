"use client";

import { useTransition } from "react";
import { UserCog } from "lucide-react";
import { setActive, resetPassword, deleteClusterHead } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";

export type UserRow = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  cluster_name: string | null;
  is_active: boolean;
};

export function UsersTable({ rows }: { rows: UserRow[] }) {
  const [pending, start] = useTransition();

  const columns: Column<UserRow>[] = [
    {
      key: "full_name",
      header: "Name",
      primary: true,
      cell: (u) => (
        <>
          <span className="block font-medium text-[var(--fg)]">{u.full_name ?? "—"}</span>
          <span className="block text-xs text-muted sm:hidden">{u.username ?? "—"}</span>
        </>
      ),
    },
    {
      key: "username",
      header: "Username",
      hideOnCard: true,
      cell: (u) => u.username ?? "—",
    },
    { key: "cluster", header: "Cluster", cell: (u) => u.cluster_name ?? "—" },
    {
      key: "status",
      header: "Status",
      cell: (u) => (
        <Badge tone={u.is_active ? "success" : "neutral"}>
          {u.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      actions: true,
      align: "right",
      cell: (u) => (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            size="xs"
            variant="subtle"
            disabled={pending}
            onClick={() => start(() => setActive(u.user_id, !u.is_active))}
          >
            {u.is_active ? "Deactivate" : "Activate"}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            disabled={pending}
            onClick={() => {
              const p = prompt("New password (min 10 chars):");
              if (p) {
                const fd = new FormData();
                fd.set("password", p);
                start(() => resetPassword(u.user_id, fd));
              }
            }}
          >
            Reset password
          </Button>
          <Button
            size="xs"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm("Delete this cluster head?")) start(() => deleteClusterHead(u.user_id));
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(u) => u.user_id}
      caption="Cluster heads, with activate, reset password and delete actions"
      empty={
        <EmptyState
          icon={UserCog}
          title="No cluster heads yet"
          description="Add a cluster head to give them scoped access to their own cluster."
        />
      }
    />
  );
}

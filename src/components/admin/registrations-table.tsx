"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Download, Inbox } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { setStatus } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { DataTable, nextSort, type Column, type SortState } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";

export type Row = {
  registration_id: string;
  full_name: string;
  email: string;
  chapter: string;
  status: string;
  created_at: string;
};

/** Kept in sync with the server page's TABLE_PAGE_SIZE — the realtime refetch
 *  must not quietly widen the window the server rendered. */
const PAGE_SIZE = 200;

export function RegistrationsTable({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "created_at", direction: "desc" });

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const refetch = () =>
      supabase
        .from("event_registrations")
        .select("registration_id, full_name, email, chapter, status, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)
        .then(({ data }) => data && setRows(data as Row[]));
    const channel = supabase
      .channel("admin-registrations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_registrations" },
        refetch,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const act = (id: string, status: "approved" | "rejected") =>
    startTransition(async () => {
      // optimistic
      setRows((rs) => rs.map((r) => (r.registration_id === id ? { ...r, status } : r)));
      await setStatus(id, status);
    });

  // Search and sort are client-side over the rows already loaded. That is a
  // deliberate limit, not an oversight: the server sends the most recent
  // PAGE_SIZE and the header above the table says so, rather than this box
  // implying it can reach registrations that were never fetched.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? rows.filter((r) =>
          [r.full_name, r.email, r.chapter, r.registration_id].some((v) =>
            v.toLowerCase().includes(q),
          ),
        )
      : rows;

    const dir = sort.direction === "asc" ? 1 : -1;
    return [...matched].sort((a, b) => {
      const key = sort.key as keyof Row;
      return String(a[key]).localeCompare(String(b[key]), "en", { numeric: true }) * dir;
    });
  }, [rows, query, sort]);

  const exportCsv = () => {
    const header = "registration_id,full_name,email,chapter,status,created_at\n";
    const body = visible
      .map((r) =>
        [r.registration_id, r.full_name, r.email, r.chapter, r.status, r.created_at]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "zubida-registrations.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<Row>[] = [
    {
      key: "full_name",
      header: "Name",
      sortable: true,
      primary: true,
      cell: (r) => (
        <>
          <span className="block font-medium text-[var(--fg)]">{r.full_name}</span>
          <span className="block text-xs text-muted">{r.email}</span>
          <span className="mt-0.5 block font-mono text-[11px] text-muted sm:hidden">
            {r.registration_id}
          </span>
        </>
      ),
    },
    {
      key: "registration_id",
      header: "ID",
      sortable: true,
      hideOnCard: true,
      cell: (r) => <span className="font-mono text-xs text-muted">{r.registration_id}</span>,
      className: "w-40",
    },
    { key: "chapter", header: "Chapter", sortable: true, cell: (r) => r.chapter },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (r) => <Badge tone={toneForStatus(r.status)}>{r.status}</Badge>,
    },
    {
      key: "actions",
      header: "Actions",
      actions: true,
      align: "right",
      cell: (r) => (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            size="xs"
            variant="subtle"
            disabled={pending || r.status === "approved"}
            onClick={() => act(r.registration_id, "approved")}
            className="flex-1 sm:flex-none"
          >
            Approve
          </Button>
          <Button
            size="xs"
            variant="danger"
            disabled={pending || r.status === "rejected"}
            onClick={() => act(r.registration_id, "rejected")}
            className="flex-1 sm:flex-none"
          >
            Reject
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, chapter or ID"
          aria-label="Search the loaded registrations"
          className="mt-0 w-full sm:w-72"
        />
        <p className="text-sm text-muted" aria-live="polite">
          {visible.length === rows.length
            ? `${rows.length} registrations`
            : `${visible.length} of ${rows.length} match`}
        </p>
        <Button variant="outline" size="sm" onClick={exportCsv} className="ml-auto">
          <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
        </Button>
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => r.registration_id}
        caption="Event registrations, with approve and reject actions"
        sort={sort}
        onSortChange={(key) => setSort((s) => nextSort(s, key))}
        empty={
          query ? (
            <EmptyState
              icon={Inbox}
              title="No matches"
              description={`Nothing in the loaded registrations matches "${query}".`}
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No registrations yet"
              description="Registrations appear here as soon as someone signs up for an event."
            />
          )
        }
      />
    </div>
  );
}

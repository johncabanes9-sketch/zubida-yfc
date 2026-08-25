"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldGroup, Input } from "@/components/ui/field";
import type { OptionListRow } from "@/lib/supabase/database.types";

type Action = (formData: FormData) => Promise<{ error?: string }>;
type DeleteAction = (id: string) => Promise<{ error?: string }>;

const LISTS = [
  {
    key: "gender",
    label: "Gender",
    hint: "Offered on the public registration form.",
  },
  {
    key: "shirt_size",
    label: "Shirt size",
    hint: "Order here is the order members see.",
  },
] as const;

export function OptionLists({
  rows,
  addOption,
  deleteOption,
}: {
  rows: OptionListRow[];
  addOption: Action;
  deleteOption: DeleteAction;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardBody className="grid gap-6">
        <FieldGroup
          title="Registration options"
          description="The two dropdowns on the registration form. Existing registrations keep whatever they were submitted with, so removing an option never rewrites history. Delete every option in a list to restore the built-in one."
        >
          {error && (
            <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">
              {error}
            </p>
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            {LISTS.map((list) => (
              <OptionList
                key={list.key}
                list={list}
                values={rows.filter((r) => r.list_key === list.key)}
                pending={pending}
                onAdd={(value, done) =>
                  start(async () => {
                    const fd = new FormData();
                    fd.set("list_key", list.key);
                    fd.set("value", value);
                    const res = await addOption(fd);
                    setError(res.error ?? null);
                    if (!res.error) done();
                  })
                }
                onDelete={(id) =>
                  start(async () => {
                    const res = await deleteOption(id);
                    setError(res.error ?? null);
                  })
                }
              />
            ))}
          </div>
        </FieldGroup>
      </CardBody>
    </Card>
  );
}

function OptionList({
  list,
  values,
  pending,
  onAdd,
  onDelete,
}: {
  list: (typeof LISTS)[number];
  values: OptionListRow[];
  pending: boolean;
  onAdd: (value: string, done: () => void) => void;
  onDelete: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const value = draft.trim();
    if (value.length === 0) return;
    onAdd(value, () => {
      setDraft("");
      // Keep focus in the field: adding several sizes in a row is the normal
      // case, and losing focus after each one makes it feel broken.
      inputRef.current?.focus();
    });
  };

  return (
    <div>
      <Field label={list.label}>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={draft}
            maxLength={40}
            placeholder={`Add a ${list.label.toLowerCase()}…`}
            onChange={(e) => setDraft(e.target.value)}
            // The surrounding settings form submits on Enter; this field must
            // add an option instead of saving the whole page.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="subtle"
            disabled={pending || draft.trim().length === 0}
            onClick={submit}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Add {list.label.toLowerCase()}</span>
          </Button>
        </div>
      </Field>
      <p className="mt-1 text-xs text-muted">{list.hint}</p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {values.length === 0 && (
          <li className="text-xs text-muted">
            Empty — the built-in list is being used.
          </li>
        )}
        {values.map((row) => (
          <li
            key={row.id}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--rule-strong)] py-1 pl-3 pr-1 text-sm"
          >
            {row.value}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`Remove "${row.value}" from ${list.label.toLowerCase()}?`)) {
                  onDelete(row.id);
                }
              }}
              aria-label={`Remove ${row.value} from ${list.label.toLowerCase()}`}
              className="grid h-6 w-6 place-items-center rounded-full text-muted transition-colors hover:bg-danger-50 hover:text-danger-700 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

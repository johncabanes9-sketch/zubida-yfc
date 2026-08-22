"use client";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";

export type ClusterOption = { id: string; name: string };

export function CreateUserForm({
  action,
  clusters,
}: {
  action: (fd: FormData) => void;
  clusters: ClusterOption[];
}) {
  return (
    <Card className="max-w-xl">
      <form action={action}>
        <CardBody className="grid gap-4">
          <Field label="Full name" required>
            <Input name="full_name" required autoComplete="name" />
          </Field>
          <Field label="Email" required>
            <Input type="email" name="email" required autoComplete="email" />
          </Field>
          <Field label="Username" hint="Optional. Used only as a display handle.">
            <Input name="username" autoComplete="off" />
          </Field>
          <Field label="Cluster" required>
            <Select name="cluster_id" required defaultValue="">
              <option value="">Select cluster…</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Password"
            required
            hint="At least 10 characters. Shown in plain text so you can copy it before sending it on."
          >
            <Input type="text" name="password" required minLength={10} autoComplete="new-password" />
          </Field>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="is_active"
              value="true"
              defaultChecked
              className="h-4 w-4 rounded border-[var(--rule-strong)] accent-royal-700 dark:accent-gold-400"
            />
            Active
          </label>
          <div>
            <Button type="submit">Create cluster head</Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}

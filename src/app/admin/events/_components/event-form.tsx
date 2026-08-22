"use client";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldGroup, Input, Select, Textarea } from "@/components/ui/field";

export type ClusterOption = { id: string; name: string };
export type EventFormValues = {
  name?: string; date?: string; time?: string; venue?: string; organizer?: string;
  description?: string; cover?: string; registration_deadline?: string;
  slots_total?: number; status?: string; scope?: string; cluster_id?: string | null;
};

export function EventForm({
  action,
  values = {},
  clusters,
  isPYH,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  values?: EventFormValues;
  clusters: ClusterOption[];
  isPYH: boolean;
  submitLabel: string;
}) {
  return (
    <Card className="max-w-2xl">
      <form action={action}>
        <CardBody className="grid gap-6">
          <FieldGroup title="The event">
            <Field label="Name" required>
              <Input name="name" required defaultValue={values.name} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date" required>
                <Input type="date" name="date" required defaultValue={values.date} />
              </Field>
              <Field label="Time" hint="Free text, e.g. 8:00 AM – 5:00 PM">
                <Input name="time" defaultValue={values.time} />
              </Field>
            </div>
            <Field label="Venue">
              <Input name="venue" defaultValue={values.venue} />
            </Field>
            <Field label="Organizer">
              <Input name="organizer" defaultValue={values.organizer} />
            </Field>
            <Field label="Cover image URL">
              <Input name="cover" defaultValue={values.cover} />
            </Field>
            <Field label="Description">
              <Textarea name="description" rows={4} defaultValue={values.description} />
            </Field>
          </FieldGroup>

          <FieldGroup
            title="Registration"
            description="Capacity is enforced in the database, so slots cannot be oversold by two people registering at once."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Registration deadline" required>
                <Input
                  type="datetime-local"
                  name="registration_deadline"
                  required
                  defaultValue={values.registration_deadline}
                />
              </Field>
              <Field label="Total slots" required>
                <Input
                  type="number"
                  name="slots_total"
                  min={0}
                  required
                  defaultValue={values.slots_total}
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Visibility">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status" hint="Only Open events appear on the public site.">
                <Select name="status" defaultValue={values.status ?? "Open"}>
                  <option value="Open">Open (published)</option>
                  <option value="Closed">Closed</option>
                  <option value="Finished">Finished (archived)</option>
                </Select>
              </Field>
              <Field label="Scope">
                <Select name="scope" defaultValue={values.scope ?? "Provincial"}>
                  <option value="Provincial">Provincial</option>
                  <option value="Chapter">Chapter</option>
                </Select>
              </Field>
            </div>
            {isPYH && (
              <Field label="Cluster">
                <Select name="cluster_id" defaultValue={values.cluster_id ?? ""}>
                  <option value="">Provincial-wide (no cluster)</option>
                  {clusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </FieldGroup>

          <div>
            <Button type="submit">{submitLabel}</Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}

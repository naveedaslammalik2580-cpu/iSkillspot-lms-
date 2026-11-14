"use client";
import { useState } from "react";
import { ActionForm } from "./forms";
import {
  reviewAdmissionAction,
  saveAdmissionSettingsAction,
} from "@/lib/actions/admissions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
type Course = {
  id: string;
  title: string;
  defaultFee: number | null;
  admissionPayment: number | null;
  admissionsOpen?: boolean;
  batches: { id: string; name: string }[];
};
const selectClass = "h-11 w-full rounded-md border bg-background px-3";
export function ReviewForm({
  id,
  courseId,
  batchId,
  courses,
  total,
  minimum,
}: {
  id: string;
  courseId: string;
  batchId: string;
  courses: Course[];
  total: number;
  minimum: number;
}) {
  const [decision, setDecision] = useState("APPROVE"),
    [selected, setSelected] = useState(courseId);
  const course = courses.find((c) => c.id === selected);
  return (
    <ActionForm action={reviewAdmissionAction} label="Save admission decision">
      <input type="hidden" name="id" value={id} />
      <div className="space-y-2">
        <Label htmlFor="decision">Decision</Label>
        <select
          id="decision"
          name="decision"
          className={selectClass}
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
        >
          <option value="APPROVE">Approve admission</option>
          <option value="INFORMATION_REQUESTED">
            Request further information
          </option>
          <option value="REJECTED">Reject admission</option>
        </select>
      </div>
      {decision === "APPROVE" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="courseId">Confirm course</Label>
            <select
              id="courseId"
              name="courseId"
              className={selectClass}
              required
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-muted-foreground">
            Course fee: {selected === courseId ? total : course?.defaultFee}.
            Required payment:{" "}
            {selected === courseId ? minimum : course?.admissionPayment}.
          </p>
          <div className="space-y-2">
            <Label htmlFor="batchId">Assign batch</Label>
            <select
              key={selected}
              id="batchId"
              name="batchId"
              required
              defaultValue={selected === courseId ? batchId : ""}
              className={selectClass}
            >
              <option value="">Select a batch</option>
              {course?.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Received payment amount</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min="0"
              step="0.01"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="method">Verified payment method</Label>
            <select id="method" name="method" className={selectClass} required>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="ONLINE">
                Easypaisa / JazzCash / online transfer
              </option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference">
              Actual transaction reference / receipt number
            </Label>
            <Input
              id="reference"
              name="reference"
              minLength={3}
              maxLength={200}
              required
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" name="installments" />
            Approve the remaining balance on installments
          </label>
          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <input className="mt-1" type="checkbox" name="verified" required />I
            verified the actual transaction in the official payment account or
            cash receipt. A screenshot alone is insufficient.
          </label>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="note">
            {decision === "REJECTED"
              ? "Reason for rejection"
              : "Information needed"}
          </Label>
          <textarea
            id="note"
            name="note"
            required
            minLength={5}
            maxLength={1000}
            rows={4}
            className="w-full rounded-md border bg-background p-3"
          />
        </div>
      )}
    </ActionForm>
  );
}
export function AdmissionSettingsForm({
  settings,
  courses,
}: {
  settings: {
    open: boolean;
    whatsapp: string;
    instructions: string;
    methods: { name: string; method: string; account: string }[];
  };
  courses: Course[];
}) {
  return (
    <section className="mt-8 rounded-lg border bg-card p-5">
      <h2 className="mb-5 text-xl font-semibold">Admission settings</h2>
      <ActionForm
        action={saveAdmissionSettingsAction}
        label="Save admission settings"
      >
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="open" defaultChecked={settings.open} />
          Open public student admissions
        </label>
        <div className="space-y-2">
          <Label htmlFor="whatsapp">
            Official admin WhatsApp (with country code)
          </Label>
          <Input
            id="whatsapp"
            name="whatsapp"
            defaultValue={settings.whatsapp}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="instructions">Admission instructions</Label>
          <textarea
            id="instructions"
            name="instructions"
            defaultValue={settings.instructions}
            rows={3}
            maxLength={2000}
            className="w-full rounded border bg-background p-3"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="methods">
            Official payment methods and account details (JSON)
          </Label>
          <textarea
            id="methods"
            name="methods"
            required
            rows={7}
            defaultValue={JSON.stringify(settings.methods, null, 2)}
            placeholder={
              '[{"name":"Bank transfer","method":"BANK_TRANSFER","account":"Official account title and number"}]'
            }
            className="w-full rounded border bg-background p-3 font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Each entry needs name, method and account. Use ONLINE for Easypaisa
            or JazzCash, BANK_TRANSFER for bank accounts.
          </p>
        </div>
        <div className="space-y-4">
          <h3 className="font-semibold">Courses accepting admissions</h3>
          {courses.map((c) => (
            <div
              key={c.id}
              className="grid gap-3 rounded border p-3 sm:grid-cols-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`open:${c.id}`}
                  defaultChecked={c.admissionsOpen}
                />
                {c.title} · Fee {c.defaultFee ?? "not set"}
              </label>
              <div>
                <Label htmlFor={`payment:${c.id}`}>
                  Required admission payment
                </Label>
                <Input
                  id={`payment:${c.id}`}
                  name={`payment:${c.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={c.admissionPayment ?? ""}
                />
              </div>
            </div>
          ))}
        </div>
      </ActionForm>
    </section>
  );
}

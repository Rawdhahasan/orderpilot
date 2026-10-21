"use client";

import { CheckCircle2, FileUp, OctagonAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { finalizeUpload, prepareUpload } from "@/features/intake/actions";
import { cn } from "@/lib/cn";

type Item = {
  key: string;
  file: File;
  progress: number;
  state: "waiting" | "uploading" | "verifying" | "done" | "failed";
  message?: string;
  intakeId?: string;
  reference?: string;
  duplicate?: boolean;
};

const ACCEPT = ["application/pdf", "image/png", "image/jpeg"];
const MAX_FILES = 10;

/** Upload to private storage with a signed URL, showing progress (FR-UPL-04). */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

export function UploadForm({
  organizationId,
  slug,
  customers,
}: {
  organizationId: string;
  slug: string;
  customers: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function add(files: FileList | null) {
    if (!files) return;
    const next = [...files].slice(0, MAX_FILES - items.length).map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      progress: 0,
      state:
        ACCEPT.includes(file.type) && file.size <= 20 * 1024 * 1024
          ? ("waiting" as const)
          : ("failed" as const),
      message: !ACCEPT.includes(file.type)
        ? "Only PDF, PNG and JPEG files are accepted."
        : file.size > 20 * 1024 * 1024
          ? "Files must be at most 20 MB."
          : undefined,
    }));
    setItems((list) => [...list, ...next]);
  }

  async function uploadAll() {
    setBusy(true);
    for (const item of items.filter((i) => i.state === "waiting")) {
      update(item.key, { state: "uploading" });
      const prepared = await prepareUpload({
        organizationId,
        name: item.file.name,
        type: item.file.type,
        size: item.file.size,
      });
      if (!prepared.ok) {
        update(item.key, { state: "failed", message: prepared.message });
        continue;
      }
      const uploaded = await putWithProgress(prepared.signedUrl, item.file, (progress) =>
        update(item.key, { progress }),
      );
      if (!uploaded) {
        update(item.key, { state: "failed", message: "The upload did not complete. Try again." });
        continue;
      }
      update(item.key, { state: "verifying", progress: 100 });
      const result = await finalizeUpload({
        documentId: prepared.documentId,
        customerHintId: hint || null,
        slug,
      });
      if (result.ok)
        update(item.key, {
          state: "done",
          intakeId: result.intakeId,
          reference: result.reference,
          duplicate: result.duplicate,
        });
      else update(item.key, { state: "failed", message: result.message });
    }
    setBusy(false);
  }

  const waiting = items.filter((i) => i.state === "waiting").length;
  return (
    <div className="space-y-5">
      <NativeSelect
        label="Customer (optional)"
        name="customerHint"
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        help="A hint for matching. You still confirm the customer during review."
        options={[
          { value: "", label: "Not sure yet" },
          ...customers.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center",
          dragging ? "border-primary bg-blue-50" : "border-neutral-300 bg-white",
        )}
      >
        <FileUp aria-hidden className="size-6 text-subtle-foreground" />
        <p className="text-body text-navy-900">Drag purchase orders here</p>
        <p className="text-small text-subtle-foreground">
          PDF, PNG or JPEG · up to 20 MB and 50 pages · up to {MAX_FILES} files
        </p>
        <Button type="button" onClick={() => input.current?.click()}>
          Choose files
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          className="sr-only"
          aria-label="Choose purchase order files"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 ? (
        <ul
          className="divide-y divide-border rounded-lg border border-border bg-white"
          aria-live="polite"
        >
          {items.map((i) => (
            <li
              key={i.key}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
              data-testid="upload-item"
            >
              <span className="min-w-0 flex-1 truncate text-small font-medium text-navy-900">
                {i.file.name}
              </span>
              {i.state === "uploading" || i.state === "waiting" ? (
                <progress
                  max={100}
                  value={i.progress}
                  className="h-2 w-40"
                  aria-label={`Upload progress for ${i.file.name}`}
                />
              ) : null}
              <span className="text-small">
                {i.state === "waiting" ? (
                  <span className="text-subtle-foreground">Ready</span>
                ) : null}
                {i.state === "uploading" ? (
                  <span className="text-subtle-foreground">Uploading {i.progress}%</span>
                ) : null}
                {i.state === "verifying" ? (
                  <span className="text-subtle-foreground">Checking the file…</span>
                ) : null}
                {i.state === "failed" ? (
                  <span className="inline-flex items-center gap-1 text-danger-700">
                    <OctagonAlert aria-hidden className="size-3.5" />
                    {i.message}
                  </span>
                ) : null}
                {i.state === "done" ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-success-800">
                      <CheckCircle2 aria-hidden className="size-3.5" />
                      <Link
                        href={`/o/${slug}/customer-pos/${i.intakeId}`}
                        className="font-mono font-medium hover:underline"
                      >
                        {i.reference}
                      </Link>
                    </span>
                    {i.duplicate ? (
                      <span className="inline-flex items-center gap-1 text-warning-800">
                        <TriangleAlert aria-hidden className="size-3.5" />
                        Same file as another order
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Button variant="primary" onClick={uploadAll} disabled={busy || waiting === 0} pending={busy}>
        Upload {waiting > 0 ? waiting : ""} {waiting === 1 ? "file" : "files"}
      </Button>
    </div>
  );
}

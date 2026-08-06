"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, Label } from "@/components/ui";

const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

/**
 * A file name safe to use as a storage key.
 *
 * The key ends up inside a URL when the photo is fetched back, and the
 * helper that builds that URL escapes with encodeURI — which leaves #, ?,
 * & and + exactly as they are. A receipt saved as "Lowes #4.jpg" therefore
 * signs to a link pointing at the wrong object, or to one whose token has
 * been swallowed by the query string. A random ID already makes the key
 * unique, so the name is only here to stay readable in the bucket.
 */
function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  const ext = (dot > 0 ? name.slice(dot + 1) : "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
    .slice(0, 8);
  return ext ? `${stem || "receipt"}.${ext}` : stem || "receipt";
}

/** What the file actually is, falling back to the extension. */
function imageType(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Take a photo (or pick an existing one) and file it in the receipt log.
 * On a phone or tablet the camera button opens the camera directly.
 *
 * `uploaderId` is whose name the receipt is logged under.
 */
export default function ReceiptCapture({
  uploaderId,
  onSaved,
  title = "Capture a receipt",
}: {
  uploaderId: string | null;
  onSaved?: () => void;
  title?: string;
}) {
  const supabase = createClient();
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus(null);
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setNote("");
    setAmount("");
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  }

  async function save() {
    if (!file || !uploaderId) return;
    setBusy(true);
    setStatus("Uploading…");

    const path = `${uploaderId}/${crypto.randomUUID()}-${safeName(file.name)}`;

    // Upload the bytes rather than the File itself. Handed a File, the
    // Supabase client posts it as form data and lets the browser decide the
    // type — which is an empty string on some phone pickers, and gets stored
    // as a non-image. An ArrayBuffer takes the path where contentType is
    // actually sent, so the photo is always filed as a photo.
    const contentType = imageType(file);
    const { error: upErr } = await supabase.storage
      .from("receipts")
      .upload(path, await file.arrayBuffer(), { contentType });
    if (upErr) {
      // The storage rules reject an upload into a folder that isn't
      // yours unless you're the boss — say so instead of showing the
      // raw database wording.
      const permissionIssue = /row-level security|violates|not authorized/i.test(
        upErr.message
      );
      setStatus(
        permissionIssue
          ? "Upload blocked by the database rules. Run supabase/08-receipt-storage-fix.sql in the Supabase SQL Editor, then try again."
          : `Upload failed: ${upErr.message}`
      );
      setBusy(false);
      return;
    }

    const { error: dbErr } = await supabase.from("receipts").insert({
      uploaded_by: uploaderId,
      file_path: path,
      note: note || null,
      amount: amount ? Number(amount) : null,
    });

    setBusy(false);
    if (dbErr) {
      setStatus(`Save failed: ${dbErr.message}`);
      return;
    }
    setStatus("Added to the receipt log ✔");
    reset();
    onSaved?.();
  }

  return (
    <Card title={title}>
      {preview ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Receipt preview"
            className="w-full max-h-64 object-contain rounded-lg border border-line bg-bone"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>What was it for?</Label>
              <Input
                placeholder="Gas, mower blades, fertilizer…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div>
              <Label>Amount (optional)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="24.99"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save to log"}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={busy}>
              Retake
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex-1 rounded-xl border-2 border-dashed border-line hover:border-cut hover:bg-bone-dim transition-colors py-6 text-center"
          >
            <div className="text-2xl mb-1">📷</div>
            <div className="text-sm font-medium">Take a photo</div>
            <div className="text-xs text-ink-soft">Opens your camera</div>
          </button>
          <button
            onClick={() => libraryRef.current?.click()}
            className="flex-1 rounded-xl border-2 border-dashed border-line hover:border-cut hover:bg-bone-dim transition-colors py-6 text-center"
          >
            <div className="text-2xl mb-1">🖼️</div>
            <div className="text-sm font-medium">Choose a file</div>
            <div className="text-xs text-ink-soft">From this device</div>
          </button>
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {status && !preview && (
        <p className="text-sm text-cut mt-3">{status}</p>
      )}
      {status && preview && <p className="text-sm text-ink-soft mt-2">{status}</p>}
    </Card>
  );
}

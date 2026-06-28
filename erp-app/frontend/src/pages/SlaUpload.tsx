import React, { useEffect, useRef, useState } from "react";
import { api, ApiError, BASE_URL } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/Modal";
import { AskSlaBox } from "../components/AskSlaBox";
import type { MyCustomer, VendorSla } from "../lib/types";

export default function SlaUpload() {
  const { user } = useAuth();
  const { show } = useToast();
  const [slas, setSlas] = useState<VendorSla[]>([]);
  const [customers, setCustomers] = useState<MyCustomer[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [slaList, customerList] = await Promise.all([
        api.get<VendorSla[]>("/api/vendors/sla"),
        user ? api.get<MyCustomer[]>(`/api/vendors/${user.username}/customers`) : Promise.resolve([]),
      ]);
      setSlas(slaList.filter((s) => s.vendor_username === user?.username));
      setCustomers(customerList);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load SLAs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);

  function toggleCustomer(username: string) {
    setSelectedCustomers((prev) =>
      prev.includes(username) ? prev.filter((c) => c !== username) : [...prev, username]
    );
  }

  function pickFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      show("error", "Only PDF files are supported");
      return;
    }
    setPendingFile(file);
  }

  async function upload() {
    if (!pendingFile) return;
    if (selectedCustomers.length === 0) {
      show("error", "Select at least one customer to share this SLA with");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      form.append("customer_usernames", JSON.stringify(selectedCustomers));
      const token = localStorage.getItem("erp_token");
      const res = await fetch(`${BASE_URL}/api/vendors/sla/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      if (!res.ok) {
        let detail = `Upload failed (${res.status})`;
        try {
          detail = (await res.json()).detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      show("success", "SLA uploaded and indexed for AI Q&A");
      setPendingFile(null);
      setSelectedCustomers([]);
      load();
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteSla(id: number) {
    setDeletingId(id);
    try {
      await api.delete(`/api/vendors/sla/${id}`);
      show("success", "SLA deleted");
      setSlas((prev) => prev.filter((s) => s.id !== id));
      setConfirmId(null);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to delete SLA");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Upload SLA</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Upload a Service Level Agreement PDF and choose which customers can see it. It's
          automatically indexed so customers (and you) can ask AI questions about it.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) pickFile(f);
        }}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent/5"
            : "border-slate-300 dark:border-navy-600"
        }`}
      >
        <span className="text-3xl">📄</span>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {pendingFile ? pendingFile.name : "Drag & drop a PDF here, or"}
        </p>
        <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {pendingFile && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Share this SLA with which customers?
          </p>
          {customers.length === 0 ? (
            <p className="text-sm text-slate-400">No linked customers yet — link one first.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {customers.map((c) => (
                <label
                  key={c.username}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-navy-600 dark:text-slate-200"
                >
                  <input
                    type="checkbox"
                    checked={selectedCustomers.includes(c.username)}
                    onChange={() => toggleCustomer(c.username)}
                  />
                  {c.display_name} (@{c.username})
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={upload} disabled={uploading || selectedCustomers.length === 0}>
              {uploading ? "Uploading…" : "Upload & share"}
            </Button>
            <Button variant="secondary" onClick={() => setPendingFile(null)} disabled={uploading}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Your uploaded SLAs</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : slas.length === 0 ? (
          <p className="text-sm text-slate-400">No SLA uploaded yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {slas.map((sla) => (
              <Card key={sla.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {sla.sla_document_filename}
                  </span>
                  <div className="flex items-center gap-3">
                    {sla.uploaded_at && (
                      <span className="text-[11px] text-slate-400">
                        {new Date(sla.uploaded_at).toLocaleString()}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirmId(sla.id)}
                      disabled={deletingId === sla.id}
                    >
                      {deletingId === sla.id ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Shared with: {sla.customer_usernames.join(", ") || "(no one)"}
                </p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Liability summary</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{sla.liability_summary}</p>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-medium text-accent">
                    View extracted text
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-navy-900 dark:text-slate-300">
                    {sla.sla_text_cache}
                  </pre>
                </details>
                <AskSlaBox slaId={sla.id} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId !== null && deleteSla(confirmId)}
        message="Delete this SLA document? Customers you shared it with will no longer be able to view or ask about it."
      />
    </div>
  );
}

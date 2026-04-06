import { useEffect, useState } from "react";

const API = "/api";

type InvoiceStatus = "draft" | "issued" | "sent" | "paid" | "cancelled";

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  status: InvoiceStatus;
  orderId?: string;
  customerId?: string;
  amountCzk: number;
  currency: string;
  issueDate: string;
  dueDate?: string;
  pdfUrl?: string;
  emailSentAt?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft:     "bg-gray-100 text-gray-600",
  issued:    "bg-blue-100 text-blue-700",
  sent:      "bg-purple-100 text-purple-700",
  paid:      "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

export default function InvoicesAdminPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [generateOrderId, setGenerateOrderId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState("");

  const token = localStorage.getItem("admin_token") ?? "";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function fetchInvoices() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/invoices`, { headers });
      const data = await r.json();
      setInvoices(data.invoices ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchInvoices(); }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!generateOrderId.trim()) return;
    setGenerating(true);
    setGenerateMsg("");
    try {
      const r = await fetch(`${API}/admin/invoices/generate/${generateOrderId.trim()}`, { method: "POST", headers });
      const data = await r.json();
      if (r.ok) {
        setGenerateMsg(`Invoice ${data.invoice?.invoiceNumber} created`);
        setGenerateOrderId("");
        fetchInvoices();
      } else {
        setGenerateMsg(data.error ?? "Failed");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleViewHtml(id: string) {
    const r = await fetch(`${API}/admin/invoices/${id}`, { headers });
    const data = await r.json();
    if (data.invoice?.htmlContent) {
      const win = window.open("", "_blank");
      win?.document.write(data.invoice.htmlContent);
      win?.document.close();
    }
  }

  async function handleDownloadPdf(id: string, invoiceNumber: string) {
    const r = await fetch(`${API}/admin/invoices/${id}/pdf`, { headers });
    if (!r.ok) { alert("PDF not available"); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalRevenue = invoices.filter(i => ["issued","sent","paid"].includes(i.status)).reduce((s, i) => s + i.amountCzk, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">Faktury — AIST Delivery (OSVČ, neplátce DPH)</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-900">{invoices.length}</div>
          <div className="text-sm text-gray-500">Total invoices</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-[#1762FF]">{invoices.filter(i => i.status === "issued").length}</div>
          <div className="text-sm text-gray-500">Issued</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-600">{totalRevenue.toLocaleString("cs-CZ")} CZK</div>
          <div className="text-sm text-gray-500">Invoiced revenue</div>
        </div>
      </div>

      {/* Manual generate */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-blue-800 mb-3">Generate invoice for order</h3>
        <form onSubmit={handleGenerate} className="flex gap-3">
          <input
            className="flex-1 border border-blue-200 bg-white rounded-lg px-3 py-2 text-sm"
            value={generateOrderId} onChange={e => setGenerateOrderId(e.target.value)}
            placeholder="Order UUID" required
          />
          <button type="submit" disabled={generating} className="bg-[#1762FF] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {generating ? "Generating..." : "Generate"}
          </button>
        </form>
        {generateMsg && <p className="text-xs mt-2 text-blue-700">{generateMsg}</p>}
      </div>

      {loading ? (
        <div className="text-gray-400 py-12 text-center">Loading...</div>
      ) : invoices.length === 0 ? (
        <div className="text-gray-400 py-12 text-center">No invoices yet</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Invoice #","Status","Type","Amount","Customer","Order","Issue Date","Due Date","PDF","Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1762FF]">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status]}`}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{inv.invoiceType}</td>
                  <td className="px-4 py-3 font-semibold">{inv.amountCzk} CZK</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{inv.customerId?.slice(0, 8) ?? "—"}…</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{inv.orderId?.slice(0, 8) ?? "—"}…</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(inv.issueDate).toLocaleDateString("cs-CZ")}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("cs-CZ") : "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                      className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded hover:bg-green-100 flex items-center gap-1"
                    >
                      ⬇ PDF
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleViewHtml(inv.id)} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100">
                      Preview
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

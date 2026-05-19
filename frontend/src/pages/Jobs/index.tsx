import React, { useEffect, useState } from "react";
import { Activity, RefreshCw, Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type AdRun = {
  id: string;
  competitor_id: string;
  status: string;
  apify_run_id: string | null;
  ads_found: number;
  ads_processed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  ad_competitors?: { name: string } | null;
};

type TranscriptionBatch = {
  id: string;
  platform: string;
  status: string;
  total_items: number;
  completed_items: number;
  created_at: string;
};

type TranscriptionItem = {
  id: string;
  batch_id: string;
  url: string;
  status: string;
  error_message: string | null;
};

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "completed" || s === "success" || s === "done") {
    return <span className="badge" style={{ background: "#0f3e1a", color: "#22c55e", border: "1px solid #22c55e" }}>{status}</span>;
  }
  if (s === "processing" || s === "running" || s === "pending") {
    return <span className="badge" style={{ background: "#0f2c3e", color: "#3b82f6", border: "1px solid #3b82f6" }}>{status}</span>;
  }
  if (s === "error" || s === "failed" || s === "partial_error") {
    return <span className="badge" style={{ background: "#3e0f0f", color: "#ef4444", border: "1px solid #ef4444" }}>{status}</span>;
  }
  return <span className="badge">{status}</span>;
}

function isErrorStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "error" || s === "failed" || s === "partial_error";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return `${diff}s atras`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m atras`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atras`;
  return `${Math.floor(diff / 86400)}d atras`;
}

export default function Jobs() {
  const [adRuns, setAdRuns] = useState<AdRun[]>([]);
  const [batches, setBatches] = useState<TranscriptionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<Record<string, TranscriptionItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<string | null>(null);

  async function fetchAll() {
    setLoading(true);
    try {
      const [runsResp, batchesResp] = await Promise.all([
        supabase
          .from("ad_collection_runs")
          .select("*, ad_competitors(name)")
          .order("started_at", { ascending: false })
          .limit(50),
        supabase
          .from("transcription_batches")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (runsResp.data) setAdRuns(runsResp.data as AdRun[]);
      if (batchesResp.data) setBatches(batchesResp.data as TranscriptionBatch[]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchBatchItems(batchId: string) {
    if (batchItems[batchId]) return; // already loaded
    setLoadingItems(batchId);
    try {
      const { data } = await supabase
        .from("transcription_items")
        .select("id, batch_id, url, status, error_message")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true });
      if (data) {
        setBatchItems((prev) => ({ ...prev, [batchId]: data as TranscriptionItem[] }));
      }
    } finally {
      setLoadingItems(null);
    }
  }

  function toggleBatchExpand(batchId: string) {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
    } else {
      setExpandedBatch(batchId);
      fetchBatchItems(batchId);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchAll, 5000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  const stats = {
    runsActive: adRuns.filter(r => r.status === "running").length,
    runsError: adRuns.filter(r => r.status === "failed" || r.status === "error").length,
    batchesActive: batches.filter(b => b.status === "processing").length,
    batchesError: batches.filter(b => b.status === "partial_error").length,
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="icon-circle"><Activity /></div>
        <div>
          <h1>Jobs</h1>
          <p>Status das coletas e transcricoes em andamento</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard icon={Loader2} label="Coletas ativas" value={stats.runsActive} color="#3b82f6" />
        <StatCard icon={AlertTriangle} label="Coletas c/ erro" value={stats.runsError} color="#ef4444" />
        <StatCard icon={Loader2} label="Transcricoes ativas" value={stats.batchesActive} color="#3b82f6" />
        <StatCard icon={AlertTriangle} label="Transcricoes c/ erro" value={stats.batchesError} color="#ef4444" />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh 5s
          </label>
          <Button size="sm" onClick={fetchAll} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "1fr 1fr" }}>
        <section>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--text-2)" }}>
            Coletas Ad Intelligence ({adRuns.length})
          </h2>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
            }}
          >
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>Concorrente</th>
                  <th>Status</th>
                  <th>Ads</th>
                  <th>Iniciado</th>
                </tr>
              </thead>
              <tbody>
                {adRuns.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>Nenhuma coleta registrada</td></tr>
                )}
                {adRuns.map(r => {
                  const isErr = isErrorStatus(r.status) && r.error_message;
                  const isExpanded = expandedRun === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        onClick={() => isErr && setExpandedRun(isExpanded ? null : r.id)}
                        style={{ cursor: isErr ? "pointer" : "default", background: isExpanded ? "var(--surface-hover)" : undefined }}
                      >
                        <td style={{ color: "var(--text-3)" }}>
                          {isErr && <ChevronRight size={12} style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />}
                        </td>
                        <td>{r.ad_competitors?.name || r.competitor_id.slice(0, 8)}</td>
                        <td><StatusBadge status={r.status} /></td>
                        <td style={{ fontSize: 12 }}>{r.ads_processed}/{r.ads_found || "?"}</td>
                        <td style={{ fontSize: 12, color: "var(--text-3)" }}>{relativeTime(r.started_at)}</td>
                      </tr>
                      {isExpanded && isErr && (
                        <tr>
                          <td colSpan={5} style={{ padding: 0, background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }}>
                            <div style={{ padding: "10px 14px 12px 34px" }}>
                              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#ef4444", marginBottom: 4 }}>
                                Erro
                              </div>
                              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace" }}>
                                {r.error_message}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--text-2)" }}>
            Transcricoes em lote ({batches.length})
          </h2>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
            }}
          >
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>Plataforma</th>
                  <th>Status</th>
                  <th>Progresso</th>
                  <th>Iniciado</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>Nenhum lote registrado</td></tr>
                )}
                {batches.map(b => {
                  const isErr = isErrorStatus(b.status);
                  const isExpanded = expandedBatch === b.id;
                  const items = batchItems[b.id] || [];
                  const errorItems = items.filter((it) => it.status === "error" && it.error_message);
                  return (
                    <React.Fragment key={b.id}>
                      <tr
                        onClick={() => isErr && toggleBatchExpand(b.id)}
                        style={{ cursor: isErr ? "pointer" : "default", background: isExpanded ? "var(--surface-hover)" : undefined }}
                      >
                        <td style={{ color: "var(--text-3)" }}>
                          {isErr && <ChevronRight size={12} style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />}
                        </td>
                        <td style={{ textTransform: "capitalize" }}>{b.platform}</td>
                        <td><StatusBadge status={b.status} /></td>
                        <td style={{ fontSize: 12 }}>{b.completed_items}/{b.total_items}</td>
                        <td style={{ fontSize: 12, color: "var(--text-3)" }}>{relativeTime(b.created_at)}</td>
                      </tr>
                      {isExpanded && isErr && (
                        <tr>
                          <td colSpan={5} style={{ padding: 0, background: "rgba(239,68,68,0.04)", borderLeft: "3px solid #ef4444" }}>
                            <div style={{ padding: "10px 14px 12px 34px" }}>
                              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#ef4444", marginBottom: 6 }}>
                                Erros ({errorItems.length})
                              </div>
                              {loadingItems === b.id ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-3)", fontSize: 12 }}>
                                  <Loader2 className="w-3 h-3 animate-spin" /> Carregando erros...
                                </div>
                              ) : errorItems.length === 0 ? (
                                <div style={{ fontSize: 12, color: "var(--text-3)" }}>Nenhum erro encontrado nos itens</div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                  {errorItems.map((it) => (
                                    <div key={it.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
                                      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, wordBreak: "break-all" }}>
                                        {it.url}
                                      </div>
                                      <div style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace" }}>
                                        {it.error_message}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "12px 16px",
        display: "flex",
        gap: 10,
        alignItems: "center",
        minWidth: 170,
      }}
    >
      <Icon size={18} style={{ color }} />
      <div>
        <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>{value}</div>
      </div>
    </div>
  );
}

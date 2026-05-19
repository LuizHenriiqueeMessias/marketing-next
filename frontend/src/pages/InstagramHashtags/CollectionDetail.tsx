import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Hash, Image as ImageIcon, Inbox, Layers, Loader2, Sparkles, Trash2, Video, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Collection = {
  id: string;
  profile_id: string;
  hashtags: string[] | null;
  scrape_recent_days: number | null;
  posts_per_tag: number | null;
  status: string | null;
  posts_count: number | null;
  created_at: string;
};

type InspirationPost = {
  id: string;
  post_id: string | null;
  post_url: string | null;
  caption: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  analysis: any;
  curtidas: number | null;
  visualizacoes: number | null;
  created_at: string;
};

type ReadaptedPost = {
  id: string;
  inspiration_post_id: string | null;
  original_caption: string | null;
  original_post_url: string | null;
  original_thumbnail_url: string | null;
  media_type: string | null;
  tema: string | null;
  gancho: string | null;
  sugestao_readaptacao: string | null;
  score_relevancia: number | null;
  created_at: string;
};

type TabKey = "coletados" | "readaptacoes" | "descartados";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function parseAnalysis(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  if (typeof value === "object") return value as Record<string, any>;
  return null;
}

function MediaIcon({ type }: { type: string | null }) {
  const t = (type || "").toLowerCase();
  if (t === "video") return <Video className="w-3.5 h-3.5" />;
  if (t === "carousel") return <Layers className="w-3.5 h-3.5" />;
  return <ImageIcon className="w-3.5 h-3.5" />;
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="w-full aspect-square rounded-lg flex items-center justify-center" style={{ background: "var(--surface)" }}>
        <ImageIcon className="w-5 h-5" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full aspect-square object-cover rounded-lg"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

function clamp(text: string | null | undefined, n: number) {
  if (!text) return "";
  return text.length > n ? text.slice(0, n - 1).trimEnd() + "…" : text;
}

function InspirationCard({ post }: { post: InspirationPost }) {
  const [open, setOpen] = useState(false);
  const analysis = parseAnalysis(post.analysis);
  const tema = analysis?.tema as string | undefined;
  const gancho = analysis?.gancho as string | undefined;
  const score = analysis?.score_relevancia as number | undefined;
  const descartar = analysis?.descartar === true;

  return (
    <div className="form-card !p-3 flex flex-col gap-2">
      <Thumb src={post.thumbnail_url} alt={post.caption || "post"} />

      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
        <MediaIcon type={post.media_type} />
        <span>{post.media_type || "image"}</span>
        {descartar && (
          <span className="badge ml-auto" style={{ background: "rgba(239,68,68,.12)", color: "rgb(239,68,68)", border: "1px solid rgba(239,68,68,.18)" }}>
            descartado
          </span>
        )}
        {!descartar && typeof score === "number" && (
          <span className="ml-auto text-[11px]" style={{ color: "var(--text-2)" }}>★ {score}</span>
        )}
      </div>

      {tema && <div className="text-[12px] font-semibold" style={{ color: "var(--text-1)" }}>{clamp(tema, 80)}</div>}
      {gancho && <div className="text-[11px]" style={{ color: "var(--text-2)" }}>{clamp(gancho, 110)}</div>}
      {!tema && !gancho && post.caption && (
        <div className="text-[11px]" style={{ color: "var(--text-2)" }}>{clamp(post.caption, 140)}</div>
      )}

      <div className="flex items-center justify-between gap-2 mt-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] underline-offset-2 hover:underline"
          style={{ color: "var(--text-3)" }}
        >
          {open ? "Recolher" : "Ver mais"}
        </button>
        {post.post_url && (
          <a
            href={post.post_url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] flex items-center gap-1 hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Abrir <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {open && (
        <div className="mt-2 pt-2 border-t text-[11px] space-y-1.5" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
          {post.caption && <div><b style={{ color: "var(--text-1)" }}>Caption:</b> {post.caption}</div>}
          {analysis?.sugestao_readaptacao && <div><b style={{ color: "var(--text-1)" }}>Sugestao:</b> {clamp(String(analysis.sugestao_readaptacao), 400)}</div>}
          {analysis && (
            <details>
              <summary className="cursor-pointer" style={{ color: "var(--text-3)" }}>JSON da analise</summary>
              <pre className="text-[10px] overflow-x-auto mt-1 p-2 rounded" style={{ background: "var(--surface)", color: "var(--text-2)" }}>
                {JSON.stringify(analysis, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ReadaptedCard({ post }: { post: ReadaptedPost }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="form-card !p-3 flex flex-col gap-2">
      <Thumb src={post.original_thumbnail_url} alt={post.tema || "readaptacao"} />

      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
        <MediaIcon type={post.media_type} />
        <span>{post.media_type || "image"}</span>
        {typeof post.score_relevancia === "number" && (
          <span className="ml-auto text-[11px]" style={{ color: "var(--text-2)" }}>★ {post.score_relevancia}</span>
        )}
      </div>

      {post.tema && <div className="text-[12px] font-semibold" style={{ color: "var(--text-1)" }}>{clamp(post.tema, 80)}</div>}
      {post.gancho && <div className="text-[11px]" style={{ color: "var(--text-2)" }}>{clamp(post.gancho, 110)}</div>}

      <div className="flex items-center justify-between gap-2 mt-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] underline-offset-2 hover:underline"
          style={{ color: "var(--text-3)" }}
        >
          {open ? "Recolher" : "Ver readaptação"}
        </button>
        {post.original_post_url && (
          <a
            href={post.original_post_url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] flex items-center gap-1 hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Original <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {open && (
        <div className="mt-2 pt-2 border-t text-[11px] space-y-2" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
          {post.sugestao_readaptacao ? (
            <div>
              <b style={{ color: "var(--text-1)" }}>Sugestao de readaptação:</b>
              <p className="mt-1 whitespace-pre-wrap">{post.sugestao_readaptacao}</p>
            </div>
          ) : (
            <p style={{ color: "var(--text-3)" }}>Sem sugestao registrada.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CollectionDetail() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [posts, setPosts] = useState<InspirationPost[]>([]);
  const [readapted, setReadapted] = useState<ReadaptedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<TabKey>("coletados");

  const handleDelete = async () => {
    if (!collectionId || !collection) return;
    const tags = collection.hashtags;
    const label = tags && tags.length > 0 ? `#${tags.join(" #")}` : "esta coleta";
    const ok = window.confirm(
      `Excluir a pasta ${label}?\n\nOs ${posts.length} posts continuam em Inspiracao — so o agrupamento por hashtag e removido.`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("hashtag_collections").delete().eq("id", collectionId);
      if (error) throw error;
      toast.success("Coleta excluida");
      navigate("/instagram-hashtags?tab=coletas");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir";
      toast.error(`Nao consegui excluir: ${msg}`);
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [collRes, postsRes, readRes] = await Promise.all([
          supabase
            .from("hashtag_collections")
            .select("id, profile_id, hashtags, scrape_recent_days, posts_per_tag, status, posts_count, created_at")
            .eq("id", collectionId)
            .maybeSingle(),
          supabase
            .from("inspiration_posts")
            .select("id, post_id, post_url, caption, media_type, thumbnail_url, video_url, analysis, curtidas, visualizacoes, created_at")
            .eq("hashtag_collection_id", collectionId)
            .order("created_at", { ascending: false }),
          supabase
            .from("readapted_posts")
            .select("id, inspiration_post_id, original_caption, original_post_url, original_thumbnail_url, media_type, tema, gancho, sugestao_readaptacao, score_relevancia, created_at")
            .eq("hashtag_collection_id", collectionId)
            .order("created_at", { ascending: false }),
        ]);

        if (cancelled) return;

        if (collRes.error) throw collRes.error;
        if (postsRes.error) throw postsRes.error;
        if (readRes.error) throw readRes.error;

        setCollection((collRes.data as Collection) || null);
        setPosts((postsRes.data as InspirationPost[]) || []);
        setReadapted((readRes.data as ReadaptedPost[]) || []);
      } catch (err: any) {
        const msg = err?.message || err?.error_description || err?.hint || "Erro ao carregar coleta";
        const code = err?.code || err?.status;
        console.error("[CollectionDetail] load error", { err, code });
        toast.error(`Erro ao carregar coleta: ${code ? `[${code}] ` : ""}${msg}`, { duration: 8000 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [collectionId]);

  const discardedPosts = useMemo(
    () => posts.filter((p) => parseAnalysis(p.analysis)?.descartar === true),
    [posts],
  );

  const statusBadge = (status: string | null | undefined) => {
    const s = status === "done"
      ? { label: "concluida", bg: "rgba(34,197,94,.12)", fg: "rgb(34,197,94)" }
      : status === "error"
        ? { label: "erro", bg: "rgba(239,68,68,.12)", fg: "rgb(239,68,68)" }
        : { label: "processando", bg: "rgba(234,179,8,.12)", fg: "rgb(234,179,8)" };
    return (
      <span className="badge" style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bg}` }}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="page-header">
        <div className="page-header-icon">
          <Hash className="w-[18px] h-[18px]" style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1">
          <h1 className="page-header-title" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>
            Coleta por hashtag
          </h1>
          <p className="page-header-sub">Posts e readaptações dessa coleta, sem precisar sair da aba Hashtags</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/instagram-hashtags?tab=coletas"
            className="btn-ghost"
            style={{ textDecoration: "none" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar pras coletas
          </Link>
          {collection && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn-ghost disabled:opacity-40"
              style={{ color: "rgb(239,68,68)", borderColor: "rgba(239,68,68,.25)" }}
              title="Excluir pasta"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Excluir pasta
            </button>
          )}
        </div>
      </div>

      <div className="page-content" style={{ display: "flex", justifyContent: "center" }}>
        <div className="w-full max-w-[1080px] space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} />
            </div>
          ) : !collection ? (
            <div className="form-card text-center py-10">
              <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
                Coleta nao encontrada.
              </p>
            </div>
          ) : (
            <>
              {/* Header da coleta */}
              <div className="form-card flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                    {formatDateTime(collection.created_at)}
                    {collection.scrape_recent_days ? ` · ult. ${collection.scrape_recent_days} dias` : ""}
                    {collection.posts_per_tag ? ` · ${collection.posts_per_tag} posts/tag` : ""}
                  </span>
                  {statusBadge(collection.status)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(collection.hashtags || []).map((tag) => (
                    <span
                      key={tag}
                      className="badge"
                      style={{ background: "rgba(232,96,74,.1)", color: "var(--accent)", border: "1px solid rgba(232,96,74,.2)" }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-end gap-6 -mb-px flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
                {(
                  [
                    { key: "coletados" as TabKey, label: "Posts coletados", count: posts.length, Icon: Inbox },
                    { key: "readaptacoes" as TabKey, label: "Readaptações", count: readapted.length, Icon: Sparkles },
                    { key: "descartados" as TabKey, label: "Descartados", count: discardedPosts.length, Icon: XCircle },
                  ]
                ).map(({ key, label, count, Icon }) => {
                  const active = tab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className="flex items-center gap-2 pb-2.5 text-[13px] transition-colors"
                      style={{
                        color: active ? "var(--accent)" : "var(--text-3)",
                        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                        fontWeight: active ? 600 : 500,
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" /> {label}
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded-md"
                        style={{
                          background: active ? "rgba(232,96,74,.15)" : "var(--surface)",
                          color: active ? "var(--accent)" : "var(--text-3)",
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Grid de cards */}
              {tab === "coletados" && (
                posts.length === 0 ? (
                  <div className="form-card text-center py-10">
                    <p className="text-[13px]" style={{ color: "var(--text-3)" }}>Nenhum post coletado ainda.</p>
                  </div>
                ) : (
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
                    {posts.map((p) => <InspirationCard key={p.id} post={p} />)}
                  </div>
                )
              )}

              {tab === "readaptacoes" && (
                readapted.length === 0 ? (
                  <div className="form-card text-center py-10">
                    <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
                      Nenhuma readaptação saiu dessa coleta (todos foram descartados pela IA ou ainda estao processando).
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
                    {readapted.map((r) => <ReadaptedCard key={r.id} post={r} />)}
                  </div>
                )
              )}

              {tab === "descartados" && (
                discardedPosts.length === 0 ? (
                  <div className="form-card text-center py-10">
                    <p className="text-[13px]" style={{ color: "var(--text-3)" }}>Nenhum post descartado.</p>
                  </div>
                ) : (
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
                    {discardedPosts.map((p) => <InspirationCard key={p.id} post={p} />)}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, UserPlus, Trash2, Loader2, Shield, User, Check, Sparkles, Link, Repeat2, TrendingUp, Pencil, Youtube, Languages, BarChart3, Music2, KeyRound, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PermItem {
  id: string;
  permissionKey: string;
  label: string;
  icon: React.ElementType;
  helper?: string;
}

interface PermSection {
  label: string;
  color: string;
  items: PermItem[];
}

const PERMISSION_SECTIONS: PermSection[] = [
  {
    label: "Instagram",
    color: "linear-gradient(135deg, #f472b6, #a855f7)",
    items: [
      { id: "instagram-hashtags", permissionKey: "scrapping", label: "Hashtags", icon: Hash, helper: "Herda o acesso de Scrapping Especifico" },
      { id: "inspiracao", permissionKey: "inspiracao", label: "Perfis", icon: Sparkles },
      { id: "scrapping", permissionKey: "scrapping", label: "Scrapping Específico", icon: Link },
      { id: "readaptados", permissionKey: "readaptados", label: "Readaptados", icon: Repeat2 },
      { id: "transcritor-instagram", permissionKey: "scrapping", label: "Transcritor", icon: Languages, helper: "Herda o acesso de Scrapping Específico" },
    ],
  },
  {
    label: "TikTok",
    color: "linear-gradient(135deg, #00f2ea, #ff0050)",
    items: [
      { id: "tiktok", permissionKey: "tiktok", label: "TikTok", icon: Music2 },
      { id: "transcritor-tiktok", permissionKey: "tiktok", label: "Transcritor", icon: Languages, helper: "Herda o acesso do módulo TikTok" },
    ],
  },
  {
    label: "YouTube",
    color: "linear-gradient(135deg, #ef4444, #f97316)",
    items: [
      { id: "youtube", permissionKey: "youtube", label: "YouTube", icon: Youtube },
      { id: "transcritor-youtube", permissionKey: "youtube", label: "Transcritor", icon: Languages, helper: "Herda o acesso do módulo YouTube" },
    ],
  },
  {
    label: "Facebook Ads",
    color: "linear-gradient(135deg, #2563eb, #38bdf8, #60a5fa)",
    items: [
      { id: "ad-intelligence", permissionKey: "ad-intelligence", label: "Ad Intelligence", icon: TrendingUp },
      { id: "ad-intelligence-compare", permissionKey: "ad-intelligence", label: "Comparar", icon: BarChart3, helper: "Herda o acesso de Ad Intelligence" },
    ],
  },
];

const ALL_PERMISSIONS = Array.from(
  new Set(PERMISSION_SECTIONS.flatMap((section) => section.items.map((item) => item.permissionKey))),
);


interface AppUser {
  id: string;
  email: string;
  role: "admin" | "user";
  permissions: string[];
  created_at: string;
}

export default function Usuarios() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingUser, setDeletingUser] = useState<AppUser | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [passwordUser, setPasswordUser] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [permissions, setPermissions] = useState<string[]>(ALL_PERMISSIONS);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar usuários:", error);
      setUsers([]);
    } else {
      setUsers((data || []).map((u: any) => ({
        ...u,
        permissions: u.permissions ?? ALL_PERMISSIONS,
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const togglePermission = (key: string) => {
    setPermissions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const toggleSectionPermissions = (sectionItems: { permissionKey: string }[]) => {
    const keys = Array.from(new Set(sectionItems.map((item) => item.permissionKey)));
    const allSelected = keys.every(k => permissions.includes(k));
    setPermissions(prev =>
      allSelected ? prev.filter(p => !keys.includes(p)) : [...new Set([...prev, ...keys])]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Preencha email e senha");
      return;
    }
    if (password.length < 6) {
      toast.error("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (role === "user" && permissions.length === 0) {
      toast.error("Selecione pelo menos um módulo de acesso");
      return;
    }

    setCreating(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
        },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
          role,
          permissions: role === "admin" ? ALL_PERMISSIONS : permissions,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "Erro ao criar usuário");

      toast.success(`Usuário ${email} criado com sucesso`);
      setEmail("");
      setPassword("");
      setRole("user");
      setPermissions(ALL_PERMISSIONS);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    try {
      const { error } = await supabase
        .from("app_users")
        .delete()
        .eq("id", deletingUser.id);

      if (error) throw error;
      toast.success("Usuário removido");
      setDeletingUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover usuário");
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwordUser) return;
    if (newPassword.length < 6) {
      toast.error("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    setUpdatingPassword(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(`${supabaseUrl}/functions/v1/update-user-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
        },
        body: JSON.stringify({
          userId: passwordUser.id,
          password: newPassword.trim(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "Erro ao atualizar senha");

      toast.success(`Senha de ${passwordUser.email} atualizada`);
      setPasswordUser(null);
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar senha");
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleToggleUserPermission = async (user: AppUser, permKey: string) => {
    const newPerms = user.permissions.includes(permKey)
      ? user.permissions.filter(p => p !== permKey)
      : [...user.permissions, permKey];

    try {
      const { error } = await supabase
        .from("app_users")
        .update({ permissions: newPerms })
        .eq("id", user.id);

      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, permissions: newPerms } : u));
      toast.success("Permissões atualizadas");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar permissões");
    }
  };

  const f = "var(--font-body)";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-icon">
          <Users className="w-4 h-4" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1 className="page-header-title" style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}>Usuários</h1>
          <p className="page-header-sub">Crie e gerencie logins de acesso ao sistema</p>
        </div>
      </div>

      <div className="page-content overflow-y-auto flex-1">
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Create user form */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <UserPlus style={{ width: 18, height: 18, color: "var(--accent)" }} />
              <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600, fontSize: 14, color: "var(--text-1)" }}>
                Novo Usuário
              </span>
            </div>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-3)", fontFamily: f, display: "block", marginBottom: 6 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@email.com"
                    required
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-1)",
                      fontSize: 13,
                      fontFamily: f,
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-3)", fontFamily: f, display: "block", marginBottom: 6 }}>
                    Senha
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-1)",
                      fontSize: 13,
                      fontFamily: f,
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: "var(--text-3)", fontFamily: f, display: "block", marginBottom: 6 }}>
                  Tipo de acesso
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["user", "admin"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "var(--radius-sm)",
                        border: role === r ? "1px solid var(--border-active)" : "1px solid var(--border)",
                        background: role === r ? "rgba(194,57,110,0.1)" : "transparent",
                        color: role === r ? "var(--text-1)" : "var(--text-3)",
                        fontSize: 12,
                        fontFamily: f,
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        transition: "all 0.15s",
                      }}
                    >
                      {r === "admin" ? <Shield size={13} /> : <User size={13} />}
                      {r === "admin" ? "Admin" : "Usuário"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permissions checkboxes - only for "user" role */}
              {role === "user" && (
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-3)", fontFamily: f, display: "block", marginBottom: 10 }}>
                    Módulos e abas de acesso
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {PERMISSION_SECTIONS.map((section) => {
                      const sectionKeys = Array.from(new Set(section.items.map((item) => item.permissionKey)));
                      const allSelected = sectionKeys.every(k => permissions.includes(k));
                      return (
                      <div key={section.label}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.05em",
                              textTransform: "uppercase",
                              backgroundImage: section.color,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              fontFamily: f,
                            }}
                          >
                            {section.label}
                          </span>
                          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                          <button
                            type="button"
                            onClick={() => toggleSectionPermissions(section.items)}
                            style={{
                              fontSize: 10,
                              fontFamily: f,
                              fontWeight: 500,
                              color: allSelected ? "var(--accent)" : "var(--text-3)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "2px 4px",
                              whiteSpace: "nowrap",
                              transition: "color 0.15s",
                            }}
                          >
                            {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
                          </button>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {section.items.map(({ id, permissionKey, label, icon: Icon, helper }) => {
                            const active = permissions.includes(permissionKey);
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => togglePermission(permissionKey)}
                                title={helper}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "8px 12px",
                                  borderRadius: "var(--radius-sm)",
                                  border: active ? "1px solid var(--border-active)" : "1px solid var(--border)",
                                  background: active ? "rgba(194,57,110,0.08)" : "transparent",
                                  color: active ? "var(--text-1)" : "var(--text-3)",
                                  fontSize: 12,
                                  fontFamily: f,
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  transition: "all 0.15s",
                                  textAlign: "left",
                                }}
                              >
                                <div
                                  style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: 4,
                                    border: active ? "none" : "1px solid var(--border)",
                                    background: active ? "var(--cr-grad)" : "transparent",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                    transition: "all 0.15s",
                                  }}
                                >
                                  {active && <Check size={10} color="#fff" strokeWidth={3} />}
                                </div>
                                <Icon size={13} style={{ flexShrink: 0, opacity: active ? 1 : 0.5 }} />
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="btn-primary"
                style={{ alignSelf: "flex-start", marginTop: 4 }}
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus size={14} />}
                {creating ? "Criando..." : "Criar usuário"}
              </button>
            </form>
          </div>

          {/* Users list */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <Users style={{ width: 16, height: 16, color: "var(--text-3)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", fontFamily: f }}>
                Usuários cadastrados
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>
                {users.length} {users.length === 1 ? "usuário" : "usuários"}
              </span>
            </div>

            {loading ? (
              <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} />
              </div>
            ) : users.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                Nenhum usuário cadastrado
              </div>
            ) : (
              <div>
                {users.map((u) => (
                  <div key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 20px",
                        transition: "background 0.15s",
                        cursor: u.role === "user" ? "pointer" : "default",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      onClick={() => {
                        if (u.role === "user") setEditingUser(editingUser === u.id ? null : u.id);
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: u.role === "admin" ? "var(--grad)" : "var(--surface-2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          color: u.role === "admin" ? "#fff" : "var(--text-2)",
                          flexShrink: 0,
                        }}
                      >
                        {u.email.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)", fontFamily: f }}>
                          {u.email}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                          Criado em {new Date(u.created_at).toLocaleDateString("pt-BR")}
                          {u.role === "user" && (
                            <span style={{ marginLeft: 8 }}>
                              &middot; {u.permissions.length} de {ALL_PERMISSIONS.length} grupos de acesso
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: 99,
                          background: u.role === "admin" ? "rgba(194,57,110,0.12)" : "var(--surface-2)",
                          color: u.role === "admin" ? "var(--accent-2)" : "var(--text-3)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {u.role === "admin" ? "Admin" : "Usuário"}
                      </span>
                      {u.role === "user" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingUser(editingUser === u.id ? null : u.id); }}
                          title="Editar permissoes"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: editingUser === u.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                            background: editingUser === u.id ? "rgba(194,57,110,0.1)" : "transparent",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: editingUser === u.id ? "var(--accent)" : "var(--text-3)",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            if (editingUser !== u.id) {
                              e.currentTarget.style.borderColor = "var(--accent)";
                              e.currentTarget.style.color = "var(--accent)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (editingUser !== u.id) {
                              e.currentTarget.style.borderColor = "var(--border)";
                              e.currentTarget.style.color = "var(--text-3)";
                            }
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setPasswordUser(u); setNewPassword(""); }}
                        title="Alterar senha"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "transparent",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--text-3)",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "var(--accent)";
                          e.currentTarget.style.color = "var(--accent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--border)";
                          e.currentTarget.style.color = "var(--text-3)";
                        }}
                      >
                        <KeyRound size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingUser(u); }}
                        title="Remover usuario"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "transparent",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--text-3)",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "var(--score-low)";
                          e.currentTarget.style.color = "var(--score-low)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--border)";
                          e.currentTarget.style.color = "var(--text-3)";
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Expandable permissions panel for "user" role */}
                    {u.role === "user" && editingUser === u.id && (
                      <div
                        style={{
                          padding: "12px 20px 16px 64px",
                          background: "rgba(255,255,255,0.02)",
                          borderTop: "1px solid var(--border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {PERMISSION_SECTIONS.map((section) => {
                          const sectionKeys = Array.from(new Set(section.items.map((item) => item.permissionKey)));
                          const allSelected = sectionKeys.every(k => u.permissions.includes(k));
                          const handleToggleAll = async () => {
                            const newPerms = allSelected
                              ? u.permissions.filter(p => !sectionKeys.includes(p))
                              : [...new Set([...u.permissions, ...sectionKeys])];
                            try {
                              const { error } = await supabase.from("app_users").update({ permissions: newPerms }).eq("id", u.id);
                              if (error) throw error;
                              setUsers(prev => prev.map(x => x.id === u.id ? { ...x, permissions: newPerms } : x));
                              toast.success("Permissões atualizadas");
                            } catch (err: any) {
                              toast.error(err.message || "Erro ao atualizar permissões");
                            }
                          };
                          return (
                          <div key={section.label}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  letterSpacing: "0.05em",
                                  textTransform: "uppercase",
                                  backgroundImage: section.color,
                                  WebkitBackgroundClip: "text",
                                  WebkitTextFillColor: "transparent",
                                  fontFamily: f,
                                }}
                              >
                                {section.label}
                              </span>
                              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                              <button
                                type="button"
                                onClick={handleToggleAll}
                                style={{
                                  fontSize: 9,
                                  fontFamily: f,
                                  fontWeight: 500,
                                  color: allSelected ? "var(--accent)" : "var(--text-3)",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: "2px 4px",
                                  whiteSpace: "nowrap",
                                  transition: "color 0.15s",
                                }}
                              >
                                {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
                              </button>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {section.items.map(({ id, permissionKey, label, icon: Icon, helper }) => {
                                const active = u.permissions.includes(permissionKey);
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => handleToggleUserPermission(u, permissionKey)}
                                    title={helper}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      padding: "6px 10px",
                                      borderRadius: "var(--radius-sm)",
                                      border: active ? "1px solid var(--border-active)" : "1px solid var(--border)",
                                      background: active ? "rgba(194,57,110,0.08)" : "transparent",
                                      color: active ? "var(--text-1)" : "var(--text-3)",
                                      fontSize: 11,
                                      fontFamily: f,
                                      fontWeight: 500,
                                      cursor: "pointer",
                                      transition: "all 0.15s",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 14,
                                        height: 14,
                                        borderRadius: 3,
                                        border: active ? "none" : "1px solid var(--border)",
                                        background: active ? "var(--cr-grad)" : "transparent",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexShrink: 0,
                                        transition: "all 0.15s",
                                      }}
                                    >
                                      {active && <Check size={9} color="#fff" strokeWidth={3} />}
                                    </div>
                                    <Icon size={12} style={{ flexShrink: 0, opacity: active ? 1 : 0.5 }} />
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => { if (!open) setDeletingUser(null); }}>
        <AlertDialogContent style={{ background: "var(--dialog-bg)", border: "1px solid var(--border)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--text-1)" }}>Remover usuário?</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-3)" }}>
              O usuário <strong style={{ color: "var(--text-1)" }}>{deletingUser?.email}</strong> será removido do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} style={{ background: "var(--score-low)", color: "#fff", border: "none" }}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password change dialog */}
      <AlertDialog
        open={!!passwordUser}
        onOpenChange={(open) => {
          if (!open && !updatingPassword) {
            setPasswordUser(null);
            setNewPassword("");
          }
        }}
      >
        <AlertDialogContent style={{ background: "var(--dialog-bg)", border: "1px solid var(--border)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--text-1)" }}>Alterar senha</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-3)" }}>
              Defina uma nova senha para <strong style={{ color: "var(--text-1)" }}>{passwordUser?.email}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ marginTop: 4 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)", fontFamily: f, display: "block", marginBottom: 6 }}>
              Nova senha
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !updatingPassword && newPassword.length >= 6) {
                  e.preventDefault();
                  handleUpdatePassword();
                }
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-1)",
                fontSize: 13,
                fontFamily: f,
                outline: "none",
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={updatingPassword}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleUpdatePassword(); }}
              disabled={updatingPassword || newPassword.length < 6}
              style={{
                background: "var(--cr-grad)",
                color: "#fff",
                border: "none",
                opacity: updatingPassword || newPassword.length < 6 ? 0.6 : 1,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {updatingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound size={14} />}
              {updatingPassword ? "Salvando..." : "Salvar senha"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

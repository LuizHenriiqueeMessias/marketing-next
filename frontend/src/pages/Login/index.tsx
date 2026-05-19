import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "var(--bg)" }}
    >
      {/* Left panel — Wordmark with nebula sphere */}
      <div
        className="hidden lg:flex flex-1 items-center justify-center"
        style={{ background: "var(--bg)", position: "relative", overflow: "hidden" }}
      >
        {/* Planet sphere with aurora glow */}
        <div className="planet-group">
          <div className="planet-body">
            <div className="planet-atmosphere" />
          </div>
          <div className="planet-aurora" />
          <div className="planet-highlight" />
          <div className="planet-reflection" />
        </div>

        {/* Starfield — on top of nebula, slightly faded */}
        <div className="starfield">
          <div className="stars-small" />
          <div className="stars-medium" />
          <div className="stars-large" />
        </div>

        <div style={{
          position: "relative", zIndex: 3,
          display: "flex", flexDirection: "column", alignItems: "center",
          transform: showForm ? "translateX(-70%) translateY(0)" : "translateX(0) translateY(40px)",
          transition: "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}>
          <div className="login-wordmark-text" style={{
            textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center",
          }}>
            <span className="cr-wordmark-main">Marketing</span>
            <span className="cr-wordmark-sub">Next</span>
          </div>

          {/* Botão Entrar — só aparece quando o form está oculto */}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="login-enter-btn"
              style={{
                marginTop: 60,
                borderRadius: 10,
                padding: "10px 32px",
                background: "transparent",
                border: "1px solid #c2396e",
                color: "rgba(255,255,255,0.85)",
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "0.05em",
                cursor: "pointer",
                opacity: 0,
                animation: "fadeSlideUp 0.6s ease forwards 1s",
                transition: "border-color 0.3s, color 0.3s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#e8604a"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#c2396e"; e.currentTarget.style.color = "rgba(255,255,255,0.85)"; }}
            >
              Entrar
            </button>
          )}
        </div>
      </div>

      {/* Right panel — Form (slides in) */}
      <div
        className="login-right-panel flex items-center justify-center"
        style={{
          width: "35%", minWidth: 380,
          background: "transparent",
          position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 1,
          overflow: "hidden",
          transform: showForm ? "translateX(0)" : "translateX(100%)",
          opacity: showForm ? 1 : 0,
          visibility: showForm ? "visible" as const : "hidden" as const,
          transition: "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease, visibility 0s linear " + (showForm ? "0s" : "0.6s"),
          willChange: "transform, opacity",
        }}
      >
        <div
          className="w-full"
          style={{
            maxWidth: 360,
            padding: "0 20px",
            marginLeft: 0,
            marginRight: "auto",
            paddingLeft: 24,
            opacity: showForm ? 1 : 0,
            transform: showForm ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.4s ease 0.25s, transform 0.4s ease 0.25s",
          }}
        >
          {/* Form Title */}
          <div className="login-form-header" style={{ marginBottom: 40, textAlign: "left" }}>
            <h1 className="cr-login-title" style={{ fontFamily: "'Montserrat', sans-serif", whiteSpace: "nowrap", fontSize: 32 }}>
              Bem-vindo de <em>volta.</em>
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 10 }}>
              Entre para acessar a plataforma
            </p>
          </div>

          <form onSubmit={handleLogin}>
            {/* Email */}
            <div className="login-field-email" style={{ marginBottom: 20 }}>
              <div className="cr-field-label">
                <span className="cr-field-label-text">Email</span>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="field-input"
              />
            </div>

            {/* Password */}
            <div className="login-field-pass" style={{ marginBottom: 20 }}>
              <div className="cr-field-label">
                <span className="cr-field-label-text">Senha</span>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="field-input"
              />
              <button type="button" className="cr-field-label-action" style={{ marginTop: 8, display: "block" }}>
                Esqueceu a senha?
              </button>
            </div>

            {/* Remember me */}
            <label
              className="login-check-row"
              style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, cursor: "pointer", marginBottom: 28 }}
            >
              <input
                type="checkbox"
                className="cr-check"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                Manter conectado por 30 dias
              </span>
            </label>

            {error && (
              <p style={{ fontSize: 12, color: "#ef4444", textAlign: "center", marginBottom: 14 }}>
                {error}
              </p>
            )}

            {/* CTA Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-run login-btn-cta"
              style={{ opacity: loading ? 0.5 : 1, borderRadius: 12 }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

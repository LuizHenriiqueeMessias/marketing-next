import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sparkles,
  Link,
  Repeat2,
  Users,
  TrendingUp,
  BarChart3,
  Languages,
  Activity,
  Music2,
  LayoutList,
  Instagram,
  Hash,
  Youtube,
  LogOut,
} from "lucide-react";
import { useNewAdsCount } from "@/hooks/useNewAdsCount";

type NavItem = { to: string; label: string; icon: React.ElementType; adminOnly: boolean; permKey?: string };

type NavSection = {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  glowColor: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    color: "linear-gradient(135deg, #f472b6, #a855f7)",
    glowColor: "rgba(244,114,182,0.4)",
    items: [
      { to: "/inspiracao", label: "Perfis", icon: Sparkles, adminOnly: false, permKey: "inspiracao" },
      { to: "/scrapping", label: "Scrapping", icon: Link, adminOnly: false, permKey: "scrapping" },
      { to: "/instagram-hashtags", label: "Hashtags", icon: Hash, adminOnly: false, permKey: "scrapping" },
      { to: "/readaptados", label: "Readaptados", icon: Repeat2, adminOnly: false, permKey: "readaptados" },
      { to: "/transcritor-instagram", label: "Transcritor", icon: Languages, adminOnly: false, permKey: "scrapping" },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: Music2,
    color: "linear-gradient(135deg, #00f2ea, #ff0050)",
    glowColor: "rgba(0,242,234,0.4)",
    items: [
      { to: "/tiktok", label: "Fontes", icon: Music2, adminOnly: false, permKey: "tiktok" },
      { to: "/tiktok/conteudos", label: "Conteúdos", icon: LayoutList, adminOnly: false, permKey: "tiktok" },
      { to: "/tiktok/readaptados", label: "Readaptados", icon: Repeat2, adminOnly: false, permKey: "tiktok" },
      { to: "/tiktok/transcritor", label: "Transcritor", icon: Languages, adminOnly: false, permKey: "tiktok" },
    ],
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: Youtube,
    color: "linear-gradient(135deg, #ff0000, #c4302b)",
    glowColor: "rgba(255,0,0,0.4)",
    items: [
      { to: "/youtube", label: "Fontes", icon: Youtube, adminOnly: false, permKey: "youtube" },
      { to: "/youtube/conteudos", label: "Conteúdos", icon: LayoutList, adminOnly: false, permKey: "youtube" },
      { to: "/youtube/readaptados", label: "Readaptados", icon: Repeat2, adminOnly: false, permKey: "youtube" },
      { to: "/youtube/transcritor", label: "Transcritor", icon: Languages, adminOnly: false, permKey: "youtube" },
    ],
  },
  {
    id: "ads",
    label: "Facebook Ads",
    icon: TrendingUp,
    color: "linear-gradient(135deg, #2563eb, #38bdf8)",
    glowColor: "rgba(37,99,235,0.4)",
    items: [
      { to: "/ad-intelligence", label: "Ad Intelligence", icon: TrendingUp, adminOnly: false, permKey: "ad-intelligence" },
      { to: "/ad-intelligence/compare", label: "Comparar", icon: BarChart3, adminOnly: false, permKey: "ad-intelligence" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: Activity,
    color: "linear-gradient(135deg, #6b7280, #9ca3af)",
    glowColor: "rgba(107,114,128,0.3)",
    items: [
      { to: "/jobs", label: "Jobs", icon: Activity, adminOnly: true },
      { to: "/usuarios", label: "Usuários", icon: Users, adminOnly: true },
    ],
  },
];

function isSectionActive(section: NavSection, pathname: string): boolean {
  return section.items.some((item) =>
    item.to === pathname || pathname.startsWith(item.to + "/"),
  );
}

export default function Layout() {
  const { signOut, user, role, permissions } = useAuth();
  const newAdsCount = useNewAdsCount();
  const location = useLocation();

  const activeSection = NAV_SECTIONS.find((s) => isSectionActive(s, location.pathname));
  const [openId, setOpenId] = useState<string | null>(activeSection?.id ?? null);

  const toggleSection = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  const openSection = openId ? NAV_SECTIONS.find((s) => s.id === openId) : null;
  const openVisibleItems = openSection?.items.filter((item) => {
    if (item.adminOnly) return role === "admin";
    if (item.permKey && role !== "admin") return permissions.includes(item.permKey);
    return true;
  }) ?? [];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <div className="orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
        <div className="orb orb-5" />
      </div>

      {/* Icon rail */}
      <div
        style={{
          width: 72,
          minWidth: 72,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 32,
          paddingBottom: 16,
          background: "rgba(255,255,255,0.015)",
          borderRight: "1px solid var(--border)",
          position: "relative",
          zIndex: 12,
        }}
      >
        {/* Platform icons */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          {NAV_SECTIONS.map((section, i) => {
            const visibleItems = section.items.filter((item) => {
              if (item.adminOnly) return role === "admin";
              if (item.permKey && role !== "admin") return permissions.includes(item.permKey);
              return true;
            });
            if (visibleItems.length === 0) return null;

            const isActive = isSectionActive(section, location.pathname);
            const isOpen = openId === section.id;
            const SectionIcon = section.icon;

            return (
              <motion.button
                key={section.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.06, duration: 0.25, type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => toggleSection(section.id)}
                title={section.label}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  border: "none",
                  background: isOpen ? section.color : isActive ? "rgba(255,255,255,0.08)" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  transition: "background 0.2s",
                  boxShadow: isActive ? `0 0 16px 2px ${section.glowColor}` : "none",
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.92 }}
              >
                <SectionIcon size={22} style={{ color: isOpen ? "#fff" : isActive ? "#fff" : "var(--text-3)" }} />

                {/* Active indicator dot */}
                {isActive && !isOpen && (
                  <motion.div
                    layoutId="activeIndicator"
                    style={{
                      position: "absolute",
                      right: -4,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 4,
                      height: 16,
                      borderRadius: 2,
                      background: section.color,
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}

                {/* Badge */}
                {section.id === "ads" && newAdsCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "#ef4444",
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid var(--bg)",
                    }}
                  >
                    {newAdsCount > 9 ? "9+" : newAdsCount}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* User avatar + logout at bottom */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "var(--cr-grad, linear-gradient(135deg, #f472b6, #a855f7))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
            }}
            title={user?.email || ""}
          >
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <button
            onClick={signOut}
            title="Sair"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <LogOut size={15} style={{ color: "var(--text-3)" }} />
          </button>
        </div>
      </div>

      {/* Expandable sub-panel */}
      <AnimatePresence>
        {openSection && openVisibleItems.length > 0 && (
          <motion.div
            key={openSection.id}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 180, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }}
            style={{
              height: "100vh",
              background: "rgba(255,255,255,0.02)",
              borderRight: "1px solid var(--border)",
              overflow: "hidden",
              position: "relative",
              zIndex: 11,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Section title */}
            <div style={{ padding: "24px 16px 12px", flexShrink: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  backgroundImage: openSection.color,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  whiteSpace: "nowrap",
                }}
              >
                {openSection.label}
              </div>
            </div>

            {/* Links */}
            <div style={{ padding: "0 8px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              {openVisibleItems.map(({ to, label, icon: Icon }, i) => (
                <motion.div
                  key={to}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                >
                  <NavLink
                    to={to}
                    end={to === "/ad-intelligence" || to === "/tiktok" || to === "/youtube"}
                    className={({ isActive: linkActive }) => `nav-item${linkActive ? " active" : ""}`}
                    style={{ padding: "8px 10px", fontSize: 12.5, whiteSpace: "nowrap" }}
                  >
                    <Icon className="nav-icon" style={{ width: 14, height: 14 }} />
                    {label}
                  </NavLink>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 h-screen overflow-y-auto flex flex-col" style={{ position: "relative", zIndex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}

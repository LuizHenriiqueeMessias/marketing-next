import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Inspiracao from "@/pages/Inspiracao";
import ScrappingEspecifico from "@/pages/ScrappingEspecifico";
import InstagramHashtags from "@/pages/InstagramHashtags";
import HashtagCollectionDetail from "@/pages/InstagramHashtags/CollectionDetail";
import Readaptados from "@/pages/Readaptados";
import Usuarios from "@/pages/Usuarios";
import AdIntelligence from "@/pages/AdIntelligence";
import AdDetailPage from "@/pages/AdIntelligence/AdDetailPage";
import CompetitorAdsPage from "@/pages/AdIntelligence/CompetitorAdsPage";
import CompareCompetitorsPage from "@/pages/AdIntelligence/CompareCompetitorsPage";
import TranscritorInstagram from "@/pages/TranscritorInstagram";
import { TikTokFontes, TikTokConteudos, TikTokReadaptados, TikTokTranscritor } from "@/pages/TikTok";
import { YouTubeFontes, YouTubeConteudos, YouTubeReadaptados, YouTubeTranscritor } from "@/pages/YouTube";
import Jobs from "@/pages/Jobs";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();

  if (role !== "admin") {
    return <Navigate to="/inspiracao" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/inspiracao" replace /> : <Login />}
      />
      <Route
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route path="/inspiracao" element={<Inspiracao />} />
        <Route path="/instagram-hashtags" element={<InstagramHashtags />} />
        <Route path="/instagram-hashtags/:collectionId" element={<HashtagCollectionDetail />} />
        <Route path="/scrapping" element={<ScrappingEspecifico />} />
        <Route path="/transcritor-instagram" element={<TranscritorInstagram />} />
        <Route path="/ad-intelligence" element={<AdIntelligence />} />
        <Route path="/ad-intelligence/compare" element={<CompareCompetitorsPage />} />
        <Route path="/ad-intelligence/competitor/:competitorId" element={<CompetitorAdsPage />} />
        <Route path="/ad-intelligence/ad/:id" element={<AdDetailPage />} />
        <Route path="/readaptados" element={<Readaptados />} />
        <Route path="/tiktok" element={<TikTokFontes />} />
        <Route path="/tiktok/conteudos" element={<TikTokConteudos />} />
        <Route path="/tiktok/readaptados" element={<TikTokReadaptados />} />
        <Route path="/tiktok/transcritor" element={<TikTokTranscritor />} />
        <Route path="/youtube" element={<YouTubeFontes />} />
        <Route path="/youtube/conteudos" element={<YouTubeConteudos />} />
        <Route path="/youtube/readaptados" element={<YouTubeReadaptados />} />
        <Route path="/youtube/transcritor" element={<YouTubeTranscritor />} />
        <Route path="/jobs" element={<AdminGuard><Jobs /></AdminGuard>} />
        <Route path="/usuarios" element={<AdminGuard><Usuarios /></AdminGuard>} />
      </Route>
      <Route path="*" element={<Navigate to="/inspiracao" replace />} />
    </Routes>
  );
}

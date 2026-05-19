import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const ALL_PERMISSIONS = ["inspiracao", "scrapping", "readaptados", "ad-intelligence", "youtube", "tiktok"];
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const DEMO_USER = {
  id: "demo-user",
  email: "demo@marketingnext.local",
} as User;
const DEMO_SESSION = {
  access_token: "demo-token",
  refresh_token: "demo-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: DEMO_USER,
} as Session;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: "admin" | "user" | null;
  permissions: string[];
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  permissions: [],
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId: string) => {
    if (DEMO_MODE) {
      setRole("admin");
      setPermissions(ALL_PERMISSIONS);
      return;
    }

    const { data } = await supabase
      .from("app_users")
      .select("role, permissions")
      .eq("id", userId)
      .single();
    const userRole = (data?.role as "admin" | "user") ?? "user";
    setRole(userRole);
    // Admin always has full access
    setPermissions(userRole === "admin" ? ALL_PERMISSIONS : (data?.permissions as string[]) ?? ALL_PERMISSIONS);
  };

  useEffect(() => {
    if (DEMO_MODE) {
      setSession(DEMO_SESSION);
      setRole("admin");
      setPermissions(ALL_PERMISSIONS);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchRole(session.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchRole(session.user.id).then(() => setLoading(false));
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (DEMO_MODE) {
      return;
    }

    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        permissions,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

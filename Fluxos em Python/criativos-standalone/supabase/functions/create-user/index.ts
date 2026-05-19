import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { email, password, role, permissions } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email e senha obrigatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create user with admin API — already confirmed, no email verification
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    // If user already exists in Auth, recover the existing user
    let userId: string;
    if (authError) {
      if (authError.message?.includes("already been registered") || authError.message?.includes("already exists")) {
        // User exists in auth.users — find them and reuse
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existing = listData?.users?.find((u: any) => u.email === email);
        if (!existing) {
          return new Response(
            JSON.stringify({ error: "Usuario existe no Auth mas nao foi encontrado. Contate o admin." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        userId = existing.id;

        // Update password if provided
        await supabaseAdmin.auth.admin.updateUserById(userId, { password, email_confirm: true });
      } else {
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      userId = authData.user.id;
    }

    // Insert into app_users (upsert to handle re-creation)
    const defaultPerms = ["inspiracao", "scrapping", "readaptados", "ad-intelligence"];
    const { error: dbError } = await supabaseAdmin
      .from("app_users")
      .upsert({
        id: userId,
        email,
        role: role || "user",
        permissions: permissions || defaultPerms,
      }, { onConflict: "id" });

    if (dbError) {
      // Only rollback if we just created the auth user (not recovered)
      if (!authError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      return new Response(
        JSON.stringify({ error: dbError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ user: { id: userId, email } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

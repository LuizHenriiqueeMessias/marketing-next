import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "ad_intelligence_last_visited";

export function getLastVisited(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function markVisited(): void {
  localStorage.setItem(STORAGE_KEY, new Date().toISOString());
}

export function useNewAdsCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      const lastVisited = getLastVisited();
      if (!lastVisited) {
        // First visit ever — mark now and show 0
        setCount(0);
        return;
      }

      const { count: total, error } = await supabase
        .from("ad_creatives")
        .select("id", { count: "exact", head: true })
        .gt("collected_at", lastVisited);

      if (!cancelled && !error && total !== null) {
        setCount(total);
      }
    }

    fetchCount();
    // Re-check every 60 seconds while page is open
    const interval = setInterval(fetchCount, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return count;
}

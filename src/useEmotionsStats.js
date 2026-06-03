// src/useEmotionsStats.js
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

/**
 * Visszaadja az adott bounds + session statjait:
 * - last24h: utolsó 24 óra eseményei
 * - last7d: utolsó 7 nap eseményei
 * - all: összes eddigi esemény
 */
export function useEmotionsStats(bounds, sessionId) {
  const [stats, setStats] = useState({
    last24h: 0,
    last7d: 0,
    all: 0,
    loading: false,
    error: null
  });

  useEffect(() => {
    if (!bounds) return;
    let cancelled = false;

    async function fetchStats() {
      setStats((prev) => ({ ...prev, loading: true, error: null }));

      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const base = (since) => {
        let q = supabase
          .from('emotions')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', sessionId)
          .gte('lat', bounds.south)
          .lte('lat', bounds.north)
          .gte('lng', bounds.west)
          .lte('lng', bounds.east);

        if (since) {
          q = q.gte('inserted_at', since);
        }
        return q;
      };

      try {
        const [{ count: last24hCount, error: e1 },
               { count: last7dCount, error: e2 },
               { count: allCount, error: e3 }] = await Promise.all([
          base(dayAgo),
          base(weekAgo),
          base(null)
        ]);

        if (cancelled) return;

        if (e1 || e2 || e3) {
          console.error('Stats error:', e1 || e2 || e3);
          setStats((prev) => ({
            ...prev,
            loading: false,
            error: (e1 || e2 || e3)?.message || 'Error loading stats'
          }));
          return;
        }

        setStats({
          last24h: last24hCount ?? 0,
          last7d: last7dCount ?? 0,
          all: allCount ?? 0,
          loading: false,
          error: null
        });
      } catch (err) {
        if (cancelled) return;
        console.error('Stats unexpected error:', err);
        setStats((prev) => ({
          ...prev,
          loading: false,
          error: err.message || 'Error loading stats'
        }));
      }
    }

    // első lekérés azonnal
    fetchStats();

    // utána 15 másodpercenként frissítünk
    const id = setInterval(fetchStats, 15000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west, sessionId]);

  return stats;
}

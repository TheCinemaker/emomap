// src/useVenues.js
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const MAX_VENUES = 500;

export function useVenues(bounds) {
  const [venues, setVenues] = useState([]);

  const refresh = useCallback(async () => {
    if (!bounds) return;
    const { north, south, east, west } = bounds;
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, lat, lng, owner_id, category, logo_url, tier')
      .eq('is_active', true)
      .gte('lat', south).lte('lat', north)
      .gte('lng', west).lte('lng', east)
      .limit(MAX_VENUES);

    if (error) { console.error('[Venues] fetch error:', error); return; }
    setVenues(data || []);
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west]);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel('venues_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, refresh)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [refresh]);

  return { venues, refresh };
}

// src/useProfileDetails.js
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export const DETAIL_FIELDS = [
  'full_name', 'phone', 'address', 'birth_date', 'contact_note',
  'facebook_url', 'instagram_url', 'tiktok_url', 'website_url',
];

export function useOwnProfileDetails(userId) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase.from('profile_details').select('*').eq('user_id', userId).maybeSingle();
    if (error) console.error('[ProfileDetails] load error:', error);
    setDetails(data || { user_id: userId, visible_fields: [] });
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (patch) => {
    const { error } = await supabase
      .from('profile_details')
      .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() });
    if (error) throw error;
    await load();
  }, [userId, load]);

  return { details, loading, save, reload: load };
}

export async function fetchFriendDetails(friendId) {
  const { data, error } = await supabase.rpc('get_visible_profile_details', { target_id: friendId });
  if (error) {
    console.error('[ProfileDetails] fetch friend details error:', error);
    return null;
  }
  return data?.[0] || null;
}

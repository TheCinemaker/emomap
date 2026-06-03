import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function RandomMatch({ session, onClose }) {
  const [matchState, setMatchState] = useState('idle'); // idle, searching, found, sending, viewing
  const [matchId, setMatchId] = useState(null);
  const [, setOtherUserId] = useState(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [receivedPhoto, setReceivedPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Subscribe to match updates (partner joining)
  useEffect(() => {
    if (matchState !== 'searching' || !matchId) return;

    const channel = supabase
      .channel(`match-${matchId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        payload => {
          if (payload.new.status === 'matched') {
            const partner = payload.new.user1_id === session.user.id
              ? payload.new.user2_id
              : payload.new.user1_id;
            setOtherUserId(partner);
            setMatchState('found');
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchState, matchId, session.user.id]);

  // Subscribe to incoming photos (separate effect → doesn't re-subscribe on every state tick)
  useEffect(() => {
    if (!matchId || matchState === 'idle' || matchState === 'searching') return;

    const channel = supabase
      .channel(`photos-${matchId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_photos', filter: `match_id=eq.${matchId}` },
        payload => {
          if (payload.new.sender_id !== session.user.id) {
            setReceivedPhoto(payload.new);
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId, matchState, session.user.id]);

  const startSearch = async () => {
    setMatchState('searching');
    try {
      // Atomic find-or-create on the server side
      const { data, error } = await supabase.rpc('try_join_match', { p_anonymous: isAnonymous });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('No match data returned');

      setMatchId(row.id);

      if (row.status === 'matched') {
        const partner = row.user1_id === session.user.id ? row.user2_id : row.user1_id;
        setOtherUserId(partner);
        setMatchState('found');
      }
      // else: created a new match, wait for someone via subscription
    } catch (error) {
      console.error('Match error:', error);
      setMatchState('idle');
      alert('Could not start matching.');
    }
  };

  const cancelSearch = async () => {
    if (matchId) {
      await supabase
        .from('matches')
        .update({ status: 'completed' })
        .eq('id', matchId)
        .in('status', ['searching', 'matched']);
    }
    setMatchState('idle');
    setMatchId(null);
    onClose();
  };

  const handleUploadPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file || !matchId) return;

    setUploading(true);
    setMatchState('sending');
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${matchId}_${session.user.id}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('matches')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('matches')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('match_photos')
        .insert({
          match_id: matchId,
          sender_id: session.user.id,
          photo_url: publicUrlData.publicUrl
        });

      if (insertError) throw insertError;

      setMatchState('viewing');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed: ' + error.message);
      setMatchState('found');
    } finally {
      setUploading(false);
    }
  };

  const handleViewPhoto = async () => {
    if (!receivedPhoto) return;
    await supabase.from('match_photos').update({ viewed: true }).eq('id', receivedPhoto.id);
    setTimeout(() => { cancelSearch(); }, 5000);
  };

  return (
    <div className="random-match-overlay">
      <div className="random-match-card">
        <button className="match-close" onClick={cancelSearch}>×</button>
        <h2 className="match-title">Mit csinál más?</h2>

        {matchState === 'idle' && (
          <div className="match-content">
            <p>Kapcsolódj össze valakivel egy random fotó erejéig!</p>
            <label className="match-toggle">
              <input
                type="checkbox"
                checked={!isAnonymous}
                onChange={(e) => setIsAnonymous(!e.target.checked)}
              />
              Név felfedése a partnernek
            </label>
            <button className="match-btn pulse" onClick={startSearch}>Keresés indítása</button>
          </div>
        )}

        {matchState === 'searching' && (
          <div className="match-content">
            <div className="spinner"></div>
            <p>Keresés...</p>
            <button className="match-btn secondary" onClick={cancelSearch}>Mégse</button>
          </div>
        )}

        {(matchState === 'found' || matchState === 'sending') && (
          <div className="match-content">
            <p className="success-text">Találat! Készíts egy fotót, hogy mit csinálsz éppen!</p>
            <label className="match-btn primary">
              {uploading ? 'Feltöltés...' : 'Fotó küldése'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleUploadPhoto}
                style={{ display: 'none' }}
                disabled={uploading}
              />
            </label>
            {receivedPhoto && <p className="alert-text">A partnered már küldött fotót! Küldj te is, hogy lásd!</p>}
          </div>
        )}

        {matchState === 'viewing' && (
          <div className="match-content">
            {receivedPhoto ? (
              receivedPhoto.viewed ? (
                <p>A fotó eltűnt.</p>
              ) : (
                <div className="view-photo-container">
                  <p>Itt a partnered fotója! 5 másodperced van megnézni.</p>
                  <img src={receivedPhoto.photo_url} alt="Partner" className="partner-photo" onLoad={handleViewPhoto} />
                </div>
              )
            ) : (
              <p>Fotó elküldve! Várjuk a partner válaszát...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

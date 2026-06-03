import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function RandomMatch({ session, onClose }) {
  const [matchState, setMatchState] = useState('idle'); // idle, searching, found, sending, viewing, completed
  const [matchId, setMatchId] = useState(null);
  const [otherUserId, setOtherUserId] = useState(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [receivedPhoto, setReceivedPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [partnerReady, setPartnerReady] = useState(false);

  useEffect(() => {
    let matchChannel;
    let photoChannel;

    if (matchState === 'searching' && matchId) {
      // Listen for partner joining
      matchChannel = supabase
        .channel(`match-${matchId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, payload => {
          if (payload.new.status === 'matched') {
            const partner = payload.new.user1_id === session.user.id ? payload.new.user2_id : payload.new.user1_id;
            setOtherUserId(partner);
            setMatchState('found');
          }
        })
        .subscribe();
    }

    if (matchState === 'found' || matchState === 'sending' || matchState === 'viewing') {
      // Listen for incoming photos
      photoChannel = supabase
        .channel(`photos-${matchId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_photos', filter: `match_id=eq.${matchId}` }, payload => {
          if (payload.new.sender_id !== session.user.id) {
            setReceivedPhoto(payload.new);
          }
        })
        .subscribe();
    }

    return () => {
      if (matchChannel) supabase.removeChannel(matchChannel);
      if (photoChannel) supabase.removeChannel(photoChannel);
    };
  }, [matchState, matchId, session.user.id]);

  const startSearch = async () => {
    setMatchState('searching');
    try {
      // 1. Try to find someone already searching
      const { data: waitingMatches, error: searchError } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'searching')
        .neq('user1_id', session.user.id)
        .limit(1);

      if (waitingMatches && waitingMatches.length > 0) {
        // Join their match
        const existingMatch = waitingMatches[0];
        const { error: updateError } = await supabase
          .from('matches')
          .update({ status: 'matched', user2_id: session.user.id, user2_anonymous: isAnonymous })
          .eq('id', existingMatch.id);
        
        if (!updateError) {
          setMatchId(existingMatch.id);
          setOtherUserId(existingMatch.user1_id);
          setMatchState('found');
          return;
        }
      }

      // 2. Create new match waiting for someone else
      const { data: newMatch, error: createError } = await supabase
        .from('matches')
        .insert({ user1_id: session.user.id, user1_anonymous: isAnonymous })
        .select()
        .single();

      if (createError) throw createError;
      setMatchId(newMatch.id);

    } catch (error) {
      console.error('Match error:', error);
      setMatchState('idle');
      alert('Could not start matching.');
    }
  };

  const cancelSearch = async () => {
    if (matchId) {
      await supabase.from('matches').update({ status: 'completed' }).eq('id', matchId);
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

      await supabase
        .from('match_photos')
        .insert({
          match_id: matchId,
          sender_id: session.user.id,
          photo_url: publicUrlData.publicUrl
        });

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
    // Mark as viewed (simulated Snapchat style - in a real app we'd hide it after X seconds)
    await supabase.from('match_photos').update({ viewed: true }).eq('id', receivedPhoto.id);
    
    // For this demo, let's just close everything after viewing
    setTimeout(() => {
       cancelSearch();
    }, 5000); // 5 seconds to view
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

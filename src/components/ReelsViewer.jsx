import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function ReelsViewer({ session }) {
  const [reels, setReels] = useState([]);
  const [activeReel, setActiveReel] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchReels();
    
    // Subscribe to new reels
    const channel = supabase
      .channel('reels_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reels' }, payload => {
        fetchReels(); // Re-fetch to get profile data as well
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchReels = async () => {
    // Step 1: fetch reels (no join — avoids FK/PostgREST issues)
    const { data, error } = await supabase
      .from('reels')
      .select('id, image_url, created_at, user_id')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reels:', error);
      return;
    }
    if (!data || data.length === 0) { setReels([]); return; }

    // Step 2: fetch profiles for the unique user IDs
    const userIds = [...new Set(data.map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);

    const profileMap = (profiles || []).reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {});

    // Group by user
    const grouped = data.reduce((acc, reel) => {
      const uid = reel.user_id;
      if (!acc[uid]) {
        const prof = profileMap[uid] || {};
        acc[uid] = {
          user_id: uid,
          username: prof.username || 'Ismeretlen',
          avatar: prof.avatar_url || `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${uid}`,
          items: []
        };
      }
      acc[uid].items.push(reel);
      return acc;
    }, {});
    setReels(Object.values(grouped));
  };

  const handleUploadReel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${session.user.id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('reels')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('reels')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('reels')
        .insert({
          user_id: session.user.id,
          image_url: publicUrlData.publicUrl
        });

      if (dbError) throw dbError;
      
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed: ' + error.message);
    } finally {
      setUploading(false);
      e.target.value = null; // reset input
    }
  };

  return (
    <div className="reels-container">
      <div className="reels-scroll">
        {/* Upload Button */}
        <div className="reel-item my-reel">
          <label className="reel-upload-label">
            <div className="reel-avatar-wrapper add-reel">
              <span>+</span>
            </div>
            <span className="reel-username">Your Story</span>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleUploadReel} 
              style={{ display: 'none' }} 
              disabled={uploading}
            />
          </label>
        </div>

        {/* Reels list */}
        {reels.map((group) => (
          <div 
            key={group.user_id} 
            className="reel-item"
            onClick={() => setActiveReel(group.items[0])} // Show newest for now
          >
            <div className="reel-avatar-wrapper has-story">
              <img src={group.avatar} alt="avatar" className="reel-avatar" />
            </div>
            <span className="reel-username">{group.username}</span>
          </div>
        ))}
      </div>

      {/* Fullscreen Viewer */}
      {activeReel && (
        <div className="reel-viewer-overlay" onClick={() => setActiveReel(null)}>
          <div className="reel-viewer-content" onClick={e => e.stopPropagation()}>
            <div className="reel-viewer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src={activeReel.profiles?.avatar_url || 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=' + activeReel.user_id} alt="avatar" className="reel-viewer-avatar" />
                <span>{activeReel.profiles?.username || 'Unknown'}</span>
              </div>
              <button className="reel-close-btn" onClick={() => setActiveReel(null)}>×</button>
            </div>
            <img src={activeReel.image_url} alt="Reel" className="reel-image-full" />
          </div>
        </div>
      )}
    </div>
  );
}

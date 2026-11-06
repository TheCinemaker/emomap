// src/components/PulsesPage.jsx
// Full-screen vertical global "Pulses" feed (Snapchat Spotlight / TikTok style).
// - Anyone can upload, anyone can view all active Pulses (24h lifetime).
// - Parallel free AI image moderation ("kép-kukázó") runs before upload.
// - Supports ❤️ Likes (plus double-tap heart burst), 💬 Comments drawer,
//   🔁 Reposts, 📤 Native Share, and 🚩 Community Report (auto-deletes at 2 reports).
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { EMOTIONS } from '../emotions';
import { compressImage } from '../imageCompress';
import { moderateImageFile, warmupModerationModel } from '../imageModeration';
import { IconUser, IconBolt, IconHeart, IconRepeat, IconTrash, IconFlag, IconCamera, IconCheck, IconClose } from './Icons';

const PULSES_LIMIT = 40;
const EXPIRES_HOURS = 24;

const EMOTION_BY_ID = EMOTIONS.reduce((acc, e) => ({ ...acc, [e.id]: e }), {});

function formatTimeAgo(iso, t) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t('pulses_just_now');
  if (mins < 60) return t('friends_mood_ago', { m: mins });
  const hours = Math.round(mins / 60);
  return `${hours}h`;
}

export default function PulsesPage({ session, t, onReady }) {
  const userId = session?.user?.id;
  const [pulses, setPulses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Social state maps keyed by reel_id
  const [likeCounts, setLikeCounts] = useState({});
  const [likedByMe, setLikedByMe] = useState({});
  const [repostCounts, setRepostCounts] = useState({});
  const [repostedByMe, setRepostedByMe] = useState({});
  const [commentCounts, setCommentCounts] = useState({});
  const [reportedByMe, setReportedByMe] = useState({});

  // Double-tap heart burst animation state: reelId | null
  const [heartBurstId, setHeartBurstId] = useState(null);
  const lastTapRef = useRef({ id: null, time: 0 });

  // Comments drawer state
  const [activeCommentReelId, setActiveCommentReelId] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSending, setCommentSending] = useState(false);

  // Upload composer modal state
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState('');
  const [selectedEmotion, setSelectedEmotion] = useState('happy');
  const [aiStatus, setAiStatus] = useState(null); // 'checking' | 'approved' | 'rejected' | null
  const [aiError, setAiError] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  // ── Fetch Pulses & Social Counts ───────────────────────────────────────────
  const fetchPulses = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('reels')
      .select('id, image_url, caption, emotion, created_at, user_id')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(PULSES_LIMIT);

    let rows = data;
    if (error) {
      // Fallback if caption/emotion columns haven't propagated to schema cache yet
      const fallback = await supabase
        .from('reels')
        .select('id, image_url, created_at, user_id')
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(PULSES_LIMIT);
      rows = fallback.data || [];
    }

    if (!rows?.length) {
      setPulses([]);
      setLoading(false);
      return;
    }

    const reelIds = rows.map((r) => r.id);
    const [
      { data: likes },
      { data: reposts },
      { data: commentsData },
    ] = await Promise.all([
      supabase.from('reel_likes').select('reel_id, user_id').in('reel_id', reelIds),
      supabase.from('reel_reposts').select('reel_id, user_id, created_at').in('reel_id', reelIds),
      supabase.from('reel_comments').select('id, reel_id').in('reel_id', reelIds),
    ]);

    const userIds = [
      ...new Set([
        ...rows.map((r) => r.user_id),
        ...(reposts || []).map((rp) => rp.user_id),
      ]),
    ];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);

    const profileMap = (profiles || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {});

    const nextLikeCounts = {};
    const nextLikedByMe = {};
    for (const l of likes || []) {
      nextLikeCounts[l.reel_id] = (nextLikeCounts[l.reel_id] || 0) + 1;
      if (l.user_id === userId) nextLikedByMe[l.reel_id] = true;
    }

    const nextRepostCounts = {};
    const nextRepostedByMe = {};
    const latestRepostByReel = {};
    for (const rp of reposts || []) {
      nextRepostCounts[rp.reel_id] = (nextRepostCounts[rp.reel_id] || 0) + 1;
      if (rp.user_id === userId) nextRepostedByMe[rp.reel_id] = true;
      const prevLatest = latestRepostByReel[rp.reel_id];
      if (!prevLatest || new Date(rp.created_at) > new Date(prevLatest.created_at)) {
        latestRepostByReel[rp.reel_id] = rp;
      }
    }

    const nextCommentCounts = {};
    for (const c of commentsData || []) {
      nextCommentCounts[c.reel_id] = (nextCommentCounts[c.reel_id] || 0) + 1;
    }

    setLikeCounts(nextLikeCounts);
    setLikedByMe(nextLikedByMe);
    setRepostCounts(nextRepostCounts);
    setRepostedByMe(nextRepostedByMe);
    setCommentCounts(nextCommentCounts);

    // Enrich and sort by latest activity (repost bumps the Pulse back to the top of the feed!)
    const enriched = rows.map((r) => {
      const latestRp = latestRepostByReel[r.id];
      const sortAt =
        latestRp?.created_at && new Date(latestRp.created_at) > new Date(r.created_at)
          ? latestRp.created_at
          : r.created_at;
      return {
        ...r,
        username: profileMap[r.user_id]?.username || t('reels_unknown'),
        avatar_url: profileMap[r.user_id]?.avatar_url || null,
        latestReposter: latestRp
          ? profileMap[latestRp.user_id]?.username || t('reels_unknown')
          : null,
        sortAt,
      };
    });

    enriched.sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));
    setPulses(enriched);
    setLoading(false);
  }, [userId, t]);

  useEffect(() => {
    // Pre-warm GPU neural network in the background so photo checks run in ~120ms
    warmupModerationModel();
    fetchPulses();
    const ch = supabase
      .channel('pulses_global_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reels' }, fetchPulses)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reel_likes' }, fetchPulses)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reel_reposts' }, fetchPulses)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reel_comments' }, fetchPulses)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchPulses]);

  // ── Like / Double-tap ──────────────────────────────────────────────────────
  const toggleLike = async (reelId, forceLike = false) => {
    if (!userId) return;
    const currentlyLiked = !!likedByMe[reelId];
    if (forceLike && currentlyLiked) return;

    const nextLiked = forceLike ? true : !currentlyLiked;
    setLikedByMe((prev) => ({ ...prev, [reelId]: nextLiked }));
    setLikeCounts((prev) => ({
      ...prev,
      [reelId]: Math.max(0, (prev[reelId] || 0) + (nextLiked ? 1 : -1)),
    }));

    if (nextLiked) {
      await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: userId });
    } else {
      await supabase.from('reel_likes').delete().eq('reel_id', reelId).eq('user_id', userId);
    }
  };

  const handleImageTap = (reelId) => {
    const now = Date.now();
    if (lastTapRef.current.id === reelId && now - lastTapRef.current.time < 320) {
      setHeartBurstId(reelId);
      setTimeout(() => setHeartBurstId((cur) => (cur === reelId ? null : cur)), 850);
      toggleLike(reelId, true);
    }
    lastTapRef.current = { id: reelId, time: now };
  };

  // ── Repost ─────────────────────────────────────────────────────────────────
  const toggleRepost = async (reelId) => {
    if (!userId) return;
    const currentlyReposted = !!repostedByMe[reelId];
    const nextReposted = !currentlyReposted;

    setRepostedByMe((prev) => ({ ...prev, [reelId]: nextReposted }));
    setRepostCounts((prev) => ({
      ...prev,
      [reelId]: Math.max(0, (prev[reelId] || 0) + (nextReposted ? 1 : -1)),
    }));

    if (nextReposted) {
      await supabase.from('reel_reposts').insert({ reel_id: reelId, user_id: userId });
      showToast(t('pulses_reposted_toast'));
      await fetchPulses();
    } else {
      await supabase.from('reel_reposts').delete().eq('reel_id', reelId).eq('user_id', userId);
      await fetchPulses();
    }
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = async (pulse) => {
    const shareUrl = window.location.origin;
    const shareText = pulse.caption
      ? `${pulse.username}: "${pulse.caption}" — EmoMap Pulses`
      : `${pulse.username} on EmoMap Pulses`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'EmoMap Pulses', text: shareText, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast(t('pulses_link_copied'));
      }
    } catch {
      // user cancelled share sheet
    }
  };

  // ── Report / Delete ────────────────────────────────────────────────────────
  const handleDeleteOwn = async (reelId) => {
    await supabase.from('reels').delete().eq('id', reelId).eq('user_id', userId);
    setPulses((prev) => prev.filter((p) => p.id !== reelId));
    showToast(t('pulses_deleted'));
  };

  const handleReport = async (reelId) => {
    if (!userId || reportedByMe[reelId]) return;
    setReportedByMe((prev) => ({ ...prev, [reelId]: true }));
    await supabase.from('reel_reports').insert({
      reel_id: reelId,
      reporter_id: userId,
      reason: 'inappropriate',
    });
    showToast(t('pulses_reported_toast'));
    fetchPulses();
  };

  // ── Comments Drawer ────────────────────────────────────────────────────────
  const openComments = async (reelId) => {
    setActiveCommentReelId(reelId);
    setCommentsLoading(true);
    setComments([]);

    const { data } = await supabase
      .from('reel_comments')
      .select('id, reel_id, user_id, body, created_at')
      .eq('reel_id', reelId)
      .order('created_at', { ascending: true })
      .limit(100);

    const rows = data || [];
    const uids = [...new Set(rows.map((c) => c.user_id))];
    let pMap = {};
    if (uids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', uids);
      pMap = (profs || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
    }

    setComments(
      rows.map((c) => ({
        ...c,
        username: pMap[c.user_id]?.username || t('reels_unknown'),
        avatar_url: pMap[c.user_id]?.avatar_url || null,
      }))
    );
    setCommentsLoading(false);
  };

  const handleSendComment = async (e) => {
    e.preventDefault();
    const text = commentDraft.trim();
    if (!text || !userId || !activeCommentReelId) return;
    setCommentSending(true);
    setCommentDraft('');

    const { data, error } = await supabase
      .from('reel_comments')
      .insert({ reel_id: activeCommentReelId, user_id: userId, body: text })
      .select()
      .single();

    setCommentSending(false);
    if (!error && data) {
      const { data: me } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', userId)
        .single();
      setComments((prev) => [
        ...prev,
        {
          ...data,
          username: me?.username || t('reels_you'),
          avatar_url: me?.avatar_url || null,
        },
      ]);
      setCommentCounts((prev) => ({
        ...prev,
        [activeCommentReelId]: (prev[activeCommentReelId] || 0) + 1,
      }));
    }
  };

  const handleDeleteComment = async (commentId) => {
    await supabase.from('reel_comments').delete().eq('id', commentId).eq('user_id', userId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    if (activeCommentReelId) {
      setCommentCounts((prev) => ({
        ...prev,
        [activeCommentReelId]: Math.max(0, (prev[activeCommentReelId] || 1) - 1),
      }));
    }
  };

  // ── Upload + AI Image Moderation ("Kép-kukázó") ────────────────────────────
  const resetComposer = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSelectedFile(null);
    setCaption('');
    setAiStatus(null);
    setAiError(null);
    setUploading(false);
  }, []);

  // Exposed to App.jsx so the bottom nav's Pulses-only center button can
  // open this page's composer without lifting all of its state up a level.
  const openComposer = useCallback(() => {
    resetComposer();
    setComposerOpen(true);
  }, [resetComposer]);

  useEffect(() => {
    onReady?.({ openComposer });
  }, [onReady, openComposer]);

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = null;
    if (!file) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setAiError(null);
  };

  const handlePublishPulse = async (e) => {
    e.preventDefault();
    if (!selectedFile || !userId) return;

    const fileToUpload = selectedFile;
    const captionToPost = caption.trim();
    const emotionToPost = selectedEmotion;

    // 1. Instantly close composer modal — user waits 0 ms!
    resetComposer();
    setComposerOpen(false);
    showToast(t('pulses_optimistic_uploading'));

    // 2. Run moderation and upload asynchronously in the background
    try {
      const verdict = await moderateImageFile(fileToUpload);
      if (!verdict.allowed) {
        showToast(t('pulses_ai_rejected'));
        return;
      }

      const compressedBlob = await compressImage(fileToUpload, { maxDim: 1280, quality: 0.82 });
      const filePath = `${userId}_${Date.now()}.jpg`;

      const { error: upErr } = await supabase.storage
        .from('reels')
        .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('reels').getPublicUrl(filePath);
      const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000).toISOString();

      const payload = {
        user_id: userId,
        image_url: publicUrl,
        expires_at: expiresAt,
        caption: captionToPost || null,
        emotion: emotionToPost || null,
      };

      let { error: dbErr } = await supabase.from('reels').insert(payload);
      if (dbErr) {
        // Fallback if schema cache hasn't refreshed caption/emotion yet
        const fallback = await supabase.from('reels').insert({
          user_id: userId,
          image_url: publicUrl,
          expires_at: expiresAt,
        });
        dbErr = fallback.error;
      }
      if (dbErr) throw dbErr;

      showToast(t('pulses_published_toast'));
      await fetchPulses();
    } catch (err) {
      console.error('[Pulses] background publish error:', err);
      showToast(t('pulses_upload_error'));
    }
  };

  return (
    <section className="pulses-page" aria-label="Pulses">
      {/* Top floating bar */}
      <div className="pulses-topbar">
        <div className="pulses-topbar-title">
          <IconBolt className="pulses-bolt" aria-hidden width={18} height={18} />
          <h2>Pulses</h2>
        </div>
      </div>

      {toast && <div className="pulses-toast">{toast}</div>}

      {/* Main vertical snap-scroll feed */}
      <div className="pulses-feed">
        {loading && (
          <div className="pulses-empty">
            <div className="spinner" />
          </div>
        )}

        {!loading && pulses.length === 0 && (
          <div className="pulses-empty">
            <IconBolt className="pulses-empty-icon" width={40} height={40} />
            <h3>{t('pulses_empty_title')}</h3>
            <p>{t('pulses_empty_hint')}</p>
            <button
              type="button"
              className="pulses-create-btn"
              onClick={openComposer}
            >
              + {t('pulses_new_btn')}
            </button>
          </div>
        )}

        {pulses.map((pulse) => {
          const liked = !!likedByMe[pulse.id];
          const likeCnt = likeCounts[pulse.id] || 0;
          const commentCnt = commentCounts[pulse.id] || 0;
          const reposted = !!repostedByMe[pulse.id];
          const repostCnt = repostCounts[pulse.id] || 0;
          const emo = pulse.emotion ? EMOTION_BY_ID[pulse.emotion] : null;
          const isMine = pulse.user_id === userId;

          return (
            <article
              key={pulse.id}
              className="pulse-slide"
              onClick={() => handleImageTap(pulse.id)}
            >
              <img
                src={pulse.image_url}
                alt={pulse.caption || pulse.username}
                className="pulse-slide-img"
                loading="lazy"
              />
              <div className="pulse-slide-vignette" />

              {heartBurstId === pulse.id && (
                <div className="pulse-heart-burst" aria-hidden>
                  <IconHeart width={64} height={64} />
                </div>
              )}

              {/* Bottom-left author & caption */}
              <div className="pulse-meta" onClick={(e) => e.stopPropagation()}>
                {repostCnt > 0 && (
                  <div className="pulse-repost-pill">
                    <IconRepeat width={13} height={13} />{' '}
                    {pulse.latestReposter
                      ? t('pulses_reposted_by', { user: pulse.latestReposter })
                      : `${repostCnt}× ${t('pulses_reposted_badge')}`}
                    {repostCnt > 1 ? ` (+${repostCnt - 1})` : ''}
                  </div>
                )}
                <div className="pulse-author-row">
                  <div
                    className="pulse-author-avatar"
                    style={{
                      backgroundImage: pulse.avatar_url ? `url(${pulse.avatar_url})` : undefined,
                    }}
                  >
                    {!pulse.avatar_url && <IconUser width={18} height={18} />}
                  </div>
                  <span className="pulse-author-name">@{pulse.username}</span>
                  <span className="pulse-time">· {formatTimeAgo(pulse.created_at, t)}</span>
                  {emo && (
                    <span
                      className="pulse-emotion-tag"
                      style={{ '--tag-color': emo.color }}
                    >
                      {t(`emotion_${emo.id}`)}
                    </span>
                  )}
                </div>
                {pulse.caption && <p className="pulse-caption">{pulse.caption}</p>}
              </div>

              {/* Right-side vertical social actions (Snapchat / TikTok style) */}
              <div className="pulse-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`pulse-action-btn${liked ? ' is-liked' : ''}`}
                  onClick={() => toggleLike(pulse.id)}
                  aria-label={t('pulses_like')}
                >
                  <span className="pulse-action-circle">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </span>
                  <span className="pulse-action-count">{likeCnt}</span>
                </button>

                <button
                  type="button"
                  className="pulse-action-btn"
                  onClick={() => openComments(pulse.id)}
                  aria-label={t('pulses_comments')}
                >
                  <span className="pulse-action-circle">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                    </svg>
                  </span>
                  <span className="pulse-action-count">{commentCnt}</span>
                </button>

                <button
                  type="button"
                  className={`pulse-action-btn${reposted ? ' is-reposted' : ''}`}
                  onClick={() => toggleRepost(pulse.id)}
                  aria-label={t('pulses_repost')}
                >
                  <span className="pulse-action-circle">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
                    </svg>
                  </span>
                  <span className="pulse-action-count">{repostCnt}</span>
                </button>

                <button
                  type="button"
                  className="pulse-action-btn"
                  onClick={() => handleShare(pulse)}
                  aria-label={t('share_card_share')}
                >
                  <span className="pulse-action-circle">
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3 3 0 0 0 0-1.4l7.05-4.11a2.99 2.99 0 1 0-1.96-2.8c0 .3.05.58.14.85L7.1 9.35a2.99 2.99 0 1 0 0 5.3l7.04 4.1c-.09.28-.14.56-.14.85a2.99 2.99 0 1 0 2.99-3.52Z" />
                    </svg>
                  </span>
                  <span className="pulse-action-count">{t('share_card_share')}</span>
                </button>

                {isMine ? (
                  <button
                    type="button"
                    className="pulse-action-btn pulse-action-btn--Subtle"
                    onClick={() => handleDeleteOwn(pulse.id)}
                    title={t('pulses_delete')}
                  >
                    <span className="pulse-action-circle"><IconTrash width={18} height={18} /></span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pulse-action-btn pulse-action-btn--Subtle"
                    onClick={() => handleReport(pulse.id)}
                    disabled={!!reportedByMe[pulse.id]}
                    title={t('pulses_report')}
                  >
                    <span className="pulse-action-circle"><IconFlag width={18} height={18} /></span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* ── Comments Bottom Sheet ───────────────────────────────────────── */}
      {activeCommentReelId && (
        <div className="pulses-sheet-backdrop" onClick={() => setActiveCommentReelId(null)}>
          <div className="pulses-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pulses-sheet-header">
              <h3>{t('pulses_comments')}</h3>
              <button
                type="button"
                className="pulses-sheet-close"
                onClick={() => setActiveCommentReelId(null)}
              >
                ×
              </button>
            </div>

            <div className="pulses-comments-list">
              {commentsLoading && <p className="pulses-comments-empty">…</p>}
              {!commentsLoading && comments.length === 0 && (
                <p className="pulses-comments-empty">{t('pulses_comments_empty')}</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="pulses-comment-row">
                  <div
                    className="pulses-comment-avatar"
                    style={{ backgroundImage: c.avatar_url ? `url(${c.avatar_url})` : undefined }}
                  >
                    {!c.avatar_url && <IconUser width={14} height={14} />}
                  </div>
                  <div className="pulses-comment-body">
                    <div className="pulses-comment-top">
                      <span className="pulses-comment-user">@{c.username}</span>
                      <span className="pulses-comment-time">{formatTimeAgo(c.created_at, t)}</span>
                    </div>
                    <p className="pulses-comment-text">{c.body}</p>
                  </div>
                  {c.user_id === userId && (
                    <button
                      type="button"
                      className="pulses-comment-del"
                      onClick={() => handleDeleteComment(c.id)}
                      title={t('pulses_delete')}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleSendComment} className="pulses-comment-form">
              <input
                type="text"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder={t('pulses_comment_placeholder')}
                maxLength={500}
                autoFocus
              />
              <button type="submit" disabled={commentSending || !commentDraft.trim()}>
                {t('chat_send')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── New Pulse Composer Modal (with AI Image Moderation) ─────────── */}
      {composerOpen && (
        <div className="pulses-sheet-backdrop" onClick={() => setComposerOpen(false)}>
          <div className="pulses-composer" onClick={(e) => e.stopPropagation()}>
            <div className="pulses-sheet-header">
              <h3><IconBolt width={16} height={16} /> {t('pulses_new_title')}</h3>
              <button
                type="button"
                className="pulses-sheet-close"
                onClick={() => setComposerOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handlePublishPulse} className="pulses-composer-form">
              <label className="pulses-picker">
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="pulses-picker-preview" />
                ) : (
                  <div className="pulses-picker-placeholder">
                    <IconCamera className="pulses-picker-icon" width={30} height={30} />
                    <span>{t('pulses_pick_photo')}</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFilePick}
                />
              </label>

              {aiError && (
                <div className="pulses-ai-banner is-rejected">
                  <IconClose width={15} height={15} /> {aiError}
                </div>
              )}

              <input
                type="text"
                className="pulses-caption-input"
                placeholder={t('pulses_caption_placeholder')}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={200}
              />

              <div className="pulses-emotion-selector">
                {EMOTIONS.map((e) => {
                  const Icon = e.Icon;
                  const active = selectedEmotion === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={`pulses-emo-pill${active ? ' is-active' : ''}`}
                      style={{ '--chip-color': e.color }}
                      onClick={() => setSelectedEmotion(e.id)}
                    >
                      <Icon width={16} height={16} />
                      <span>{t(`emotion_${e.id}`)}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="submit"
                className="pulses-publish-btn"
                disabled={!selectedFile}
              >
                <IconBolt width={15} height={15} /> {t('pulses_publish_btn')}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}


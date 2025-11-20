// src/useMoodGrid.js
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// kb. 1 km rácsdeg – ~0.009°, kerekítsük 0.01-re
// Megjegyzés: Ez a fix érték csak egy szűk zoom tartományban optimális.
// Nagyobb skálázhatósághoz ezt az értéket a térkép ZOOM szintjétől függően kellene dinamikusan változtatni!
const CELL_SIZE_DEG = 0.01; 
const MAX_FETCH_LIMIT = 20000; // Maximális adatpont, amit a kliens feldolgozhat a fagyás nélkül

// színek RGB-ben – az emotions.js hex-jeiből (ez a definíció OK)
const EMOTION_RGB = {
  happy:      [34, 197, 94],   // #22c55e
  bored:      [156, 163, 175], // #9ca3af
  stressed:   [239, 68, 68],   // #ef4444
  tired:      [250, 204, 21],  // #facc15
  motivated:  [14, 165, 233],  // #0ea5e9
  love:       [236, 72, 153],  // #ec4899
  hype:       [168, 85, 247],  // #a855f7
};

export function useMoodGrid(bounds, sessionId) {
  const [cells, setCells] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    if (!bounds) return;

    const { north, south, east, west } = bounds;
    if (
      typeof north !== 'number' ||
      typeof south !== 'number' ||
      typeof east !== 'number' ||
      typeof west !== 'number'
    ) {
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setWarning(null);

      try {
        // csak az elmúlt 24h
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data, error, count } = await supabase
          .from('emotions')
          .select('emotion, lat, lng, inserted_at', { count: 'exact', head: false })
          // ❌ ELTÁVOLÍTVA: .eq('session_id', sessionId) - MOST MÁR KÖZÖSSÉGI ADAT!
          .gte('inserted_at', since)
          .gte('lat', south)
          .lte('lat', north)
          .gte('lng', west)
          .lte('lng', east)
           // ✅ BIZTONSÁGI LIMIT BEÁLLÍTVA
           .limit(MAX_FETCH_LIMIT); 

        if (error) {
          console.error('[MoodGrid] supabase error:', error);
          if (!cancelled) {
            setCells([]);
            setTotalPoints(0);
            setLoading(false);
          }
          return;
        }

        if (cancelled || !data) return;

        // Figyelmeztetés, ha elértük a limitet, azaz a lekérdezés nem teljes
        if (data.length === MAX_FETCH_LIMIT) {
          setWarning(`A megjelenített adatok limitálva vannak (${MAX_FETCH_LIMIT}+ pont) a teljesítmény érdekében. Kérlek, zoomolj közelebb!`);
        } else {
          setWarning(null);
        }

        setTotalPoints(data.length);

        // Rácsba pakolás (Client-side aggregation)
        const grid = new Map();

        for (const row of data) {
          const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat);
          const lng = typeof row.lng === 'number' ? row.lng : Number(row.lng);
          if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

          // A cella koordinátáinak meghatározása a CELL_SIZE_DEG alapján
          const gx = Math.floor(lat / CELL_SIZE_DEG);
          const gy = Math.floor(lng / CELL_SIZE_DEG);
          const key = `${gx}_${gy}`;

          let cell = grid.get(key);
          if (!cell) {
            cell = {
              latSum: 0,
              lngSum: 0,
              count: 0,
              emotionCounts: {}, // id -> count
            };
            grid.set(key, cell);
          }

          cell.latSum += lat;
          cell.lngSum += lng;
          cell.count += 1;
          cell.emotionCounts[row.emotion] =
            (cell.emotionCounts[row.emotion] || 0) + 1;
        }

        const result = [];
        for (const [, cell] of grid.entries()) {
          if (cell.count === 0) continue;

          // A cella átlagos pozíciója (a kirajzolás helye)
          const lat = cell.latSum / cell.count;
          const lng = cell.lngSum / cell.count;
          const total = cell.count;

          // súlyozott szín keverés
          let rSum = 0;
          let gSum = 0;
          let bSum = 0;

          for (const [emotion, count] of Object.entries(cell.emotionCounts)) {
            const rgb = EMOTION_RGB[emotion];
            if (!rgb) continue;
            const weight = count / total;
            rSum += rgb[0] * weight;
            gSum += rgb[1] * weight;
            bSum += rgb[2] * weight;
          }

          const r = Math.round(rSum);
          const g = Math.round(gSum);
          const b = Math.round(bSum);

          const color = `rgb(${r}, ${g}, ${b})`;
          // intenzitás – 0..1, kb. 1 aura / 20+ click már max
          const intensity = Math.min(1, total / 20);

          result.push({
            lat,
            lng,
            color,
            total,
            intensity,
            // Szükséges a rácsrajzoláshoz a méret is
               size: CELL_SIZE_DEG, 
               key: `${lat}_${lng}`
          });
        }

        if (!cancelled) {
          setCells(result);
          setLoading(false);
        }
      } catch (err) {
        console.error('[MoodGrid] unexpected error:', err);
        if (!cancelled) {
          setCells([]);
          setTotalPoints(0);
          setLoading(false);
          setWarning('Adatlekérdezési hiba történt.');
        }
      }
    }

    // A polling továbbra is marad, de a lekérdezés most már limitált
    load();
    const interval = setInterval(load, 10000); // 10 másodpercenként frissít

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [JSON.stringify(bounds)]); // A sessionId már nem kell, mivel közösségi adatról van szó

  // Visszaadjuk a figyelmeztetést is
  return { cells, loading, totalPoints, warning };
}

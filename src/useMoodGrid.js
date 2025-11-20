// src/useMoodGrid.js
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// A MAX_FETCH_LIMIT a böngésző védelmére szolgál.
const MAX_FETCH_LIMIT = 20000; 

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

/**
 * Dinamikusan kiszámítja a rácsméretet a zoom szint alapján.
 * Cél: Nagy zoomnál (pl. 14+) 0.005 fokos (kb. 500m) rácsokat kapjunk,
 * alacsony zoomnál (pl. 4-es zoom, földgömb) pedig nagy, 10-20 fokos rácsokat.
 * A formula biztosítja, hogy minden rács egy nagyjából azonos, 
 * kezelhető területet fedjen le a képernyőn.
 * * @param {number} zoomLevel A MapLibre aktuális zoom szintje
 * @returns {number} A rács mérete fokokban (CELL_SIZE_DEG)
 */
function calculateCellSize(zoomLevel) {
    // Alap rácsméret (pl. 1 km fokban, ~10-es zoom szintnél)
    const baseSizeDeg = 0.01; 
    
    // Faktor: minél kisebb a zoom, annál nagyobb cellát kell használni
    // p.l. zoom 10 -> size 0.01; zoom 4 -> size 0.01 * 2^(10-4) = 0.64 fok!
    const size = baseSizeDeg * Math.pow(2, 10 - zoomLevel); 
    
    // Korlátozzuk a maximális méretet (pl. 10 fok) és a minimális méretet (pl. 0.005 fok)
    return Math.max(0.005, Math.min(10, size));
}


export function useMoodGrid(bounds, sessionId, mapZoom) {
  const [cells, setCells] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    if (!bounds || mapZoom === undefined) return;

    const { north, south, east, west } = bounds;
    if (
      typeof north !== 'number' ||
      typeof south !== 'number' ||
      typeof east !== 'number' ||
      typeof west !== 'number'
    ) {
      return;
    }
    
    // ✅ DINAMIKUS RÁCSMÉRET KISZÁMÍTÁSA
    const cellSizeDeg = calculateCellSize(mapZoom);
    console.log(`[MoodGrid] Zoom: ${mapZoom.toFixed(1)}, Cell Size: ${cellSizeDeg.toFixed(4)} deg`);


    let cancelled = false;

    async function load() {
      setLoading(true);
      setWarning(null);

      try {
        // csak az elmúlt 24h
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // ⚠️ FIGYELEM: A MapLibre nem támogatja a szerver oldali aggregációt, 
        // így minden pontot le kell kérdezni. Ezért kell a limit és a zoom-függő rács.
        const { data, error } = await supabase
          .from('emotions')
          .select('emotion, lat, lng, inserted_at')
          .gte('inserted_at', since)
          .gte('lat', south)
          .lte('lat', north)
          .gte('lng', west)
          .lte('lng', east)
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

          // A cella koordinátáinak meghatározása a DINAMIKUS CELL_SIZE_DEG alapján
          const gx = Math.floor(lat / cellSizeDeg);
          const gy = Math.floor(lng / cellSizeDeg);
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
            // ✅ Hozzáadtuk a rácsméretet a cellához a MapView-beli méretezéshez
               size: cellSizeDeg, 
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

    // A polling továbbra is marad
    load();
    const interval = setInterval(load, 10000); // 10 másodpercenként frissít

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [JSON.stringify(bounds), mapZoom]); // ✅ Zoom szint figyelése

  // Visszaadjuk a figyelmeztetést is
  return { cells, loading, totalPoints, warning };
}

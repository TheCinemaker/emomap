// src/MapView.jsx
import React, { useEffect, useRef } from 'react';
// A MapLibre importálást eltávolítva a build hiba elkerülése érdekében.
// A maplibregl-t globális objektumként olvassuk (a CDN-es betöltést feltételezve)
const maplibregl = window.maplibregl || {}; 


const EMOTION_COLORS = {
  happy: '#22c55e',     // green
  bored: '#9ca3af',     // grey
  stressed: '#ef4444',  // red
  tired: '#facc15',     // yellow
  motivated: '#0ea5e9', // blue
  love: '#ec4899',      // pink
  hype: '#a855f7'       // purple
};

// Global map to hold grid markers for easy removal
const moodGridMarkers = new Map(); 

export function MapView({ coords, viewCenter, onBoundsChange, pulses, personalMood, moodGridCells, onZoomChange }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const personalAuraRef = useRef(null);

  // Map initialization: Runs ONLY ONCE when coords becomes available
  useEffect(() => {
    // Fontos ellenőrzés: ha a MapLibre nem töltődött be globálisan, vagy már inicializálva van, kiszállunk.
    if (!maplibregl.Map || !mapContainerRef.current || mapRef.current) return;

    // A térkép inicializálása: ha van coords, azonnal arra centrálunk.
    const initialCenter = coords ? [coords.lng, coords.lat] : [19, 47];
    const initialZoom = coords ? 12 : 4; // Zoom beállítása (12: helyi nézet)

    // MapLibre map creation
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: initialCenter, 
      zoom: initialZoom, 
      attributionControl: false
    });

    // Enable basic map interactions
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.touchZoomRotate.enable();

    // Function to emit current map bounds and zoom for data fetching
    const emitBounds = () => {
      const b = map.getBounds();
      const bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest()
      };
      const zoom = map.getZoom();
      onBoundsChange?.(bounds);
      onZoomChange?.(zoom);
    };

    map.on('moveend', emitBounds);
    map.on('load', emitBounds);
    map.on('zoomend', emitBounds); 

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
            mapRef.current.remove();
        }
      mapRef.current = null;
    };
  }, [onBoundsChange, onZoomChange, coords]); // Csak egyszer fut le, amikor a Maplibregl elérhetővé válik, de a kezdeti coords-ra reagál

  // Center map on search result (viewCenter) - runs every time viewCenter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewCenter) return;
    
    // FlyTo animációval ugrunk a keresett helyre
    map.flyTo({
      center: [viewCenter.lng, viewCenter.lat],
      zoom: viewCenter.zoom || 10,
      speed: 0.9
    });
  }, [viewCenter?.lat, viewCenter?.lng, viewCenter?.zoom]);

  // Show user position as a blue dot (User Marker) - runs when coords changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords || !maplibregl.Marker) return;

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-marker';
      userMarkerRef.current = new maplibregl.Marker({
        element: el
      })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([coords.lng, coords.lat]); // Update marker position
    }
  }, [coords]);

  // Personal aura around user (Personal Mood Aura)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords || !maplibregl.Marker) return;

    // If no mood color or total is zero, remove the aura
    if (!personalMood || !personalMood.color || personalMood.total === 0) {
      if (personalAuraRef.current) {
        personalAuraRef.current.remove();
        personalAuraRef.current = null;
      }
      return;
    }

    const opacity = Math.min(1, 0.4 + 0.6 * personalMood.intensity);

    if (!personalAuraRef.current) {
      // Create the marker element for the aura
      const container = document.createElement('div');
      container.className = 'personal-aura';

      const inner = document.createElement('div');
      inner.className = 'personal-aura-inner';
      container.appendChild(inner);

      inner.style.setProperty('--personal-color', personalMood.color);
      inner.style.opacity = String(opacity);

      const marker = new maplibregl.Marker({
        element: container
      })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);

      personalAuraRef.current = marker;
    } else {
      // Update the existing aura position and style
      const marker = personalAuraRef.current;
      marker.setLngLat([coords.lng, coords.lat]);

      const el = marker.getElement().querySelector('.personal-aura-inner');
      if (el) {
        el.style.setProperty('--personal-color', personalMood.color);
        el.style.opacity = String(opacity);
      }
    }
  }, [coords, personalMood]);

  // Show pulses (new events)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pulses || pulses.length === 0 || !maplibregl.Marker) return;
    

    pulses.forEach((p) => {
      const lat = typeof p.lat === 'number' ? p.lat : Number(p.lat);
      const lng = typeof p.lng === 'number' ? p.lng : Number(p.lng);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        console.warn('Invalid pulse coords:', p);
        return;
      }

      const container = document.createElement('div');
      container.className = 'pulse-marker-container';

      const el = document.createElement('div');
      el.className = 'pulse-marker';
      container.appendChild(el);

      const color = EMOTION_COLORS[p.emotion] || 'rgba(255,255,255,0.9)';
      el.style.setProperty('--pulse-color', color);

      const marker = new maplibregl.Marker({ element: container })
        .setLngLat([lng, lat])
        .addTo(map);

      // Pulse fades out after 6 seconds
      setTimeout(() => {
        marker.remove();
      }, 6000);
    });
  }, [pulses]);

  // Mood Grid Cells megjelenítése
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !maplibregl.Marker) return;
    
    const visibleKeys = new Set();
    const currentZoom = map.getZoom(); 

    // 1. Meglévő markerek frissítése és az újak létrehozása
    moodGridCells?.forEach(cell => {
      const key = cell.key; 
      visibleKeys.add(key);

      // Funkció a pixelméret kiszámításához a cella mérete alapján
      const calculatePixelSize = (zoom) => {
          // Ez a formula biztosítja, hogy kisebb zoomnál az aura is arányosan nagyobb legyen.
          // Zoom 10-nél kb 100px.
          return Math.max(10, Math.min(250, 100 * Math.pow(2, zoom - 10)));
      };

      const pixelSize = calculatePixelSize(currentZoom);

      if (moodGridMarkers.has(key)) {
        // Frissítjük a meglévő markert
        const marker = moodGridMarkers.get(key);
        marker.setLngLat([cell.lng, cell.lat]);
        
        const el = marker.getElement().querySelector('.mood-grid-cell-inner');
        if (el) {
          el.style.setProperty('--cell-color', cell.color);
          el.style.opacity = String(0.1 + 0.8 * cell.intensity);
          
          el.style.width = `${pixelSize}px`;
          el.style.height = `${pixelSize}px`;
        }

      } else {
        // Új marker létrehozása
        const container = document.createElement('div');
        container.className = 'mood-grid-cell-container';

        const inner = document.createElement('div');
        inner.className = 'mood-grid-cell-inner';
        container.appendChild(inner);
        
        inner.style.setProperty('--cell-color', cell.color);
        inner.style.opacity = String(0.1 + 0.8 * cell.intensity);
        
        // Méret beállítás
        inner.style.width = `${pixelSize}px`;
        inner.style.height = `${pixelSize}px`;

        const marker = new maplibregl.Marker({ 
            element: container,
            anchor: 'center' // A pontot a DOM elem közepéhez illesztjük
        })
          .setLngLat([cell.lng, cell.lat])
          .addTo(map);

        moodGridMarkers.set(key, marker);
      }
    });

    // 2. Eltávolítjuk azokat a markereket, amik már nincsenek az adatokban
    const markersToRemove = [];
    moodGridMarkers.forEach((marker, key) => {
      if (!visibleKeys.has(key)) {
        marker.remove();
        markersToRemove.push(key);
      }
    });

    markersToRemove.forEach(key => moodGridMarkers.delete(key));

  }, [moodGridCells]); 

  // zoom controls
  function handleZoomIn() {
    if (!mapRef.current) return;
    mapRef.current.zoomIn();
  }
  
  function handleZoomOut() {
    if (!mapRef.current) return;
    mapRef.current.zoomOut();
  }

  // Back to user position button
  function handleBackToMe() {
    const map = mapRef.current;
    if (!map || !coords) return;
    
    map.flyTo({
      center: [coords.lng, coords.lat],
      zoom: 12,
      speed: 1.2,
      essential: true
    });
  }

  return (
    <div className="map-container" ref={mapContainerRef}>
      <div className="map-zoom-controls">
        <button onClick={handleZoomIn}>+</button>
        <button onClick={handleZoomOut}>−</button>
      </div>
      
      {/* Back to me button */}
      {coords && (
        <button 
          className="back-to-me-btn"
          onClick={handleBackToMe}
          title="Vissza a saját helyemhez"
        >
          📍
        </button>
      )}
    </div>
  );
}

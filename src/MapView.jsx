// src/MapView.jsx
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMOTION_COLORS = {
  happy: '#22c55e',     // zöld
  bored: '#9ca3af',     // szürke
  stressed: '#ef4444',  // piros
  tired: '#facc15',     // sárga
  motivated: '#0ea5e9', // kék
  love: '#ec4899',      // pink
  hype: '#a855f7'       // lila
};

export function MapView({ coords, viewCenter, onBoundsChange, pulses }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const pulseMarkersRef = useRef([]);

  // Init map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      // JAVÍTÁS: OpenStreetMap alapú sötét téma, ami biztosan működik
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
      center: [19, 47],
      zoom: 4,
      attributionControl: false
    });

    // Add cyberpunk filter to the map
    map.on('load', () => {
      // Add a custom layer for cyberpunk effect
      map.addLayer({
        id: 'cyberpunk-overlay',
        type: 'background',
        paint: {
          'background-color': '#000000'
        }
      });

      // Emit bounds after map loads
      const b = map.getBounds();
      const bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest()
      };
      onBoundsChange?.(bounds);
    });

    // enable interactions
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.touchZoomRotate.enable();

    const emitBounds = () => {
      const b = map.getBounds();
      const bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest()
      };
      onBoundsChange?.(bounds);
    };

    map.on('moveend', emitBounds);

    mapRef.current = map;

    return () => {
      // Clean up all markers
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }
      pulseMarkersRef.current.forEach(marker => marker.remove());
      pulseMarkersRef.current = [];
      
      map.remove();
      mapRef.current = null;
    };
  }, [onBoundsChange]);

  // center map on user coords or view center
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    // Wait for map to be fully loaded
    if (!map.isStyleLoaded()) {
      map.once('load', () => {
        handleCenterUpdate();
      });
      return;
    }
    
    function handleCenterUpdate() {
      const target = viewCenter || coords;
      if (!target || !target.lat || !target.lng) return;

      map.flyTo({
        center: [target.lng, target.lat],
        zoom: viewCenter?.zoom || 10,
        speed: 0.9,
        essential: true
      });
    }
    
    handleCenterUpdate();
  }, [coords, viewCenter]);

  // show user position as a blue dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    // Wait for map to load
    if (!map.isStyleLoaded()) {
      map.once('load', () => {
        updateUserMarker();
      });
      return;
    }

    function updateUserMarker() {
      if (!userMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'user-marker';
        userMarkerRef.current = new maplibregl.Marker({
          element: el
        })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat([coords.lng, coords.lat]);
      }
    }

    updateUserMarker();
  }, [coords]);

  // show pulses (new events)
  useEffect(() => {
    if (!mapRef.current || !pulses || pulses.length === 0) return;
    const map = mapRef.current;

    // Wait for map to load
    if (!map.isStyleLoaded()) {
      map.once('load', () => {
        addPulses();
      });
      return;
    }

    function addPulses() {
      // Clean up old markers that are done animating
      pulseMarkersRef.current = pulseMarkersRef.current.filter(marker => {
        if (marker._removed) {
          marker.remove();
          return false;
        }
        return true;
      });

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

        const marker = new maplibregl.Marker({ 
          element: container,
          anchor: 'center'
        })
          .setLngLat([lng, lat])
          .addTo(map);

        pulseMarkersRef.current.push(marker);

        setTimeout(() => {
          marker._removed = true;
          marker.remove();
        }, 6000);
      });
    }

    addPulses();
  }, [pulses]);

  // zoom controls
  function handleZoomIn() {
    if (!mapRef.current) return;
    mapRef.current.zoomIn();
  }
  
  function handleZoomOut() {
    if (!mapRef.current) return;
    mapRef.current.zoomOut();
  }

  return (
    <div className="map-container" ref={mapContainerRef}>
      <div className="map-zoom-controls">
        <button onClick={handleZoomIn}>+</button>
        <button onClick={handleZoomOut}>−</button>
      </div>
      
      {/* Cyberpunk overlay effect */}
      <div className="cyberpunk-overlay"></div>
    </div>
  );
}

// src/MapView.jsx
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export function MapView({ coords, onBoundsChange, pulses }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);

  // Init map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [16, 47],
      zoom: 2,
      attributionControl: false
    });

    // enable interactions
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.touchZoomRotate.enable();

    map.on('moveend', () => {
      const b = map.getBounds();
      const bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getSouth() > b.getNorth() ? b.getSouth() : b.getSouth(), // (optional fix later, most important az alap)
        east: b.getEast(),
        west: b.getWest()
      };
      onBoundsChange?.(bounds);
    });

    map.on('load', () => {
      const b = map.getBounds();
      const bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest()
      };
      onBoundsChange?.(bounds);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onBoundsChange]);

  // center map on user coords
  useEffect(() => {
    if (!coords || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [coords.lng, coords.lat],
      zoom: 10,
      speed: 0.9
    });
  }, [coords]);

  // show user position as a blue dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

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
  }, [coords]);

  // show pulses (new events)
  useEffect(() => {
    if (!mapRef.current || !pulses || pulses.length === 0) return;
    const map = mapRef.current;

    pulses.forEach((p) => {
      if (typeof p.lng !== 'number' || typeof p.lat !== 'number') return;

      const el = document.createElement('div');
      el.className = 'pulse-marker';

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      setTimeout(() => {
        marker.remove();
      }, 2500);
    });
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
    </div>
  );
}

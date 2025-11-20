// src/useGeolocation.js
import { useState, useEffect } from 'react';

/**
 * React Hook a felhasználó aktuális földrajzi pozíciójának figyelésére.
 * Az adatokat a böngésző Geolocation API-jából nyeri.
 * * @returns {object} { coords: { lat, lng }, error: string | null }
 */
export function useGeolocation() {
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 1. Ellenőrizzük, elérhető-e a Geolocation API
    if (!navigator.geolocation) {
      setError('A böngésződ nem támogatja a Geolocation API-t.');
      return;
    }

    // 2. Siker esetén a pozíció frissítése
    const successHandler = (position) => {
      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setError(null); // Töröljük a korábbi hibákat
    };

    // 3. Hiba esetén a hiba beállítása
    const errorHandler = (err) => {
      console.error(`Geolocation hiba (${err.code}): ${err.message}`);
      // Kezeljük a leggyakoribb hibákat
      let errorMessage = 'Ismeretlen hiba történt a helymeghatározás során.';
      if (err.code === 1) {
        errorMessage = 'A felhasználó megtagadta a helymeghatározást. Kérlek, engedélyezd a böngésződben!';
      } else if (err.code === 2) {
        errorMessage = 'A pozíció nem érhető el (pl. gyenge jel).';
      }
      setError(errorMessage);
    };

    // 4. Beállítások a watchPosition-höz
    const options = {
      enableHighAccuracy: true, // Magas pontosság kérése (jobb GPS/Wi-Fi)
      timeout: 15000,         // Maximális idő a várakozásra
      maximumAge: 5000        // Maximum 5 mp-nél régebbi cachelt pozíciót fogadunk el
    };

    // 5. Elindítjuk a pozíció folyamatos figyelését
    const watchId = navigator.geolocation.watchPosition(
      successHandler,
      errorHandler,
      options
    );

    // Tisztító funkció: a komponens eltűnésekor leállítjuk a figyelést
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []); // Csak egyszer fut le a komponens mountolásakor

  return { coords, error };
}

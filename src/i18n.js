// src/i18n.js
// Minimal i18n: no extra dependency, just a dictionary + a tiny hook.
// Default language is English; Hungarian and German are first-class, not an afterthought.
import { useCallback, useState } from 'react';

export const LANGUAGES = ['en', 'hu', 'de'];
export const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'emomap_lang';

const dict = {
  en: {
    app_title: 'EmoMap',
    vote_prompt_need_location: 'Allow location access to vote',
    vote_prompt_ready: 'How are you feeling right now?',
    vote_prompt_cooldown: 'Next vote in {s}s',
    info: 'Info',
    user: 'User',
    logout: 'Log out',
    location: 'Location',
    gps_error: 'GPS error',
    activity: 'Activity',
    cells: 'Cells',
    search_placeholder: 'Search a city…',
    search_go: 'Go',
    search_no_result: 'No results',
    search_bad_coords: 'Invalid coordinates',
    search_error: 'Search error',
    close: 'Close',

    emotion_happy: 'Happy',
    emotion_bored: 'Bored',
    emotion_stressed: 'Stressed',
    emotion_tired: 'Tired',
    emotion_motivated: 'Focused',
    emotion_love: 'Loving',
    emotion_hype: 'Hyped',

    auth_tagline_signup: 'Create an account',
    auth_tagline_signin: 'Welcome back',
    auth_email: 'Email',
    auth_username: 'Username',
    auth_password: 'Password',
    auth_username_placeholder_signup: 'e.g. jane_42',
    auth_username_placeholder_signin: 'username',
    auth_username_taken: 'This name is already taken.',
    auth_username_invalid: '3–20 characters, letters/digits/_ only.',
    auth_username_available: 'Available ✨',
    auth_username_checking: 'Checking…',
    auth_submit_loading: 'One moment…',
    auth_submit_signup: 'Sign up',
    auth_submit_signin: 'Log in',
    auth_or: 'or',
    auth_switch_to_signin: 'Already have an account? Log in',
    auth_switch_to_signup: "Don't have an account yet? Sign up",
    auth_footer_note: "Log in with your username. Signing up also needs an email — you'll get a confirmation there.",
    auth_err_email_taken: 'This email is already registered.',
    auth_err_bad_credentials: 'Wrong username or password.',
    auth_err_password_short: 'Password must be at least 6 characters.',
    auth_err_username_taken: 'This username is already taken.',
    auth_err_username_format: 'Username must be 3–20 characters, letters/digits/_ only.',
    auth_err_username_required: 'Enter your username.',
    auth_success_signup: "Signed up! Confirm your email, then log in.",

    reels_add_story: 'Add a story',
    reels_you: 'You',
    reels_unknown: 'Unknown',

    mirror_not_alone: "You're not alone — {percent}% nearby feel {emotion} too right now",

    share_card_open: 'My week',
    share_card_loading: 'Building your card…',
    share_card_no_data: 'Vote a few times this week to unlock your recap.',
    share_card_headline: 'was your most-felt mood this week',
    share_card_footer: '{total} votes this week · emomap.app',
    share_card_share: 'Share',
    share_card_download: 'Download',

    replay_open: 'Replay',
    replay_now: 'Now',
    replay_hours_ago: '-{h}h',

    venue_claim_open: 'Claim this spot',
    venue_claim_title: 'Put your venue on the map',
    venue_claim_hint: "This claims your current location as a venue — free. You'll be able to boost its visibility later.",
    venue_claim_name_placeholder: 'Venue name',
    venue_claim_submit: 'Claim',
    venue_claim_error: 'Could not claim this venue.',
  },

  hu: {
    app_title: 'EmoMap',
    vote_prompt_need_location: 'Engedélyezd a helymeghatározást a szavazáshoz',
    vote_prompt_ready: 'Hogy érzed magad most?',
    vote_prompt_cooldown: 'Új szavazat: {s}s múlva',
    info: 'Info',
    user: 'Felhasználó',
    logout: 'Kilépés',
    location: 'Helyzet',
    gps_error: 'GPS hiba',
    activity: 'Aktivitás',
    cells: 'Cellák',
    search_placeholder: 'Város keresése…',
    search_go: 'Ugrás',
    search_no_result: 'Nincs találat',
    search_bad_coords: 'Hibás koordináta',
    search_error: 'Keresési hiba',
    close: 'Bezárás',

    emotion_happy: 'Vidám',
    emotion_bored: 'Unalom',
    emotion_stressed: 'Stressz',
    emotion_tired: 'Fáradt',
    emotion_motivated: 'Fókusz',
    emotion_love: 'Szeretet',
    emotion_hype: 'Pörgés',

    auth_tagline_signup: 'Hozz létre egy fiókot',
    auth_tagline_signin: 'Üdv újra!',
    auth_email: 'Email',
    auth_username: 'Felhasználónév',
    auth_password: 'Jelszó',
    auth_username_placeholder_signup: 'pl. szilveszter_42',
    auth_username_placeholder_signin: 'felhasználónév',
    auth_username_taken: 'Ez a név már foglalt.',
    auth_username_invalid: '3–20 karakter, csak betű, szám, _.',
    auth_username_available: 'Szabad ✨',
    auth_username_checking: 'Ellenőrzés…',
    auth_submit_loading: 'Egy pillanat…',
    auth_submit_signup: 'Regisztráció',
    auth_submit_signin: 'Belépés',
    auth_or: 'vagy',
    auth_switch_to_signin: 'Van már fiókod? Lépj be',
    auth_switch_to_signup: 'Még nincs fiókod? Regisztrálj',
    auth_footer_note: 'Bejelentkezés felhasználónévvel. Regisztrációhoz email is kell — erre kapsz megerősítést.',
    auth_err_email_taken: 'Ez az email cím már regisztrálva van.',
    auth_err_bad_credentials: 'Hibás felhasználónév vagy jelszó.',
    auth_err_password_short: 'A jelszónak legalább 6 karakter hosszúnak kell lennie.',
    auth_err_username_taken: 'Ez a felhasználónév már foglalt.',
    auth_err_username_format: 'A felhasználónév 3–20 karakter, csak betű/szám/_ lehet.',
    auth_err_username_required: 'Add meg a felhasználóneved.',
    auth_success_signup: 'Sikeres regisztráció! Erősítsd meg az emailedet a beérkezett levélben, aztán lépj be.',

    reels_add_story: 'Story hozzáadása',
    reels_you: 'Te',
    reels_unknown: 'Ismeretlen',

    mirror_not_alone: 'Nem vagy egyedül — a közeledben élők {percent}%-a most is {emotion}',

    share_card_open: 'Heti kártya',
    share_card_loading: 'Készül a kártyád…',
    share_card_no_data: 'Szavazz pár alkalommal ezen a héten, hogy legyen mit megosztanod.',
    share_card_headline: 'volt a leggyakoribb hangulatod ezen a héten',
    share_card_footer: '{total} szavazat ezen a héten · emomap.app',
    share_card_share: 'Megosztás',
    share_card_download: 'Letöltés',

    replay_open: 'Visszajátszás',
    replay_now: 'Most',
    replay_hours_ago: '-{h}ó',

    venue_claim_open: 'Hely regisztrálása',
    venue_claim_title: 'Tedd fel a helyedet a térképre',
    venue_claim_hint: 'Ez ingyen felveszi a jelenlegi pozíciódat helyszínként. Később fizetve ki is emelheted.',
    venue_claim_name_placeholder: 'Helyszín neve',
    venue_claim_submit: 'Regisztrálás',
    venue_claim_error: 'Nem sikerült felvenni ezt a helyszínt.',
  },

  de: {
    app_title: 'EmoMap',
    vote_prompt_need_location: 'Standortzugriff erlauben, um abzustimmen',
    vote_prompt_ready: 'Wie fühlst du dich gerade?',
    vote_prompt_cooldown: 'Nächste Abstimmung in {s}s',
    info: 'Info',
    user: 'Benutzer',
    logout: 'Abmelden',
    location: 'Standort',
    gps_error: 'GPS-Fehler',
    activity: 'Aktivität',
    cells: 'Zellen',
    search_placeholder: 'Stadt suchen…',
    search_go: 'Los',
    search_no_result: 'Keine Treffer',
    search_bad_coords: 'Ungültige Koordinaten',
    search_error: 'Suchfehler',
    close: 'Schließen',

    emotion_happy: 'Froh',
    emotion_bored: 'Gelangweilt',
    emotion_stressed: 'Gestresst',
    emotion_tired: 'Müde',
    emotion_motivated: 'Fokussiert',
    emotion_love: 'Verliebt',
    emotion_hype: 'Aufgedreht',

    auth_tagline_signup: 'Konto erstellen',
    auth_tagline_signin: 'Willkommen zurück',
    auth_email: 'E-Mail',
    auth_username: 'Benutzername',
    auth_password: 'Passwort',
    auth_username_placeholder_signup: 'z. B. jane_42',
    auth_username_placeholder_signin: 'Benutzername',
    auth_username_taken: 'Dieser Name ist bereits vergeben.',
    auth_username_invalid: '3–20 Zeichen, nur Buchstaben/Zahlen/_.',
    auth_username_available: 'Verfügbar ✨',
    auth_username_checking: 'Wird geprüft…',
    auth_submit_loading: 'Einen Moment…',
    auth_submit_signup: 'Registrieren',
    auth_submit_signin: 'Anmelden',
    auth_or: 'oder',
    auth_switch_to_signin: 'Schon ein Konto? Anmelden',
    auth_switch_to_signup: 'Noch kein Konto? Registrieren',
    auth_footer_note: 'Anmeldung mit Benutzername. Für die Registrierung wird auch eine E-Mail benötigt — dort erhältst du eine Bestätigung.',
    auth_err_email_taken: 'Diese E-Mail-Adresse ist bereits registriert.',
    auth_err_bad_credentials: 'Falscher Benutzername oder Passwort.',
    auth_err_password_short: 'Das Passwort muss mindestens 6 Zeichen lang sein.',
    auth_err_username_taken: 'Dieser Benutzername ist bereits vergeben.',
    auth_err_username_format: 'Der Benutzername muss 3–20 Zeichen lang sein, nur Buchstaben/Zahlen/_.',
    auth_err_username_required: 'Gib deinen Benutzernamen ein.',
    auth_success_signup: 'Registrierung erfolgreich! Bestätige deine E-Mail und melde dich dann an.',

    reels_add_story: 'Story hinzufügen',
    reels_you: 'Du',
    reels_unknown: 'Unbekannt',

    mirror_not_alone: 'Du bist nicht allein — {percent}% in deiner Nähe fühlen sich jetzt auch {emotion}',

    share_card_open: 'Meine Woche',
    share_card_loading: 'Deine Karte wird erstellt…',
    share_card_no_data: 'Stimme diese Woche ein paar Mal ab, um deine Zusammenfassung freizuschalten.',
    share_card_headline: 'war diese Woche deine häufigste Stimmung',
    share_card_footer: '{total} Abstimmungen diese Woche · emomap.app',
    share_card_share: 'Teilen',
    share_card_download: 'Herunterladen',

    replay_open: 'Wiedergabe',
    replay_now: 'Jetzt',
    replay_hours_ago: '-{h}h',

    venue_claim_open: 'Standort registrieren',
    venue_claim_title: 'Setze deinen Ort auf die Karte',
    venue_claim_hint: 'Das registriert deinen aktuellen Standort kostenlos als Venue. Später kannst du die Sichtbarkeit boosten.',
    venue_claim_name_placeholder: 'Name des Ortes',
    venue_claim_submit: 'Registrieren',
    venue_claim_error: 'Dieser Ort konnte nicht registriert werden.',
  },
};

export function getStoredLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.includes(saved)) return saved;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through to default
  }
  return DEFAULT_LANGUAGE;
}

function translate(lang, key, vars) {
  let str = dict[lang]?.[key] ?? dict[DEFAULT_LANGUAGE][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

export function useLang() {
  const [lang, setLangState] = useState(getStoredLanguage);

  const setLang = useCallback((next) => {
    if (!LANGUAGES.includes(next)) return;
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {
      // ignore storage failures
    }
  }, []);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  return { lang, setLang, t };
}

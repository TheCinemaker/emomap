# EmoMap — Partner Mini CRM, Térképes POI & Flyer Modal Terv (`VENUE_CRM_PLAN.md`)

Ez a dokumentum rögzíti a helytulajdonosok (bárok, klubok, éttermek, kávézók, rendezvényhelyszínek) számára készülő **fizetős Partner Mini CRM** és **Térképes POI / Flyer Modal** rendszer pontos üzleti és technikai specifikációját, valamint az indulás előtti technikai javítási listát.

---

## 1. Üzleti modell és jogosultságkezelés (Miért cseréljük le a jelenlegi `VenueClaim.jsx`-et?)

- **A jelenlegi `VenueClaim.jsx` kivezetése a publikus Info panelből:**
  - A helyregisztráció **nem ingyenes tömegfunkció**, hanem **fizetős B2B Partner csomag**.
  - A helytulajdonosok gyakran otthonról vagy irodából (nem a helyszíni GPS-koordinátán állva) kezelik a helyüket, ezért pontos térképes kitűzőre és saját adminisztrációs felületre (Mini CRM) van szükségük.

### Kétlépcsős aktiválás (Kézi most → Automata később)
1. **1. Fázis (Kézi aktiválás – azonnal indulhat):**
   - A `public.profiles` táblába kerül egy `is_partner boolean not null default false` (vagy a `public.venues` táblába `is_active boolean not null default false` + `tier text default 'basic'`).
   - Csak azoknak a felhasználóknak jelenik meg a Profilban a **„🏢 Partner CRM / Helyem kezelése”** gomb, akiknek az admin (Szilveszter) a Supabase-ben (vagy egy mini admin kapcsolóval) bekapcsolta az `is_partner = true` jogosultságot.
2. **2. Fázis (Önkiszolgáló skálázás – napi 200+ regisztrációhoz):**
   - Stripe Checkout előfizetés (`basic` / `vip` havi csomag) + Supabase Edge Function webhook.
   - Sikeres fizetéskor a webhook automatikusan `is_partner = true` / `venues.is_active = true` állapotra állítja a fiókot; lemondáskor/lejáratkor automatikusan inaktiválja a megjelenést.

---

## 2. Adatbázis-séma bővítés (`public.venues` + Storage)

A meglévő `public.venues` táblát az alábbi oszlopokkal kell kiegészíteni:

```sql
alter table public.venues
  add column if not exists category text default 'club',           -- 'club' | 'bar' | 'restaurant' | 'cafe' | 'event'
  add column if not exists logo_url text,                          -- Kerek POI logó a térképen
  add column if not exists flyer_url text,                         -- Nagy buliplakát / akció kép a Modalban
  add column if not exists headline text,                          -- Pl. "Péntek 22:00 – Neon Night"
  add column if not exists description text,                       -- Részletes leírás, akciók, belépő infók
  add column if not exists cta_label text,                         -- Pl. "Asztalfoglalás" / "Instagram" / "Jegyek"
  add column if not exists cta_url text,                           -- Külső link (ha nincs belső jegyvásárlás)
  add column if not exists tier text not null default 'basic'      -- 'basic' (zoom >= 14) | 'vip' (zoom >= 11 + neon gyűrű)
    check (tier in ('basic', 'vip')),
  add column if not exists is_active boolean not null default true,
  add column if not exists views_count bigint not null default 0,  -- Hányan nyitották meg a Modalt
  add column if not exists clicks_count bigint not null default 0, -- Hányan kattintottak a CTA / Útvonal gombra
  -- Későbbi belső jegyértékesítés (másik appból átültetendő modul) előkészítése:
  add column if not exists ticketing_enabled boolean not null default false,
  add column if not exists ticket_price_huf integer,
  add column if not exists ticket_event_id uuid,
  add column if not exists updated_at timestamptz default timezone('utc'::text, now()) not null;
```

- **Storage Bucket (`venues`):**
  - Publikus olvasású bucket két mappával: `{user_id}/logo.{ext}` és `{user_id}/flyer.{ext}`.
  - Feltöltés előtt kliensoldali `<canvas>` tömörítés:
    - Logó: max `256x256px` WebP/JPEG (~25 KB)
    - Flyer/Plakát: max `1200px` magas WebP/JPEG (~150–200 KB)

---

## 3. A Partner Mini CRM felület (`src/components/VenueCRM.jsx`)

Amikor egy `is_partner = true` felhasználó megnyitja a **Partner CRM**-et:

1. **Milliméter-pontos Térképes Pin-választó:**
   - Nem a telefon aktuális GPS-ét használja!
   - A tulajdonos a térképen húzható jelölővel (vagy célkereszttel) centire pontosan a saját üzlete/klubja bejáratára teheti a tűt (`lat`, `lng`).
2. **Térképes POI beállítások:**
   - Hely neve (`name`), kategória (`category`), és **kerek logó/kép (`logo_url`)** feltöltése előnézettel.
3. **Flyer & Esemény szerkesztő (amit a felhasználók kattintáskor látnak):**
   - **Flyer / Plakát kép (`flyer_url`)** feltöltése és azonnali cseréje.
   - **Főcím (`headline`)** és **Leírás (`description`)** megadása (pl. aktuális buli, DJ, italakció, nyitvatartás).
   - **CTA gomb (`cta_label` + `cta_url`)** beállítása.
4. **Partner Statisztika (Élő visszajelzés a tulajnak):**
   - Megjelenések / Modal megnyitások száma (`views_count`).
   - Gombkattintások / Útvonaltervezések száma (`clicks_count`).
   - Környékbeli (200 m-es) élő hangulat-index.

---

## 4. Térképes megjelenés – POI Karika & Zoom-szabályozás (`src/MapView.jsx`)

1. **Zoom-küszöb (hogy kizoomolva ne legyen zsúfolt a térkép):**
   - **`basic` csomagú helyek:** csak **`zoom >= 14`** (utca / városrész szint) felett jelennek meg.
   - **`vip` (kiemelt) csomagú helyek:** már **`zoom >= 11`** (teljes város szint) felett megjelennek, és pulsáló neon/arany keretet kapnak.
2. **POI Design a térképen:**
   - Kerek avatár/logó (`40x40px`) + alatta kompakt, sötét üveghatású kapszulában a hely neve.
   - Kattintásra nem egy apró tooltipet, hanem a **Venue Flyer Modalt** nyitja meg.

---

## 5. Venue Flyer Modal & Jegyvásárlás előkészítés (`src/components/VenueModal.jsx`)

Amikor egy felhasználó rákattint a helyre a térképen:
1. **Fejléc:** Hely logója, neve, kategóriája + a hely 200 méteres körzetének aktuális domináns hangulata (*„🔥 82% Hype itt most”*).
2. **Középső rész:**
   - Teljes szélességű, nagy felbontású **Flyer / Buliplakát** (`flyer_url`).
   - **Főcím (`headline`)** és **Leírás (`description`)**.
3. **Lábléc akciógombok:**
   - **1. Gomb (Dinamikus CTA / Jegyvásárlás):**
     - Ha `ticketing_enabled = true` (a másik appból átültetett jegyértékesítő modul aktiválása után): **„🎟️ Jegyvásárlás ({ticket_price_huf} Ft)”** → közvetlen jegyvásárlás és QR-belépő generálás.
     - Ha külső `cta_url` van megadva: pl. **„🎟️ Jegyek / Asztalfoglalás / Instagram”**.
   - **2. Gomb (Navigáció):** **„📍 Útvonaltervezés ide”** (`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).

---

## 6. További észrevételek és technikai javítási lista (Code Audit)

A kódbázis átvizsgálása során talált konkrét javítandó pontok:

1. **Reels lejárati idő (`src/components/ReelsViewer.jsx` 5. sor):**
   - Jelenleg `const EXPIRES_MINUTES = 20;` van beégetve, így a sztorik 24 óra helyett 20 perc után eltűnnek. Át kell állítani `24 * 60`-ra (1440 perc = 24 óra).
2. **Kliensoldali képtömörítés (`ReelsViewer.jsx`, `Profile.jsx`, és majd `VenueCRM.jsx`):**
   - Feltöltés előtt `<canvas>`-szal érdemes `max 1200px` méretre és `0.82` JPEG/WebP minőségre tömöríteni a telefonos fotókat, hogy mobilneten azonnal felmenjenek és ne teljen be a Supabase Storage.
3. **Chat dupla üzenet villanás (`src/useChat.js` 47. és 76. sor):**
   - Küldéskor a Supabase Realtime `INSERT` esemény gyakran hamarabb ér vissza, mint az `insert().select().single()` HTTP válasz, így az optimista `temp_...` buborék átírásakor duplikálódik a saját üzenet. A 76. sorban ha `prev.some(m => m.id === data.id)`, akkor a `tempId`-t törölni kell csere helyett.
4. **Chat üzenet-sorrend 200 üzenet felett (`src/useChat.js` 26–27. sor):**
   - `.order('created_at', { ascending: false }).limit(200)` lekérdezés szükséges, majd kliensen `.reverse()`, különben 200 üzenet felett a legrégebbi 200-at tölti be.
5. **`usePersonalMood.js` 24 órás szűrés hiánya (`src/usePersonalMood.js` 51–59. sor):**
   - Hiányzik belőle a `.gte('inserted_at', since)` (elmúlt 24 óra), így jelenleg a régi szavazatokat is beleszámolja.
6. **2 perces szavazási cooldown megőrzése F5 után (`src/App.jsx`):**
   - A `lastVoteAt` értéket érdemes `localStorage`-ban is tárolni, hogy oldalfrissítés után se tűnjön el a visszaszámláló.
7. **Opcionális látvány-fejlesztés (3D épületek a térképen):**
   - A `src/MapView.jsx`-ben a raszteres OSM csempék helyett ingyenes OpenFreeMap vektoros csempére + MapLibre `fill-extrusion` 3D épület-rétegre és `pitch: 50` dönthetőségre váltva valódi 3D várostérkép érhető el 0 Ft költséggel.


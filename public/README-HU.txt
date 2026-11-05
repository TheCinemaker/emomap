EmoMap PWA ikoncsomag

Tartalom:
- favicon.ico: többméretű böngészőikon
- favicon-16x16.png, favicon-32x32.png, favicon-48x48.png: böngészőikonok
- apple-touch-icon.png: iOS/iPadOS kezdőképernyő ikon (180x180)
- android-chrome-192x192.png és android-chrome-512x512.png: Android/PWA ikonok
- pwa-maskable-192x192.png és pwa-maskable-512x512.png: maskable PWA ikonok
- emomap-icon-master.png: 1024x1024-es ikonmester
- emomap-full-logo.png: teljes, feliratos eredeti logó
- site.webmanifest: beilleszthető PWA manifest

Telepítés:
1. Másold a PNG/ICO fájlokat a Vite projekt public/ mappájába.
2. A site.webmanifest fájlt szintén a public/ mappába másold.
3. Az index.html <head> részébe tedd be:

<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#050e23">

Megjegyzés:
A favicon és a telepített app ikonja a logó szimbólumát használja felirat nélkül,
mert az EMOMAP felirat kis méretben olvashatatlan lenne. A teljes logó külön
emomap-full-logo.png fájlban található.

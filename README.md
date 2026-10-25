# Third Eye

An offline-first OSINT toolkit PWA: a tool launcher (57 tools), search and dork builders, a username checker, cases with on-device photos, and a data-broker removal tracker. Everything stays on your device. There are no accounts, analytics or external scripts.

**Open:** https://trevorlay.github.io/third-eye/ (on Android Chrome, use ⋮ → Install app)

**Optional live checks (v1.1):** with a private server and API key set in Settings → Live check server, the Username checker can run Sherlock and Email tools can run Holehe. The key is stored only on your device (IndexedDB) and is never included in backups. Without a key, the app works fully offline as before.

**Case photos (v1.2):** take or pick photos for a case. They are downscaled to 2000 px, stored only in IndexedDB, and can be captioned, shared, downloaded or reverse-searched on TinEye and Google Lens, where you upload them yourself. They are included in backups. v1.2 also removed PeekYou, Nuwber, Radaris and Yandex as search tools; their broker opt-out entries are still there.

**Cost badges and live tiles (v1.3):** tools whose results are paywalled show a gold $, and tools with some free results but a paid full report show ½$. "Hide paid" in the launcher hides the $ tools. The Sherlock and Holehe tiles now open the built-in live check, with a link to each project page.

Only for lawful purposes, such as auditing your own exposure or protecting family. Version 1.3.1.

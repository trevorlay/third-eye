# Third Eye

An offline-first OSINT toolkit PWA: a tool launcher (56 tools), search and dork builders, a username checker, cases with on-device photos, and a data-broker removal tracker. Records stay on your device; optional live checks and alias creation use your own server. There are no accounts, analytics or external scripts.

**Open:** https://trevorlay.github.io/third-eye/ (on Android Chrome, use ⋮ → Install app)

**Optional live checks (v1.1):** with a private server and API key set in Settings → Live check server, the Username checker can run Sherlock and Email tools can run Holehe. The key is stored only on your device (IndexedDB) and is never included in backups. Without a key, the app works fully offline as before.

**Case photos (v1.2):** take or pick photos for a case. They are downscaled to 2000 px, stored only in IndexedDB, and can be captioned, shared, downloaded or reverse-searched on TinEye and Google Lens, where you upload them yourself. They are included in backups. v1.2 also removed PeekYou, Nuwber, Radaris and Yandex as search tools; their broker opt-out entries are still there.

**Cost badges and live tiles (v1.3):** tools whose results are paywalled show a gold $, and tools with some free results but a paid full report show ½$. "Hide paid" in the launcher hides the $ tools. The Sherlock and Holehe tiles now open the built-in live check, with a link to each project page.

Only for lawful purposes, such as auditing your own exposure or protecting family. Version 1.4.0.

**Privacy tab (v1.4):** email alias and secondary-number trackers with search, edit and active/burned labels; optional SimpleLogin/Firefox Relay alias creation through your server; broker opted-out/re-check dates, progress and overdue list; a sourced Android device checklist; Firefox/uBlock Origin/AdNauseam guidance; and an offline random persona generator with save/copy/alias linking. No automated sign-ups or notifications. Marking burned is local only, not provider deactivation.

IndexedDB upgrades in place to v3. Schema-3 backups include all privacy records and still import older backups, but never contain server/provider keys. Keep backups private: they are not encrypted. Alias creation sends the site/note to the provider after confirmation; provider keys stay on your server. Configure `SIMPLELOGIN_API_KEY` and/or `FIREFOX_RELAY_API_KEY` securely in the existing root-owned 0600 `/etc/thirdeye/thirdeye.env`, restart only `thirdeye.service`, then use Privacy → Aliases → Check providers. Free account quotas still apply.

AdNauseam is listed for Firefox for Android 120+ (checked 2026-11-08). Use it instead of another ad blocker; Chrome on Android cannot run extensions. Noise does not guarantee privacy. Personas are only for low-stakes manual sign-ups, never banking/government or real-identity uses.

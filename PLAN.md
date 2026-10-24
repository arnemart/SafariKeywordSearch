# Modernization plan

Minimum: Safari 17 (iOS 17, macOS 12+ with Safari 17). The Safari permission prompt for host permissions is acceptable.

## 1. Bug fixes and build setup — done

- background.js
  - Domain regex: `soguo` → `sogou`, accept `m.` and regional Yahoo (`no.search.yahoo.com`); `maps.google.com` etc. still do not match.
  - Multiple query parameters per engine: Baidu `wd`/`word`, Sogou `query`/`keyword`.
  - Import: v1/v2 data is upgraded before validation; no more undefined `e`; current-version data is now saved to native/iCloud (it was previously only set in memory).
  - `onMessage` returns `true` for async responses; reset responds when done.
  - `loadData`: queues callbacks during an in-flight load, calls them on native errors/timeouts (2s), so the first search after a cold start isn't lost.
  - Debounce per tab instead of global.
- Editor.jsx
  - Settings in state, merged on change (previously overwritten/reverted when a search was saved).
  - Deleted-search animation got an array instead of an object.
  - `editor-${...}` key, `preventDefault` on submit, `className`, `key` on `<option>`.
  - Reset waits for the background before reload.
- Swift
  - `SafariWebExtensionHandler` always completes the request (previously hung on decode error), no force cast.
  - `ViewController`: missing `)` in `show('mac', …)` JS, so on/off status never showed.
  - App copy: "preferences" → "settings".
- Build
  - Removed `dist/` and source maps from git; `npm run build` without source maps. `popup.js` stays committed until step 2 (Xcode references it directly).
  - Deployment target macOS 11 → 12 (Xcode no longer supports 11), iOS 15 → 17.
  - Xcode's "recommended settings" applied (Xcode 27). Run Script phase (`npm run build`) finds node via fnm/Homebrew (Xcode does not get the shell PATH), runs `npm ci` if needed, fails with a clear error without npm. `ENABLE_USER_SCRIPT_SANDBOXING = NO` on the extension targets, because the script writes `popup.js` to the source folder.
  - Both schemes build (unsigned, with Xcode's PATH). Not tested in Safari yet.

## 2. Dependencies and Editor refactor — done

- Sources in `Shared (Extension)/Resources/src/`: `popup.jsx`, `Editor.jsx`, `background.js`, plus `search.js` (URL parsing/expansion) and `data.js` (version, defaults, upgrade, validation, ids). esbuild bundles to `popup.js` and `background.js` (same paths as before, so Xcode refs are unchanged). Build output no longer committed; a missing npm is a build error in Xcode.
- React 17 → 19.3 (`createRoot`), Parcel → esbuild 0.28.
- Editor: immutable state, selection by `id` instead of index, sorting no longer mutates state, unsaved new searches are never persisted.
- Ids: existing searches get a deterministic id (hash of content) so all devices derive the same ids; new searches get `crypto.randomUUID()`.
- Bugs found along the way: per-search "Front only" was ignored when the global setting was "Front and end"; v2 upgrade kept `version: 2` (import of v2 failed, re-upgraded on every load).
- Bug: the background cache (localStorage) from the old version had no ids, and `undefined == null` made the popup open straight into the first search. Ids are now added on cache load and in the Editor; strict comparisons.
- Tests: `npm test` (vitest), 20 tests: all known Safari URLs, expansion, keyword location, upgrade v1/v2, ids, and UI tests for the Editor (jsdom + Testing Library): list without ids, open/edit/add/cancel/delete, default, settings preserved. Checked that the regression test fails on the old code.
- Tested by hand in the iOS simulator.
- Swift 6 / project upgrade postponed to step 3 (Data.swift is rewritten there anyway).

## 3. Sync — implemented, being tested

**Requirement: tests for upgrading from any older version to any newer one.** Fixtures with real data from each format (v1, v2, v3 without ids, v3 with ids, the new sync format), and tests that each one is upgraded correctly to every newer version. Also cross-version: an old app on another device that reads/writes the new format via iCloud (e.g. the old Editor drops `id` and unknown fields when a search is saved), so it must not break or lose data.

Problem seen: adding searches on two devices minutes apart often loses one. Cause: the extension process is short-lived and KVS fetches asynchronously, so a device often saves based on a stale copy, and the whole blob overwrites the other device's in iCloud.

Decisions: option B (new key for the new format, bridge to v3 for old versions), stay on KVS.

Design:
- Swift is a dumb store: `load` returns the raw values of all keys (v1, v3, v4) from UserDefaults (app group) and KVS; `save` writes given keys. All logic in JS (`src/sync.js`), so it can be tested.
- v4 format (key `keywordSearchesv4`): `searches` with `id` + `updatedAt`, `deleted: {id: timestamp}` (tombstones), `settings` + `settingsUpdatedAt` per key, `legacyTimestamp` (latest bridged v3 write).
- Merge: per search the newest `updatedAt` wins; a tombstone wins over the same or older version; settings per key; multiple defaults after merge → the newest wins. Deterministic, so all devices converge.
- Write-back: after a merge, a device writes to local and iCloud wherever the merged state differs from what was read. Then additions on two devices survive even if one overwrites the other in iCloud.
- Clock: `updatedAt = max(now, highest seen + 1)`.
- Edits: the popup sends the new list plus what it started from (base); the background turns the diff into changes (updatedAt/tombstones) and applies them on top of the current state, so data that arrived while the popup was open isn't deleted.
- Old versions (v3 key): new versions write a v3 copy with a `bridge: true` marker (old versions drop unknown top-level fields when saving, so their writes never carry it). A v3 write without the marker and newer than `legacyTimestamp` is read back in: new/changed searches get `updatedAt` = the v3 timestamp; searches missing from it that are older than the v3 timestamp are tombstoned. Old Editor drops `id` on edit → the search gets a content-based id → old one tombstoned + new one added = edit.
- Native is called at startup, popup open, before saving and at most every 30 s on navigation (not on every navigation).
- Refinement: a missing search in an old version's write is ambiguous (deleted, or never seen). The v3 copy stamps each search with `syncedAt`; old versions keep it on searches they don't edit, so we know which copy they started from and only treat searches that were in it as deleted. A search with a known id but different content is a stale copy (the old Editor drops `id` on edit), so ours is kept. v3 with `timestamp: 0` (an old version's untouched defaults) is not read in.
- Defaults are not stored until the user changes something, so a new device doesn't push the defaults to other devices.

Done:
- `src/sync.js` + `src/sync.test.js` (28 tests): simulation of the iCloud server (last write per key), devices with stale data, an emulation of the old version (Data.swift + background + Editor). Covers: adding on two devices (the reported bug), edit vs delete, newest edit wins, tombstones, clock skew, settings per key, one default, fresh device, 200 random operations on 3 devices, and old and new versions together. Upgrades from v1 (with/without timestamp), v2, v3 locally / in iCloud / newer in iCloud, v3 with ids, defaults with timestamp 0. Mutation-checked: whole-blob LWW and dropping `syncedAt` both make the right tests fail.
- background.js: new sync flow; Editor sends `base`.
- Swift: `Data.swift` is a raw store (`load`/`save` of keys v1/v3/v4, locally and iCloud), the handler logs iCloud quota/account changes. Swift 6, both schemes build.
- Note: Xcode MCP builds get cancelled when `project.pbxproj` has just changed on disk (Xcode reloads the project silently).

Remaining: test in Safari, including together with the App Store version (old version) on another device. Tombstones are never pruned (small; can be revisited).

## 4. Default-engine setting — todo

Dropdown: Any / Google / Bing / DuckDuckGo / Ecosia / Yahoo / other regional (domain match only). With an engine selected, only trigger on that engine and with Safari's marker parameter.

## 5. declarativeNetRequest — todo

Redirect before the request is sent, using dynamic rules with `regexSubstitution`, per platform (parameter order differs). `webNavigation` remains as the fallback (custom spaceReplacer, `escape: false`, unknown parameter order). Then consider MV3.

## Safari's search URLs ("monkey")

| Engine | macOS | iPhone | iPad |
|---|---|---|---|
| DuckDuckGo | `?q=monkey&t=osx&ia=web` | `?q=monkey&t=iphone&ia=web` | `?q=monkey&t=ipad&ia=web` |
| Google | `/search?client=safari&rls=en&q=monkey&ie=UTF-8&oe=UTF-8` | `/search?q=monkey&ie=UTF-8&oe=UTF-8&hl=en&client=safari&iga=1&utm_campaign=safari_share_1` | `/search?q=monkey&ie=UTF-8&oe=UTF-8&hl=en-us&client=safari&sei=…` |
| Yahoo | `search.yahoo.com/search?ei=utf-8&fr=aaplw&p=monkey` | `no.search.yahoo.com/search?p=monkey&fr=iphone&.tsrc=apple` | `no.search.yahoo.com/search?p=monkey&fr=ipad` |
| Bing | `/search?q=monkey&form=APMCS1&PC=APMC` | `/search?q=monkey&form=APIPH1&PC=APPL` | `/search?q=monkey&form=APIPA1&PC=APPD` |
| Ecosia | `/search?q=monkey&tts=st_asaf_macos` | `/search?q=monkey&tts=st_asaf_iphone` | `/search?q=monkey&tts=st_asaf_ipad` |

Marker rules: DDG `t` ∈ osx/iphone/ipad · Google `client=safari` · Yahoo `fr` ∈ aaplw/iphone/ipad · Bing `form` starts with `AP` · Ecosia `tts` starts with `st_asaf_`.

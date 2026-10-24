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
  - Both schemes build (unsigned). Not tested in Safari yet.

## 2. Dependencies and Editor refactor — todo

React 19, Parcel/esbuild, immutable state in Editor, stable `id` per search, Xcode project upgrade, Swift 5.10/6.

## 3. Sync — todo

Per-search merging (`id`, `updatedAt`, tombstones) instead of last-writer-wins on the whole blob. Handle iCloud KVS notification reasons. Load from native at startup/popup/interval, not on every navigation.

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

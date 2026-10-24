# SafariKeywordSearch

<http://safarikeywordsearch.aurlien.net>

[Download on the App Store](https://apps.apple.com/app/keyword-search/id1558453954)

Safari Keyword Search is a simple extension for Safari on macOS and iOS that lets you change the default search engine and search using any search engine using keywords in the address bar. For example, you can search Wikipedia for information on monkeys by typing **w monkeys** in the address bar.

The following searches are included in the default set:

- **a**: amazon.com
- **ao**: archive.org waybackmachine
- **d**: duckduckgo.com
- **down**: downforeveryoneorjustme.com
- **e**: ebay.com
- **g**: google search
- **gm**: google maps
- **i**: google image search
- **imdb**: imdb.com
- **so**: stackoverflow.com
- **w**: en.wikipedia.org
- **wa**: wolframalpha.com
- **y**: youtube.com

You can also add your own searches in the extension settings, which live inside Safari.

### Settings

- **Make default**: use one of your searches instead of Safari’s search engine when you search without a keyword.
- **Allowed keyword locations**: allow typing the keyword after the search phrase (**monkeys w**). Can be overridden per search.
- **Safari’s search engine**: pick the search engine set in Safari’s settings, and keywords will only work for searches from the address bar, not when you search on the search engine’s own website. “Any” works with all search engines.
- **Export/Import**: copy your searches as JSON, or paste them in to restore them.

Your searches and settings sync between your devices through iCloud. Changes made on different devices are merged, so adding searches on two devices keeps both. Devices still running an older version of the app keep syncing too.

Requires Safari 17 or later (iOS 17, macOS 12 or later).

If you want to contribute a PR, feel free. Let me warn you, the source code is a lot like a garbage fire at a spaghetti factory.

### Did the extension disappear from Safari on macOS?

There is a bug in Safari on macOS where extensions sometimes disappear. To fix it, follow these steps:

1. Quit Safari
2. Open Terminal, copy and paste the following command:
```
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f -R /Applications/Safari.app
```
3. Relaunch Safari
4. Go to Safari Settings --> Extensions, Keyword Search should have reappeared. If the checkbox is unchecked, check it to reenable the extension.

Thanks to [Jeff Johnson for figuring that out](https://lapcatsoftware.com/articles/disappearing-safari.html) and [@porg](https://github.com/porg) for helping clarify these instructions.

### Weird details/limitations etc

This is how the extension works:

1. Listening for the beforeNavigate event
2. Checking the URL to see if the domain matches one of the search engines Safari can use (Google, Bing, Yahoo including regional Yahoo sites, DuckDuckGo, Ecosia, Baidu, Sogou or 360 Search). If you have picked Safari’s search engine in the settings, only that one is accepted, and only with the parameters Safari adds to searches from the address bar (e.g. `client=safari` for Google)
3. Extracting the search string from the URL
4. Checking if the search string includes one of the keywords
5. Quickly replacing the URL of the tab with the new search URL

Parsing the URL to get the search string is not optimal, but it’s the only way with the current APIs. These edge cases/bugs can occur:

- In some cases, the default search engine will load in the tab before the extension is triggered, especially if the search engine you are using is slightly slow to respond (Wikipedia I'm lookin at you).
- If you have more than one keyword the extension can in rare cases trigger multiple times (i.e. if you enter ddg g w monkey) (there are workarounds for this in place but it can happen anyway).
- Baidu, Sogou and 360 Search are only recognized by their domain, so the “Safari’s search engine” setting can’t tell searches from the address bar apart from searches on their websites.

Redirecting with `declarativeNetRequest` instead would avoid loading the search engine at all, but in Safari 27 it makes Safari regularly reload the page with “This webpage was reloaded because of a problem”, so it’s not used.

The previous previous Safari Extension API had a beforeSearch event that was a lot more convenient. To any Safari developers who might be reading this: hello!

### Development

The extension’s JavaScript lives in `Shared (Extension)/Resources/src`. Xcode builds it with esbuild (`npm run build`) into `popup.js` and `background.js` before each build, using node from fnm or Homebrew. Tests run with `npm test` in `Shared (Extension)/Resources`.

- `search.js`: recognizing search URLs and expanding keywords
- `data.js`: the data format, defaults and upgrades from older formats
- `sync.js`: merging data between devices and with older versions of the app
- `background.js`: listens for navigation and talks to the native side
- `Editor.jsx`, `popup.jsx`: the settings popup

The native side (`Shared (Extension)/Data.swift`) only stores the data, locally and in iCloud key-value storage.

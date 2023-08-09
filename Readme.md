# SafariKeywordSearch

<http://safarikeywordsearch.aurlien.net>

[Download on the App Store](https://apps.apple.com/app/keyword-search/id1558453954)

Safari Keyword Search is a simple extension for Safari on macOS amd iOS that enables keyword searching from the address bar. This is a simple but powerful feature that gives you access to several search engines using simple keywords. For example, you can search Wikipedia for information on monkeys by typing **w monkeys** in the address bar.

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

If you want to contribute a PR, feel free. Let me warn you, the source code is a lot like a garbage fire at a spaghetti factory.

### Did the extension disappear from Safari on macOS?

There is a bug in Safari on macOS where extensions sometimes disappear. To fix it, follow these steps:

1. Quit Safari
2. Open Terminal, copy and paste the following command:
```
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f -R /Applications/Safari.app
```
3. Relaunch Safari
4. Go to Safari Preferences --> Extensions, Keyword Search should have reappeared. If the checkbox is unchecked, check it to reenable the extension.

Thanks to: 
- [Jeff Johnson for figuring that out!](https://lapcatsoftware.com/articles/disappearing-safari.html)
- [@porg](https://github.com/porg) for helping clarify these instructions

### Weird details/limitations etc

This is how the extension works:

1. Listening for the beforeNavigate event
2. Checking the URL to see if the domain matches one of the default search domains in Safari (Google, Bing, Yahoo, DuckDuckGo or Ecosia
3. Extracting the search string from the URL
4. Checking if the search string includes one of the keywords
5. Quickly replacing the URL of the tab with the new search URL

Parsing the URL to get the search string is not optimal, but it’s the only way with the current APIs. These edge cases/bugs can occur:

- In some cases, the default search engine will load in the tab before the extension is triggered, especially if the search engine you are using is slightly slow to respond (Wikipedia I'm lookin at you).
- If you have more than one keyword the extension can in rare cases trigger multiple times (i.e. if you enter ddg g w monkey) (there are workarounds for this in place but it can happen anyway).

The previous previous Safari Extension API had a beforeSearch event that was a lot more convenient. To any Safari developers who might be reading this: hello!

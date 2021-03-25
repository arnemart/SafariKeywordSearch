# SafariKeywordSearch

<http://safarikeywordsearch.aurlien.net>

[Download on the Mac App Store](https://apps.apple.com/app/keyword-search/id1558453954)

Safari Keyword Search is a simple extension for Safari on macOS that enables keyword searching from the address bar. This is a simple but powerful feature that gives you access to several search engines using simple keywords. For example, you can search Wikipedia for information on monkeys by typing w monkeys in the address bar.

The following searches are included in the default set:

- **a**: amazon.com
- **d**: duckduckgo.com
- **down**: downforeveryoneorjustme.com
- **e**: ebay.com
- **g**: google.com
- **gm**: maps.google.com
- **imdb**: imdb.com
- **so**: stackoverflow.com
- **w**: en.wikipedia.org
- **wa**: wolframalpha.com
- **y**: youtube.com

You can also add your own searches in the app. The search keyword can be placed before (w monkeys) or after (monkeys w) the search string.

If you want to contribute a PR, feel free. Let me warn you, having zero prior experience with AppKit and macOS development, the source code is a lot like a garbage fire at a spaghetti factory.

### Weird details/limitations etc

This is how the extension works:

1. Listening for the beforeNavigate event
2. Checking the URL to see if the domain matches one of the default search domains in Safari (Google, Bing, Yahoo, DuckDuckGo or Ecosia
3. Extracting the search string from the URL
4. Checking if the search string includes one of the keywords
5. Quickly replacing the URL of the tab with the new search URL

Parsing the URL to get the search string is not optimal, but it’s the only way with the current APIs. These edge cases/bugs can occur:

- If you have more than one keyword the extension can trigger multiple times (i.e. if you enter ddg g w monkey)
- On rare occasions, the default search engine will load in the tab before the extension is triggered (I’ve only seen this a couple of times)

The previous previous previous Safari Extension API had a beforeSearch event that was a lot more convenient. To any Safari developers who might be reading this: hello!

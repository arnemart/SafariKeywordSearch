import { test, describe, expect } from 'vitest'
import assert from 'node:assert/strict'
import { getSearchParam, getSearchUrl, buildIndex } from './search.js'
import { defaultSearches } from './data.js'

test('getSearchParam extracts the query from Safari search URLs', () => {
  const urls = [
    // macOS
    'https://duckduckgo.com/?q=monkey&t=osx&ia=web',
    'https://www.google.com/search?client=safari&rls=en&q=monkey&ie=UTF-8&oe=UTF-8',
    'https://search.yahoo.com/search?ei=utf-8&fr=aaplw&p=monkey',
    'https://www.bing.com/search?q=monkey&form=APMCS1&PC=APMC',
    'https://www.ecosia.org/search?q=monkey&tts=st_asaf_macos',
    // iPhone
    'https://duckduckgo.com/?q=monkey&t=iphone&ia=web',
    'https://www.google.com/search?q=monkey&ie=UTF-8&oe=UTF-8&hl=en&client=safari&iga=1',
    'https://no.search.yahoo.com/search?p=monkey&fr=iphone&.tsrc=apple',
    'https://www.bing.com/search?q=monkey&form=APIPH1&PC=APPL',
    'https://www.ecosia.org/search?q=monkey&tts=st_asaf_iphone',
    // iPad
    'https://www.bing.com/search?q=monkey&form=APIPA1&PC=APPD',
    'https://no.search.yahoo.com/search?p=monkey&fr=ipad',
    // Regional
    'https://www.baidu.com/s?wd=monkey',
    'https://m.baidu.com/s?word=monkey',
    'https://www.sogou.com/web?query=monkey',
    'https://m.sogou.com/web/searchList.jsp?keyword=monkey',
    'https://www.so.com/s?q=monkey',
    'https://search.yahoo.co.jp/search?p=monkey',
    'https://www.google.co.uk/search?q=monkey'
  ]
  for (const url of urls) {
    assert.equal(getSearchParam(url), 'monkey', url)
  }
})

test('getSearchParam ignores other sites and subdomains', () => {
  for (const url of [
    'https://maps.google.com/?q=monkey',
    'https://docs.google.com/?q=monkey',
    'https://example.com/?q=monkey',
    'https://notgoogle.com/search?q=monkey'
  ]) {
    assert.equal(getSearchParam(url), undefined, url)
  }
})

const index = buildIndex(defaultSearches)

test('getSearchUrl expands keyword at the front', () => {
  assert.equal(getSearchUrl('y rick astley', index), 'https://www.youtube.com/results?search_query=rick+astley')
  assert.equal(getSearchUrl('Y rick', index), 'https://www.youtube.com/results?search_query=rick')
  assert.equal(getSearchUrl('ddg a&b', index), 'https://duckduckgo.com/?q=a%26b')
})

test('getSearchUrl respects spaceReplacer and escape', () => {
  assert.equal(getSearchUrl('w monkey business', index), 'https://en.wikipedia.org/wiki/Special:Search/monkey_business')
  assert.equal(getSearchUrl('ao example.com/a?b', index), 'https://web.archive.org/web/*/example.com/a?b')
})

test('getSearchUrl returns nothing without keyword or default', () => {
  assert.equal(getSearchUrl('monkey business', index), undefined)
})

test('getSearchUrl uses the default search', () => {
  const data = {
    ...defaultSearches,
    searches: defaultSearches.searches.map(s => (s.name == 'DuckDuckGo' ? { ...s, isDefault: true } : s))
  }
  assert.equal(getSearchUrl('monkey business', buildIndex(data)), 'https://duckduckgo.com/?q=monkey+business')
})

test('getSearchUrl keyword at the end', () => {
  const frontOnly = buildIndex(defaultSearches)
  assert.equal(getSearchUrl('rick y', frontOnly), undefined)

  const frontAndEnd = buildIndex({ ...defaultSearches, settings: { allowedLocations: 'frontAndEnd' } })
  assert.equal(getSearchUrl('rick y', frontAndEnd), 'https://www.youtube.com/results?search_query=rick')

  // Per-search override wins over the global setting, both ways
  const searches = [
    { name: 'A', keywords: 'a', expansion: 'https://a/@@@', allowedLocations: 'frontAndEnd' },
    { name: 'B', keywords: 'b', expansion: 'https://b/@@@', allowedLocations: 'frontOnly' }
  ]
  assert.equal(getSearchUrl('x a', buildIndex({ searches, settings: { allowedLocations: 'frontOnly' } })), 'https://a/x')
  assert.equal(getSearchUrl('x b', buildIndex({ searches, settings: { allowedLocations: 'frontAndEnd' } })), undefined)
})

describe('searchEngine setting', () => {
  // The URLs Safari generated for "monkey" on Mac, iPhone and iPad
  const safariUrls = {
    duckduckgo: [
      'https://duckduckgo.com/?q=monkey&t=osx&ia=web',
      'https://duckduckgo.com/?q=monkey&t=iphone&ia=web',
      'https://duckduckgo.com/?q=monkey&t=ipad&ia=web'
    ],
    google: [
      'https://www.google.com/search?client=safari&rls=en&q=monkey&ie=UTF-8&oe=UTF-8',
      'https://www.google.com/search?q=monkey&ie=UTF-8&oe=UTF-8&hl=en&client=safari&iga=1&utm_campaign=safari_share_1',
      'https://www.google.com/search?q=monkey&ie=UTF-8&oe=UTF-8&hl=en-us&client=safari&sei=Y37caqLnI7adi-gPwZjAwQs'
    ],
    yahoo: [
      'https://search.yahoo.com/search?ei=utf-8&fr=aaplw&p=monkey',
      'https://no.search.yahoo.com/search?p=monkey&fr=iphone&.tsrc=apple',
      'https://no.search.yahoo.com/search?p=monkey&fr=ipad'
    ],
    bing: [
      'https://www.bing.com/search?q=monkey&form=APMCS1&PC=APMC',
      'https://www.bing.com/search?q=monkey&form=APIPH1&PC=APPL',
      'https://www.bing.com/search?q=monkey&form=APIPA1&PC=APPD'
    ],
    ecosia: [
      'https://www.ecosia.org/search?q=monkey&tts=st_asaf_macos',
      'https://www.ecosia.org/search?q=monkey&tts=st_asaf_iphone',
      'https://www.ecosia.org/search?q=monkey&tts=st_asaf_ipad'
    ]
  }
  // Searches made on the engine's own website
  const websiteUrls = {
    duckduckgo: 'https://duckduckgo.com/?q=monkey&ia=web',
    google: 'https://www.google.com/search?q=monkey&sca_esv=123&source=hp',
    yahoo: 'https://search.yahoo.com/search?p=monkey&fr=yfp-t',
    bing: 'https://www.bing.com/search?q=monkey&form=QBLH',
    ecosia: 'https://www.ecosia.org/search?method=index&q=monkey'
  }

  for (const [engine, urls] of Object.entries(safariUrls)) {
    test(`${engine}: matches Safari's searches only`, () => {
      for (const url of urls) {
        expect(getSearchParam(url, engine), url).toBe('monkey')
        expect(getSearchParam(url, 'any'), url).toBe('monkey')
      }
      expect(getSearchParam(websiteUrls[engine], engine)).toBeUndefined()
      expect(getSearchParam(websiteUrls[engine], 'any')).toBe('monkey')
    })

    test(`${engine}: other engines' searches are ignored`, () => {
      for (const [other, otherUrls] of Object.entries(safariUrls)) {
        if (other == engine) continue
        for (const url of otherUrls) {
          expect(getSearchParam(url, engine), url).toBeUndefined()
        }
      }
    })
  }

  test('regional engines match on domain only', () => {
    expect(getSearchParam('https://www.baidu.com/s?wd=monkey', 'baidu')).toBe('monkey')
    expect(getSearchParam('https://m.sogou.com/web/searchList.jsp?keyword=monkey', 'sogou')).toBe('monkey')
    expect(getSearchParam('https://www.so.com/s?q=monkey', 'so')).toBe('monkey')
    expect(getSearchParam('https://www.baidu.com/s?wd=monkey', 'so')).toBeUndefined()
  })

  test('no setting means any engine', () => {
    expect(getSearchParam('https://www.google.com/search?q=monkey')).toBe('monkey')
  })
})

test('keywords are trimmed and matched case-insensitively', () => {
  const index = buildIndex({ searches: [{ name: 'X', keywords: ' Xx ,  yy ', expansion: 'https://x/@@@' }], settings: {} })
  expect(getSearchUrl('xx a', index)).toBe('https://x/a')
  expect(getSearchUrl('YY a', index)).toBe('https://x/a')
})

import { test } from 'vitest'
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

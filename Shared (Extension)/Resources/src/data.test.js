import { test } from 'vitest'
import assert from 'node:assert/strict'
import { CURRENT_VERSION, defaultSearches, upgradeData, validateData, ensureIds } from './data.js'

test('defaults are valid', () => {
  assert.ok(validateData(defaultSearches))
})

test('upgrades v1 data', () => {
  const v1 = {
    data: [
      { name: 'Plain', keyword: 'p', expansion: 'https://p/?q=@@@' },
      { keyword: 'n', expansion: 'https://n/%%%' },
      { name: 'Custom', keyword: 'c', expansion: 'https://c/{{@_@}}' }
    ]
  }
  const upgraded = upgradeData(v1)
  assert.equal(upgraded.version, CURRENT_VERSION)
  assert.ok(validateData(upgraded))
  assert.deepEqual(upgraded.searches[1], {
    name: '',
    keywords: 'n',
    expansion: 'https://n/@@@',
    allowedLocations: 'default',
    escape: false
  })
  assert.equal(upgraded.searches[2].spaceReplacer, '_')
})

test('upgrades v2 data to the current version', () => {
  const upgraded = upgradeData({ version: 2, timestamp: 1, searches: defaultSearches.searches })
  assert.equal(upgraded.version, CURRENT_VERSION)
  assert.ok(validateData(upgraded))
})

test('ensureIds is deterministic and keeps existing ids', () => {
  const a = ensureIds(defaultSearches.searches)
  const b = ensureIds(defaultSearches.searches)
  assert.deepEqual(
    a.map(s => s.id),
    b.map(s => s.id)
  )
  assert.equal(new Set(a.map(s => s.id)).size, a.length)

  const withId = [{ id: 'x', name: '', keywords: 'k', expansion: 'https://k/@@@' }]
  assert.equal(ensureIds(withId)[0], withId[0])
})

test('ensureIds gives duplicates distinct ids', () => {
  const s = { name: 'Same', keywords: 's', expansion: 'https://s/@@@' }
  const ids = ensureIds([s, s]).map(s => s.id)
  assert.notEqual(ids[0], ids[1])
})

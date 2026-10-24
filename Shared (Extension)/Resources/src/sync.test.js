import { test, describe, expect } from 'vitest'
import { syncStores, applyEdit, replaceAll, view, merge, KEYS, emptyState } from './sync.js'
import { defaultSearches } from './data.js'

// --- Simulation -----------------------------------------------------------------------------------------
//
// The iCloud server keeps the last write per key. Each device only sees the server's values when they are
// delivered to it (KVS fetches asynchronously, so devices often work on stale data).

class Cloud {
  constructor() {
    this.values = {}
  }
  write(values) {
    Object.assign(this.values, values)
  }
}

let now = 1_000_000

class Device {
  constructor(cloud, { clockOffset = 0 } = {}) {
    this.cloud = cloud
    this.cloudView = {}
    this.local = {}
    this.cache = null
    this.clockOffset = clockOffset
  }
  deliver() {
    this.cloudView = { ...this.cloud.values }
  }
  // What the background script does on load
  sync() {
    now += 10
    const { state, writes } = syncStores({ local: this.local, cloud: this.cloudView }, this.cache, now + this.clockOffset)
    this.write(writes)
    this.cache = state
    return state
  }
  write(writes) {
    Object.assign(this.local, writes.local)
    Object.assign(this.cloudView, writes.cloud)
    this.cloud.write(writes.cloud)
  }
  // Opens the popup, lets `change` modify the list, and saves (Editor sends base + new list)
  edit(change) {
    const state = this.sync()
    const base = view(state)
    const next = change(structuredClone(base))
    now += 10
    this.cache = applyEdit(state, base, next, now + this.clockOffset)
    this.sync()
  }
  import(data) {
    now += 10
    this.cache = replaceAll(this.sync(), data, now + this.clockOffset)
    this.sync()
  }
  view() {
    return view(this.cache || emptyState())
  }
  names() {
    return this.view()
      .searches.map(s => s.name)
      .sort()
  }
}

// The old app version (v3): Data.swift picks local or iCloud by newest timestamp, the popup saves the whole list,
// and the old Editor rebuilds an edited search from its form fields only (dropping `id` and other fields).
class LegacyDevice {
  constructor(cloud) {
    this.cloud = cloud
    this.cloudView = {}
    this.local = null
  }
  deliver() {
    this.cloudView = { ...this.cloud.values }
  }
  load() {
    const icloud = this.cloudView[KEYS.v3]
    const ts = json => (json ? JSON.parse(json).timestamp || 0 : -1)
    if (icloud && ts(icloud) > ts(this.local)) this.local = icloud
    else if (this.local && ts(this.local) > ts(icloud) && ts(this.local) > 0) this.saveRaw(this.local)
    return this.local ? JSON.parse(this.local) : structuredClone(defaultSearches)
  }
  saveRaw(json) {
    this.local = json
    this.cloudView[KEYS.v3] = json
    this.cloud.write({ [KEYS.v3]: json })
  }
  save(searches, settings) {
    now += 10
    this.saveRaw(JSON.stringify({ version: 3, timestamp: now, searches, settings }))
  }
  add(search) {
    const data = this.load()
    this.save([...data.searches, search], data.settings)
  }
  editByName(name, changes) {
    const data = this.load()
    const searches = data.searches.map(s =>
      s.name == name
        ? {
            name: s.name,
            keywords: s.keywords,
            expansion: s.expansion,
            isDefault: s.isDefault || false,
            escape: s.escape !== false,
            spaceReplacer: s.spaceReplacer || '',
            allowedLocations: s.allowedLocations || 'default',
            ...changes
          }
        : s
    )
    this.save(searches, data.settings)
  }
  deleteByName(name) {
    const data = this.load()
    this.save(
      data.searches.filter(s => s.name != name),
      data.settings
    )
  }
  names() {
    return this.load()
      .searches.map(s => s.name)
      .sort()
  }
}

const search = (name, keywords = name.toLowerCase()) => ({
  name,
  keywords,
  expansion: `https://${keywords}.example/?q=@@@`
})
const add = s => data => ({ ...data, searches: [...data.searches, { ...s, id: crypto.randomUUID() }] })
const remove = name => data => ({ ...data, searches: data.searches.filter(s => s.name != name) })
const rename = (from, to) => data => ({
  ...data,
  searches: data.searches.map(s => (s.name == from ? { ...s, name: to } : s))
})

// Lets every device see the latest cloud data and sync, a few times over, so everything has propagated
function settle(...devices) {
  for (let i = 0; i < 3; i++) {
    for (const d of devices) {
      d.deliver()
      d.sync ? d.sync() : d.load()
    }
  }
}

const startWith = (cloud, searches) => {
  const seed = new Device(cloud)
  seed.import({ searches, settings: { allowedLocations: 'frontOnly' } })
  return seed
}

// --- Tests ------------------------------------------------------------------------------------------------

describe('between new devices', () => {
  test('adding on two devices with stale data keeps both', () => {
    const cloud = new Cloud()
    const a = new Device(cloud)
    const b = new Device(cloud)
    settle(startWith(cloud, [search('Base')]), a, b)

    // Neither device sees the other's change before saving
    a.edit(add(search('From A')))
    b.edit(add(search('From B')))
    expect(cloud.values[KEYS.v4]).not.toContain('From A') // B overwrote A in iCloud

    settle(a, b)
    expect(a.names()).toEqual(['Base', 'From A', 'From B'])
    expect(b.names()).toEqual(['Base', 'From A', 'From B'])
  })

  test('edit on one device and delete on another both survive', () => {
    const cloud = new Cloud()
    const a = new Device(cloud)
    const b = new Device(cloud)
    settle(startWith(cloud, [search('One'), search('Two')]), a, b)

    a.edit(rename('One', 'One edited'))
    b.edit(remove('Two'))
    settle(a, b)
    expect(a.names()).toEqual(['One edited'])
    expect(b.names()).toEqual(['One edited'])
  })

  test('the newest edit of the same search wins', () => {
    const cloud = new Cloud()
    const a = new Device(cloud)
    const b = new Device(cloud)
    settle(startWith(cloud, [search('One')]), a, b)

    a.edit(rename('One', 'From A'))
    b.edit(rename('One', 'From B'))
    settle(a, b)
    expect(a.names()).toEqual(['From B'])
    expect(b.names()).toEqual(['From B'])
  })

  test('deleted searches stay deleted', () => {
    const cloud = new Cloud()
    const a = new Device(cloud)
    const b = new Device(cloud)
    settle(startWith(cloud, [search('One'), search('Two')]), a, b)

    a.edit(remove('One'))
    // B still has the old data with 'One' in it, and saves something else
    b.edit(add(search('Three')))
    settle(a, b)
    expect(a.names()).toEqual(['Three', 'Two'])
    expect(b.names()).toEqual(['Three', 'Two'])
  })

  test('a device with its clock behind does not lose its edits', () => {
    const cloud = new Cloud()
    const a = new Device(cloud)
    const slow = new Device(cloud, { clockOffset: -3_600_000 })
    settle(startWith(cloud, [search('One')]), a, slow)

    a.edit(rename('One', 'From A'))
    settle(a, slow)
    slow.edit(rename('From A', 'From slow'))
    settle(a, slow)
    expect(a.names()).toEqual(['From slow'])
  })

  test('settings merge per key', () => {
    const cloud = new Cloud()
    const a = new Device(cloud)
    const b = new Device(cloud)
    settle(startWith(cloud, [search('One')]), a, b)

    a.edit(data => ({ ...data, settings: { ...data.settings, allowedLocations: 'frontAndEnd' } }))
    b.edit(add(search('Two')))
    settle(a, b)
    expect(b.view().settings.allowedLocations).toBe('frontAndEnd')
    expect(a.names()).toEqual(['One', 'Two'])
  })

  test('two devices picking different defaults end up with one', () => {
    const cloud = new Cloud()
    const a = new Device(cloud)
    const b = new Device(cloud)
    settle(startWith(cloud, [search('One'), search('Two')]), a, b)

    const makeDefault = name => data => ({
      ...data,
      searches: data.searches.map(s => ({ ...s, isDefault: s.name == name }))
    })
    a.edit(makeDefault('One'))
    b.edit(makeDefault('Two'))
    settle(a, b)
    const defaults = d => d.view().searches.filter(s => s.isDefault)
    expect(defaults(a)).toHaveLength(1)
    expect(defaults(a)).toEqual(defaults(b))
  })

  test('a fresh device shows defaults but does not push them to others', () => {
    const cloud = new Cloud()
    const a = new Device(cloud)
    settle(startWith(cloud, [search('Mine')]), a)

    const fresh = new Device(cloud)
    fresh.sync() // has not received anything from iCloud yet
    expect(fresh.names()).toEqual(defaultSearches.searches.map(s => s.name).sort())
    settle(a, fresh)
    expect(a.names()).toEqual(['Mine'])
    expect(fresh.names()).toEqual(['Mine'])
  })

  test('random edits on several devices converge without losing additions', () => {
    let seed = 42
    const random = n => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % n
    }
    const cloud = new Cloud()
    const devices = [new Device(cloud), new Device(cloud), new Device(cloud, { clockOffset: -50 })]
    settle(startWith(cloud, [search('Base')]), ...devices)

    const added = new Set(['Base'])
    const deleted = new Set()
    for (let i = 0; i < 200; i++) {
      const d = devices[random(devices.length)]
      if (random(3) == 0) d.deliver()
      const op = random(3)
      if (op == 0) {
        const name = `S${i}`
        added.add(name)
        d.edit(add(search(name, `k${i}`)))
      } else if (op == 1) {
        const names = d.names().filter(n => n != 'Base')
        if (names.length) {
          const name = names[random(names.length)]
          deleted.add(name)
          d.edit(remove(name))
        }
      } else {
        d.sync()
      }
    }
    settle(...devices)

    const expected = [...added].filter(n => !deleted.has(n)).sort()
    for (const d of devices) {
      expect(d.names()).toEqual(expected)
    }
  })
})

describe('with old app versions', () => {
  test('a new device picks up an old version add, edit and delete', () => {
    const cloud = new Cloud()
    const n = new Device(cloud)
    const old = new LegacyDevice(cloud)
    settle(startWith(cloud, [search('One'), search('Two'), search('Three')]), n, old)
    expect(old.names()).toEqual(['One', 'Three', 'Two'])

    old.add(search('Four'))
    old.editByName('One', { name: 'One edited' })
    old.deleteByName('Two')
    settle(n, old)
    expect(n.names()).toEqual(['Four', 'One edited', 'Three'])
    expect(old.names()).toEqual(['Four', 'One edited', 'Three'])
  })

  test('additions on an old and a new device at the same time both survive', () => {
    const cloud = new Cloud()
    const n = new Device(cloud)
    const old = new LegacyDevice(cloud)
    settle(startWith(cloud, [search('Base')]), n, old)

    n.edit(add(search('From new')))
    old.add(search('From old')) // has not seen 'From new'
    settle(n, old)
    expect(n.names()).toEqual(['Base', 'From new', 'From old'])
    expect(old.names()).toEqual(['Base', 'From new', 'From old'])
  })

  test('a stale old device does not undo edits from a new device', () => {
    const cloud = new Cloud()
    const n = new Device(cloud)
    const old = new LegacyDevice(cloud)
    settle(startWith(cloud, [search('One'), search('Two')]), n, old)

    n.edit(rename('One', 'One edited'))
    old.add(search('Three')) // still has the old 'One'
    settle(n, old)
    expect(n.names()).toEqual(['One edited', 'Three', 'Two'])
  })

  test('deleted on a new device stays deleted even if a stale old device saves', () => {
    const cloud = new Cloud()
    const n = new Device(cloud)
    const old = new LegacyDevice(cloud)
    settle(startWith(cloud, [search('One'), search('Two')]), n, old)

    n.edit(remove('One'))
    old.add(search('Three'))
    settle(n, old)
    expect(n.names()).toEqual(['Three', 'Two'])
    expect(old.names()).toEqual(['Three', 'Two'])
  })

  test('two new devices and an old one converge', () => {
    const cloud = new Cloud()
    const a = new Device(cloud)
    const b = new Device(cloud)
    const old = new LegacyDevice(cloud)
    settle(startWith(cloud, [search('Base')]), a, b, old)

    a.edit(add(search('A')))
    b.edit(add(search('B')))
    old.add(search('Old'))
    settle(a, b, old)
    for (const d of [a, b, old]) {
      expect(d.names()).toEqual(['A', 'B', 'Base', 'Old'])
    }
  })
})

describe('upgrading', () => {
  const v3 = (searches, timestamp = 500_000) => JSON.stringify({ version: 3, timestamp, settings: { allowedLocations: 'frontAndEnd' }, searches })
  const legacyData = [
    { name: 'Plain', keywords: 'p', expansion: 'https://p/?q=@@@' },
    { name: 'Custom', keywords: 'c', expansion: 'https://c/@@@', spaceReplacer: '_', escape: false }
  ]

  const fixtures = {
    'v1 in local storage': {
      local: {
        [KEYS.v1]: JSON.stringify({
          timestamp: 400_000,
          data: [
            { name: 'Plain', keyword: 'p', expansion: 'https://p/?q=@@@' },
            { name: 'Custom', keyword: 'c', expansion: 'https://c/{{%_%}}' }
          ]
        })
      }
    },
    'v1 without timestamp': {
      local: {
        [KEYS.v1]: JSON.stringify({
          data: [
            { name: 'Plain', keyword: 'p', expansion: 'https://p/?q=@@@' },
            { name: 'Custom', keyword: 'c', expansion: 'https://c/{{%_%}}' }
          ]
        })
      }
    },
    'v2 in local storage': { local: { [KEYS.v3]: JSON.stringify({ version: 2, timestamp: 450_000, searches: legacyData }) } },
    'v3 in local storage': { local: { [KEYS.v3]: v3(legacyData) } },
    'v3 in iCloud only': { cloud: { [KEYS.v3]: v3(legacyData) } },
    'v3 newer in iCloud than locally': {
      local: { [KEYS.v3]: v3([legacyData[0]], 400_000) },
      cloud: { [KEYS.v3]: v3(legacyData, 500_000) }
    },
    'v3 with ids (written by step 2)': {
      local: { [KEYS.v3]: v3(legacyData.map((s, i) => ({ ...s, id: `id${i}` }))) }
    }
  }

  for (const [name, stores] of Object.entries(fixtures)) {
    test(`from ${name}`, () => {
      const { state, writes } = syncStores({ local: {}, cloud: {}, ...stores }, null, 1_000_000)
      const v = view(state)
      expect(v.searches.map(s => s.name).sort()).toEqual(['Custom', 'Plain'])
      const custom = v.searches.find(s => s.name == 'Custom')
      expect(custom.spaceReplacer).toBe('_')
      expect(custom.escape).toBe(false)
      expect(v.searches.every(s => s.id)).toBe(true)
      // The upgraded data is stored in the new format, and old versions see the same searches in iCloud
      expect(writes.local[KEYS.v4]).toBeTruthy()
      expect(writes.cloud[KEYS.v4]).toBeTruthy()
      const legacyCopy = JSON.parse(writes.cloud[KEYS.v3] ?? stores.cloud[KEYS.v3])
      expect(legacyCopy.searches.map(s => s.name).sort()).toEqual(['Custom', 'Plain'])
    })
  }

  test('v3 settings are kept', () => {
    const { state } = syncStores({ local: { [KEYS.v3]: v3(legacyData) }, cloud: {} }, null, 1_000_000)
    expect(view(state).settings.allowedLocations).toBe('frontAndEnd')
  })

  test('the background cache from step 2 (v3 without ids) is ignored in favour of the stores', () => {
    const { state } = syncStores({ local: { [KEYS.v3]: v3(legacyData) }, cloud: {} }, null, 1_000_000)
    expect(merge(state, null)).toBe(state)
  })

  test('nothing stored gives the defaults and writes nothing', () => {
    const { state, writes } = syncStores({ local: {}, cloud: {} }, null, 1_000_000)
    expect(view(state).searches).toHaveLength(defaultSearches.searches.length)
    expect(writes).toEqual({ local: {}, cloud: {} })
  })

  test('an old version that only ever had the defaults (timestamp 0) is not treated as data', () => {
    const { state, writes } = syncStores({ local: { [KEYS.v3]: JSON.stringify(defaultSearches) }, cloud: {} }, null, 1)
    expect(writes).toEqual({ local: {}, cloud: {} })
    expect(view(state).searches).toHaveLength(defaultSearches.searches.length)
  })

  test('two devices upgrading from the same v3 data get the same ids', () => {
    const stores = { local: { [KEYS.v3]: v3(legacyData) }, cloud: { [KEYS.v3]: v3(legacyData) } }
    const a = syncStores(stores, null, 1_000_000).state
    const b = syncStores(stores, null, 2_000_000).state
    expect(a.searches.map(s => s.id)).toEqual(b.searches.map(s => s.id))
  })

  test('a device upgrading after another one has upgraded does not duplicate or lose anything', () => {
    const cloud = new Cloud()
    const first = new Device(cloud)
    const second = new Device(cloud)
    // Both had the same data in the old version
    cloud.write({ [KEYS.v3]: v3(legacyData) })
    first.local[KEYS.v3] = v3(legacyData)
    second.local[KEYS.v3] = v3(legacyData)

    first.deliver()
    first.edit(add(search('New')))
    settle(first, second)
    expect(second.names()).toEqual(['Custom', 'New', 'Plain'])
  })
})

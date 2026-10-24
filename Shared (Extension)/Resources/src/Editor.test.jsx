// @vitest-environment jsdom
import { test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import Editor from './Editor.jsx'

afterEach(cleanup)

const searches = [
  { name: 'YouTube', keywords: 'y', expansion: 'https://youtube.com/?q=@@@' },
  { name: 'Amazon', keywords: 'a', expansion: 'https://amazon.com/?k=@@@' },
  { name: 'DuckDuckGo', keywords: 'd', expansion: 'https://duckduckgo.com/?q=@@@', isDefault: true }
]

const setup = (data = { version: 3, searches, settings: { allowedLocations: 'frontOnly' } }) => {
  const save = vi.fn()
  const { container } = render(
    <Editor data={data} save={save} importData={vi.fn()} reload={vi.fn()} resetData={vi.fn()} os="mac" />
  )
  return { save, container, lastSaved: () => save.mock.calls.at(-1)[0] }
}

const listItems = container => [...container.querySelectorAll('.screen:first-child > ul:first-of-type > li')]
// The outgoing editor stays in the DOM while it animates out, so only look at the incoming one
const editor = container => container.querySelector('.animate-in-left .editor')
const input = (container, name) => editor(container).querySelector(`[name="${name}"]`)
const clickButton = (container, text) =>
  fireEvent.click(within(editor(container)).getAllByRole('button', { name: text }).at(-1))

test('opens on the list, also for data without ids', () => {
  const { container } = setup()
  expect(editor(container)).toBeNull()
  expect(listItems(container).map(li => li.textContent)).toEqual([
    expect.stringContaining('Amazon'),
    expect.stringContaining('DuckDuckGo'),
    expect.stringContaining('YouTube')
  ])
})

test('opens the clicked search, also after sorting', () => {
  const { container } = setup()
  fireEvent.click(listItems(container)[2])
  expect(input(container, 'name').value).toBe('YouTube')
})

test('editing a search saves it with its id', () => {
  const { container, lastSaved } = setup()
  fireEvent.click(listItems(container)[0])
  fireEvent.change(input(container, 'name'), { target: { value: 'Zamazon' } })
  clickButton(container, 'Save')

  const saved = lastSaved().searches.find(s => s.keywords == 'a')
  expect(saved.name).toBe('Zamazon')
  expect(saved.id).toBeTruthy()
  expect(editor(container)).toBeNull()
  // Renamed search moves to the end of the sorted list
  expect(listItems(container).at(-1).textContent).toContain('Zamazon')
})

test('cancelling a new search leaves nothing behind', () => {
  const { container, save } = setup()
  fireEvent.click(screen.getByRole('button', { name: '+ Add new' }))
  expect(input(container, 'name').value).toBe('')
  clickButton(container, 'Cancel')

  expect(listItems(container)).toHaveLength(3)
  for (const [data] of save.mock.calls) {
    expect(data.searches).toHaveLength(3)
  }
})

test('adding a new search', () => {
  const { container, lastSaved } = setup()
  fireEvent.click(screen.getByRole('button', { name: '+ Add new' }))
  fireEvent.change(input(container, 'name'), { target: { value: 'Wikipedia' } })
  fireEvent.change(input(container, 'keywords'), { target: { value: 'w' } })
  fireEvent.change(input(container, 'expansion'), { target: { value: 'https://wikipedia.org/@@@' } })
  clickButton(container, 'Save')

  const saved = lastSaved().searches
  expect(saved).toHaveLength(4)
  const added = saved.find(s => s.keywords == 'w')
  expect(added.id).toBeTruthy()
  expect(added.new).toBeUndefined()
  expect(listItems(container).map(li => li.textContent)).toContainEqual(expect.stringContaining('Wikipedia'))
})

test('deleting requires confirmation', () => {
  const { container, save, lastSaved } = setup()
  fireEvent.click(listItems(container)[0])
  clickButton(container, 'Delete')
  expect(save).not.toHaveBeenCalled()
  clickButton(container, 'Confirm?')

  expect(lastSaved().searches.map(s => s.name)).toEqual(['YouTube', 'DuckDuckGo'])
  expect(listItems(container)).toHaveLength(2)
})

test('only one search can be the default', () => {
  const { container, lastSaved } = setup()
  fireEvent.click(listItems(container)[0])
  fireEvent.click(input(container, 'isDefault'))
  clickButton(container, 'Save')

  const defaults = lastSaved().searches.filter(s => s.isDefault)
  expect(defaults.map(s => s.name)).toEqual(['Amazon'])
})

test('changed settings survive saving a search', () => {
  const { container, lastSaved } = setup()
  fireEvent.change(container.querySelector('select[name="allowedLocations"]'), { target: { value: 'frontAndEnd' } })
  expect(lastSaved().settings.allowedLocations).toBe('frontAndEnd')

  fireEvent.click(listItems(container)[0])
  clickButton(container, 'Save')
  expect(lastSaved().settings.allowedLocations).toBe('frontAndEnd')
})

test('each save sends what it was based on', () => {
  const { container, save } = setup()
  fireEvent.click(listItems(container)[0])
  fireEvent.change(input(container, 'name'), { target: { value: 'Zamazon' } })
  clickButton(container, 'Save')
  fireEvent.click(listItems(container)[0])
  clickButton(container, 'Delete')
  clickButton(container, 'Confirm?')

  const [first, second] = save.mock.calls.map(([data]) => data)
  expect(first.base.searches.map(s => s.name)).toEqual(['YouTube', 'Amazon', 'DuckDuckGo'])
  expect(second.base).toEqual({ searches: first.searches, settings: first.settings })
  expect(second.searches).toHaveLength(2)
})

test('choosing the search engine saves the setting', () => {
  const { container, lastSaved } = setup()
  const select = container.querySelector('select[name="searchEngine"]')
  expect([...select.options].map(o => o.value)).toEqual([
    'any',
    'google',
    'bing',
    'duckduckgo',
    'ecosia',
    'yahoo',
    'baidu',
    'sogou',
    'so'
  ])
  fireEvent.change(select, { target: { value: 'duckduckgo' } })
  expect(lastSaved().settings).toEqual({ allowedLocations: 'frontOnly', searchEngine: 'duckduckgo' })
})

const keywordError = container => editor(container).querySelector('.error')?.textContent
const saveButton = container => within(editor(container)).getAllByRole('button', { name: 'Save' }).at(-1)

test('keywords used by another search are rejected', () => {
  const { container, save } = setup()
  fireEvent.click(screen.getByRole('button', { name: '+ Add new' }))
  fireEvent.change(input(container, 'keywords'), { target: { value: 'x, Y' } })
  fireEvent.change(input(container, 'expansion'), { target: { value: 'https://example.com/@@@' } })

  expect(keywordError(container)).toBe('“y” is already used by YouTube')
  expect(saveButton(container).disabled).toBe(true)
  clickButton(container, 'Save')
  expect(save).not.toHaveBeenCalled()
})

test('the same keyword twice is rejected', () => {
  const { container } = setup()
  fireEvent.click(listItems(container)[0])
  fireEvent.change(input(container, 'keywords'), { target: { value: 'a, b, A' } })
  expect(keywordError(container)).toBe('“a” is listed twice')
  expect(saveButton(container).disabled).toBe(true)
})

test('a search can keep its own keywords', () => {
  const { container, lastSaved } = setup()
  fireEvent.click(listItems(container)[2])
  fireEvent.change(input(container, 'keywords'), { target: { value: 'y, yt' } })
  expect(keywordError(container)).toBeUndefined()
  clickButton(container, 'Save')
  expect(lastSaved().searches.find(s => s.name == 'YouTube').keywords).toBe('y, yt')
})

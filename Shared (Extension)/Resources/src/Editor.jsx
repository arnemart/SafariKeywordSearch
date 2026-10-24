import React, { useState, useEffect, useRef } from 'react'
import { ensureIds } from './data.js'

const keywordRegex = /\S+/
const urlRegex = /^https?:\/\/.+/

const emptySearch = () => ({ id: crypto.randomUUID(), name: '', keywords: '', expansion: '', new: true })

const sortKey = s => (s.name || s.keywords).toLowerCase()
const bySortKey = (a, b) => (sortKey(a) < sortKey(b) ? -1 : 1)

const Screen = React.forwardRef(({ animate, children }, ref) => (
  <div className={`screen ${animate}`} ref={ref}>
    {children}
  </div>
))

const Editor = props => {
  const [searches, setSearches] = useState(() => ensureIds(props.data.searches))
  const [settings, setSettings] = useState(props.data.settings)
  const [selectedId, setSelectedId] = useState(null)
  const [prevSelectedId, setPrevSelectedId] = useState(null)
  const listRef = useRef(null)
  const [recentlyDeleted, setRecentlyDeleted] = useState(null)

  // What the last save was based on, so the background can tell what the user actually changed
  const base = useRef(null)
  if (!base.current) base.current = { searches, settings }

  // Unsaved new searches are never persisted
  const persist = (newSearches, newSettings) => {
    const data = { searches: newSearches.filter(s => !s.new), settings: newSettings }
    props.save({ ...data, base: base.current })
    base.current = data
  }

  const select = id => {
    setPrevSelectedId(selectedId)
    setSelectedId(id)
  }

  const saveOne = id => vals => {
    if (!keywordRegex.test(vals.keywords) || !urlRegex.test(vals.expansion)) {
      deleteOne(id)()
      return
    }
    const newSearches = searches.map(s => {
      if (s.id === id) {
        const { new: _, ...rest } = { ...s, ...vals }
        return rest
      }
      if (vals.isDefault && s.isDefault) {
        const { isDefault: _, ...rest } = s
        return rest
      }
      return s
    })
    setSearches(newSearches)
    select(null)
    persist(newSearches, settings)
  }

  const saveSettings = changes => {
    const newSettings = { ...settings, ...changes }
    setSettings(newSettings)
    persist(searches, newSettings)
  }

  const deleteOne = id => () => {
    setRecentlyDeleted(searches.find(s => s.id === id))
    const newSearches = searches.filter(s => s.id !== id)
    setSearches(newSearches)
    select(null)
    persist(newSearches, settings)
  }

  const expandMe = id => () => {
    setRecentlyDeleted(null)
    select(id)
  }

  const createNew = () => {
    const search = emptySearch()
    setSearches([search, ...searches])
    setRecentlyDeleted(null)
    select(search.id)
  }

  const exportData = () => {
    const dataToExport = {
      searches: searches.filter(s => !s.new),
      settings: settings,
      version: props.data.version
    }
    navigator.clipboard.writeText(JSON.stringify(dataToExport))
  }

  const selected = selectedId !== null && searches.find(s => s.id === selectedId)
  const prevSelected = recentlyDeleted || (prevSelectedId !== null && searches.find(s => s.id === prevSelectedId))

  const listAnimationName = selected ? 'animate-out-right' : prevSelectedId ? 'animate-in-right' : 'animate-none'

  return (
    <div className={`wrap wrap--${props.os} ${selected ? 'has-selected' : ''}`}>
      <div className="contents">
        <Screen key="list" animate={listAnimationName} ref={listRef}>
          <List searches={searches} expandMe={expandMe} createNew={createNew} os={props.os} />
          <Settings
            settings={settings}
            save={saveSettings}
            exportData={exportData}
            importData={props.importData}
            reload={props.reload}
            resetData={props.resetData}
          />
        </Screen>
        {selected && (
          <Screen key={`editor-${selected.id}`} animate="animate-in-left">
            <EditIt
              search={selected}
              save={saveOne(selected.id)}
              deleteOne={deleteOne(selected.id)}
              collapse={expandMe(null)}
            />
          </Screen>
        )}
        {!selected && prevSelected && (
          <Screen key={`editor-${prevSelected.id}`} animate="animate-out-left">
            <EditIt search={prevSelected} save={() => {}} deleteOne={() => {}} collapse={() => {}} />
          </Screen>
        )}
      </div>
    </div>
  )
}

export default Editor

const List = ({ searches, expandMe, createNew, os }) => (
  <>
    {os == 'mac' && <header>Keyword search settings</header>}
    <button type="button" onClick={createNew} className="primary">
      + Add new
    </button>
    <ul>
      {searches
        .filter(s => !s.new)
        .sort(bySortKey)
        .map(s => (
          <JustOne key={s.id} search={s} expand={expandMe(s.id)} />
        ))}
    </ul>
  </>
)

const Settings = ({ settings, save, exportData, importData, reload, resetData }) => {
  const importText = useRef(null)
  const importButtonRef = useRef(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(false)
  const [resetting, setResetting] = useState(false)

  function doImport() {
    setImportError(false)
    setResetting(false)
    if (importing) {
      importData(importText.current.value).then(result => {
        if (result.success) {
          reload()
          window.scrollTo(0, 0)
        } else {
          setImporting(false)
          setImportError(true)
        }
      })
    } else {
      setImporting(true)
      setTimeout(() => {
        try {
          importButtonRef.current.scrollIntoView()
        } catch (e) {}
      }, 300)
    }
  }

  function doReset() {
    setImporting(false)
    if (resetting) {
      setResetting(false)
      resetData().then(() => {
        reload()
        window.scrollTo(0, 0)
      })
    } else {
      setResetting(true)
    }
  }

  return (
    <>
      <header>Other settings</header>
      <ul>
        <li className="list__item no-caret">
          <FormFieldWithHelpTextEtc
            name="allowedLocations"
            label="Allowed keyword locations"
            helpText="Do you want to be able to type the keyword after the search phrase? This setting can be overridden for each keyword."
            type="select"
            options={[
              { name: 'Front only', value: 'frontOnly' },
              { name: 'Front and end', value: 'frontAndEnd' }
            ]}
            vals={settings}
            update={(key, val) => save({ [key]: val })}
            errors={{}}
          />
        </li>
      </ul>

      <header>Export/Import</header>
      <ul>
        <li className="list__item no-caret">
          <button type="button" onClick={exportData}>
            Export data to clipboard
          </button>
        </li>
        <li className="list__item no-caret">
          <textarea placeholder="Paste your data here and click “Import”" ref={importText}></textarea>
          {importError && (
            <div className="error">
              <small>There was an error importing the data. Is the syntax correct?</small>
            </div>
          )}
          <button type="button" onClick={doImport} className={importing ? 'danger' : ''}>
            {importing ? 'Confirm import – this will overwrite your existing data' : 'Import'}
          </button>
        </li>
        <li className="list__item no-caret">
          <button type="button" onClick={doReset} className={resetting ? 'danger' : ''} ref={importButtonRef}>
            {resetting ? 'Confirm restore – this will overwrite your existing data' : 'Restore default searches'}
          </button>
        </li>
      </ul>
    </>
  )
}

const JustOne = ({ search, expand }) => {
  return (
    <li className="list__item" onClick={expand}>
      <JustTheHeader search={search} />
      <small className="tiny oneliner">{search.expansion}</small>
    </li>
  )
}

const EditIt = ({ search, collapse, save, deleteOne }) => {
  const [vals, setVals] = useState({
    name: search.name,
    keywords: search.keywords,
    expansion: search.expansion,
    isDefault: search.isDefault || false,
    escape: search.escape !== false,
    spaceReplacer: search.spaceReplacer || '',
    allowedLocations: search.allowedLocations || 'default'
  })
  const [changed, setChanged] = useState(false)
  const [touched, setTouched] = useState({})
  const [showAllErrors, setShowAllErrors] = useState(false)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const errors = {}

  if (!keywordRegex.test(vals.keywords)) {
    errors.keywords = 'Please provide a keyword'
  }
  if (!urlRegex.test(vals.expansion)) {
    errors.expansion = 'Needs to be a valid URL'
  }

  const update = (key, val) => {
    setVals({
      ...vals,
      [key]: val
    })
    setTouched({
      ...touched,
      [key]: true
    })
    setChanged(true)
  }

  const fieldsValid = Object.values(errors).every(v => v == '')
  const valid = search.new ? changed && fieldsValid : fieldsValid

  const cancel = search.new ? deleteOne : collapse

  const handleSubmit = e => {
    e.preventDefault()
    if (valid) {
      save(vals)
    } else {
      setShowAllErrors(true)
    }
  }

  const confirmDelete = () => {
    if (deleting) {
      deleteOne()
    } else {
      setDeleting(true)
    }
  }

  useEffect(() => {
    let cancelDeleteTimeout
    if (deleting) {
      cancelDeleteTimeout = setTimeout(() => setDeleting(false), 5000)
    }
    return () => clearTimeout(cancelDeleteTimeout)
  }, [deleting])

  return (
    <div className="editor">
      <header>Edit</header>
      <button className="go-back" onClick={cancel}>
        ❮
      </button>
      <form onSubmit={handleSubmit}>
        <button type="submit" className="primary top-right" disabled={!valid}>
          Save
        </button>
        <FormFieldWithHelpTextEtc
          name="name"
          label="Name"
          helpText="Name is optional but nice to have."
          errors={errors}
          showError={touched.name || showAllErrors}
          vals={vals}
          update={update}
        />
        <FormFieldWithHelpTextEtc
          name="keywords"
          label="Keywords"
          helpText="The keywords should not be anything fancy, preferably just alphanumeric. If you want multiple keywords for the same thing, separate them with comma."
          more={{ autocorrect: 'off', autocapitalize: 'none' }}
          vals={vals}
          update={update}
          errors={errors}
          showError={touched.keywords || showAllErrors}
        />
        <FormFieldWithHelpTextEtc
          name="expansion"
          label="Expansion"
          helpText="Insert @@@ in the URL where you want the search terms to appear."
          more={{
            inputmode: 'url',
            autocorrect: 'off',
            autocapitalize: 'none',
            spellcheck: false,
            placeholder: 'https://example.com?search=@@@'
          }}
          vals={vals}
          update={update}
          errors={errors}
          showError={touched.expansion || showAllErrors}
        />
        <FormFieldWithHelpTextEtc
          name="isDefault"
          label="Make default"
          helpText="Do you want to make this the default search engine when you search without a keyword?"
          type="checkbox"
          vals={vals}
          update={update}
          errors={errors}
        />

        <div>
          <div className="expandor" onClick={() => setAdvancedExpanded(!advancedExpanded)}>
            <small>
              <span className="triangle">{advancedExpanded ? '▾' : '▸'}</span> Advanced settings
            </small>
          </div>
          {advancedExpanded && (
            <div className="advanced-settings">
              <FormFieldWithHelpTextEtc
                name="spaceReplacer"
                label="Space replacement character(s)"
                helpText="What should spaces in the search query be replaced with? Leave blank for the default which is +."
                vals={vals}
                update={update}
                errors={errors}
              />
              <FormFieldWithHelpTextEtc
                name="escape"
                label="URL escape"
                helpText="Do you want to URL escape the search phrase?"
                type="checkbox"
                vals={vals}
                update={update}
                errors={errors}
              />
              <FormFieldWithHelpTextEtc
                name="allowedLocations"
                label="Allowed keyword location"
                helpText="Do you want to be able to type the keyword after the search phrase?"
                type="select"
                options={[
                  { name: 'Use default setting', value: 'default' },
                  { name: 'Front and end', value: 'frontAndEnd' },
                  { name: 'Front only', value: 'frontOnly' }
                ]}
                vals={vals}
                update={update}
                errors={errors}
              />
            </div>
          )}
        </div>

        <div className="form__buttons">
          <button type="button" onClick={cancel}>
            Cancel
          </button>
          <button type="button" onClick={confirmDelete} className={deleting ? 'danger' : ''}>
            {deleting ? 'Confirm?' : 'Delete'}
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

const FormFieldWithHelpTextEtc = ({
  type = 'text',
  className = '',
  vals,
  update,
  name,
  label,
  helpText,
  errors,
  options,
  more = {},
  showError = true
}) => (
  <label className={className}>
    {(type == 'text' || type == 'url') && (
      <>
        {label}
        <input
          type={type}
          name={name}
          defaultValue={vals[name]}
          onChange={e => update(name, e.target.value)}
          {...more}
        />
      </>
    )}
    {type == 'checkbox' && (
      <div>
        <input type={type} name={name} defaultChecked={vals[name]} onChange={e => update(name, e.target.checked)} />{' '}
        {label}
      </div>
    )}
    {type == 'select' && (
      <>
        {label}
        <select name={name} defaultValue={vals[name]} onChange={e => update(name, e.target.value)}>
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.name}</option>
          ))}
        </select>
      </>
    )}

    {showError && errors[name] && (
      <div className="error">
        <small>{errors[name]}</small>
      </div>
    )}
    {helpText && (
      <div>
        <small className="tiny">{helpText}</small>
      </div>
    )}
  </label>
)

const JustTheHeader = ({ search }) => (
  <>
    {search.name ? (
      <>
        {search.isDefault && <strong>Default: </strong>}
        {search.name} - <small>{search.keywords}</small>
      </>
    ) : (
      <>
        {search.isDefault && <strong>Default: </strong>} {search.keywords}
      </>
    )}
  </>
)

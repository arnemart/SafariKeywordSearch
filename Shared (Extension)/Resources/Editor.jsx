import React, { useState, useEffect, useRef } from 'react'

const keywordRegex = /\S+/
const urlRegex = /^https?:\/\/.+/

const emptySearch = () => ({ name: '', keywords: '', expansion: '', new: true })

const Screen = React.forwardRef(({ animate, children }, ref) => (
  <div className={`screen ${animate}`} ref={ref}>
    {children}
  </div>
))

const Editor = props => {
  const [searches, setSearches] = useState(props.data.searches)
  const [selected, setSelected] = useState(-1)
  const [prevSelected, setPrevSelected] = useState(-1)
  const listRef = useRef(null)
  const [recentlyDeleted, setRecentlyDeleted] = useState(emptySearch())

  const saveOne = i => s => {
    if (!keywordRegex.test(s.keywords) || !urlRegex.test(s.expansion)) {
      deleteOne(i)()
    } else {
      searches[i] = s
      if (searches[i].isDefault) {
        for (let j = 0; j < searches.length; j++) {
          if (j != i) {
            delete searches[j].isDefault
          }
        }
      }
      setSearches(searches)
      setPrevSelected(selected)
      setSelected(-1)
      props.save({ searches: searches, settings: props.data.settings })
    }
  }

  const saveSettings = settings => {
    props.save({ searches: searches, settings: settings })
  }

  const deleteOne = i => () => {
    const deleted = searches.splice(i, 1)
    setRecentlyDeleted(deleted)
    setSearches(searches)
    setPrevSelected(selected)
    setSelected(-1)
    props.save({ searches: searches, settings: props.data.settings })
  }

  const expandMe = i => () => {
    setRecentlyDeleted(null)
    setPrevSelected(selected)
    setSelected(i)
  }

  const createNew = () => {
    setSearches([emptySearch(), ...searches])
    setSelected(0)
  }

  const exportData = () => {
    const dataToExport = {
      searches: props.data.searches,
      settings: props.data.settings,
      version: props.data.version
    }
    navigator.clipboard.writeText(JSON.stringify(dataToExport))
  }

  const listAnimationName =
    selected > -1 ? 'animate-out-right' : prevSelected > -1 ? 'animate-in-right' : 'animate-none'

  return (
    <div className={`wrap wrap--${props.os} ${selected > -1 && 'has-selected'}`}>
      <div className="contents">
        <Screen key="list" animate={listAnimationName} ref={listRef}>
          <List searches={searches} expandMe={expandMe} createNew={createNew} os={props.os} />
          <Settings
            settings={props.data.settings}
            save={saveSettings}
            exportData={exportData}
            importData={props.importData}
            reload={props.reload}
            resetData={props.resetData}
          />
        </Screen>
        {selected > -1 && (
          <Screen key={`editor-{selected}`} animate="animate-in-left">
            <EditIt
              search={searches[selected]}
              save={saveOne(selected)}
              deleteOne={deleteOne(selected)}
              collapse={expandMe(-1)}
            />
          </Screen>
        )}
        {selected == -1 && prevSelected > -1 && (
          <Screen key={`editor-{prevSelected}`} animate="animate-out-left">
            <EditIt
              search={recentlyDeleted || searches[prevSelected]}
              save={() => {}}
              deleteOne={() => {}}
              collapse={() => {}}
            />
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
        .sort((a, b) => ((a.name || a.keywords).toLowerCase() < (b.name || b.keywords).toLowerCase() ? -1 : 1))
        .map((s, i) => (
          <JustOne key={i} search={s} expand={expandMe(i)} />
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
      resetData()
      reload()
      window.scrollTo(0, 0)
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
      <small class="tiny oneliner">{search.expansion}</small>
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

  const handleSubmit = () => {
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
            <option value={option.value}>{option.name}</option>
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
        <small class="tiny">{helpText}</small>
      </div>
    )}
  </label>
)

const JustTheHeader = ({ search }) => (
  <>
    {search.name ? (
      <>
        {search.name} - <small>{search.keywords}</small>
      </>
    ) : (
      search.keywords
    )}
  </>
)

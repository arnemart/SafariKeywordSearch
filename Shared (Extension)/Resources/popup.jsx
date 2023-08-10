import React from 'react'
import ReactDOM from 'react-dom'
import Editor from './Editor'

const main = document.querySelector('main')

let tries = 0
let key = Math.random()

const osPromise = browser.runtime.getPlatformInfo()
const loadData = () => {
  const dataPromise = browser.runtime.sendMessage({
    message: 'popupWantsData'
  })

  Promise.all([dataPromise, osPromise])
    .then(([dataResponse, osResponse]) => {
      if (dataResponse && dataResponse.data && dataResponse.data.version) {
        const os = osResponse.os == 'ios' && !navigator.appVersion.match(/iPhone/i) ? 'ipad' : osResponse.os
        letsGo(dataResponse.data, os)
      } else if (tries < 5) {
        tries++
        setTimeout(loadData, 100)
      }
    })
    .catch(e => {
      console.log('Error loading data', e)
    })
}

loadData()

function saveData(data) {
  browser.runtime.sendMessage({
    message: 'popupWantsToSave',
    data: data
  })
}

function importData(data) {
  return browser.runtime.sendMessage({
    message: 'popupWantsToImport',
    data: data
  })
}

function reload() {
  key = Math.random()
  loadData()
}

function resetData() {
  browser.runtime.sendMessage({
    message: 'popupWantsToReset'
  })
}

function letsGo(data, os) {
  ReactDOM.render(
    <Editor
      key={key}
      data={data}
      save={saveData}
      importData={importData}
      reload={reload}
      resetData={resetData}
      os={os}
    />,
    main
  )
}

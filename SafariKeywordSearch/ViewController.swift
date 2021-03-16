//
//  ViewController.swift
//  SafariKeywordSearch
//
//  Created by Arne Martin Aurlien on 06/03/2021.
//

import Cocoa
import SafariServices.SFSafariApplication
import SafariServices.SFSafariExtensionManager

class ViewController: NSViewController, NSTextFieldDelegate {

    @IBOutlet var appNameLabel: NSTextField!
    @IBOutlet var openSafariPrefsButton: NSButton!
    @IBOutlet var nameField: NSTextField!
    @IBOutlet var keywordField: NSTextField!
    @IBOutlet var expansionField: NSTextField!

    override func viewDidLoad() {
        super.viewDidLoad()
        self.openSafariPrefsButton.isHidden = true
        self.updatePrefsInfoAndButton()
        
        KeywordSearchData.instance.listen(listener: self.loadData)
        
        NotificationCenter.default.addObserver(self,
                                               selector: #selector(updatePrefsInfoAndButton),
                                               name: NSApplication.didBecomeActiveNotification,
                                               object: nil)
    }
    
    @objc private func updatePrefsInfoAndButton() {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                return
            }

            DispatchQueue.main.async {
                if (state.isEnabled) {
                    self.appNameLabel.stringValue = ""
                    self.openSafariPrefsButton.isHidden = true
                } else {
                    self.appNameLabel.stringValue = "The Safari Keyword Search extension is currently disabled."
                    self.openSafariPrefsButton.isHidden = false
                }
            }
        }
    }
    
    @IBAction func openSafariExtensionPreferences(_ sender: AnyObject?) {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier)
    }
    
    func loadData() {
        let data = KeywordSearchData.instance.getCurrent()
        self.nameField.stringValue = data.name
        self.keywordField.stringValue = data.keyword
        self.expansionField.stringValue = data.expansion
    }
    
    func controlTextDidChange(_ notification: Notification) {
        if let field = notification.object as! NSTextField? {
            KeywordSearchData.instance.updateValue(field: field.identifier!.rawValue, value: field.stringValue)
        }
    }

}

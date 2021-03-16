//
//  AppDelegate.swift
//  SafariKeywordSearch
//
//  Created by Arne Martin Aurlien on 06/03/2021.
//

import Cocoa

let appName = "Safari Keyword Search"
let extensionBundleIdentifier = "net.aurlien.SafariKeywordSearch.SafariKeywordSearchWebExtension"

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Insert code here to initialize your application
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Insert code here to tear down your application
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
    
    func applicationDidBecomeActive(_ notification: Notification) {
        
    }
    
    @IBAction func addButtonClicked(_ sender: AnyObject?) {
        KeywordSearchData.instance.addSearch()
    }
    
    @IBAction func deleteButtonClicked(_ sender: AnyObject?) {
        if let window = NSApplication.shared.keyWindow {
            let alert: NSAlert = NSAlert()
            alert.messageText = "Are you sure you want to delete this keyword?"
            alert.informativeText = "This action cannot be undone."
            alert.alertStyle = .warning
            alert.addButton(withTitle: "Delete")
            alert.addButton(withTitle: "Cancel")
            alert.beginSheetModal(for: window) { response in
                if response == .alertFirstButtonReturn {
                    KeywordSearchData.instance.deleteSearch()
                }
            }
        }
    }

}

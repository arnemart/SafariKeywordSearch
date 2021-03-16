//
//  ViewController.swift
//  SafariKeywordSearch
//
//  Created by Arne Martin Aurlien on 06/03/2021.
//

import Cocoa

class ListViewController: NSViewController, NSTableViewDelegate, NSTableViewDataSource {
    
    private var enableUpdates: Bool = true
    @IBOutlet var listView: NSTableView!
    
    override func viewDidLoad() {
        KeywordSearchData.instance.listen(listener: self.reloadData)
    }
    
    func reloadData() {
        let scrollOffset = self.listView.enclosingScrollView?.contentView.bounds.origin.y
        self.listView.reloadData()
        let data = KeywordSearchData.instance
        self.enableUpdates = false
        self.listView.selectRowIndexes(IndexSet.init(integer: data.getSelected()), byExtendingSelection: false)
        if (scrollOffset != nil) {
            self.listView.enclosingScrollView?.contentView.bounds.origin.y = scrollOffset!
        } else {
            Timer.scheduledTimer(withTimeInterval: 0.0, repeats: false) { _ in
                self.listView.scrollRowToVisible(self.listView.selectedRow)
            }
        }
        self.enableUpdates = true
    }

    func numberOfRows(in _: NSTableView) -> Int {
        return KeywordSearchData.instance.getSearches().count
    }
    
    func tableView(_ tableView: NSTableView, viewFor: NSTableColumn?, row: Int) -> NSView? {
        let search = KeywordSearchData.instance.getSearches()[row]

        let nameLabel = search.name == "" ? search.keyword : search.name
        let nameView = NSTextField(labelWithString: nameLabel)
        nameView.font = .labelFont(ofSize: 15.0)
        nameView.lineBreakMode = .byTruncatingTail
        nameView.setContentCompressionResistancePriority(
            NSLayoutConstraint.Priority(rawValue: 1),
            for: .horizontal
        )
        
        let keywordLabel = search.name == "" ? search.expansion : "\(search.keyword) - \(search.expansion)"
        let keywordView = NSTextField(labelWithString: keywordLabel)
        keywordView.lineBreakMode = .byTruncatingTail
        keywordView.setContentCompressionResistancePriority(
            NSLayoutConstraint.Priority(rawValue: 1),
            for: .horizontal
        )
        keywordView.font = .labelFont(ofSize: 11.0)
        
        let view = NSStackView(views: [nameView, keywordView])
        view.orientation = .vertical
        view.alignment = .leading
        view.edgeInsets = NSEdgeInsets(top: 8, left: 4, bottom: 8, right: 4)

        return view
            
    }
    
    func tableViewSelectionDidChange(_ notification: Notification) {
        if (self.enableUpdates) {
            KeywordSearchData.instance.setSelected(sel: self.listView.selectedRow)
        }
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

import AppKit

final class Fixture: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let field = NSTextField(string: "")
    let status = NSTextField(labelWithString: "Ready")
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 120, y: 180, width: 520, height: 310), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "DSH Native Verification"
        let label = NSTextField(labelWithString: "Native Computer Use verification")
        label.font = .systemFont(ofSize: 21, weight: .semibold)
        label.frame = NSRect(x: 28, y: 240, width: 470, height: 35)
        field.frame = NSRect(x: 28, y: 180, width: 300, height: 30)
        field.setAccessibilityLabel("Fixture input")
        let button = NSButton(title: "Save fixture", target: self, action: #selector(save))
        button.frame = NSRect(x: 345, y: 177, width: 145, height: 36)
        status.frame = NSRect(x: 28, y: 115, width: 460, height: 35)
        status.setAccessibilityLabel("Fixture result")
        for view in [label, field, button, status] { window.contentView!.addSubview(view) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc func save() { status.stringValue = "Saved " + field.stringValue }
}
let app = NSApplication.shared
let fixture = Fixture()
app.setActivationPolicy(.regular)
app.delegate = fixture
app.run()

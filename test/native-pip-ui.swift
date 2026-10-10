import AppKit

final class FixtureContent: NSView {
    override func draw(_ rect: NSRect) {
        NSColor(calibratedWhite: 0.15, alpha: 1).setFill(); bounds.fill()
        let title: NSString = "PiP UI fixture"
        title.draw(at: NSPoint(x: 14, y: bounds.height - 90), withAttributes: [.font: NSFont.systemFont(ofSize: 16, weight: .semibold), .foregroundColor: NSColor.white])
        for row in 0..<4 {
            for col in 0..<3 {
                NSColor(calibratedWhite: 0.4 + CGFloat(row) * 0.05, alpha: 1).setFill()
                NSBezierPath(roundedRect: NSRect(x: 14 + CGFloat(col) * 42, y: 30 + CGFloat(row) * 42, width: 34, height: 34), xRadius: 17, yRadius: 17).fill()
            }
        }
    }
}
@main
struct Fixture {
    @MainActor static func main() {
        if CommandLine.arguments.contains("--test") {
            let screen = NSRect(x: 0, y: 0, width: 1440, height: 900)
            let portrait = PipLayout.initial(ratio: 0.56, slot: 0, area: screen)
            assert(abs(portrait.width / portrait.height - 0.56) < 0.001)
            assert(abs(portrait.height - 300) < 0.001 && abs(portrait.width - 168) < 0.001)
            let second = PipLayout.initial(ratio: 0.56, slot: 1, area: screen)
            assert(portrait.minX - second.minX == 32 && portrait.maxY - second.maxY == 32)
            let resized = PipLayout.resize(portrait, delta: NSPoint(x: 30, y: -100), ratio: 0.56, area: screen)
            assert(abs(resized.height - 400) < 0.001 && resized.maxY == portrait.maxY)
            let left = NSRect(x: -1920, y: -100, width: 1920, height: 1080)
            let moved = NSRect(x: -1500, y: 200, width: 320, height: 200)
            assert(PipLayout.area(for: moved, in: [screen, left]) == left)
            assert(PipLayout.constrain(moved, ratio: 1.6, area: left) == moved)
            let clamped = PipLayout.constrain(NSRect(x: -3000, y: 9000, width: 3000, height: 3000), ratio: 1.6, area: screen)
            assert(screen.contains(clamped) && clamped.width <= 720 && clamped.height <= 450)
            let tiny = NSRect(x: 0, y: 0, width: 180, height: 150)
            assert(tiny.contains(PipLayout.initial(ratio: 0.1, slot: 9000, area: tiny)))
            print("Native PiP layout: portrait, stacking, resize, cross-display and bounds checks passed")
            return
        }
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let menu = NSMenu(), item = NSMenuItem(), submenu = NSMenu()
        submenu.addItem(withTitle: "Quit PiP UI Fixture", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = submenu; menu.addItem(item); app.mainMenu = menu
        var previews: [Preview] = []
        var observers: [NSObjectProtocol] = []
        for (index, ratio) in [CGFloat(1.6), 0.56].enumerated() {
            let preview = Preview(slot: index)
            preview.target = "fixture-\(index)"; preview.pid = ProcessInfo.processInfo.processIdentifier
            preview.panel.title = index == 0 ? "Landscape preview fixture" : "Portrait preview fixture"
            preview.canvas.caption.label.stringValue = index == 0 ? "Landscape fixture" : "Portrait fixture"
            let content = FixtureContent(frame: preview.video.bounds)
            content.autoresizingMask = [.width, .height]; preview.video.addSubview(content)
            preview.adapt(ratio: ratio); preview.canvas.state.update("live")
            preview.panel.orderFrontRegardless(); previews.append(preview)
            for name in [NSWindow.didMoveNotification, NSWindow.didResizeNotification] {
                observers.append(NotificationCenter.default.addObserver(forName: name, object: preview.panel, queue: .main) { _ in
                    let frame = preview.panel.frame
                    preview.panel.title = "Fixture \(index): x=\(Int(frame.minX)) y=\(Int(frame.minY)) w=\(Int(frame.width)) h=\(Int(frame.height))"
                })
            }
        }
        withExtendedLifetime((previews, observers)) { app.run() }
    }
}

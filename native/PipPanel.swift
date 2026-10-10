import AppKit

func text(_ en: String, _ zh: String) -> String {
    Locale.preferredLanguages.first?.hasPrefix("zh") == true ? zh : en
}

// Geometry uses desktop points, including negative origins on secondary displays.
enum PipLayout {
    static func size(width: CGFloat, ratio: CGFloat, area: NSRect) -> NSSize {
        let r = max(0.01, ratio)
        let maximum = max(1, min(720, 450 * r, area.width - 24, (area.height - 24) * r))
        let minimum = min(280, 175 * r, maximum)
        let w = max(minimum, min(width, maximum))
        return NSSize(width: w, height: w / r)
    }
    static func constrain(_ frame: NSRect, ratio: CGFloat, area: NSRect) -> NSRect {
        let size = size(width: frame.width, ratio: ratio, area: area)
        let marginX = min(12, max(0, (area.width - size.width) / 2))
        let marginY = min(12, max(0, (area.height - size.height) / 2))
        return NSRect(x: max(area.minX + marginX, min(frame.minX, area.maxX - size.width - marginX)),
                      y: max(area.minY + marginY, min(frame.maxY - size.height, area.maxY - size.height - marginY)),
                      width: size.width, height: size.height)
    }
    static func initial(ratio: CGFloat, slot: Int, area: NSRect) -> NSRect {
        let size = size(width: min(480, 300 * ratio), ratio: ratio, area: area)
        let steps = max(1, Int(max(0, min(area.width - size.width - 48, area.height - size.height - 48)) / 32) + 1)
        let offset = CGFloat(max(0, slot) % steps) * 32
        return constrain(NSRect(x: area.maxX - size.width - 24 - offset, y: area.maxY - size.height - 24 - offset,
                                width: size.width, height: size.height), ratio: ratio, area: area)
    }
    static func resize(_ frame: NSRect, delta: NSPoint, ratio: CGFloat, area: NSRect) -> NSRect {
        let change = abs(delta.x) >= abs(delta.y * ratio) ? delta.x : -delta.y * ratio
        let size = size(width: frame.width + change, ratio: ratio, area: area)
        return constrain(NSRect(x: frame.minX, y: frame.maxY - size.height, width: size.width, height: size.height), ratio: ratio, area: area)
    }
    static func area(for frame: NSRect, in areas: [NSRect]) -> NSRect {
        areas.max { a, b in
            let ia = a.intersection(frame), ib = b.intersection(frame)
            return (ia.isNull ? 0 : ia.width * ia.height) < (ib.isNull ? 0 : ib.width * ib.height)
        } ?? NSRect(x: 0, y: 0, width: 1200, height: 800)
    }
}

final class PipPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class OverlayButton: NSButton {
    private var tracking: NSTrackingArea?
    private var hovered = false
    init(symbol: String, label: String) {
        super.init(frame: .zero)
        title = ""; isBordered = false
        image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        imagePosition = .imageOnly
        contentTintColor = .white
        toolTip = label; setAccessibilityLabel(label)
        wantsLayer = true
    }
    required init?(coder: NSCoder) { fatalError() }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)
        addTrackingArea(area); tracking = area
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovered = false; needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        NSColor(calibratedWhite: 0.13, alpha: hovered ? 0.85 : 0.58).setFill()
        NSBezierPath(ovalIn: bounds).fill()
        super.draw(dirtyRect)
    }
}

final class GradientCaption: NSView {
    let label = NSTextField(labelWithString: "")
    override init(frame: NSRect) {
        super.init(frame: frame)
        label.font = .systemFont(ofSize: 12); label.textColor = .white
        label.lineBreakMode = .byTruncatingTail
        addSubview(label)
    }
    required init?(coder: NSCoder) { fatalError() }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func layout() { super.layout(); label.frame = NSRect(x: 14, y: 12, width: max(0, bounds.width - 58), height: 18) }
    override func draw(_ dirtyRect: NSRect) {
        NSGradient(starting: NSColor.black.withAlphaComponent(0.62), ending: .clear)?.draw(in: bounds, angle: 90)
    }
}

final class StateView: NSView {
    let label = NSTextField(wrappingLabelWithString: "")
    let icon = NSImageView()
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        label.alignment = .center; label.font = .systemFont(ofSize: 12, weight: .medium)
        addSubview(icon); addSubview(label)
        setAccessibilityRole(.group)
    }
    required init?(coder: NSCoder) { fatalError() }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func layout() {
        super.layout()
        label.frame = NSRect(x: 10, y: bounds.midY - 29, width: max(0, bounds.width - 20), height: 32)
        icon.frame = NSRect(x: bounds.midX - 11, y: bounds.midY + 11, width: 22, height: 22)
    }
    override func draw(_ dirtyRect: NSRect) { NSColor.windowBackgroundColor.withAlphaComponent(0.96).setFill(); bounds.fill() }
    func update(_ phase: String) {
        isHidden = phase == "live"
        let symbol: String
        switch phase {
        case "connecting": label.stringValue = text("Connecting…", "正在连接…"); symbol = "ellipsis"
        case "finished": label.stringValue = text("Task finished", "任务已结束"); symbol = "checkmark"
        default: label.stringValue = text("Preview unavailable", "预览不可用"); symbol = "rectangle.slash"
        }
        icon.image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
        icon.contentTintColor = .secondaryLabelColor; label.textColor = .secondaryLabelColor
        setAccessibilityLabel(label.stringValue)
    }
}

final class GestureView: NSView {
    var resizing = false
    var changed: ((NSRect, NSPoint, Bool) -> Void)?
    var cancelled: ((NSRect, Bool) -> Void)?
    var interaction: (() -> Void)?
    private var start: (point: NSPoint, frame: NSRect)?
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func resetCursorRects() { addCursorRect(bounds, cursor: resizing ? .crosshair : .openHand) }
    override func mouseDown(with event: NSEvent) {
        guard let window else { return }
        window.orderFrontRegardless(); window.makeKey(); window.makeFirstResponder(self)
        start = (window.convertPoint(toScreen: event.locationInWindow), window.frame)
        interaction?()
    }
    override func mouseDragged(with event: NSEvent) {
        guard let start else { return }
        guard let window else { return }
        let point = window.convertPoint(toScreen: event.locationInWindow)
        changed?(start.frame, NSPoint(x: point.x - start.point.x, y: point.y - start.point.y), resizing)
    }
    override func mouseUp(with event: NSEvent) { start = nil }
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53, let start { cancelled?(start.frame, resizing); self.start = nil; return }
        guard let window else { return }
        let step: CGFloat = event.modifierFlags.contains(.shift) ? 40 : 10
        let delta: NSPoint
        switch event.keyCode {
        case 123: delta = NSPoint(x: -step, y: 0)
        case 124: delta = NSPoint(x: step, y: 0)
        case 125: delta = NSPoint(x: 0, y: -step)
        case 126: delta = NSPoint(x: 0, y: step)
        default: super.keyDown(with: event); return
        }
        interaction?(); changed?(window.frame, delta, resizing)
    }
    override func draw(_ dirtyRect: NSRect) {
        guard resizing else { return }
        NSColor.white.withAlphaComponent(0.75).setStroke()
        let path = NSBezierPath(); path.lineWidth = 1.5
        for d in [CGFloat(7), 12] { path.move(to: NSPoint(x: bounds.maxX - d - 5, y: 5)); path.line(to: NSPoint(x: bounds.maxX - 5, y: d + 5)) }
        path.stroke()
    }
}

// Video fills the card. Controls and source text are hover/focus overlays, not chrome.
final class PipCanvas: NSView {
    let video: NSView
    let move = GestureView(), resize = GestureView()
    let close = OverlayButton(symbol: "xmark", label: text("Close preview", "关闭预览"))
    let reveal = OverlayButton(symbol: "arrow.up.right", label: text("Show app", "显示应用"))
    let caption = GradientCaption(frame: .zero), state = StateView(frame: .zero)
    var onClose: (() -> Void)?, onReveal: (() -> Void)?
    var changed: ((NSRect, NSPoint, Bool) -> Void)?
    var cancelled: ((NSRect, Bool) -> Void)?
    private var tracking: NSTrackingArea?
    private var hovered = false
    init(video: NSView) {
        self.video = video
        super.init(frame: .zero)
        wantsLayer = true; layer?.cornerRadius = 14; layer?.masksToBounds = true
        layer?.borderWidth = 1; layer?.borderColor = NSColor.black.withAlphaComponent(0.05).cgColor
        for view in [video, state, move, caption, close, reveal, resize] { addSubview(view) }
        resize.resizing = true
        move.setAccessibilityElement(true); move.setAccessibilityRole(.button); move.setAccessibilityLabel(text("Move preview", "移动预览"))
        resize.setAccessibilityElement(true); resize.setAccessibilityRole(.button); resize.setAccessibilityLabel(text("Resize preview", "缩放预览"))
        move.toolTip = text("Drag to move · Arrow keys to nudge", "拖动移动 · 方向键微调")
        resize.toolTip = text("Drag to resize · Arrow keys to resize", "拖动缩放 · 方向键调整")
        for gesture in [move, resize] {
            gesture.changed = { [weak self] frame, delta, resize in self?.changed?(frame, delta, resize) }
            gesture.cancelled = { [weak self] frame, resizing in self?.cancelled?(frame, resizing) }
            gesture.interaction = { [weak self] in self?.setControls(true) }
        }
        close.target = self; close.action = #selector(closePressed)
        reveal.target = self; reveal.action = #selector(revealPressed)
        state.update("connecting"); setControls(false)
    }
    required init?(coder: NSCoder) { fatalError() }
    @objc private func closePressed() { onClose?() }
    @objc private func revealPressed() { onReveal?() }
    override func layout() {
        super.layout(); video.frame = bounds; move.frame = bounds; state.frame = bounds
        close.frame = NSRect(x: 10, y: bounds.height - 42, width: 32, height: 32)
        reveal.frame = NSRect(x: 46, y: bounds.height - 42, width: 32, height: 32)
        caption.frame = NSRect(x: 0, y: 0, width: bounds.width, height: 68)
        resize.frame = NSRect(x: bounds.width - 26, y: 0, width: 26, height: 26)
    }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)
        addTrackingArea(area); tracking = area
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; setControls(true) }
    override func mouseExited(with event: NSEvent) { hovered = false; setControls(window?.isKeyWindow == true) }
    func focusChanged() { setControls(hovered || window?.isKeyWindow == true) }
    private func setControls(_ visible: Bool) {
        // Hidden controls do not intercept clicks intended for the drag surface.
        for view in [close, reveal, caption, resize] { view.isHidden = !visible }
    }
}

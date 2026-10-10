// A session-owned, window-only live preview. No network, input injection or disk frames.
import AppKit
import AVFoundation
import ScreenCaptureKit
import CoreMedia

struct Command: Decodable {
    let action: String
    let target: String?
    let pid: Int32?
    let windowId: UInt32?
    let title: String?
    let slot: Int?
}
func emit(_ event: String, _ details: [String: Any] = [:]) {
    var result = details
    result["event"] = event
    guard let bytes = try? JSONSerialization.data(withJSONObject: result),
          let line = String(data: bytes, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}
final class VideoView: NSView {
    let display = AVSampleBufferDisplayLayer()
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        display.videoGravity = .resizeAspect
        layer?.addSublayer(display)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override func layout() { super.layout(); display.frame = bounds }
    func clear() { display.flushAndRemoveImage() }
}
final class CaptureOutput: NSObject, SCStreamOutput, SCStreamDelegate {
    let deliver: (CMSampleBuffer) -> Void
    let failed: (Error) -> Void
    init(deliver: @escaping (CMSampleBuffer) -> Void, failed: @escaping (Error) -> Void) {
        self.deliver = deliver; self.failed = failed
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let status = attachments.first?[.status] as? Int,
              SCFrameStatus(rawValue: status) == .complete else { return }
        deliver(sampleBuffer)
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) { failed(error) }
}

// A retained, immutable frame crosses from the capture queue to the main actor.
final class FrameBox: @unchecked Sendable {
    let frame: CMSampleBuffer
    init(_ frame: CMSampleBuffer) { self.frame = frame }
}
final class FrameGate: @unchecked Sendable {
    private let lock = NSLock()
    private var pending = false
    func admit() -> Bool { lock.lock(); defer { lock.unlock() }; if pending { return false }; pending = true; return true }
    func release() { lock.lock(); pending = false; lock.unlock() }
}
@MainActor
final class Preview: NSObject, NSWindowDelegate {
    let panel: PipPanel
    let video = VideoView(frame: .zero)
    let canvas: PipCanvas
    let slot: Int
    var ratio: CGFloat = 1.6
    var preferredSize = NSSize(width: 480, height: 300)
    var positioned = false
    var stream: SCStream?
    var output: CaptureOutput?
    var epoch = 0
    var target: String?
    var pid: pid_t?
    var windowId: CGWindowID?
    var dismissed = false
    var suspended = false
    var finished = false
    var terminating = false
    var monitor: Timer?
    var receivedFrame = false
    var checking = false
    var observers: [NSObjectProtocol] = []

    init(slot: Int) {
        self.slot = slot
        panel = PipPanel(contentRect: NSRect(x: 0, y: 0, width: 480, height: 300),
                         styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        canvas = PipCanvas(video: video)
        super.init()
        panel.title = text("Live app preview", "应用实时预览")
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.isReleasedWhenClosed = false
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
        panel.acceptsMouseMovedEvents = true
        panel.delegate = self
        panel.contentView = canvas
        canvas.autoresizingMask = [.width, .height]
        canvas.onClose = { [weak self] in self?.dismiss() }
        canvas.onReveal = { [weak self] in self?.showApp() }
        canvas.changed = { [weak self] frame, delta, resizing in self?.gesture(frame: frame, delta: delta, resizing: resizing) }
        canvas.cancelled = { [weak self] frame, resizing in
            guard let self else { return }
            if resizing { self.preferredSize = frame.size }
            self.panel.setFrame(PipLayout.constrain(frame, ratio: self.ratio, area: self.area(frame)), display: true)
        }
        let workspace = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.screensDidSleepNotification, NSWorkspace.sessionDidResignActiveNotification] {
            observers.append(workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in Task { @MainActor in self?.interrupt() } })
        }
        for name in [NSWorkspace.didWakeNotification, NSWorkspace.screensDidWakeNotification, NSWorkspace.sessionDidBecomeActiveNotification] {
            observers.append(workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in Task { @MainActor in self?.suspended = false } })
        }
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(lockScreen), name: NSNotification.Name("com.apple.screenIsLocked"), object: nil)
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(unlockScreen), name: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged), name: NSApplication.didChangeScreenParametersNotification, object: nil)
    }
    func area(_ frame: NSRect) -> NSRect { PipLayout.area(for: frame, in: NSScreen.screens.map { $0.visibleFrame }) }
    func adapt(ratio next: CGFloat) {
        guard next.isFinite, next > 0 else { return }
        ratio = next
        if !positioned {
            positioned = true
            panel.setFrame(PipLayout.initial(ratio: ratio, slot: slot, area: NSScreen.main?.visibleFrame ?? area(panel.frame)), display: true)
        } else {
            let previous = panel.frame
            let size = PipLayout.size(width: min(preferredSize.width, preferredSize.height * ratio), ratio: ratio, area: area(previous))
            let frame = NSRect(x: previous.maxX - size.width, y: previous.maxY - size.height, width: size.width, height: size.height)
            panel.setFrame(PipLayout.constrain(frame, ratio: ratio, area: area(previous)), display: true)
        }
    }
    func gesture(frame: NSRect, delta: NSPoint, resizing: Bool) {
        let candidate = NSRect(origin: NSPoint(x: frame.minX + delta.x, y: frame.minY + delta.y), size: frame.size)
        let next = resizing ? PipLayout.resize(frame, delta: delta, ratio: ratio, area: area(frame)) : PipLayout.constrain(candidate, ratio: ratio, area: area(candidate))
        if resizing { preferredSize = next.size }
        panel.setFrame(next, display: true)
    }
    func windowDidBecomeKey(_ notification: Notification) { canvas.focusChanged() }
    func windowDidResignKey(_ notification: Notification) { canvas.focusChanged() }
    @objc func screensChanged() { panel.setFrame(PipLayout.constrain(panel.frame, ratio: ratio, area: area(panel.frame)), display: true) }
    @objc func lockScreen() { interrupt() }
    @objc func unlockScreen() { suspended = false }
    func interrupt() {
        suspended = true
        stop()
        panel.orderOut(nil)
    }
    @objc func showApp() {
        guard let pid = pid, target != nil else { return }
        if NSRunningApplication(processIdentifier: pid)?.activate(options: []) == true { dismiss() }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { dismiss(); return false }
    func dismiss() {
        dismissed = true
        stop(); panel.orderOut(nil)
        emit("dismissed", ["target": target ?? ""])
    }
    func stop() {
        epoch += 1
        monitor?.invalidate(); monitor = nil
        checking = false
        let previous = stream
        stream = nil; output = nil
        video.clear(); receivedFrame = false
        if let previous { Task { try? await previous.stopCapture() } }
    }
    func command(_ command: Command) {
        guard !terminating else { return }
        switch command.action {
        case "open":
            guard let target = command.target, !target.isEmpty, target.utf8.count <= 128,
                  let pid = command.pid, pid > 0,
                  let windowId = command.windowId, windowId > 0 else { emit("error", ["message": "Invalid preview target"]); return }
            guard !dismissed && !suspended else { return }
            finished = false
            if self.target == target && self.pid == pid && self.windowId == windowId && stream != nil { return }
            stop()
            self.target = target; self.pid = pid; self.windowId = windowId
            panel.title = String((command.title ?? text("App", "应用")).prefix(120)) + " · " + text("Live preview", "实时预览")
            canvas.state.update("connecting")
            canvas.caption.label.stringValue = command.title ?? text("App", "应用")
            canvas.reveal.isEnabled = true
            // Wait for source dimensions before showing the aspect-fitted card.
            let current = epoch
            Task { await start(pid: pid, windowId: windowId, epoch: current) }
        case "resume": dismissed = false; finished = false
        case "finish":
            finished = true
            stop()
            canvas.state.update("finished")
            let current = epoch
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                if let self, self.epoch == current && self.finished { self.panel.orderOut(nil) }
            }
        case "close":
            if command.target == target { stop(); target = nil; pid = nil; windowId = nil; panel.orderOut(nil) }
        case "shutdown": shutdown()
        default: emit("error", ["message": "Unknown preview command"])
        }
    }
    func start(pid: pid_t, windowId: CGWindowID, epoch current: Int) async {
        do {
            guard CGPreflightScreenCaptureAccess() else { throw NSError(domain: "NativePip", code: 1, userInfo: [NSLocalizedDescriptionKey: text("Screen Recording permission is required.", "需要屏幕录制权限。")]) }
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
            guard current == epoch, !terminating else { return }
            guard let window = content.windows.first(where: { $0.windowID == windowId && $0.owningApplication?.processID == pid }) else {
                throw NSError(domain: "NativePip", code: 2, userInfo: [NSLocalizedDescriptionKey: text("The selected window is no longer available.", "所选窗口已不可用。")])
            }
            adapt(ratio: window.frame.width / max(1, window.frame.height))
            panel.orderFrontRegardless()
            let config = configuration(window.frame.size)
            let gate = FrameGate()
            let receiver = CaptureOutput(deliver: { [weak self] frame in
                guard let self else { return }
                // At most one queued frame on the UI thread; drop instead of buffering.
                guard gate.admit() else { return }
                let box = FrameBox(frame)
                DispatchQueue.main.async {
                    defer { gate.release() }
                    guard self.epoch == current, !self.terminating else { return }
                    if self.video.display.status == .failed { self.video.display.flush() }
                    if self.video.display.isReadyForMoreMediaData {
                        if let attachments = CMSampleBufferGetSampleAttachmentsArray(box.frame, createIfNecessary: true) as? [NSMutableDictionary] { attachments.first?[kCMSampleAttachmentKey_DisplayImmediately] = true }
                        self.video.display.enqueue(box.frame)
                    }
                    if !self.receivedFrame {
                        self.receivedFrame = true
                        self.canvas.state.update("live")
                        emit("live", ["target": self.target ?? "", "windowId": windowId])
                    }
                }
            }, failed: { [weak self] error in
                DispatchQueue.main.async { self?.fail(error, epoch: current) }
            })
            let capture = SCStream(filter: SCContentFilter(desktopIndependentWindow: window), configuration: config, delegate: receiver)
            try capture.addStreamOutput(receiver, type: .screen, sampleHandlerQueue: DispatchQueue(label: "dsh.native-pip.frames"))
            guard current == epoch else { return }
            stream = capture; output = receiver
            try await capture.startCapture()
            guard current == epoch else { try? await capture.stopCapture(); return }
            emit("started", ["target": target ?? "", "windowId": windowId])
            monitor = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in Task { @MainActor in self?.checkWindow(epoch: current) } }
        } catch { fail(error, epoch: current) }
    }
    func checkWindow(epoch current: Int) {
        guard current == epoch, !checking, let pid, let windowId else { return }
        checking = true
        Task {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
                guard current == epoch else { return }
                checking = false
                guard let window = content.windows.first(where: { $0.windowID == windowId && $0.owningApplication?.processID == pid }) else {
                    stop(); target = nil; self.pid = nil; self.windowId = nil; panel.orderOut(nil); emit("target-closed"); return
                }
                let next = window.frame.width / max(1, window.frame.height)
                if abs(next - ratio) > 0.001 {
                    adapt(ratio: next)
                    try await stream?.updateConfiguration(configuration(window.frame.size))
                }
            } catch { fail(error, epoch: current) }
        }
    }
    func fail(_ error: Error, epoch current: Int) {
        guard current == epoch, !terminating else { return }
        stop()
        canvas.reveal.isEnabled = false
        canvas.state.update("unavailable")
        canvas.state.toolTip = error.localizedDescription
        if !positioned { adapt(ratio: ratio) }
        panel.orderFrontRegardless()
        emit("error", ["target": target ?? "", "message": error.localizedDescription])
    }
    func configuration(_ size: NSSize) -> SCStreamConfiguration {
        let config = SCStreamConfiguration()
        let scale = min(1, 960 / max(size.width, size.height, 1))
        config.width = max(2, Int(size.width * scale)); config.height = max(2, Int(size.height * scale))
        config.minimumFrameInterval = CMTime(value: 1, timescale: 15)
        config.queueDepth = 3; config.capturesAudio = false; config.showsCursor = false
        config.pixelFormat = kCVPixelFormatType_32BGRA
        return config
    }
    func shutdown() {
        guard !terminating else { return }
        terminating = true
        stop(); panel.orderOut(nil)
        for observer in observers { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
        observers.removeAll()
        DistributedNotificationCenter.default().removeObserver(self)
        NotificationCenter.default.removeObserver(self)
        panel.delegate = nil
        panel.close()
    }
}

@MainActor
final class Previews {
    var entries: [String: Preview] = [:]
    func command(_ command: Command) {
        switch command.action {
        case "open":
            guard let id = command.target, !id.isEmpty, id.utf8.count <= 128,
                  let pid = command.pid, pid > 0, let window = command.windowId, window > 0,
                  let slot = command.slot, slot >= 0, slot < 10000 else { emit("error", ["message": "Invalid preview target"]); return }
            let entry: Preview
            if let existing = entries[id] { entry = existing }
            else { entry = Preview(slot: slot); entries[id] = entry }
            entry.command(command)
        case "close":
            if let id = command.target { entries.removeValue(forKey: id)?.shutdown() }
        case "resume", "finish": for preview in entries.values { preview.command(command) }
        case "shutdown": shutdown()
        default: emit("error", ["message": "Unknown preview command"])
        }
    }
    func shutdown() {
        for preview in entries.values { preview.shutdown() }
        entries.removeAll(); emit("stopped"); NSApp.terminate(nil)
    }
}

#if !PIP_UI_FIXTURE
@main
struct Main {
    static func main() {
        let application = NSApplication.shared
        application.setActivationPolicy(.accessory)
        DispatchQueue.main.async {
            let previews = Previews()
            // The parent owns lifetime. An inherited stdin EOF tears down all panels.
            DispatchQueue.global(qos: .userInitiated).async {
                var pending = Data()
                let input = FileHandle.standardInput
                while true {
                    let bytes = input.availableData
                    if bytes.isEmpty { DispatchQueue.main.async { previews.shutdown() }; break }
                    pending.append(bytes)
                    if pending.count > 16_384 { DispatchQueue.main.async { previews.shutdown() }; break }
                    while let newline = pending.firstIndex(of: 10) {
                        let line = pending.subdata(in: 0..<newline)
                        pending.removeSubrange(0...newline)
                        guard let command = try? JSONDecoder().decode(Command.self, from: line) else { emit("error", ["message": "Invalid preview command"]); continue }
                        DispatchQueue.main.async { previews.command(command) }
                    }
                }
            }
            emit("ready")
        }
        application.run()
    }
}

#endif

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
}
func emit(_ event: String, _ details: [String: Any] = [:]) {
    var result = details
    result["event"] = event
    guard let bytes = try? JSONSerialization.data(withJSONObject: result),
          let line = String(data: bytes, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}
let chinese = Locale.preferredLanguages.first?.hasPrefix("zh") == true
func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }

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
    let panel: NSPanel
    let video = VideoView(frame: .zero)
    let status = NSTextField(labelWithString: "")
    let reveal = NSButton()
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

    override init() {
        panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 360, height: 260),
                        styleMask: [.titled, .closable, .resizable, .nonactivatingPanel],
                        backing: .buffered, defer: false)
        super.init()
        panel.title = text("Live app preview", "应用实时预览")
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.isReleasedWhenClosed = false
        panel.delegate = self
        panel.minSize = NSSize(width: 240, height: 180)
        panel.maxSize = NSSize(width: 900, height: 900)
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.isMovableByWindowBackground = true
        let content = NSView()
        panel.contentView = content
        video.translatesAutoresizingMaskIntoConstraints = false
        status.translatesAutoresizingMaskIntoConstraints = false
        reveal.translatesAutoresizingMaskIntoConstraints = false
        status.font = .systemFont(ofSize: 11)
        status.textColor = .secondaryLabelColor
        status.lineBreakMode = .byTruncatingTail
        status.setAccessibilityLabel(text("Preview status", "预览状态"))
        reveal.title = text("Show app", "显示应用")
        reveal.bezelStyle = .rounded
        reveal.controlSize = .small
        reveal.target = self
        reveal.action = #selector(showApp)
        content.addSubview(video); content.addSubview(status); content.addSubview(reveal)
        NSLayoutConstraint.activate([
            video.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            video.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            video.topAnchor.constraint(equalTo: content.topAnchor),
            video.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -36),
            status.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
            status.centerYAnchor.constraint(equalTo: reveal.centerYAnchor),
            status.trailingAnchor.constraint(lessThanOrEqualTo: reveal.leadingAnchor, constant: -8),
            reveal.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -10),
            reveal.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -6)
        ])
        placeOnScreen()
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
    func placeOnScreen() {
        guard let screen = NSScreen.main ?? NSScreen.screens.first else { return }
        let area = screen.visibleFrame
        panel.setFrameOrigin(NSPoint(x: area.maxX - panel.frame.width - 24, y: area.maxY - panel.frame.height - 24))
    }
    @objc func screensChanged() {
        if !NSScreen.screens.contains(where: { $0.visibleFrame.intersects(panel.frame) }) { placeOnScreen() }
    }
    @objc func lockScreen() { interrupt() }
    @objc func unlockScreen() { suspended = false }
    func interrupt() {
        suspended = true
        stop()
        panel.orderOut(nil)
    }
    @objc func showApp() {
        guard let pid = pid, target != nil else { return }
        NSRunningApplication(processIdentifier: pid)?.activate(options: [])
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        dismissed = true
        stop()
        panel.orderOut(nil)
        emit("dismissed")
        return false
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
            status.stringValue = text("Connecting…", "正在连接…")
            reveal.isEnabled = true
            panel.orderFrontRegardless() // Nonactivating panel: never takes focus from the user's app.
            let current = epoch
            Task { await start(pid: pid, windowId: windowId, epoch: current) }
        case "resume": dismissed = false; finished = false
        case "finish":
            finished = true
            stop()
            status.stringValue = text("Finished", "已结束")
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
            let config = SCStreamConfiguration()
            let ratio = min(1, 960 / max(window.frame.width, window.frame.height, 1))
            config.width = max(2, Int(window.frame.width * ratio))
            config.height = max(2, Int(window.frame.height * ratio))
            config.minimumFrameInterval = CMTime(value: 1, timescale: 15)
            config.queueDepth = 3
            config.capturesAudio = false
            config.showsCursor = false
            config.pixelFormat = kCVPixelFormatType_32BGRA
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
                        self.status.stringValue = text("Live · Window only", "实时 · 仅此窗口")
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
                if !content.windows.contains(where: { $0.windowID == windowId && $0.owningApplication?.processID == pid }) {
                    stop(); target = nil; self.pid = nil; self.windowId = nil; panel.orderOut(nil); emit("target-closed")
                }
            } catch { fail(error, epoch: current) }
        }
    }
    func fail(_ error: Error, epoch current: Int) {
        guard current == epoch, !terminating else { return }
        stop()
        reveal.isEnabled = false
        status.stringValue = text("Preview unavailable", "预览不可用")
        status.toolTip = error.localizedDescription
        emit("error", ["message": error.localizedDescription])
    }
    func shutdown() {
        guard !terminating else { return }
        terminating = true
        stop(); panel.orderOut(nil)
        emit("stopped")
        NSApp.terminate(nil)
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
DispatchQueue.main.async {
let preview = Preview()
// The parent owns lifetime. An inherited stdin EOF also tears down after Host exit.
DispatchQueue.global(qos: .userInitiated).async {
    var pending = Data()
    let input = FileHandle.standardInput
    while true {
        let bytes = input.availableData
        if bytes.isEmpty { DispatchQueue.main.async { preview.shutdown() }; break }
        pending.append(bytes)
        if pending.count > 16_384 { DispatchQueue.main.async { preview.shutdown() }; break }
        while let newline = pending.firstIndex(of: 10) {
            let line = pending.subdata(in: 0..<newline)
            pending.removeSubrange(0...newline)
            guard let command = try? JSONDecoder().decode(Command.self, from: line) else {
                emit("error", ["message": "Invalid preview command"]); continue
            }
            DispatchQueue.main.async { preview.command(command) }
        }
    }
}
emit("ready")
}
application.run()

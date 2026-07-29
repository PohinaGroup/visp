import AVFoundation
import CoreImage

/// An object that manages offscreen rendering a video track source.
public final class VideoTrackScreenObject: ScreenObject, ChromaKeyProcessable {
    static let capacity: Int = 3
    public var chromaKeyColor: CGColor?

    /// Specifies the track number how the displays the visual content.
    public var track: UInt8 = 0 {
        didSet {
            guard track != oldValue else {
                return
            }
            invalidateLayout()
        }
    }

    /// A value that specifies how the video is displayed within a player layer’s bounds.
    public var videoGravity: AVLayerVideoGravity = .resizeAspect {
        didSet {
            guard videoGravity != oldValue else {
                return
            }
            invalidateLayout()
        }
    }

    /// The frame rate.
    public var frameRate: Int {
        frameTracker.frameRate
    }

    // #region agent log
    var debugHasFrame: String {
        "enq=\(Self.debugEnqueued) deq=\(Self.debugDequeued) empty=\(String(describing: queue?.isEmpty)) head=\(String(describing: queue?.head?.formatDescription?.dimensions)) bounds=\(bounds) parent=\(parent != nil) visible=\(isVisible)"
    }
    static var debugEnqueued = 0
    static var debugDequeued = 0
    static var debugNoDequeue = 0
    // #endregion

    override var blendMode: ScreenObject.BlendMode {
        if 0.0 < cornerRadius || chromaKeyColor != nil {
            return .alpha
        }
        return .normal
    }

    private var queue: TypedBlockQueue<CMSampleBuffer>?
    private var effects: [any VideoEffect] = .init()
    private var frameTracker = FrameTracker()

    /// Create a screen object.
    override public init() {
        super.init()
        do {
            queue = try TypedBlockQueue(capacity: Self.capacity, handlers: .outputPTSSortedSampleBuffers)
        } catch {
            logger.error(error)
        }
        Task {
            horizontalAlignment = .center
        }
    }

    /// Registers a video effect.
    public func registerVideoEffect(_ effect: some VideoEffect) -> Bool {
        if effects.contains(where: { $0 === effect }) {
            return false
        }
        effects.append(effect)
        return true
    }

    /// Unregisters a video effect.
    public func unregisterVideoEffect(_ effect: some VideoEffect) -> Bool {
        if let index = effects.firstIndex(where: { $0 === effect }) {
            effects.remove(at: index)
            return true
        }
        return false
    }

    override public func makeImage(_ renderer: some ScreenRenderer) -> CGImage? {
        guard let image: CIImage = makeImage(renderer) else {
            return nil
        }
        return renderer.context.createCGImage(image, from: videoGravity.region(bounds, image: image.extent))
    }

    override public func makeImage(_ renderer: some ScreenRenderer) -> CIImage? {
        let presentationTimeStamp = renderer.presentationTimeStamp.convertTime(from: CMClockGetHostTimeClock(), to: renderer.synchronizationClock)
        guard let sampleBuffer = queue?.dequeue(presentationTimeStamp),
              let pixelBuffer = sampleBuffer.imageBuffer else {
            // #region agent log
            Self.debugNoDequeue += 1
            if Self.debugNoDequeue <= 5 || Self.debugNoDequeue % 120 == 0 {
                NSLog("[VISPDBG] makeImage NO DEQUEUE #\(Self.debugNoDequeue) wantPts=\(presentationTimeStamp.seconds) headPts=\(String(describing: queue?.head?.presentationTimeStamp.seconds)) enq=\(Self.debugEnqueued) syncClock=\(renderer.synchronizationClock != nil)")
            }
            // #endregion
            return nil
        }
        // #region agent log
        Self.debugDequeued += 1
        if Self.debugDequeued <= 5 {
            NSLog("[VISPDBG] makeImage DEQUEUED #\(Self.debugDequeued) bounds=\(bounds) pixel=\(pixelBuffer.size)")
        }
        // #endregion
        frameTracker.update(sampleBuffer.presentationTimeStamp)
        // Resizing before applying the filter for performance optimization.
        var image = CIImage(cvPixelBuffer: pixelBuffer, options: renderer.imageOptions).transformed(by: videoGravity.scale(
            bounds.size,
            image: pixelBuffer.size
        ))
        if effects.isEmpty {
            return image
        } else {
            for effect in effects {
                image = effect.execute(image)
            }
            return image
        }
    }

    override public func makeBounds(_ size: CGSize) -> CGRect {
        guard parent != nil, let image = queue?.head?.formatDescription?.dimensions.size else {
            return super.makeBounds(size)
        }
        let bounds = super.makeBounds(size)
        switch videoGravity {
        case .resizeAspect:
            let scale = min(bounds.size.width / image.width, bounds.size.height / image.height)
            let scaleSize = CGSize(width: image.width * scale, height: image.height * scale)
            return super.makeBounds(scaleSize)
        case .resizeAspectFill:
            return bounds
        default:
            return bounds
        }
    }

    override public func draw(_ renderer: some ScreenRenderer) {
        super.draw(renderer)
        if queue?.isEmpty == false {
            invalidateLayout()
        }
    }

    func enqueue(_ sampleBuffer: CMSampleBuffer) {
        // #region agent log
        Self.debugEnqueued += 1
        if Self.debugEnqueued <= 3 || Self.debugEnqueued % 120 == 0 {
            var luma = "?"
            if let pb = sampleBuffer.imageBuffer {
                CVPixelBufferLockBaseAddress(pb, .readOnly)
                let w = CVPixelBufferGetWidthOfPlane(pb, 0)
                let h = CVPixelBufferGetHeightOfPlane(pb, 0)
                let rb = CVPixelBufferGetBytesPerRowOfPlane(pb, 0)
                if let base = CVPixelBufferGetBaseAddressOfPlane(pb, 0) {
                    let p = base.assumingMemoryBound(to: UInt8.self)
                    luma = "\(p[h / 2 * rb + w / 2]),\(p[h / 4 * rb + w / 4]),\(p[h * 3 / 4 * rb + w / 2])"
                }
                CVPixelBufferUnlockBaseAddress(pb, .readOnly)
                luma += " fmt=\(CVPixelBufferGetPixelFormatType(pb)) planes=\(CVPixelBufferGetPlaneCount(pb))"
            }
            NSLog("[VISPDBG] enqueue #\(Self.debugEnqueued) track=\(track) dims=\(String(describing: sampleBuffer.formatDescription?.dimensions)) cameraLuma=\(luma)")
        }
        // #endregion
        try? queue?.enqueue(sampleBuffer)
        invalidateLayout()
    }

    func reset() {
        frameTracker.clear()
        try? queue?.reset()
        invalidateLayout()
    }
}

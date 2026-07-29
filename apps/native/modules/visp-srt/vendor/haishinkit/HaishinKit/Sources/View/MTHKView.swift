#if os(iOS) || os(tvOS) || os(macOS)

import AVFoundation
import MetalKit

/// A view that displays a video content of a NetStream object which uses Metal api.
public class MTHKView: MTKView {
    /// Specifies how the video is displayed within a player layer’s bounds.
    public var videoGravity: AVLayerVideoGravity = .resizeAspect
    public var videoTrackId: UInt8? = UInt8.max
    public var audioTrackId: UInt8?
    private var displayImage: CIImage?
    private var lastAppliedPtsSeconds = -1.0
    // #region agent log
    private static var drawCount = 0
    private static var mixerOutCount = 0
    private static var mixerDropCount = 0
    // #endregion
    private lazy var commandQueue: (any MTLCommandQueue)? = {
        return device?.makeCommandQueue()
    }()
    private var context: CIContext?
    private var effects: [any VideoEffect] = .init()

    /// Drop PTS tracking so the next frame is always accepted.
    public func resetPreviewTiming() {
        lastAppliedPtsSeconds = -1
    }

    /// Clear the drawable and PTS tracking (camera switch). Brief black is OK.
    public func clearPreviewForCameraSwitch() {
        displayImage = nil
        lastAppliedPtsSeconds = -1
        #if os(macOS)
        needsDisplay = true
        #else
        setNeedsDisplay()
        #endif
    }

    /// Initializes and returns a newly allocated view object with the specified frame rectangle.
    public init(frame: CGRect) {
        super.init(frame: frame, device: MTLCreateSystemDefaultDevice())
        awakeFromNib()
    }

    /// Returns an object initialized from data in a given unarchiver.
    public required init(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
        self.device = MTLCreateSystemDefaultDevice()
    }

    /// Prepares the receiver for service after it has been loaded from an Interface Builder archive, or nib file.
    override public func awakeFromNib() {
        super.awakeFromNib()
        Task { @MainActor in
            framebufferOnly = false
            enableSetNeedsDisplay = true
            if let device {
                context = CIContext(mtlDevice: device, options: [.cacheIntermediates: false, .name: "MTHKView"])
            }
        }
    }

    /// Redraws the view’s contents.
    override public func draw(_ rect: CGRect) {
        // #region agent log
        Self.drawCount += 1
        if Self.drawCount <= 5 || Self.drawCount % 120 == 0 {
            NSLog("[VISPDBG] draw #\(Self.drawCount) ctx=\(context != nil) drawable=\(currentDrawable != nil) q=\(commandQueue != nil) img=\(displayImage != nil) bounds=\(bounds) drawableSize=\(drawableSize) window=\(window != nil) hidden=\(isHidden) alpha=\(alpha) paused=\(isPaused)")
        }
        // #endregion
        guard
            let context,
            let currentDrawable = currentDrawable,
            let commandBuffer = commandQueue?.makeCommandBuffer() else {
            return
        }
        if
            let currentRenderPassDescriptor = currentRenderPassDescriptor,
            let renderCommandEncoder = commandBuffer.makeRenderCommandEncoder(descriptor: currentRenderPassDescriptor) {
            renderCommandEncoder.endEncoding()
        }
        guard let displayImage else {
            commandBuffer.present(currentDrawable)
            commandBuffer.commit()
            return
        }

        var scaleX: CGFloat = 0
        var scaleY: CGFloat = 0
        var translationX: CGFloat = 0
        var translationY: CGFloat = 0
        switch videoGravity {
        case .resize:
            scaleX = drawableSize.width / displayImage.extent.width
            scaleY = drawableSize.height / displayImage.extent.height
        case .resizeAspect:
            let scale: CGFloat = min(drawableSize.width / displayImage.extent.width, drawableSize.height / displayImage.extent.height)
            scaleX = scale
            scaleY = scale
            translationX = (drawableSize.width - displayImage.extent.width * scale) / scaleX / 2
            translationY = (drawableSize.height - displayImage.extent.height * scale) / scaleY / 2
        case .resizeAspectFill:
            let scale: CGFloat = max(drawableSize.width / displayImage.extent.width, drawableSize.height / displayImage.extent.height)
            scaleX = scale
            scaleY = scale
            translationX = (drawableSize.width - displayImage.extent.width * scale) / scaleX / 2
            translationY = (drawableSize.height - displayImage.extent.height * scale) / scaleY / 2
        default:
            break
        }

        var scaledImage: CIImage = displayImage
        for effect in effects {
            scaledImage = effect.execute(scaledImage)
        }

        scaledImage = scaledImage
            .transformed(by: CGAffineTransform(translationX: translationX, y: translationY))
            .transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        let destination = CIRenderDestination(
            width: Int(drawableSize.width),
            height: Int(drawableSize.height),
            pixelFormat: colorPixelFormat,
            commandBuffer: commandBuffer,
            mtlTextureProvider: { () -> (any MTLTexture) in
                return currentDrawable.texture
            })

        // #region agent log
        do {
            _ = try context.startTask(toRender: scaledImage, to: destination)
            if Self.drawCount <= 5 || Self.drawCount % 120 == 0 {
                NSLog("[VISPDBG] render OK extent=\(scaledImage.extent) srcExtent=\(displayImage.extent) scale=\(scaleX),\(scaleY) tx=\(translationX),\(translationY) fbOnly=\(framebufferOnly) pixFmt=\(colorPixelFormat.rawValue) texUsage=\(currentDrawable.texture.usage.rawValue)")
            }
        } catch {
            NSLog("[VISPDBG] render FAILED \(error) extent=\(scaledImage.extent) fbOnly=\(framebufferOnly) pixFmt=\(colorPixelFormat.rawValue)")
        }
        // #endregion

        commandBuffer.present(currentDrawable)
        commandBuffer.commit()
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
}

extension MTHKView: MediaMixerOutput {
    // MARK: MediaMixerOutput
    public func selectTrack(_ id: UInt8?, mediaType: CMFormatDescription.MediaType) async {
        switch mediaType {
        case .audio:
            break
        case .video:
            videoTrackId = id
        default:
            break
        }
    }

    nonisolated public func mixer(_ mixer: MediaMixer, didOutput buffer: AVAudioPCMBuffer, when: AVAudioTime) {
    }

    nonisolated public func mixer(_ mixer: MediaMixer, didOutput sampleBuffer: CMSampleBuffer) {
        let pts = sampleBuffer.presentationTimeStamp.seconds
        Task { @MainActor in
            // #region agent log
            Self.mixerOutCount += 1
            if Self.mixerOutCount <= 5 || Self.mixerOutCount % 120 == 0 {
                NSLog("[VISPDBG] mixerOut #\(Self.mixerOutCount) drops=\(Self.mixerDropCount) pts=\(pts) last=\(self.lastAppliedPtsSeconds) imageBuffer=\(sampleBuffer.imageBuffer != nil) fmt=\(sampleBuffer.formatDescription?.mediaSubType.rawValue ?? 0) dims=\(String(describing: sampleBuffer.formatDescription?.dimensions))")
            }
            // #endregion
            if self.lastAppliedPtsSeconds >= 0 && pts < self.lastAppliedPtsSeconds - 0.001 {
                // Capture-latency recalculation can jump output PTS backward by
                // hundreds of ms. Treat large jumps as a rebase, not a reorder.
                if self.lastAppliedPtsSeconds - pts <= 0.25 {
                    // #region agent log
                    Self.mixerDropCount += 1
                    // #endregion
                    return
                }
            }
            guard let image = try? sampleBuffer.imageBuffer?.makeCIImage() else {
                // #region agent log
                NSLog("[VISPDBG] mixerOut makeCIImage FAILED")
                // #endregion
                return
            }
            self.lastAppliedPtsSeconds = pts
            self.displayImage = image
            #if os(macOS)
            self.needsDisplay = true
            #else
            self.setNeedsDisplay()
            #endif
        }
    }
}

extension MTHKView: StreamOutput {
    // MARK: HKStreamOutput
    nonisolated public func stream(_ stream: some StreamConvertible, didOutput audio: AVAudioBuffer, when: AVAudioTime) {
    }

    nonisolated public func stream(_ stream: some StreamConvertible, didOutput video: CMSampleBuffer) {
        let pts = video.presentationTimeStamp.seconds
        Task { @MainActor in
            if self.lastAppliedPtsSeconds >= 0 && pts < self.lastAppliedPtsSeconds - 0.001 {
                if self.lastAppliedPtsSeconds - pts <= 0.25 {
                    return
                }
            }
            guard let image = try? video.imageBuffer?.makeCIImage() else {
                return
            }
            self.lastAppliedPtsSeconds = pts
            self.displayImage = image
            #if os(macOS)
            self.needsDisplay = true
            #else
            self.setNeedsDisplay()
            #endif
        }
    }
}

#endif

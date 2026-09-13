// swift liftmask.swift in.jpg mask.png
// Foreground-instance mask (the same model iOS "lift subject" uses), soft, full-res.
import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else { fputs("usage: liftmask in out.png\n", stderr); exit(1) }
let url = URL(fileURLWithPath: args[1])
guard let ci = CIImage(contentsOf: url) else { fputs("cannot read input\n", stderr); exit(1) }
let handler = VNImageRequestHandler(ciImage: ci, options: [:])
let req = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([req])
guard let obs = req.results?.first else { fputs("no foreground found\n", stderr); exit(2) }
let pb = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler)
let maskCI = CIImage(cvPixelBuffer: pb)
let ctx = CIContext()
guard let cg = ctx.createCGImage(maskCI, from: maskCI.extent) else { exit(3) }
let rep = NSBitmapImageRep(cgImage: cg)
guard let png = rep.representation(using: .png, properties: [:]) else { exit(4) }
try png.write(to: URL(fileURLWithPath: args[2]))
print("mask \(cg.width)x\(cg.height)")

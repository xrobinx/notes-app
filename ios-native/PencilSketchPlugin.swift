import Capacitor
import PencilKit
import UIKit

@objc(PencilSketchPlugin)
public class PencilSketchPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "PencilSketchPlugin"
  public let jsName = "PencilSketch"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
  ]

  @objc func open(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      guard let viewController = self.bridge?.viewController else {
        call.reject("No presenting view controller.")
        return
      }

      let controller = PencilSketchViewController()
      controller.initialDrawingBase64 = call.getString("drawingData")
      controller.onDone = { drawingData, previewPng in
        call.resolve([
          "drawingData": drawingData,
          "previewPng": previewPng
        ])
      }

      let nav = UINavigationController(rootViewController: controller)
      nav.modalPresentationStyle = .formSheet
      viewController.present(nav, animated: true)
    }
  }
}

final class PencilSketchViewController: UIViewController, PKCanvasViewDelegate {
  var initialDrawingBase64: String?
  var onDone: ((String, String) -> Void)?

  private let canvas = PKCanvasView()
  private let toolPicker = PKToolPicker()

  override func viewDidLoad() {
    super.viewDidLoad()
    title = "Sketch"
    view.backgroundColor = .systemBackground
    navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .cancel, primaryAction: UIAction { [weak self] _ in
      self?.dismiss(animated: true)
    })
    navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .done, primaryAction: UIAction { [weak self] _ in
      self?.finish()
    })

    canvas.translatesAutoresizingMaskIntoConstraints = false
    canvas.drawingPolicy = .anyInput
    canvas.backgroundColor = .clear
    canvas.delegate = self
    view.addSubview(canvas)
    NSLayoutConstraint.activate([
      canvas.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      canvas.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      canvas.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      canvas.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])

    if let initialDrawingBase64,
       let data = Data(base64Encoded: initialDrawingBase64),
       let drawing = try? PKDrawing(data: data) {
      canvas.drawing = drawing
    }
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    toolPicker.setVisible(true, forFirstResponder: canvas)
    toolPicker.addObserver(canvas)
    canvas.becomeFirstResponder()
  }

  private func finish() {
    let drawingData = canvas.drawing.dataRepresentation().base64EncodedString()
    let bounds = canvas.bounds.width > 1 && canvas.bounds.height > 1 ? canvas.bounds : CGRect(x: 0, y: 0, width: 900, height: 600)
    let image = canvas.drawing.image(from: bounds, scale: UIScreen.main.scale)
    let preview = image.pngData()?.base64EncodedString() ?? ""
    onDone?(drawingData, preview)
    dismiss(animated: true)
  }
}

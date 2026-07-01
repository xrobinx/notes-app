import AppIntents

enum NotesDestination: String, AppEnum {
  case quickCapture
  case allNotes
  case reminders

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Notes Destination"
  static var caseDisplayRepresentations: [NotesDestination: DisplayRepresentation] {
    [
      .quickCapture: "Quick Capture",
      .allNotes: "All Notes",
      .reminders: "Reminders",
    ]
  }

  var deepLink: URL {
    URL(string: "notesapp://open/\(rawValue)")!
  }
}

struct OpenNotesDestinationIntent: AppIntent {
  static let title: LocalizedStringResource = "Open Notes"
  static let description = IntentDescription("Open Notes to a useful place.")
  static let openAppWhenRun = true

  @Parameter(title: "Destination")
  var destination: NotesDestination

  func perform() async throws -> some IntentResult {
    return .result(opensIntent: OpenURLIntent(destination.deepLink))
  }
}

struct QuickNoteIntent: AppIntent {
  static let title: LocalizedStringResource = "Create Quick Note"
  static let description = IntentDescription("Open Notes ready for quick capture.")
  static let openAppWhenRun = true

  @Parameter(title: "Text", inputConnectionBehavior: .connectToPreviousIntentResult)
  var text: String?

  func perform() async throws -> some IntentResult {
    var components = URLComponents(string: "notesapp://quick-note")!
    if let text, !text.isEmpty {
      components.queryItems = [URLQueryItem(name: "text", value: text)]
    }
    return .result(opensIntent: OpenURLIntent(components.url!))
  }
}

struct NotesAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: QuickNoteIntent(),
      phrases: [
        "Create a quick note in \(.applicationName)",
        "Write a note in \(.applicationName)",
      ],
      shortTitle: "Quick Note",
      systemImageName: "square.and.pencil"
    )

    AppShortcut(
      intent: OpenNotesDestinationIntent(destination: .allNotes),
      phrases: [
        "Open my notes in \(.applicationName)",
      ],
      shortTitle: "Open Notes",
      systemImageName: "note.text"
    )
  }
}

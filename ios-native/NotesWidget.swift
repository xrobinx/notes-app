import SwiftUI
import WidgetKit

private let appGroupId = "group.com.notesapp.shared"

struct NotesWidgetEntry: TimelineEntry {
  let date: Date
  let title: String
  let preview: String
  let emoji: String
  let checklistDone: Int
  let checklistTotal: Int
}

struct NotesWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> NotesWidgetEntry {
    NotesWidgetEntry(date: .now, title: "Quick Note", preview: "Write something before it disappears.", emoji: "📝", checklistDone: 0, checklistTotal: 0)
  }

  func getSnapshot(in context: Context, completion: @escaping (NotesWidgetEntry) -> Void) {
    completion(loadEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<NotesWidgetEntry>) -> Void) {
    completion(Timeline(entries: [loadEntry()], policy: .after(.now.addingTimeInterval(15 * 60))))
  }

  private func loadEntry() -> NotesWidgetEntry {
    let defaults = UserDefaults(suiteName: appGroupId)
    return NotesWidgetEntry(
      date: .now,
      title: defaults?.string(forKey: "widget.title") ?? "Notes",
      preview: defaults?.string(forKey: "widget.preview") ?? "Tap to keep writing.",
      emoji: defaults?.string(forKey: "widget.emoji") ?? "📝",
      checklistDone: defaults?.integer(forKey: "widget.checklistDone") ?? 0,
      checklistTotal: defaults?.integer(forKey: "widget.checklistTotal") ?? 0
    )
  }
}

struct NotesWidgetView: View {
  let entry: NotesWidgetEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(entry.emoji)
        Text(entry.title)
          .font(.headline)
          .lineLimit(1)
        Spacer()
      }

      Text(entry.preview)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .lineLimit(4)

      if entry.checklistTotal > 0 {
        ProgressView(value: Double(entry.checklistDone), total: Double(entry.checklistTotal))
          .tint(.yellow)
        Text("\(entry.checklistDone) of \(entry.checklistTotal)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Spacer(minLength: 0)
    }
    .containerBackground(Color(red: 0.12, green: 0.12, blue: 0.13), for: .widget)
    .foregroundStyle(.white)
    .widgetURL(URL(string: "notesapp://quick-note"))
  }
}

@main
struct NotesWidgets: WidgetBundle {
  var body: some Widget {
    NotesRecentWidget()
  }
}

struct NotesRecentWidget: Widget {
  let kind = "NotesWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: NotesWidgetProvider()) { entry in
      NotesWidgetView(entry: entry)
    }
    .configurationDisplayName("Notes")
    .description("Quick access to your recent note and checklist progress.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

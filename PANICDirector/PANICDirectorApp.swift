import SwiftUI
import UIKit

final class PortraitAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        .portrait
    }
}

@main
struct PANICDirectorApp: App {
    @UIApplicationDelegateAdaptor(PortraitAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootCoordinatorView()
                .preferredColorScheme(.dark)
        }
    }
}

private enum AppScreen {
    case start
    case playing(id: UUID, session: GameSessionViewModel)
    case results(lastRecord: RunTelemetryRecord?)
}

@MainActor
private struct RootCoordinatorView: View {
    @State private var telemetryStore = TelemetryStore()
    @State private var initialsChars: [Character] = ["V", "L", "F"]
    @State private var selectedMode: GameMode = .director2026
    @State private var screen: AppScreen = .start

    private var currentInitials: String {
        String(initialsChars)
    }

    var body: some View {
        Group {
            switch screen {
            case .start:
                StartScreenView(
                    initialsChars: $initialsChars,
                    selectedMode: $selectedMode,
                    recordedCount: telemetryStore.records.count,
                    onStartGame: startNewRun,
                    onOpenTelemetry: {
                        screen = .results(lastRecord: nil)
                    }
                )

            case .playing(let runID, let session):
                GamePlayView(viewModel: session)
                    .id(runID)
                    .statusBarHidden(true)

            case .results(let lastRecord):
                ResultsTelemetryView(
                    lastRecord: lastRecord,
                    store: telemetryStore,
                    onPlayAgainSameSetup: startNewRun,
                    onReturnToStart: {
                        screen = .start
                    }
                )
            }
        }
        .animation(.easeInOut(duration: 0.22), value: screenKey)
    }

    private var screenKey: String {
        switch screen {
        case .start: return "start"
        case .playing(let id, _): return "play-\(id.uuidString)"
        case .results(let rec): return "res-\(rec?.id.uuidString ?? "log")"
        }
    }

    private func startNewRun() {
        let runID = UUID()
        let session = GameSessionViewModel(
            initials: currentInitials,
            mode: selectedMode,
            onFinish: { record in
                telemetryStore.recordRun(record)
                screen = .results(lastRecord: record)
            }
        )
        screen = .playing(id: runID, session: session)
    }
}

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
    case players(initialInitials: String?)
}

@MainActor
private struct RootCoordinatorView: View {
    @State private var telemetryStore = TelemetryStore()
    @State private var initialsChars: [Character] = ["V", "L", "F"]
    @State private var selectedMode: GameMode = .director2026
    @State private var selectedAvatar: PlayerAvatar = .penitente
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
                    selectedAvatar: $selectedAvatar,
                    recordedCount: telemetryStore.records.count,
                    uniquePlayerCount: telemetryStore.uniquePlayerCount,
                    onStartGame: startNewRun,
                    onOpenTelemetry: {
                        screen = .results(lastRecord: nil)
                    },
                    onOpenPlayers: {
                        screen = .players(initialInitials: nil)
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
                    },
                    onOpenPlayers: { initials in
                        screen = .players(initialInitials: initials)
                    }
                )

            case .players(let initialInitials):
                PlayersDirectoryView(
                    store: telemetryStore,
                    initialPlayerInitials: initialInitials,
                    onReturnToStart: {
                        screen = .start
                    },
                    onUsePlayerSetup: { initials, preferredAvatar in
                        applyPlayerSetup(initials: initials, avatar: preferredAvatar)
                        screen = .start
                    }
                )
                .id("players-\(initialInitials ?? "all")")
            }
        }
        .animation(.easeInOut(duration: 0.22), value: screenKey)
    }

    private var screenKey: String {
        switch screen {
        case .start: return "start"
        case .playing(let id, _): return "play-\(id.uuidString)"
        case .results(let rec): return "res-\(rec?.id.uuidString ?? "log")"
        case .players(let initial): return "players-\(initial ?? "all")"
        }
    }

    private func applyPlayerSetup(initials: String, avatar: PlayerAvatar?) {
        let validAlphabet = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        let cleaned = initials
            .uppercased()
            .filter { validAlphabet.contains($0) }
        var chars = Array(cleaned.prefix(3))
        while chars.count < 3 {
            chars.append("A")
        }
        initialsChars = chars
        if let avatar {
            selectedAvatar = avatar
        }
    }

    private func startNewRun() {
        let runID = UUID()
        let session = GameSessionViewModel(
            initials: currentInitials,
            mode: selectedMode,
            avatar: selectedAvatar,
            onFinish: { record in
                telemetryStore.recordRun(record)
                screen = .results(lastRecord: record)
            }
        )
        screen = .playing(id: runID, session: session)
    }
}

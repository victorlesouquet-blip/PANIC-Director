import SwiftUI
import UIKit

// MARK: - Pantalla de Inicio Tipo Recreativa

@MainActor
struct StartScreenView: View {
    @Binding var initialsChars: [Character]
    @Binding var selectedMode: GameMode
    @Binding var selectedAvatar: PlayerAvatar
    let recordedCount: Int
    let uniquePlayerCount: Int
    let onStartGame: @MainActor () -> Void
    let onOpenTelemetry: @MainActor () -> Void
    let onOpenPlayers: @MainActor () -> Void

    private var startButtonBackground: Color {
        switch selectedMode {
        case .classic1985:
            return RelicarioPalette.swOldBone
        case .director2026:
            return RelicarioPalette.swVermilion
        case .hybrid1985x2026:
            return RelicarioPalette.swGold
        }
    }

    private var startButtonForeground: Color {
        selectedMode == .director2026 ? RelicarioPalette.swIvory : Color.black
    }

    var body: some View {
        ZStack {
            RelicarioPalette.swArenaBG
                .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    // Cabecera Editorial Arcade
                    VStack(spacing: 6) {
                        HStack(spacing: 8) {
                            ReliquaryEmblemView()
                                .frame(width: 22, height: 22)
                            Text("LABORATORIO DE IA · DEMO 60s")
                                .font(.caption.weight(.bold))
                                .tracking(2.0)
                                .foregroundStyle(RelicarioPalette.swGold)
                        }

                        Text("PANIC DIRECTOR")
                            .font(.system(size: 32, weight: .black, design: .monospaced))
                            .tracking(2.4)
                            .foregroundStyle(RelicarioPalette.swIvory)
                            .multilineTextAlignment(.center)

                        Text("Relicario de Ceniza y Carmesí")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.8))
                    }
                    .padding(.top, 12)

                    // Selector de 3 Iniciales del Jugador
                    VStack(spacing: 10) {
                        HStack {
                            Text("INICIALES DEL JUGADOR")
                                .font(.caption.weight(.bold))
                                .tracking(1.6)
                                .foregroundStyle(RelicarioPalette.swOldBone)
                            Spacer()
                            Text("REGISTRO RECREATIVA")
                                .font(.caption2.monospaced())
                                .foregroundStyle(RelicarioPalette.swColdSilver.opacity(0.8))
                        }

                        HStack(spacing: 14) {
                            ForEach(0..<3, id: \.self) { index in
                                ArcadeLetterWheel(letter: $initialsChars[index])
                            }
                        }
                    }
                    .padding(14)
                    .background(RelicarioPalette.swCardBG)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(RelicarioPalette.swCardBorder, lineWidth: 1.2)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                    // Selector de Avatar (12 Arquetipos sin Cursor)
                    avatarSelectionCard

                    // Selector de Motor de IA (1985 vs 2026 vs Híbrido)
                    VStack(alignment: .leading, spacing: 10) {
                        Text("SELECCIONA MOTOR DE IA")
                            .font(.caption.weight(.bold))
                            .tracking(1.6)
                            .foregroundStyle(RelicarioPalette.swOldBone)

                        ForEach(GameMode.allCases) { mode in
                            ModeSelectionCard(
                                mode: mode,
                                isSelected: selectedMode == mode,
                                onSelect: {
                                    let gen = UIImpactFeedbackGenerator(style: .light)
                                    gen.impactOccurred()
                                    selectedMode = mode
                                }
                            )
                        }
                    }

                    // Botón Principal de Inicio
                    Button(action: {
                        let gen = UIImpactFeedbackGenerator(style: .medium)
                        gen.impactOccurred()
                        MainActor.assumeIsolated {
                            onStartGame()
                        }
                    }) {
                        HStack(spacing: 10) {
                            Image(systemName: "play.fill")
                                .font(.headline)
                            Text("INICIAR PARTIDA (60s)")
                                .font(.headline.monospaced().weight(.heavy))
                                .tracking(1.2)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(startButtonBackground)
                        .foregroundStyle(startButtonForeground)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)

                    // Accesos directos: Telemetría de Clase y Directorio/Ránking de Jugadores
                    HStack(spacing: 10) {
                        Button(action: {
                            MainActor.assumeIsolated {
                                onOpenTelemetry()
                            }
                        }) {
                            HStack(spacing: 6) {
                                Image(systemName: "chart.bar.xaxis")
                                    .font(.subheadline)
                                Text("Telemetría (\(recordedCount))")
                                    .font(.caption.monospaced().weight(.bold))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .padding(.horizontal, 8)
                            .background(RelicarioPalette.swCardBG)
                            .foregroundStyle(RelicarioPalette.swColdSilver)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(RelicarioPalette.swColdSilver.opacity(0.35), lineWidth: 1.0)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)

                        Button(action: {
                            MainActor.assumeIsolated {
                                onOpenPlayers()
                            }
                        }) {
                            HStack(spacing: 6) {
                                Image(systemName: "trophy.fill")
                                    .font(.subheadline)
                                Text("Jugadores (\(uniquePlayerCount))")
                                    .font(.caption.monospaced().weight(.bold))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .padding(.horizontal, 8)
                            .background(RelicarioPalette.swCardBG)
                            .foregroundStyle(RelicarioPalette.swGold)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(RelicarioPalette.swGold.opacity(0.42), lineWidth: 1.0)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.bottom, 20)
                }
                .padding(.horizontal, 18)
            }
        }
    }

    private var avatarSelectionCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("ELIGE TU AVATAR")
                    .font(.caption.weight(.bold))
                    .tracking(1.6)
                    .foregroundStyle(RelicarioPalette.swOldBone)
                Spacer()
                Text("12 ARQUETIPOS")
                    .font(.caption2.monospaced())
                    .foregroundStyle(RelicarioPalette.swGold.opacity(0.85))
            }

            // Vista previa destacada del avatar seleccionado
            HStack(spacing: 12) {
                AvatarPortraitView(avatar: selectedAvatar, size: 46)
                    .overlay(
                        Circle()
                            .stroke(selectedAvatar.auraSwiftColor.opacity(0.75), lineWidth: 1.4)
                    )

                VStack(alignment: .leading, spacing: 2) {
                    Text(selectedAvatar.displayName.uppercased())
                        .font(.subheadline.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swIvory)
                    Text(selectedAvatar.roleSubtitle)
                        .font(.caption)
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.85))
                        .lineLimit(2)
                }

                Spacer()
            }
            .padding(10)
            .background(Color.black.opacity(0.34))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(selectedAvatar.auraSwiftColor.opacity(0.42), lineWidth: 1.0)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))

            // Rejilla 4×3 con los 12 avatares jugables
            let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 4)
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(PlayerAvatar.allCases) { avatar in
                    let isSelected = selectedAvatar == avatar
                    Button {
                        let gen = UIImpactFeedbackGenerator(style: .light)
                        gen.impactOccurred(intensity: 0.75)
                        selectedAvatar = avatar
                    } label: {
                        VStack(spacing: 4) {
                            AvatarPortraitView(avatar: avatar, size: 34, showAuraRing: isSelected)
                            Text(avatar.shortLabel)
                                .font(.system(size: 10, weight: isSelected ? .black : .semibold, design: .monospaced))
                                .foregroundStyle(isSelected ? RelicarioPalette.swIvory : RelicarioPalette.swOldBone.opacity(0.82))
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 4)
                        .background(isSelected ? avatar.auraSwiftColor.opacity(0.16) : Color.black.opacity(0.30))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(isSelected ? avatar.auraSwiftColor : RelicarioPalette.swCardBorder, lineWidth: isSelected ? 1.6 : 1.0)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .background(RelicarioPalette.swCardBG)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(RelicarioPalette.swCardBorder, lineWidth: 1.2)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

@MainActor
private struct ArcadeLetterWheel: View {
    @Binding var letter: Character
    private let alphabet: [Character] = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

    var body: some View {
        VStack(spacing: 5) {
            Button(action: { step(by: 1) }) {
                Image(systemName: "chevron.up")
                    .font(.caption.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.05))
                    .foregroundStyle(RelicarioPalette.swGold)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            Text(String(letter))
                .font(.system(size: 28, weight: .black, design: .monospaced))
                .foregroundStyle(RelicarioPalette.swIvory)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 5)
                .background(Color.black.opacity(0.45))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(RelicarioPalette.swGold.opacity(0.55), lineWidth: 1.2)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .onTapGesture { step(by: 1) }

            Button(action: { step(by: -1) }) {
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.05))
                    .foregroundStyle(RelicarioPalette.swGold)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
        }
    }

    private func step(by delta: Int) {
        let currentIndex = alphabet.firstIndex(of: letter) ?? 0
        let nextIndex = (currentIndex + delta + alphabet.count) % alphabet.count
        letter = alphabet[nextIndex]
        let gen = UIImpactFeedbackGenerator(style: .light)
        gen.impactOccurred(intensity: 0.65)
    }
}

@MainActor
private struct ModeSelectionCard: View {
    let mode: GameMode
    let isSelected: Bool
    let onSelect: @MainActor () -> Void

    var body: some View {
        Button(action: {
            MainActor.assumeIsolated {
                onSelect()
            }
        }) {
            HStack(alignment: .top, spacing: 12) {
                Circle()
                    .strokeBorder(isSelected ? mode.accentColor : Color.white.opacity(0.25), lineWidth: 2)
                    .background(Circle().fill(isSelected ? mode.accentColor : Color.clear).padding(4))
                    .frame(width: 22, height: 22)
                    .padding(.top, 2)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(mode.displayTitle)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(RelicarioPalette.swIvory)
                            .lineLimit(1)
                            .minimumScaleFactor(0.78)
                        Spacer(minLength: 4)
                        Text(mode.shortBadge)
                            .font(.caption2.monospaced().weight(.bold))
                            .lineLimit(1)
                            .fixedSize()
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(mode.accentColor.opacity(0.18))
                            .foregroundStyle(mode.accentColor)
                            .clipShape(Capsule())
                    }
                    Text(mode.subtitle)
                        .font(.caption)
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.85))
                        .multilineTextAlignment(.leading)
                }
            }
            .padding(13)
            .background(isSelected ? mode.accentColor.opacity(0.10) : RelicarioPalette.swCardBG)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? mode.accentColor : RelicarioPalette.swCardBorder, lineWidth: isSelected ? 1.8 : 1.0)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Vista Vectorial Procedural del Avatar (SwiftUI Canvas)

@MainActor
struct AvatarPortraitView: View {
    let avatar: PlayerAvatar
    let size: CGFloat
    var showAuraRing: Bool = true

    var body: some View {
        let layers = AvatarDesignCatalog.layers(for: avatar)
        ZStack {
            if showAuraRing {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [avatar.auraSwiftColor.opacity(0.28), RelicarioPalette.swArenaBG.opacity(0.92)],
                            center: .center,
                            startRadius: 1,
                            endRadius: size * 0.56
                        )
                    )
            }

            Canvas { ctx, canvasSize in
                let scale = min(canvasSize.width, canvasSize.height) / 36.0
                let transform = CGAffineTransform(scaleX: scale, y: -scale)
                    .concatenating(CGAffineTransform(translationX: canvasSize.width * 0.5, y: canvasSize.height * 0.5))

                for part in layers {
                    let transformedPath = Path(part.path).applying(transform)
                    ctx.fill(transformedPath, with: .color(Color(uiColor: part.fillColor)))
                    if part.lineWidth > 0 && part.strokeColor != .clear {
                        let strokeWidth = max(0.75, part.lineWidth * scale * 0.85)
                        ctx.stroke(
                            transformedPath,
                            with: .color(Color(uiColor: part.strokeColor)),
                            style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round, lineJoin: .miter)
                        )
                    }
                }
            }
        }
        .frame(width: size, height: size)
    }
}

private struct ReliquaryEmblemView: View {
    var body: some View {
        Canvas { ctx, size in
            let midX = size.width * 0.5
            let midY = size.height * 0.5
            var diamond = Path()
            diamond.move(to: CGPoint(x: midX, y: 1))
            diamond.addLine(to: CGPoint(x: size.width - 1, y: midY))
            diamond.addLine(to: CGPoint(x: midX, y: size.height - 1))
            diamond.addLine(to: CGPoint(x: 1, y: midY))
            diamond.closeSubpath()
            ctx.stroke(diamond, with: .color(RelicarioPalette.swVermilion), lineWidth: 1.8)

            let inner = Path(ellipseIn: CGRect(x: midX - 3, y: midY - 4.5, width: 6, height: 9))
            ctx.fill(inner, with: .color(RelicarioPalette.swGold))
        }
    }
}

// MARK: - Vista en Partida + HUD Reactivo en Español

@MainActor
struct GamePlayView: View {
    let viewModel: GameSessionViewModel
    @State private var showTouchHint = true

    var body: some View {
        ZStack {
            GeometryReader { fullProxy in
                SpriteKitHostView(scene: viewModel.scene)
                    .onAppear {
                        viewModel.updateSafeMargins(
                            top: fullProxy.safeAreaInsets.top,
                            bottom: fullProxy.safeAreaInsets.bottom
                        )
                    }
                    .onChange(of: fullProxy.safeAreaInsets) { _, newInsets in
                        viewModel.updateSafeMargins(top: newInsets.top, bottom: newInsets.bottom)
                    }
            }
            .ignoresSafeArea()

            // Capa HUD superior
            VStack(spacing: 8) {
                topHUDHeader
                stressDirectorPanel
                Spacer()

                if showTouchHint {
                    Text("Arrastra el pulgar donde quieras · Disparo automático")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.62))
                        .foregroundStyle(RelicarioPalette.swColdSilver)
                        .clipShape(Capsule())
                        .padding(.bottom, 16)
                        .allowsHitTesting(false)
                        .transition(.opacity)
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 6)

            // Superposición de Pausa
            if viewModel.isPaused {
                pauseOverlay
            }
        }
        .task {
            try? await Task.sleep(for: .seconds(4))
            withAnimation(.easeOut(duration: 0.6)) {
                showTouchHint = false
            }
        }
    }

    private var topHUDHeader: some View {
        HStack(spacing: 4) {
            // Avatar + Vida + Iniciales + Modo
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    AvatarPortraitView(avatar: viewModel.avatar, size: 22)
                    Text(viewModel.initials)
                        .font(.caption.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swIvory)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text("NV.\(viewModel.snapshot.playerLevel)")
                        .font(.caption2.monospaced().weight(.black))
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(RelicarioPalette.swGold.opacity(0.22))
                        .foregroundStyle(RelicarioPalette.swGold)
                        .clipShape(Capsule())
                    Text(viewModel.mode.shortBadge)
                        .font(.caption2.monospaced().weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(viewModel.mode.accentColor.opacity(0.22))
                        .foregroundStyle(viewModel.mode.accentColor)
                        .clipShape(Capsule())
                }

                // Barra de vida
                HStack(spacing: 6) {
                    GeometryReader { geo in
                        let ratio = CGFloat(viewModel.snapshot.hp) / CGFloat(max(1, viewModel.snapshot.maxHP))
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.white.opacity(0.12))
                            RoundedRectangle(cornerRadius: 4)
                                .fill(ratio <= 0.30 ? RelicarioPalette.swVermilion : RelicarioPalette.swGraceJade)
                                .frame(width: max(0, geo.size.width * ratio))
                                .animation(.easeOut(duration: 0.12), value: viewModel.snapshot.hp)
                        }
                    }
                    .frame(width: 80, height: 9)

                    Text("\(viewModel.snapshot.hp)")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(viewModel.snapshot.hp <= 30 ? RelicarioPalette.swVermilion : RelicarioPalette.swIvory)
                }
            }
            .allowsHitTesting(false)

            Spacer(minLength: 4)

            // Temporizador cuenta atrás (60s)
            VStack(spacing: 1) {
                Text("TIEMPO")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.75))
                Text(formattedTimer)
                    .font(.system(size: 24, weight: .black, design: .monospaced))
                    .monospacedDigit()
                    .foregroundStyle(viewModel.snapshot.timeRemaining <= 10 ? RelicarioPalette.swVermilion : RelicarioPalette.swIvory)
            }
            .layoutPriority(1)
            .allowsHitTesting(false)

            Spacer(minLength: 4)

            // Contador de bajas + Botón Pausa
            HStack(spacing: 6) {
                VStack(alignment: .trailing, spacing: 1) {
                    Text("BAJAS")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.75))
                    Text("\(viewModel.snapshot.kills)")
                        .font(.headline.monospacedDigit().weight(.black))
                        .foregroundStyle(RelicarioPalette.swIvory)
                }
                .fixedSize()
                .allowsHitTesting(false)

                Button(action: { viewModel.togglePause() }) {
                    Image(systemName: viewModel.isPaused ? "play.fill" : "pause.fill")
                        .font(.caption.weight(.bold))
                        .frame(width: 32, height: 32)
                        .background(Color.black.opacity(0.55))
                        .foregroundStyle(RelicarioPalette.swIvory)
                        .overlay(Circle().stroke(Color.white.opacity(0.22), lineWidth: 1))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.62))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                )
                .allowsHitTesting(false)
        }
    }

    private var stressDirectorPanel: some View {
        let stress = Int(viewModel.snapshot.stressIndex.rounded())
        let tier = viewModel.snapshot.stressTier

        return VStack(spacing: 6) {
            HStack(spacing: 8) {
                Text("ÍNDICE DE ESTRÉS")
                    .font(.caption2.monospaced().weight(.bold))
                    .foregroundStyle(RelicarioPalette.swOldBone)

                Text(tier.label)
                    .font(.caption2.monospaced().weight(.black))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(tier.color.opacity(0.20))
                    .foregroundStyle(tier.color)
                    .clipShape(Capsule())

                Spacer()

                Text("\(stress) %")
                    .font(.subheadline.monospacedDigit().weight(.black))
                    .foregroundStyle(tier.color)
            }

            GeometryReader { geo in
                let ratio = CGFloat(min(100, max(0, viewModel.snapshot.stressIndex))) / 100.0
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.white.opacity(0.10))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(tier.color)
                        .frame(width: max(4, geo.size.width * ratio))
                        .animation(.easeOut(duration: 0.10), value: stress)
                }
            }
            .frame(height: 7)

            HStack(spacing: 6) {
                Circle()
                    .fill(viewModel.mode == .classic1985 ? RelicarioPalette.swOldBone.opacity(0.6) : tier.color)
                    .frame(width: 7, height: 7)
                Text(viewModel.snapshot.directorMessage)
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(RelicarioPalette.swIvory)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer()
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.66))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(
                    viewModel.snapshot.isInterventionActive ? tier.color.opacity(0.55) : Color.white.opacity(0.12),
                    lineWidth: viewModel.snapshot.isInterventionActive ? 1.4 : 1.0
                )
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .allowsHitTesting(false)
    }

    private var pauseOverlay: some View {
        ZStack {
            Color.black.opacity(0.72)
                .ignoresSafeArea()

            VStack(spacing: 14) {
                Text("EXPERIMENTO EN PAUSA")
                    .font(.title3.monospaced().weight(.black))
                    .foregroundStyle(RelicarioPalette.swIvory)

                HStack(spacing: 8) {
                    AvatarPortraitView(avatar: viewModel.avatar, size: 24)
                    Text("\(viewModel.initials) · \(viewModel.avatar.displayName) · \(viewModel.mode.displayTitle)")
                        .font(.caption)
                        .foregroundStyle(RelicarioPalette.swOldBone)
                        .multilineTextAlignment(.center)
                }

                Button(action: { viewModel.togglePause() }) {
                    Text("REANUDAR")
                        .font(.headline.monospaced().weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(RelicarioPalette.swGraceJade)
                        .foregroundStyle(Color.black)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)

                Button(action: { viewModel.abortRun() }) {
                    Text("FINALIZAR Y REGISTRAR")
                        .font(.subheadline.monospaced().weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(RelicarioPalette.swVermilion.opacity(0.22))
                        .foregroundStyle(RelicarioPalette.swVermilion)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(RelicarioPalette.swVermilion.opacity(0.6), lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
            .padding(20)
            .frame(maxWidth: 310)
            .background(RelicarioPalette.swCardBG)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(RelicarioPalette.swCardBorder, lineWidth: 1.4)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    private var formattedTimer: String {
        let t = max(0, viewModel.snapshot.timeRemaining)
        if t < 9.95 {
            return String(format: "%.1fs", t)
        }
        return "\(Int(ceil(t)))s"
    }
}

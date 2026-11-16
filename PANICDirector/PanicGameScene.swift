import Foundation
import Observation
import SpriteKit
import SwiftUI
import UIKit

// MARK: - ViewModel de Sesión Activa (Puente SwiftUI <-> SpriteKit)

struct GameHUDSnapshot: Sendable {
    var timeRemaining: TimeInterval = 60.0
    var hp: Int = 100
    var maxHP: Int = 100
    var kills: Int = 0
    var playerLevel: Int = 1
    var stressIndex: Double = 18.0
    var stressTier: StressTier = .bajo
    var directorMessage: String = "Calibrando arena..."
    var isInterventionActive: Bool = false
    var medkitsCollected: Int = 0
}

@Observable
@MainActor
final class GameSessionViewModel {
    var snapshot = GameHUDSnapshot()
    var isPaused = false

    let initials: String
    let mode: GameMode
    let avatar: PlayerAvatar
    let scene: PanicGameScene
    private let onFinish: @MainActor (RunTelemetryRecord) -> Void

    init(
        initials: String,
        mode: GameMode,
        avatar: PlayerAvatar = .penitente,
        onFinish: @escaping @MainActor (RunTelemetryRecord) -> Void
    ) {
        self.initials = initials
        self.mode = mode
        self.avatar = avatar
        self.onFinish = onFinish

        let createdScene = PanicGameScene(
            mode: mode,
            initials: initials,
            avatar: avatar,
            safeTop: 59,
            safeBottom: 34
        )
        createdScene.scaleMode = .resizeFill
        self.scene = createdScene

        switch mode {
        case .classic1985:
            self.snapshot.directorMessage = "Regla fija [0-12s] → Asedio inicial"
        case .director2026:
            self.snapshot.directorMessage = "IA activa → Leyendo estrés"
        case .hybrid1985x2026:
            self.snapshot.directorMessage = "Mix 85×26 → Reloj fijo + IA"
        }

        createdScene.onSnapshotUpdate = { [weak self] snap in
            self?.snapshot = snap
        }
        createdScene.onRunCompleted = { [weak self] record in
            self?.onFinish(record)
        }
    }

    func updateSafeMargins(top: CGFloat, bottom: CGFloat) {
        scene.updateSafeMargins(top: top, bottom: bottom)
    }

    func togglePause() {
        isPaused.toggle()
        scene.setUserPaused(isPaused)
    }

    func abortRun() {
        scene.forceAbort()
    }
}

// MARK: - Contenedor UIViewRepresentable (Latencia mínima táctil + ProMotion 120 Hz)

struct SpriteKitHostView: UIViewRepresentable {
    let scene: PanicGameScene

    func makeUIView(context: Context) -> SKView {
        let skView = SKView()
        skView.ignoresSiblingOrder = true
        skView.preferredFramesPerSecond = 120
        skView.isMultipleTouchEnabled = false
        skView.backgroundColor = RelicarioPalette.arenaBG
        skView.presentScene(scene)
        return skView
    }

    func updateUIView(_ uiView: SKView, context: Context) {
        if uiView.scene !== scene {
            uiView.presentScene(scene)
        }
    }

    static func dismantleUIView(_ uiView: SKView, coordinator: ()) {
        uiView.presentScene(nil)
    }
}

// MARK: - Escena Principal SpriteKit

final class PanicGameScene: SKScene {
    // Callbacks hacia SwiftUI (@MainActor)
    var onSnapshotUpdate: (@MainActor @Sendable (GameHUDSnapshot) -> Void)?
    var onRunCompleted: (@MainActor @Sendable (RunTelemetryRecord) -> Void)?

    private let mode: GameMode
    private let initials: String
    private let avatar: PlayerAvatar
    private var safeTopInset: CGFloat
    private var safeBottomInset: CGFloat

    // Recursos 100 % procedurales
    private lazy var textures = ProceduralTextureCache()
    private lazy var sharedPaths = SharedCreaturePaths()

    // Capas de escena
    private let arenaLayer = SKNode()
    private let worldLayer = SKNode()
    private let uiCanvasLayer = SKNode()
    private let panicVignette = SKShapeNode()

    // Joystick flotante táctil
    private let joystickRing = SKShapeNode(circleOfRadius: 46)
    private let joystickKnob = SKShapeNode(circleOfRadius: 18)
    private weak var activeTouch: UITouch?
    private var joystickOrigin: CGPoint = .zero
    private var moveInput: CGVector = .zero

    // Estado del jugador y progresión de XP
    private var playerAvatarNode: PlayerAvatarVisualNode?
    private var playerNode = SKNode()
    private var playerXPBar = PlayerXPBarNode()
    private var playerPos: CGPoint = .zero
    private var playerVelocity: CGVector = .zero
    private var playerHP: Int = 100
    private let playerMaxHP: Int = 100
    private var invulnerabilityTimer: TimeInterval = 0
    private var fireTimer: TimeInterval = 0
    private let basePlayerSpeed: CGFloat = 208.0
    private var playerLevel: Int = 1
    private var currentXP: Int = 0
    private var xpToNextLevel: Int = 55

    // Motores de IA y estrés
    private let stressTracker = StressMetricsTracker()
    private lazy var waveDirector: any WaveDirectorProtocol = {
        switch mode {
        case .classic1985:
            return Classic1985Engine()
        case .director2026:
            return Adaptive2026Director()
        case .hybrid1985x2026:
            return HybridMixDirector()
        }
    }()
    private var previousStressTier: StressTier = .bajo
    private var lastDirective: WaveDirective?

    // Entidades activas
    private var enemies: [EnemyEntity] = []
    private var projectiles: [ProjectileEntity] = []
    private var enemyProjectiles: [EnemyProjectileEntity] = []
    private var medkits: [MedkitEntity] = []

    // Tiempos y contadores
    private let totalRunDuration: TimeInterval = 60.0
    private var elapsedTime: TimeInterval = 0.0
    private var spawnTimer: TimeInterval = 0.45
    private var hudPublishTimer: TimeInterval = 0.0
    private var lastUpdateTime: TimeInterval?
    private var kills: Int = 0
    private var medkitsCollected: Int = 0
    private var justTookDamageFlag = false
    private var isUserPaused = false
    private var hasEnded = false
    private var isSetupComplete = false

    // MARK: - Modelos Internos de Entidades

    private enum StalkerPhase {
        case stalking(cooldown: TimeInterval)
        case telegraphing(remaining: TimeInterval, angle: CGFloat)
        case lunging(remaining: TimeInterval, velocity: CGVector, trailTimer: TimeInterval)
        case recovering(remaining: TimeInterval)
    }

    private final class EnemyEntity {
        let id = UUID()
        let archetype: EnemyArchetype
        let node: SKNode
        var hp: Int
        let maxHP: Int
        let baseSpeed: CGFloat
        let hitRadius: CGFloat
        let contactDamage: Int
        var age: TimeInterval = 0
        let phaseOffset: CGFloat = CGFloat.random(in: 0...(CGFloat.pi * 2.0))
        var abilityCooldown: TimeInterval
        var abilityActiveTimer: TimeInterval = 0
        var isSpitTelegraphing: Bool = false
        var comboDashUsed: Bool = false
        var stalkerPhase: StalkerPhase = .stalking(cooldown: TimeInterval.random(in: 1.4...2.2))

        init(
            archetype: EnemyArchetype,
            node: SKNode,
            hp: Int,
            baseSpeed: CGFloat,
            hitRadius: CGFloat,
            contactDamage: Int,
            abilityCooldown: TimeInterval
        ) {
            self.archetype = archetype
            self.node = node
            self.hp = hp
            self.maxHP = hp
            self.baseSpeed = baseSpeed
            self.hitRadius = hitRadius
            self.contactDamage = contactDamage
            self.abilityCooldown = abilityCooldown
        }
    }

    private final class ProjectileEntity {
        let node: SKShapeNode
        var velocity: CGVector
        var remainingLife: TimeInterval
        let damage: Int

        init(node: SKShapeNode, velocity: CGVector, remainingLife: TimeInterval, damage: Int) {
            self.node = node
            self.velocity = velocity
            self.remainingLife = remainingLife
            self.damage = damage
        }
    }

    private final class EnemyProjectileEntity {
        let node: SKShapeNode
        var velocity: CGVector
        var remainingLife: TimeInterval
        let damage: Int

        init(node: SKShapeNode, velocity: CGVector, remainingLife: TimeInterval, damage: Int) {
            self.node = node
            self.velocity = velocity
            self.remainingLife = remainingLife
            self.damage = damage
        }
    }

    private final class MedkitEntity {
        let node: SKNode
        var age: TimeInterval = 0

        init(node: SKNode) {
            self.node = node
        }
    }

    // MARK: - Inicialización y Ciclo de Escena

    init(mode: GameMode, initials: String, avatar: PlayerAvatar, safeTop: CGFloat, safeBottom: CGFloat) {
        self.mode = mode
        self.initials = initials
        self.avatar = avatar
        self.safeTopInset = safeTop
        self.safeBottomInset = safeBottom
        super.init(size: CGSize(width: 390, height: 844))
        backgroundColor = RelicarioPalette.arenaBG
    }

    @available(*, unavailable)
    required init?(coder aDecoder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func updateSafeMargins(top: CGFloat, bottom: CGFloat) {
        let uiTop = view?.safeAreaInsets.top ?? 0
        let uiBottom = view?.safeAreaInsets.bottom ?? 0
        safeTopInset = max(top, uiTop)
        safeBottomInset = max(bottom, uiBottom)
        guard isSetupComplete else { return }
        let bounds = playableBounds()
        playerPos.x = min(max(playerPos.x, bounds.minX), bounds.maxX)
        playerPos.y = min(max(playerPos.y, bounds.minY), bounds.maxY)
        playerNode.position = playerPos
        playerXPBar.position = CGPoint(x: playerPos.x, y: playerPos.y + 31)
    }

    func setUserPaused(_ paused: Bool) {
        isUserPaused = paused
        self.isPaused = paused
        if paused {
            releaseJoystick()
        } else {
            lastUpdateTime = nil
        }
    }

    func forceAbort() {
        guard !hasEnded else { return }
        finishRun(didSurvive: false)
    }

    override func didMove(to view: SKView) {
        guard !isSetupComplete else { return }
        isSetupComplete = true

        if view.safeAreaInsets.top > 0 {
            safeTopInset = view.safeAreaInsets.top
        }
        if view.safeAreaInsets.bottom > 0 {
            safeBottomInset = view.safeAreaInsets.bottom
        }

        _ = textures
        _ = sharedPaths

        arenaLayer.zPosition = -10
        worldLayer.zPosition = 0
        uiCanvasLayer.zPosition = 30

        addChild(arenaLayer)
        addChild(worldLayer)
        addChild(uiCanvasLayer)

        setupJoystickNodes()
        setupPanicVignette()
        rebuildArenaBackdrop()

        let avatarVisual = PlayerAvatarVisualNode(avatar: avatar, textures: textures)
        avatarVisual.zPosition = 4
        worldLayer.addChild(avatarVisual)
        playerAvatarNode = avatarVisual
        playerNode = avatarVisual

        let bounds = playableBounds()
        playerPos = CGPoint(x: bounds.midX, y: bounds.midY)
        playerNode.position = playerPos

        playerXPBar.zPosition = 8.0
        playerXPBar.position = CGPoint(x: playerPos.x, y: playerPos.y + 31)
        playerXPBar.updateXP(progress: 0.0, level: playerLevel)
        worldLayer.addChild(playerXPBar)

        stressTracker.reset()
        waveDirector.reset()

        MainActor.assumeIsolated {
            HapticManager.shared.prepareAll()
        }
    }

    override func didChangeSize(_ oldSize: CGSize) {
        super.didChangeSize(oldSize)
        guard isSetupComplete, size.width > 10, size.height > 10 else { return }
        rebuildArenaBackdrop()
        updatePanicVignetteGeometry()
        let bounds = playableBounds()
        if elapsedTime < 0.05 {
            playerPos = CGPoint(x: bounds.midX, y: bounds.midY)
            playerNode.position = playerPos
        } else {
            playerPos.x = min(max(playerPos.x, bounds.minX), bounds.maxX)
            playerPos.y = min(max(playerPos.y, bounds.minY), bounds.maxY)
            playerNode.position = playerPos
        }
        playerXPBar.position = CGPoint(x: playerPos.x, y: playerPos.y + 31)
    }

    // MARK: - Geometría de Arena y Joystick

    private func playableBounds() -> CGRect {
        let topMargin = max(194, safeTopInset + 192)
        let bottomMargin = max(28, safeBottomInset + 16)
        let sideMargin: CGFloat = 18
        let w = max(120, size.width - sideMargin * 2)
        let h = max(160, size.height - topMargin - bottomMargin)
        return CGRect(x: sideMargin, y: bottomMargin, width: w, height: h)
    }

    private func rebuildArenaBackdrop() {
        arenaLayer.removeAllChildren()
        guard size.width > 0, size.height > 0 else { return }

        // Retícula sutil de losas basálticas
        let gridPath = CGMutablePath()
        let step: CGFloat = 56
        var x: CGFloat = step
        while x < size.width {
            gridPath.move(to: CGPoint(x: x, y: 0))
            gridPath.addLine(to: CGPoint(x: x, y: size.height))
            x += step
        }
        var y: CGFloat = step
        while y < size.height {
            gridPath.move(to: CGPoint(x: 0, y: y))
            gridPath.addLine(to: CGPoint(x: size.width, y: y))
            y += step
        }
        let gridNode = SKShapeNode(path: gridPath)
        gridNode.strokeColor = RelicarioPalette.basaltSlab
        gridNode.lineWidth = 1.0
        arenaLayer.addChild(gridNode)

        // Sello geométrico central del Relicario
        let center = CGPoint(x: size.width * 0.5, y: size.height * 0.46)
        let outerCircle = SKShapeNode(circleOfRadius: min(size.width, size.height) * 0.34)
        outerCircle.position = center
        outerCircle.fillColor = .clear
        outerCircle.strokeColor = RelicarioPalette.ritualSeal
        outerCircle.lineWidth = 1.5
        arenaLayer.addChild(outerCircle)

        let innerDiamond = CGMutablePath()
        let r = min(size.width, size.height) * 0.24
        innerDiamond.move(to: CGPoint(x: center.x, y: center.y + r))
        innerDiamond.addLine(to: CGPoint(x: center.x + r, y: center.y))
        innerDiamond.addLine(to: CGPoint(x: center.x, y: center.y - r))
        innerDiamond.addLine(to: CGPoint(x: center.x - r, y: center.y))
        innerDiamond.closeSubpath()
        let sealShape = SKShapeNode(path: innerDiamond)
        sealShape.fillColor = .clear
        sealShape.strokeColor = RelicarioPalette.ritualSeal
        sealShape.lineWidth = 1.2
        arenaLayer.addChild(sealShape)
    }

    private func setupJoystickNodes() {
        joystickRing.fillColor = RelicarioPalette.voidBlack.withAlphaComponent(0.32)
        joystickRing.strokeColor = RelicarioPalette.coldSilver.withAlphaComponent(0.65)
        joystickRing.lineWidth = 1.8
        joystickRing.alpha = 0
        uiCanvasLayer.addChild(joystickRing)

        joystickKnob.fillColor = RelicarioPalette.coldSilver.withAlphaComponent(0.45)
        joystickKnob.strokeColor = RelicarioPalette.ivory.withAlphaComponent(0.85)
        joystickKnob.lineWidth = 1.4
        joystickKnob.alpha = 0
        uiCanvasLayer.addChild(joystickKnob)
    }

    private func setupPanicVignette() {
        panicVignette.fillColor = .clear
        panicVignette.strokeColor = RelicarioPalette.vermilion
        panicVignette.lineWidth = 14
        panicVignette.alpha = 0.0
        panicVignette.blendMode = .add
        uiCanvasLayer.addChild(panicVignette)
        updatePanicVignetteGeometry()
    }

    private func updatePanicVignetteGeometry() {
        guard size.width > 0, size.height > 0 else { return }
        panicVignette.path = CGPath(rect: CGRect(origin: .zero, size: size), transform: nil)
    }

    // MARK: - Control Táctil (Joystick Flotante)

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard !hasEnded, !isUserPaused, activeTouch == nil, let touch = touches.first else { return }
        activeTouch = touch
        let loc = touch.location(in: self)
        joystickOrigin = loc
        joystickRing.position = loc
        joystickKnob.position = loc
        joystickRing.removeAllActions()
        joystickKnob.removeAllActions()
        joystickRing.alpha = 0.85
        joystickKnob.alpha = 0.92
        moveInput = .zero
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let active = activeTouch, touches.contains(active) else { return }
        let loc = active.location(in: self)
        let dx = loc.x - joystickOrigin.x
        let dy = loc.y - joystickOrigin.y
        let dist = hypot(dx, dy)
        let maxR: CGFloat = 46.0

        if dist < 4.5 {
            joystickKnob.position = joystickOrigin
            moveInput = .zero
            return
        }

        let clamped = min(dist, maxR)
        let nx = dx / dist
        let ny = dy / dist
        joystickKnob.position = CGPoint(x: joystickOrigin.x + nx * clamped, y: joystickOrigin.y + ny * clamped)
        let throttle = clamped / maxR
        moveInput = CGVector(dx: nx * throttle, dy: ny * throttle)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let active = activeTouch, touches.contains(active) else { return }
        releaseJoystick()
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let active = activeTouch, touches.contains(active) else { return }
        releaseJoystick()
    }

    private func releaseJoystick() {
        activeTouch = nil
        moveInput = .zero
        joystickRing.run(SKAction.fadeAlpha(to: 0.0, duration: 0.14))
        joystickKnob.run(SKAction.fadeAlpha(to: 0.0, duration: 0.14))
    }

    // MARK: - Bucle Principal (60/120 Hz)

    override func update(_ currentTime: TimeInterval) {
        guard !hasEnded, !isUserPaused else { return }

        let rawDt: TimeInterval
        if let last = lastUpdateTime {
            rawDt = currentTime - last
        } else {
            rawDt = 1.0 / 60.0
        }
        lastUpdateTime = currentTime
        let dt = min(max(rawDt, 0.0), 1.0 / 24.0)

        elapsedTime += dt
        if elapsedTime >= totalRunDuration {
            elapsedTime = totalRunDuration
            finishRun(didSurvive: true)
            return
        }

        if invulnerabilityTimer > 0 {
            invulnerabilityTimer = max(0, invulnerabilityTimer - dt)
            playerNode.alpha = (Int(invulnerabilityTimer * 22) % 2 == 0) ? 0.38 : 1.0
        } else {
            playerNode.alpha = 1.0
        }

        // 1. Movimiento del jugador (escala agilidad con el nivel)
        let bounds = playableBounds()
        let speedBonus: CGFloat = 1.0 + min(0.30, CGFloat(playerLevel - 1) * 0.05)
        let effectiveSpeed = basePlayerSpeed * speedBonus
        playerVelocity = CGVector(dx: moveInput.dx * effectiveSpeed, dy: moveInput.dy * effectiveSpeed)
        playerPos.x = min(max(playerPos.x + playerVelocity.dx * CGFloat(dt), bounds.minX), bounds.maxX)
        playerPos.y = min(max(playerPos.y + playerVelocity.dy * CGFloat(dt), bounds.minY), bounds.maxY)
        playerNode.position = playerPos
        playerXPBar.position = CGPoint(x: playerPos.x, y: playerPos.y + 31)

        // 2. Medición espacial y actualización del Índice de Estrés en vivo
        var nearestDist: CGFloat = 999
        var dangerCount = 0
        var panicCount = 0
        for enemy in enemies {
            let d = hypot(enemy.node.position.x - playerPos.x, enemy.node.position.y - playerPos.y)
            nearestDist = min(nearestDist, d)
            if d < 120 { dangerCount += 1 }
            if d < 68 { panicCount += 1 }
        }

        let stressValue = stressTracker.update(with: StressSampleInput(
            dt: dt,
            moveVector: moveInput,
            playerHPNormalized: Double(playerHP) / Double(playerMaxHP),
            nearestEnemyDistance: nearestDist,
            enemiesInsideDangerRing: dangerCount,
            enemiesInsidePanicRing: panicCount,
            justTookDamage: justTookDamageFlag
        ))
        justTookDamageFlag = false

        let newTier = StressTier.from(index: stressValue)
        if newTier > previousStressTier {
            MainActor.assumeIsolated {
                HapticManager.shared.triggerStressTierUp(to: newTier)
            }
        }
        previousStressTier = newTier

        // 3. Evaluación del motor de IA (1985 vs 2026 vs Híbrido)
        let directive = waveDirector.evaluate(input: WaveDirectorInput(
            dt: dt,
            elapsedTime: elapsedTime,
            stressIndex: stressValue,
            stressTier: newTier,
            playerHPNormalized: Double(playerHP) / Double(playerMaxHP),
            playerVelocity: playerVelocity,
            activeEnemyCount: enemies.count,
            activeMedkitCount: medkits.count
        ))
        lastDirective = directive

        if directive.spawnEmergencyMedkit {
            spawnMedkit(biasAhead: directive.medkitBiasAhead, bounds: bounds)
        }

        // 4. Aparición de criaturas según directiva
        spawnTimer -= dt
        if spawnTimer <= 0 && enemies.count < directive.maxActiveEnemies {
            spawnEnemy(using: directive, bounds: bounds)
            spawnTimer = directive.spawnInterval
        }

        // 5. Auto-disparo al enemigo más cercano y animación del avatar
        let aimAngle = updateAutoFire(dt: dt)
        playerAvatarNode?.updateMotionAndAim(velocity: playerVelocity, aimAngle: aimAngle, dt: dt)

        // 6. Simulación de proyectiles, criaturas, proyectiles hostiles, colisiones y curas
        updateProjectiles(dt: dt, bounds: bounds)
        updateEnemies(dt: dt, directive: directive, bounds: bounds)
        guard !hasEnded else { return }
        updateEnemyProjectiles(dt: dt, bounds: bounds)
        guard !hasEnded else { return }
        updateMedkits(dt: dt)

        // Vigneta de pánico reactiva en bordes
        if stressValue >= 72 || playerHP <= 30 {
            let pulse = 0.20 + 0.16 * sin(elapsedTime * 7.5)
            panicVignette.alpha = CGFloat(pulse)
        } else {
            panicVignette.alpha = max(0, panicVignette.alpha - CGFloat(dt * 1.5))
        }

        // 7. Publicar telemetría HUD a ~20 Hz
        hudPublishTimer -= dt
        if hudPublishTimer <= 0 {
            hudPublishTimer = 0.05
            publishHUDNow(directive: directive)
        }
    }

    // MARK: - Auto-disparo y Proyectiles

    private func updateAutoFire(dt: TimeInterval) -> CGFloat? {
        fireTimer -= dt

        guard let target = closestEnemy(within: 440) else {
            return nil
        }

        let angle = atan2(target.node.position.y - playerPos.y, target.node.position.x - playerPos.x)

        guard fireTimer <= 0 else { return angle }
        fireTimer = max(0.125, 0.24 * pow(0.91, Double(playerLevel - 1)))

        let damage = (playerLevel >= 6 ? 3 : (playerLevel >= 3 ? 2 : 1))
        let spreadOffsets: [CGFloat]
        switch playerLevel {
        case 1:
            spreadOffsets = [0.0]
        case 2...3:
            spreadOffsets = [-0.08, 0.08]
        case 4...5:
            spreadOffsets = [-0.13, 0.0, 0.13]
        default:
            spreadOffsets = [-0.16, -0.055, 0.055, 0.16]
        }

        let tierStep = CGFloat(min(5, playerLevel - 1))
        let shardScale: CGFloat = 1.0 + tierStep * 0.07
        let speed: CGFloat = 590.0 + tierStep * 28.0

        let fillTint: UIColor
        let strokeTint: UIColor
        if playerLevel >= 5 {
            fillTint = RelicarioPalette.liturgicalGold
            strokeTint = RelicarioPalette.ivory
        } else if playerLevel >= 3 {
            fillTint = RelicarioPalette.coldSilver
            strokeTint = RelicarioPalette.projectileCore
        } else {
            fillTint = RelicarioPalette.projectileCore
            strokeTint = RelicarioPalette.projectileTrail
        }

        for offset in spreadOffsets {
            let shotAngle = angle + offset
            let shard = SKShapeNode(path: sharedPaths.projectileShard)
            shard.fillColor = fillTint
            shard.strokeColor = strokeTint
            shard.lineWidth = 1.4
            shard.blendMode = .add
            shard.setScale(shardScale)
            shard.position = CGPoint(x: playerPos.x + cos(shotAngle) * 14, y: playerPos.y + sin(shotAngle) * 14)
            shard.zRotation = shotAngle
            shard.zPosition = 3.5
            worldLayer.addChild(shard)

            let vel = CGVector(dx: cos(shotAngle) * speed, dy: sin(shotAngle) * speed)
            projectiles.append(ProjectileEntity(node: shard, velocity: vel, remainingLife: 1.05, damage: damage))
        }

        MainActor.assumeIsolated {
            HapticManager.shared.triggerShoot()
        }
        return angle
    }

    private func closestEnemy(within maxRange: CGFloat) -> EnemyEntity? {
        var best: EnemyEntity?
        var bestDist = maxRange
        for enemy in enemies {
            let d = hypot(enemy.node.position.x - playerPos.x, enemy.node.position.y - playerPos.y)
            if d < bestDist {
                bestDist = d
                best = enemy
            }
        }
        return best
    }

    private func updateProjectiles(dt: TimeInterval, bounds: CGRect) {
        var survivors: [ProjectileEntity] = []
        survivors.reserveCapacity(projectiles.count)

        let expandedBounds = bounds.insetBy(dx: -40, dy: -40)

        for proj in projectiles {
            proj.remainingLife -= dt
            let nextPos = CGPoint(
                x: proj.node.position.x + proj.velocity.dx * CGFloat(dt),
                y: proj.node.position.y + proj.velocity.dy * CGFloat(dt)
            )
            proj.node.position = nextPos

            if proj.remainingLife <= 0 || !expandedBounds.contains(nextPos) {
                proj.node.removeFromParent()
                continue
            }

            // Impacto contra enemigos
            let hitPadding: CGFloat = 6.5 + CGFloat(proj.damage - 1) * 1.2
            var hitIndex: Int?
            for (idx, enemy) in enemies.enumerated() {
                let d = hypot(enemy.node.position.x - nextPos.x, enemy.node.position.y - nextPos.y)
                if d <= enemy.hitRadius + hitPadding {
                    hitIndex = idx
                    break
                }
            }

            if let idx = hitIndex {
                applyHit(toEnemyAt: idx, damage: proj.damage, impactVelocity: proj.velocity, impactPoint: nextPos)
                proj.node.removeFromParent()
            } else {
                survivors.append(proj)
            }
        }

        projectiles = survivors
    }

    private func applyHit(toEnemyAt index: Int, damage: Int, impactVelocity: CGVector, impactPoint: CGPoint) {
        let enemy = enemies[index]
        enemy.hp -= damage

        let sparkColor: UIColor = (enemy.archetype == .jaula) ? RelicarioPalette.oldBone : RelicarioPalette.vermilion
        worldLayer.addChild(ParticleFactory.makeSparkBurst(at: impactPoint, color: sparkColor, textures: textures))

        // Retroceso reducido para mantener presión constante
        let velMag = max(1.0, hypot(impactVelocity.dx, impactVelocity.dy))
        let knockbackDistance: CGFloat
        switch enemy.archetype {
        case .desollado: knockbackDistance = 5.5
        case .jaula:     knockbackDistance = 1.2
        case .martir:    knockbackDistance = 4.0
        }
        enemy.node.position.x += (impactVelocity.dx / velMag) * knockbackDistance
        enemy.node.position.y += (impactVelocity.dy / velMag) * knockbackDistance

        if let visual = enemy.node as? DesolladoVisualNode {
            visual.triggerHitFlash()
        } else if let visual = enemy.node as? JaulaViscerasVisualNode {
            visual.triggerHitFlash()
            visual.updateArmor(hp: enemy.hp, maxHP: enemy.maxHP, worldLayer: worldLayer, textures: textures)
        } else if let visual = enemy.node as? MartirVisualNode {
            visual.triggerHitFlash()
        }

        if enemy.hp <= 0 {
            let deathColor: UIColor
            let count: Int
            let xpValue: Int
            switch enemy.archetype {
            case .desollado:
                deathColor = RelicarioPalette.vermilion
                count = 11
                xpValue = 10
            case .jaula:
                deathColor = RelicarioPalette.liturgicalGold
                count = 20
                xpValue = 65
                shakeWorld(amplitude: 4.5)
            case .martir:
                deathColor = RelicarioPalette.liturgicalGold
                count = 15
                xpValue = 28
            }
            worldLayer.addChild(ParticleFactory.makeDeathBurst(at: enemy.node.position, color: deathColor, count: count, textures: textures))
            enemy.node.removeFromParent()
            enemies.remove(at: index)
            kills += 1
            grantXP(xpValue)
        }
    }

    private func xpRequired(forLevel level: Int) -> Int {
        let step = max(0, level - 1)
        return 35 + level * 20 + step * step * 8
    }

    private func grantXP(_ amount: Int) {
        currentXP += amount
        var didLevelUp = false
        while currentXP >= xpToNextLevel {
            currentXP -= xpToNextLevel
            playerLevel += 1
            xpToNextLevel = xpRequired(forLevel: playerLevel)
            didLevelUp = true
        }

        let progress = Double(currentXP) / Double(max(1, xpToNextLevel))
        playerXPBar.updateXP(progress: progress, level: playerLevel, leveledUp: didLevelUp)

        if didLevelUp {
            playerXPBar.playLevelUpEffect(level: playerLevel, in: worldLayer, playerPos: playerPos, textures: textures)
            MainActor.assumeIsolated {
                HapticManager.shared.triggerLevelUp()
            }
            publishHUDNow(directive: nil)
        }
    }

    // MARK: - Comportamiento de Criaturas, Habilidades y Colisiones

    private func updateEnemies(dt: TimeInterval, directive: WaveDirective, bounds: CGRect) {
        var activeOrStartedLunges = enemies.reduce(0) { count, e in
            if case .lunging = e.stalkerPhase { return count + 1 }
            if case .telegraphing = e.stalkerPhase { return count + 1 }
            return count
        }

        for i in enemies.indices {
            let enemy = enemies[i]
            enemy.age += dt

            let toPlayer = CGVector(
                dx: playerPos.x - enemy.node.position.x,
                dy: playerPos.y - enemy.node.position.y
            )
            let distToPlayer = max(0.001, hypot(toPlayer.dx, toPlayer.dy))
            let dirToPlayer = CGVector(dx: toPlayer.dx / distToPlayer, dy: toPlayer.dy / distToPlayer)
            let angleToPlayer = atan2(dirToPlayer.dy, dirToPlayer.dx)

            switch enemy.archetype {
            case .desollado:
                let visual = enemy.node as? DesolladoVisualNode
                if enemy.abilityActiveTimer > 0 {
                    // Salto depredador frontal a corta distancia
                    enemy.abilityActiveTimer = max(0, enemy.abilityActiveTimer - dt)
                    let pounceSpeed = enemy.baseSpeed * directive.enemySpeedMultiplier * 1.62
                    enemy.node.position.x += dirToPlayer.dx * pounceSpeed * CGFloat(dt)
                    enemy.node.position.y += dirToPlayer.dy * pounceSpeed * CGFloat(dt)
                    enemy.node.zRotation = angleToPlayer
                    if enemy.abilityActiveTimer <= 0 {
                        visual?.setPouncing(false)
                    }
                } else {
                    enemy.abilityCooldown -= dt
                    if enemy.abilityCooldown <= 0 && distToPlayer < 150 {
                        enemy.abilityActiveTimer = 0.38
                        enemy.abilityCooldown = TimeInterval.random(in: 2.2...3.2)
                        visual?.setPouncing(true)
                    } else {
                        // Zigzag espasmódico rápido
                        let perp = CGVector(dx: -dirToPlayer.dy, dy: dirToPlayer.dx)
                        let wave = sin(CGFloat(enemy.age) * 7.8 + enemy.phaseOffset) * 0.45
                        let speed = enemy.baseSpeed * directive.enemySpeedMultiplier
                        let vx = (dirToPlayer.dx + perp.dx * wave) * speed
                        let vy = (dirToPlayer.dy + perp.dy * wave) * speed
                        enemy.node.position.x += vx * CGFloat(dt)
                        enemy.node.position.y += vy * CGFloat(dt)
                        enemy.node.zRotation = atan2(vy, vx)
                    }
                }

            case .jaula:
                let visual = enemy.node as? JaulaViscerasVisualNode
                let frenzied = Double(enemy.hp) / Double(max(1, enemy.maxHP)) <= 0.30
                let frenzyBoost: CGFloat = frenzied ? 1.68 : 1.0

                if enemy.isSpitTelegraphing {
                    enemy.abilityActiveTimer -= dt
                    let slowSpeed = enemy.baseSpeed * directive.enemySpeedMultiplier * 0.35
                    enemy.node.position.x += dirToPlayer.dx * slowSpeed * CGFloat(dt)
                    enemy.node.position.y += dirToPlayer.dy * slowSpeed * CGFloat(dt)
                    if enemy.abilityActiveTimer <= 0 {
                        enemy.isSpitTelegraphing = false
                        enemy.abilityCooldown = frenzied
                            ? TimeInterval.random(in: 2.4...3.2)
                            : TimeInterval.random(in: 3.3...4.4)
                        spawnEnemyBoneVolley(
                            from: enemy.node.position,
                            baseAngle: angleToPlayer,
                            frenzied: frenzied
                        )
                    }
                } else {
                    let speed = enemy.baseSpeed * directive.enemySpeedMultiplier * frenzyBoost
                    enemy.node.position.x += dirToPlayer.dx * speed * CGFloat(dt)
                    enemy.node.position.y += dirToPlayer.dy * speed * CGFloat(dt)

                    enemy.abilityCooldown -= dt
                    if enemy.abilityCooldown <= 0 && distToPlayer > 85 && distToPlayer < 350 {
                        enemy.isSpitTelegraphing = true
                        enemy.abilityActiveTimer = 0.42
                        visual?.triggerSpitTelegraph()
                    }
                }
                visual?.updateLookAngle(angleToPlayer)

            case .martir:
                let wasStalking: Bool
                if case .stalking = enemy.stalkerPhase { wasStalking = true } else { wasStalking = false }
                updateStalker(
                    enemy: enemy,
                    dt: dt,
                    dirToPlayer: dirToPlayer,
                    distToPlayer: distToPlayer,
                    angleToPlayer: angleToPlayer,
                    directive: directive,
                    canStartNewLunge: !directive.suppressSimultaneousLunges || activeOrStartedLunges == 0
                )
                if wasStalking, case .telegraphing = enemy.stalkerPhase {
                    activeOrStartedLunges += 1
                }
            }

            // Mantener dentro del área ampliada para que no escapen por teletransporte
            enemy.node.position.x = min(max(enemy.node.position.x, bounds.minX - 28), bounds.maxX + 28)
            enemy.node.position.y = min(max(enemy.node.position.y, bounds.minY - 28), bounds.maxY + 28)
        }

        // Separación suave entre criaturas
        let count = enemies.count
        if count > 1 {
            for i in 0..<(count - 1) {
                for j in (i + 1)..<count {
                    let a = enemies[i]
                    let b = enemies[j]
                    let dx = b.node.position.x - a.node.position.x
                    let dy = b.node.position.y - a.node.position.y
                    let minDist = (a.hitRadius + b.hitRadius) * 0.85
                    let d = hypot(dx, dy)
                    if d > 0.01 && d < minDist {
                        let overlap = (minDist - d) * 0.38
                        let nx = dx / d
                        let ny = dy / d
                        a.node.position.x -= nx * overlap
                        a.node.position.y -= ny * overlap
                        b.node.position.x += nx * overlap
                        b.node.position.y += ny * overlap
                    }
                }
            }
        }

        // Colisión cuerpo a cuerpo contra el jugador
        if invulnerabilityTimer <= 0 {
            for enemy in enemies {
                let d = hypot(enemy.node.position.x - playerPos.x, enemy.node.position.y - playerPos.y)
                if d <= enemy.hitRadius + 10.5 {
                    let dmg: Int
                    if enemy.archetype == .martir, case .lunging = enemy.stalkerPhase {
                        dmg = 26
                    } else {
                        dmg = enemy.contactDamage
                    }
                    applyDamageToPlayer(dmg)
                    break
                }
            }
        }
    }

    private func spawnEnemyBoneVolley(from origin: CGPoint, baseAngle: CGFloat, frenzied: Bool) {
        let offsets: [CGFloat] = frenzied ? [-0.27, -0.09, 0.09, 0.27] : [-0.22, 0.0, 0.22]
        let speed: CGFloat = frenzied ? 235.0 : 198.0

        for offset in offsets {
            let shotAngle = baseAngle + offset
            let bolt = ParticleFactory.makeEnemyBoltNode(paths: sharedPaths)
            bolt.position = CGPoint(x: origin.x + cos(shotAngle) * 18, y: origin.y + sin(shotAngle) * 18)
            worldLayer.addChild(bolt)

            let vel = CGVector(dx: cos(shotAngle) * speed, dy: sin(shotAngle) * speed)
            enemyProjectiles.append(EnemyProjectileEntity(node: bolt, velocity: vel, remainingLife: 2.3, damage: 14))
        }
    }

    private func updateEnemyProjectiles(dt: TimeInterval, bounds: CGRect) {
        var survivors: [EnemyProjectileEntity] = []
        survivors.reserveCapacity(enemyProjectiles.count)
        let expanded = bounds.insetBy(dx: -36, dy: -36)

        for bolt in enemyProjectiles {
            bolt.remainingLife -= dt
            let nextPos = CGPoint(
                x: bolt.node.position.x + bolt.velocity.dx * CGFloat(dt),
                y: bolt.node.position.y + bolt.velocity.dy * CGFloat(dt)
            )
            bolt.node.position = nextPos

            if bolt.remainingLife <= 0 || !expanded.contains(nextPos) {
                bolt.node.removeFromParent()
                continue
            }

            let d = hypot(nextPos.x - playerPos.x, nextPos.y - playerPos.y)
            if d <= 13.5 {
                bolt.node.removeFromParent()
                if invulnerabilityTimer <= 0 && !hasEnded {
                    applyDamageToPlayer(bolt.damage)
                }
                continue
            }

            survivors.append(bolt)
        }

        enemyProjectiles = survivors
    }

    private func updateStalker(
        enemy: EnemyEntity,
        dt: TimeInterval,
        dirToPlayer: CGVector,
        distToPlayer: CGFloat,
        angleToPlayer: CGFloat,
        directive: WaveDirective,
        canStartNewLunge: Bool
    ) {
        let visual = enemy.node as? MartirVisualNode

        switch enemy.stalkerPhase {
        case .stalking(let cooldown):
            visual?.setTelegraph(active: false, distance: 0)
            enemy.comboDashUsed = false
            let tangentSign: CGFloat = enemy.phaseOffset > .pi ? 1.0 : -1.0
            let tangent = CGVector(dx: -dirToPlayer.dy * tangentSign, dy: dirToPlayer.dx * tangentSign)
            let radialBias: CGFloat = distToPlayer > 175 ? 0.68 : (distToPlayer < 100 ? -0.30 : 0.18)
            let speed = enemy.baseSpeed * directive.enemySpeedMultiplier
            enemy.node.position.x += (dirToPlayer.dx * radialBias + tangent.dx * 0.85) * speed * CGFloat(dt)
            enemy.node.position.y += (dirToPlayer.dy * radialBias + tangent.dy * 0.85) * speed * CGFloat(dt)

            // Tics bruscos antinaturales en la rotación
            let twitch = sin(CGFloat(enemy.age) * 14.0) > 0.90 ? CGFloat(0.26 * tangentSign) : 0
            enemy.node.zRotation = angleToPlayer + twitch

            let nextCD = cooldown - dt
            if nextCD <= 0 && distToPlayer < 330 && canStartNewLunge {
                enemy.stalkerPhase = .telegraphing(remaining: 0.40, angle: angleToPlayer)
            } else {
                enemy.stalkerPhase = .stalking(cooldown: nextCD)
            }

        case .telegraphing(let remaining, let lockedAngle):
            let updatedAngle = remaining > 0.19 ? angleToPlayer : lockedAngle
            enemy.node.zRotation = updatedAngle
            visual?.setTelegraph(active: true, distance: min(275, distToPlayer + 40))

            let nextRem = remaining - dt
            if nextRem <= 0 {
                visual?.setTelegraph(active: false, distance: 0)
                let dashSpeed: CGFloat = 510.0 * max(0.88, directive.enemySpeedMultiplier)
                let vel = CGVector(dx: cos(updatedAngle) * dashSpeed, dy: sin(updatedAngle) * dashSpeed)
                enemy.stalkerPhase = .lunging(remaining: 0.34, velocity: vel, trailTimer: 0)
            } else {
                enemy.stalkerPhase = .telegraphing(remaining: nextRem, angle: updatedAngle)
            }

        case .lunging(let remaining, let vel, var trailTimer):
            enemy.node.position.x += vel.dx * CGFloat(dt)
            enemy.node.position.y += vel.dy * CGFloat(dt)
            trailTimer -= dt
            if trailTimer <= 0 {
                trailTimer = 0.04
                visual?.spawnGhostTrail(in: worldLayer, sharedPaths: sharedPaths)
            }
            let nextRem = remaining - dt
            if nextRem <= 0 {
                // Onda de choque breve al rematar la embestida
                worldLayer.addChild(ParticleFactory.makeShockRing(at: enemy.node.position, color: RelicarioPalette.vermilion, radius: 34))
                let shockDist = hypot(enemy.node.position.x - playerPos.x, enemy.node.position.y - playerPos.y)
                if shockDist <= 34.0 && invulnerabilityTimer <= 0 && !hasEnded {
                    applyDamageToPlayer(12)
                }

                // Doble embestida encadenada en fase media o baja vida
                if !enemy.comboDashUsed && (elapsedTime >= 20.0 || enemy.hp <= max(2, enemy.maxHP / 2)) {
                    enemy.comboDashUsed = true
                    enemy.stalkerPhase = .telegraphing(remaining: 0.28, angle: angleToPlayer)
                } else {
                    enemy.stalkerPhase = .recovering(remaining: 0.45)
                }
            } else {
                enemy.stalkerPhase = .lunging(remaining: nextRem, velocity: vel, trailTimer: trailTimer)
            }

        case .recovering(let remaining):
            visual?.setTelegraph(active: false, distance: 0)
            let nextRem = remaining - dt
            if nextRem <= 0 {
                enemy.stalkerPhase = .stalking(cooldown: TimeInterval.random(in: 1.15...2.05))
            } else {
                enemy.stalkerPhase = .recovering(remaining: nextRem)
            }
        }
    }

    private func applyDamageToPlayer(_ amount: Int) {
        playerHP = max(0, playerHP - amount)
        invulnerabilityTimer = 0.40
        justTookDamageFlag = true

        panicVignette.alpha = 0.85
        shakeWorld(amplitude: 7.0)
        worldLayer.addChild(ParticleFactory.makeDeathBurst(at: playerPos, color: RelicarioPalette.vermilion, count: 10, textures: textures))

        if playerHP <= 0 {
            finishRun(didSurvive: false)
        } else {
            MainActor.assumeIsolated {
                HapticManager.shared.triggerDamage()
            }
            publishHUDNow(directive: nil)
        }
    }

    private func shakeWorld(amplitude: CGFloat) {
        worldLayer.removeAction(forKey: "shake")
        let s1 = SKAction.move(to: CGPoint(x: amplitude, y: -amplitude * 0.6), duration: 0.03)
        let s2 = SKAction.move(to: CGPoint(x: -amplitude * 0.8, y: amplitude * 0.7), duration: 0.03)
        let s3 = SKAction.move(to: CGPoint(x: amplitude * 0.4, y: amplitude * 0.3), duration: 0.03)
        let reset = SKAction.move(to: .zero, duration: 0.03)
        worldLayer.run(SKAction.sequence([s1, s2, s3, reset]), withKey: "shake")
    }

    // MARK: - Botiquines (Gotas de Gracia) y Generación de Oleadas

    private func spawnMedkit(biasAhead: Bool, bounds: CGRect) {
        let pos: CGPoint
        if biasAhead && hypot(playerVelocity.dx, playerVelocity.dy) > 10 {
            let moveAngle = atan2(playerVelocity.dy, playerVelocity.dx) + CGFloat.random(in: -0.45...0.45)
            let dist = CGFloat.random(in: 88...135)
            pos = CGPoint(
                x: min(max(playerPos.x + cos(moveAngle) * dist, bounds.minX + 18), bounds.maxX - 18),
                y: min(max(playerPos.y + sin(moveAngle) * dist, bounds.minY + 18), bounds.maxY - 18)
            )
        } else {
            var candidate = CGPoint(
                x: CGFloat.random(in: (bounds.minX + 24)...(bounds.maxX - 24)),
                y: CGFloat.random(in: (bounds.minY + 24)...(bounds.maxY - 24))
            )
            if hypot(candidate.x - playerPos.x, candidate.y - playerPos.y) < 75 {
                candidate.y = candidate.y > bounds.midY ? bounds.minY + 42 : bounds.maxY - 42
            }
            pos = candidate
        }

        let node = ParticleFactory.makeMedkitNode(textures: textures, paths: sharedPaths)
        node.position = pos
        node.zPosition = 2.5
        worldLayer.addChild(node)
        medkits.append(MedkitEntity(node: node))
    }

    private func updateMedkits(dt: TimeInterval) {
        var remaining: [MedkitEntity] = []
        for kit in medkits {
            kit.age += dt
            let d = hypot(kit.node.position.x - playerPos.x, kit.node.position.y - playerPos.y)
            if d <= 26.0 {
                playerHP = min(playerMaxHP, playerHP + 22)
                medkitsCollected += 1
                worldLayer.addChild(ParticleFactory.makeDeathBurst(at: kit.node.position, color: RelicarioPalette.graceJade, count: 14, textures: textures))
                kit.node.removeFromParent()
                MainActor.assumeIsolated {
                    HapticManager.shared.triggerHeal()
                }
                publishHUDNow(directive: nil)
            } else if kit.age > 12.0 {
                kit.node.run(SKAction.sequence([SKAction.fadeOut(withDuration: 0.25), SKAction.removeFromParent()]))
            } else {
                remaining.append(kit)
            }
        }
        medkits = remaining
    }

    private func spawnEnemy(using directive: WaveDirective, bounds: CGRect) {
        let archetype = pickArchetype(directive: directive)
        let spawnPoint = pickSpawnPoint(directive: directive, bounds: bounds)

        let node: SKNode
        let hp: Int
        let speed: CGFloat
        let radius: CGFloat
        let damage: Int
        let initialAbilityCD: TimeInterval

        switch archetype {
        case .desollado:
            node = DesolladoVisualNode(textures: textures, sharedPaths: sharedPaths)
            hp = 2 + (elapsedTime > 20 ? 1 : 0) + (elapsedTime > 42 ? 1 : 0) + (playerLevel >= 5 ? 1 : 0)
            speed = CGFloat.random(in: 120...144)
            radius = 12.5
            damage = 14
            initialAbilityCD = TimeInterval.random(in: 1.4...2.6)
        case .jaula:
            node = JaulaViscerasVisualNode(textures: textures, sharedPaths: sharedPaths)
            hp = 18 + (elapsedTime > 24 ? 4 : 0) + (elapsedTime > 44 ? 6 : 0)
            speed = CGFloat.random(in: 62...72)
            radius = 25.5
            damage = 24
            initialAbilityCD = TimeInterval.random(in: 2.2...3.4)
        case .martir:
            node = MartirVisualNode(textures: textures, sharedPaths: sharedPaths)
            hp = 9 + (elapsedTime > 26 ? 3 : 0)
            speed = CGFloat.random(in: 102...118)
            radius = 16.5
            damage = 18
            initialAbilityCD = TimeInterval.random(in: 1.1...1.8)
        }

        node.position = spawnPoint
        node.zPosition = archetype == .jaula ? 3.2 : 3.0
        worldLayer.addChild(node)

        enemies.append(EnemyEntity(
            archetype: archetype,
            node: node,
            hp: hp,
            baseSpeed: speed,
            hitRadius: radius,
            contactDamage: damage,
            abilityCooldown: initialAbilityCD
        ))
    }

    private func pickArchetype(directive: WaveDirective) -> EnemyArchetype {
        let total = max(0.001, directive.swarmWeight + directive.tankWeight + directive.stalkerWeight)
        let roll = Double.random(in: 0..<total)
        if roll < directive.swarmWeight {
            return .desollado
        } else if roll < directive.swarmWeight + directive.tankWeight {
            return .jaula
        } else {
            return .martir
        }
    }

    private func pickSpawnPoint(directive: WaveDirective, bounds: CGRect) -> CGPoint {
        var chosenAngle = CGFloat.random(in: 0...(CGFloat.pi * 2.0))
        if let safeAngle = directive.safeEscapeCenterAngle {
            for _ in 0..<8 {
                let candidate = CGFloat.random(in: 0...(CGFloat.pi * 2.0))
                let diff = abs(atan2(sin(candidate - safeAngle), cos(candidate - safeAngle)))
                if diff > directive.safeEscapeHalfConeRadians {
                    chosenAngle = candidate
                    break
                }
            }
        }

        let spawnDist: CGFloat = CGFloat.random(in: 185...265)
        var pt = CGPoint(
            x: playerPos.x + cos(chosenAngle) * spawnDist,
            y: playerPos.y + sin(chosenAngle) * spawnDist
        )

        // Proyectar hacia el borde más cercano si queda dentro o fuera del anillo
        let pad: CGFloat = 14
        pt.x = min(max(pt.x, bounds.minX - pad), bounds.maxX + pad)
        pt.y = min(max(pt.y, bounds.minY - pad), bounds.maxY + pad)

        // Si el jugador está arrinconado en una esquina, empujar hacia el interior de la arena
        let dist = hypot(pt.x - playerPos.x, pt.y - playerPos.y)
        if dist < 118 {
            let inwardAngle = atan2(bounds.midY - playerPos.y, bounds.midX - playerPos.x)
                + CGFloat.random(in: -0.55...0.55)
            let safeDist = CGFloat.random(in: 145...185)
            pt.x = min(max(playerPos.x + cos(inwardAngle) * safeDist, bounds.minX - pad), bounds.maxX + pad)
            pt.y = min(max(playerPos.y + sin(inwardAngle) * safeDist, bounds.minY - pad), bounds.maxY + pad)
        }
        return pt
    }

    // MARK: - Publicación HUD y Cierre

    private func publishHUDNow(directive: WaveDirective?) {
        guard !hasEnded else { return }
        let activeDirective = directive ?? lastDirective
        let fallbackMsg: String
        switch mode {
        case .classic1985:
            fallbackMsg = "Regla fija [0-12s] → Asedio inicial"
        case .director2026:
            fallbackMsg = "IA activa → Leyendo estrés"
        case .hybrid1985x2026:
            fallbackMsg = "Mix 85×26 → Reloj fijo + IA"
        }
        let snap = GameHUDSnapshot(
            timeRemaining: max(0, totalRunDuration - elapsedTime),
            hp: playerHP,
            maxHP: playerMaxHP,
            kills: kills,
            playerLevel: playerLevel,
            stressIndex: stressTracker.currentStress,
            stressTier: stressTracker.currentTier,
            directorMessage: activeDirective?.microMessage ?? fallbackMsg,
            isInterventionActive: activeDirective?.isInterventionActive ?? false,
            medkitsCollected: medkitsCollected
        )
        let updateCallback = onSnapshotUpdate
        MainActor.assumeIsolated {
            updateCallback?(snap)
        }
    }

    private func finishRun(didSurvive: Bool) {
        guard !hasEnded else { return }
        hasEnded = true
        isPaused = true

        let survived = didSurvive ? totalRunDuration : min(totalRunDuration, elapsedTime)
        let finalSnap = GameHUDSnapshot(
            timeRemaining: didSurvive ? 0 : max(0, totalRunDuration - elapsedTime),
            hp: playerHP,
            maxHP: playerMaxHP,
            kills: kills,
            playerLevel: playerLevel,
            stressIndex: stressTracker.currentStress,
            stressTier: stressTracker.currentTier,
            directorMessage: didSurvive ? "Experimento completado (60s)" : "Sujeto caído en combate",
            isInterventionActive: false,
            medkitsCollected: medkitsCollected
        )

        let record = RunTelemetryRecord(
            id: UUID(),
            initials: initials,
            avatar: avatar,
            mode: mode,
            survivedSeconds: survived,
            didSurvive: didSurvive,
            kills: kills,
            averageStress: stressTracker.averageStress,
            peakStress: stressTracker.peakStress,
            medkitsCollected: medkitsCollected,
            playedAt: Date()
        )

        let updateCallback = onSnapshotUpdate
        let completedCallback = onRunCompleted
        MainActor.assumeIsolated {
            HapticManager.shared.triggerRunEnd(survived: didSurvive)
            updateCallback?(finalSnap)
            completedCallback?(record)
        }
    }
}

import Foundation
import Observation
import SpriteKit
import SwiftUI
import UIKit

// MARK: - ViewModel de Sesión Activa (Puente SwiftUI <-> SpriteKit)

struct GameHUDSnapshot {
    var timeRemaining: TimeInterval = 60.0
    var hp: Int = 100
    var maxHP: Int = 100
    var kills: Int = 0
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
    let scene: PanicGameScene
    private let onFinish: @MainActor (RunTelemetryRecord) -> Void

    init(initials: String, mode: GameMode, onFinish: @escaping @MainActor (RunTelemetryRecord) -> Void) {
        self.initials = initials
        self.mode = mode
        self.onFinish = onFinish
        self.snapshot.directorMessage = mode == .classic1985
            ? "Regla fija [0-15s] → Oleada inicial"
            : "IA activa → Leyendo estrés"

        let createdScene = PanicGameScene(
            mode: mode,
            initials: initials,
            safeTop: 59,
            safeBottom: 34
        )
        createdScene.scaleMode = .resizeFill
        self.scene = createdScene

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
    var onSnapshotUpdate: (@MainActor (GameHUDSnapshot) -> Void)?
    var onRunCompleted: (@MainActor (RunTelemetryRecord) -> Void)?

    private let mode: GameMode
    private let initials: String
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

    // Estado del jugador
    private var playerNode = SKNode()
    private var playerPos: CGPoint = .zero
    private var playerVelocity: CGVector = .zero
    private var playerHP: Int = 100
    private let playerMaxHP: Int = 100
    private var invulnerabilityTimer: TimeInterval = 0
    private var fireTimer: TimeInterval = 0
    private let playerSpeed: CGFloat = 208.0

    // Motores de IA y estrés
    private let stressTracker = StressMetricsTracker()
    private lazy var waveDirector: any WaveDirectorProtocol = {
        if mode == .classic1985 {
            return Classic1985Engine()
        } else {
            return Adaptive2026Director()
        }
    }()
    private var previousStressTier: StressTier = .bajo

    // Entidades activas
    private var enemies: [EnemyEntity] = []
    private var projectiles: [ProjectileEntity] = []
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
        var stalkerPhase: StalkerPhase = .stalking(cooldown: TimeInterval.random(in: 1.8...2.8))

        init(
            archetype: EnemyArchetype,
            node: SKNode,
            hp: Int,
            baseSpeed: CGFloat,
            hitRadius: CGFloat,
            contactDamage: Int
        ) {
            self.archetype = archetype
            self.node = node
            self.hp = hp
            self.maxHP = hp
            self.baseSpeed = baseSpeed
            self.hitRadius = hitRadius
            self.contactDamage = contactDamage
        }
    }

    private final class ProjectileEntity {
        let node: SKShapeNode
        var velocity: CGVector
        var remainingLife: TimeInterval

        init(node: SKShapeNode, velocity: CGVector, remainingLife: TimeInterval) {
            self.node = node
            self.velocity = velocity
            self.remainingLife = remainingLife
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

    init(mode: GameMode, initials: String, safeTop: CGFloat, safeBottom: CGFloat) {
        self.mode = mode
        self.initials = initials
        self.safeTopInset = safeTop
        self.safeBottomInset = safeBottom
        super.init(size: CGSize(width: 390, height: 844))
        backgroundColor = RelicarioPalette.arenaBG
    }

    @available(*, unavailable)
    required init?(coder aDecoder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func updateSafeMargins(top: CGFloat, bottom: CGFloat) {
        safeTopInset = top
        safeBottomInset = bottom
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

        playerNode = ParticleFactory.makePlayerNode(textures: textures, paths: sharedPaths)
        playerNode.zPosition = 4
        worldLayer.addChild(playerNode)

        let bounds = playableBounds()
        playerPos = CGPoint(x: bounds.midX, y: bounds.midY)
        playerNode.position = playerPos

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
    }

    // MARK: - Geometría de Arena y Joystick

    private func playableBounds() -> CGRect {
        let topMargin = max(145, safeTopInset + 140)
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

        // 1. Movimiento del jugador
        let bounds = playableBounds()
        playerVelocity = CGVector(dx: moveInput.dx * playerSpeed, dy: moveInput.dy * playerSpeed)
        playerPos.x = min(max(playerPos.x + playerVelocity.dx * CGFloat(dt), bounds.minX), bounds.maxX)
        playerPos.y = min(max(playerPos.y + playerVelocity.dy * CGFloat(dt), bounds.minY), bounds.maxY)
        playerNode.position = playerPos

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

        // 3. Evaluación del motor de IA (1985 vs 2026)
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

        if directive.spawnEmergencyMedkit {
            spawnMedkit(biasAhead: directive.medkitBiasAhead, bounds: bounds)
        }

        // 4. Aparición de criaturas según directiva
        spawnTimer -= dt
        if spawnTimer <= 0 && enemies.count < directive.maxActiveEnemies {
            spawnEnemy(using: directive, bounds: bounds)
            spawnTimer = directive.spawnInterval
        }

        // 5. Auto-disparo al enemigo más cercano
        updateAutoFire(dt: dt)

        // 6. Simulación de proyectiles, criaturas, colisiones y curas
        updateProjectiles(dt: dt, bounds: bounds)
        updateEnemies(dt: dt, directive: directive, bounds: bounds)
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

    private func updateAutoFire(dt: TimeInterval) {
        fireTimer -= dt

        guard let target = closestEnemy(within: 440) else {
            if hypot(playerVelocity.dx, playerVelocity.dy) > 10 {
                playerNode.zRotation = atan2(playerVelocity.dy, playerVelocity.dx)
            }
            return
        }

        let angle = atan2(target.node.position.y - playerPos.y, target.node.position.x - playerPos.x)
        playerNode.zRotation = angle

        guard fireTimer <= 0 else { return }
        fireTimer = 0.23

        let shard = SKShapeNode(path: sharedPaths.projectileShard)
        shard.fillColor = RelicarioPalette.projectileCore
        shard.strokeColor = RelicarioPalette.projectileTrail
        shard.lineWidth = 1.4
        shard.blendMode = .add
        shard.position = CGPoint(x: playerPos.x + cos(angle) * 14, y: playerPos.y + sin(angle) * 14)
        shard.zRotation = angle
        shard.zPosition = 3.5
        worldLayer.addChild(shard)

        let speed: CGFloat = 590.0
        let vel = CGVector(dx: cos(angle) * speed, dy: sin(angle) * speed)
        projectiles.append(ProjectileEntity(node: shard, velocity: vel, remainingLife: 1.05))

        MainActor.assumeIsolated {
            HapticManager.shared.triggerShoot()
        }
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
            var hitIndex: Int?
            for (idx, enemy) in enemies.enumerated() {
                let d = hypot(enemy.node.position.x - nextPos.x, enemy.node.position.y - nextPos.y)
                if d <= enemy.hitRadius + 6.5 {
                    hitIndex = idx
                    break
                }
            }

            if let idx = hitIndex {
                applyHit(toEnemyAt: idx, impactVelocity: proj.velocity, impactPoint: nextPos)
                proj.node.removeFromParent()
            } else {
                survivors.append(proj)
            }
        }

        projectiles = survivors
    }

    private func applyHit(toEnemyAt index: Int, impactVelocity: CGVector, impactPoint: CGPoint) {
        let enemy = enemies[index]
        enemy.hp -= 1

        let sparkColor: UIColor = (enemy.archetype == .jaula) ? RelicarioPalette.oldBone : RelicarioPalette.vermilion
        worldLayer.addChild(ParticleFactory.makeSparkBurst(at: impactPoint, color: sparkColor, textures: textures))

        // Retroceso según masa
        let velMag = max(1.0, hypot(impactVelocity.dx, impactVelocity.dy))
        let knockbackDistance: CGFloat
        switch enemy.archetype {
        case .desollado: knockbackDistance = 11.0
        case .jaula:     knockbackDistance = 2.2
        case .martir:    knockbackDistance = 6.0
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
            switch enemy.archetype {
            case .desollado:
                deathColor = RelicarioPalette.vermilion
                count = 11
            case .jaula:
                deathColor = RelicarioPalette.liturgicalGold
                count = 20
                shakeWorld(amplitude: 4.5)
            case .martir:
                deathColor = RelicarioPalette.liturgicalGold
                count = 15
            }
            worldLayer.addChild(ParticleFactory.makeDeathBurst(at: enemy.node.position, color: deathColor, count: count, textures: textures))
            enemy.node.removeFromParent()
            enemies.remove(at: index)
            kills += 1
        }
    }

    // MARK: - Comportamiento de Criaturas y Colisiones

    private func updateEnemies(dt: TimeInterval, directive: WaveDirective, bounds: CGRect) {
        let activeLunges = enemies.reduce(0) { count, e in
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
                // Zigzag espasmódico inquietante
                let perp = CGVector(dx: -dirToPlayer.dy, dy: dirToPlayer.dx)
                let wave = sin(CGFloat(enemy.age) * 7.2 + enemy.phaseOffset) * 0.42
                let speed = enemy.baseSpeed * directive.enemySpeedMultiplier
                let vx = (dirToPlayer.dx + perp.dx * wave) * speed
                let vy = (dirToPlayer.dy + perp.dy * wave) * speed
                enemy.node.position.x += vx * CGFloat(dt)
                enemy.node.position.y += vy * CGFloat(dt)
                enemy.node.zRotation = atan2(vy, vx)

            case .jaula:
                // Lento hasta perder las 4 costillas, luego frenesí acelerado
                let frenzied = enemy.hp <= 3
                let frenzyBoost: CGFloat = frenzied ? 1.52 : 1.0
                let speed = enemy.baseSpeed * directive.enemySpeedMultiplier * frenzyBoost
                enemy.node.position.x += dirToPlayer.dx * speed * CGFloat(dt)
                enemy.node.position.y += dirToPlayer.dy * speed * CGFloat(dt)
                if let visual = enemy.node as? JaulaViscerasVisualNode {
                    visual.updateLookAngle(angleToPlayer)
                }

            case .martir:
                updateStalker(
                    enemy: enemy,
                    dt: dt,
                    dirToPlayer: dirToPlayer,
                    distToPlayer: distToPlayer,
                    angleToPlayer: angleToPlayer,
                    directive: directive,
                    canStartNewLunge: !directive.suppressSimultaneousLunges || activeLunges == 0
                )
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

        // Colisión contra el jugador
        if invulnerabilityTimer <= 0 {
            for enemy in enemies {
                let d = hypot(enemy.node.position.x - playerPos.x, enemy.node.position.y - playerPos.y)
                if d <= enemy.hitRadius + 10.5 {
                    let dmg: Int
                    if enemy.archetype == .martir, case .lunging = enemy.stalkerPhase {
                        dmg = 22
                    } else {
                        dmg = enemy.contactDamage
                    }
                    applyDamageToPlayer(dmg)
                    break
                }
            }
        }
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
            let tangentSign: CGFloat = enemy.phaseOffset > .pi ? 1.0 : -1.0
            let tangent = CGVector(dx: -dirToPlayer.dy * tangentSign, dy: dirToPlayer.dx * tangentSign)
            let radialBias: CGFloat = distToPlayer > 175 ? 0.65 : (distToPlayer < 105 ? -0.35 : 0.15)
            let speed = enemy.baseSpeed * directive.enemySpeedMultiplier
            enemy.node.position.x += (dirToPlayer.dx * radialBias + tangent.dx * 0.85) * speed * CGFloat(dt)
            enemy.node.position.y += (dirToPlayer.dy * radialBias + tangent.dy * 0.85) * speed * CGFloat(dt)

            // Tics bruscos antinaturales en la rotación
            let twitch = sin(CGFloat(enemy.age) * 14.0) > 0.92 ? CGFloat(0.24 * tangentSign) : 0
            enemy.node.zRotation = angleToPlayer + twitch

            let nextCD = cooldown - dt
            if nextCD <= 0 && distToPlayer < 310 && canStartNewLunge {
                enemy.stalkerPhase = .telegraphing(remaining: 0.52, angle: angleToPlayer)
            } else {
                enemy.stalkerPhase = .stalking(cooldown: nextCD)
            }

        case .telegraphing(let remaining, let lockedAngle):
            let updatedAngle = remaining > 0.25 ? angleToPlayer : lockedAngle
            enemy.node.zRotation = updatedAngle
            visual?.setTelegraph(active: true, distance: min(260, distToPlayer + 35))

            let nextRem = remaining - dt
            if nextRem <= 0 {
                visual?.setTelegraph(active: false, distance: 0)
                let dashSpeed: CGFloat = 415.0 * max(0.85, directive.enemySpeedMultiplier)
                let vel = CGVector(dx: cos(updatedAngle) * dashSpeed, dy: sin(updatedAngle) * dashSpeed)
                enemy.stalkerPhase = .lunging(remaining: 0.36, velocity: vel, trailTimer: 0)
            } else {
                enemy.stalkerPhase = .telegraphing(remaining: nextRem, angle: updatedAngle)
            }

        case .lunging(let remaining, let vel, var trailTimer):
            enemy.node.position.x += vel.dx * CGFloat(dt)
            enemy.node.position.y += vel.dy * CGFloat(dt)
            trailTimer -= dt
            if trailTimer <= 0 {
                trailTimer = 0.045
                visual?.spawnGhostTrail(in: worldLayer, sharedPaths: sharedPaths)
            }
            let nextRem = remaining - dt
            if nextRem <= 0 {
                enemy.stalkerPhase = .recovering(remaining: 0.62)
            } else {
                enemy.stalkerPhase = .lunging(remaining: nextRem, velocity: vel, trailTimer: trailTimer)
            }

        case .recovering(let remaining):
            visual?.setTelegraph(active: false, distance: 0)
            let nextRem = remaining - dt
            if nextRem <= 0 {
                enemy.stalkerPhase = .stalking(cooldown: TimeInterval.random(in: 2.0...3.1))
            } else {
                enemy.stalkerPhase = .recovering(remaining: nextRem)
            }
        }
    }

    private func applyDamageToPlayer(_ amount: Int) {
        playerHP = max(0, playerHP - amount)
        invulnerabilityTimer = 0.58
        justTookDamageFlag = true

        panicVignette.alpha = 0.85
        shakeWorld(amplitude: 7.0)
        worldLayer.addChild(ParticleFactory.makeDeathBurst(at: playerPos, color: RelicarioPalette.vermilion, count: 10, textures: textures))

        MainActor.assumeIsolated {
            HapticManager.shared.triggerDamage()
        }

        if playerHP <= 0 {
            finishRun(didSurvive: false)
        } else {
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
                playerHP = min(playerMaxHP, playerHP + 28)
                medkitsCollected += 1
                worldLayer.addChild(ParticleFactory.makeDeathBurst(at: kit.node.position, color: RelicarioPalette.graceJade, count: 14, textures: textures))
                kit.node.removeFromParent()
                MainActor.assumeIsolated {
                    HapticManager.shared.triggerHeal()
                }
                publishHUDNow(directive: nil)
            } else if kit.age > 16.0 {
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

        switch archetype {
        case .desollado:
            node = DesolladoVisualNode(textures: textures, sharedPaths: sharedPaths)
            hp = 2
            speed = CGFloat.random(in: 102...120)
            radius = 12.0
            damage = 10
        case .jaula:
            node = JaulaViscerasVisualNode(textures: textures, sharedPaths: sharedPaths)
            hp = 12
            speed = CGFloat.random(in: 50...58)
            radius = 25.0
            damage = 20
        case .martir:
            node = MartirVisualNode(textures: textures, sharedPaths: sharedPaths)
            hp = 5
            speed = CGFloat.random(in: 84...98)
            radius = 16.0
            damage = 16
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
            contactDamage: damage
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
        let snap = GameHUDSnapshot(
            timeRemaining: max(0, totalRunDuration - elapsedTime),
            hp: playerHP,
            maxHP: playerMaxHP,
            kills: kills,
            stressIndex: stressTracker.currentStress,
            stressTier: stressTracker.currentTier,
            directorMessage: directive?.microMessage ?? (mode == .classic1985 ? "Regla fija [0-15s] → Oleada inicial" : "IA activa → Leyendo estrés"),
            isInterventionActive: directive?.isInterventionActive ?? false,
            medkitsCollected: medkitsCollected
        )
        MainActor.assumeIsolated {
            onSnapshotUpdate?(snap)
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
            stressIndex: stressTracker.currentStress,
            stressTier: stressTracker.currentTier,
            directorMessage: didSurvive ? "Experimento completado (60s)" : "Sujeto caído en combate",
            isInterventionActive: false,
            medkitsCollected: medkitsCollected
        )

        let record = RunTelemetryRecord(
            id: UUID(),
            initials: initials,
            mode: mode,
            survivedSeconds: survived,
            didSurvive: didSurvive,
            kills: kills,
            averageStress: stressTracker.averageStress,
            peakStress: stressTracker.peakStress,
            medkitsCollected: medkitsCollected,
            playedAt: Date()
        )

        MainActor.assumeIsolated {
            HapticManager.shared.triggerRunEnd(survived: didSurvive)
            onSnapshotUpdate?(finalSnap)
            onRunCompleted?(record)
        }
    }
}

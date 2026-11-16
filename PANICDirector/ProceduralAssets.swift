import SpriteKit
import UIKit

// MARK: - Caché de Texturas 100 % Procedurales (Sin .png ni .sks)

final class ProceduralTextureCache {
    let softGlow: SKTexture
    let emberMote: SKTexture
    let boneSplinter: SKTexture
    let starSpark: SKTexture
    let laserBeam1D: SKTexture

    init() {
        softGlow = Self.makeRadialGlow(size: 48)
        emberMote = Self.makeEmberMote(size: 14)
        boneSplinter = Self.makeBoneSplinter(size: CGSize(width: 14, height: 6))
        starSpark = Self.makeStarSpark(size: 18)
        laserBeam1D = Self.makeLaserBeam1D(size: CGSize(width: 24, height: 14))
    }

    private static func makeRadialGlow(size: CGFloat) -> SKTexture {
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: format)
        let image = renderer.image { ctx in
            let cg = ctx.cgContext
            let center = CGPoint(x: size * 0.5, y: size * 0.5)
            let colors = [
                UIColor.white.withAlphaComponent(0.95).cgColor,
                UIColor.white.withAlphaComponent(0.35).cgColor,
                UIColor.white.withAlphaComponent(0.0).cgColor
            ] as CFArray
            let locations: [CGFloat] = [0.0, 0.42, 1.0]
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: locations) {
                cg.drawRadialGradient(
                    gradient,
                    startCenter: center,
                    startRadius: 0,
                    endCenter: center,
                    endRadius: size * 0.5,
                    options: []
                )
            }
        }
        return SKTexture(image: image)
    }

    private static func makeEmberMote(size: CGFloat) -> SKTexture {
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: format)
        let image = renderer.image { ctx in
            let cg = ctx.cgContext
            let mid = size * 0.5
            cg.setFillColor(UIColor.white.cgColor)
            cg.move(to: CGPoint(x: mid, y: 1))
            cg.addLine(to: CGPoint(x: size - 1, y: mid))
            cg.addLine(to: CGPoint(x: mid, y: size - 1))
            cg.addLine(to: CGPoint(x: 1, y: mid))
            cg.closePath()
            cg.fillPath()
        }
        return SKTexture(image: image)
    }

    private static func makeBoneSplinter(size: CGSize) -> SKTexture {
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { ctx in
            let cg = ctx.cgContext
            cg.setFillColor(UIColor.white.cgColor)
            cg.move(to: CGPoint(x: 0, y: size.height * 0.5))
            cg.addLine(to: CGPoint(x: size.width * 0.65, y: 0.5))
            cg.addLine(to: CGPoint(x: size.width, y: size.height * 0.5))
            cg.addLine(to: CGPoint(x: size.width * 0.45, y: size.height - 0.5))
            cg.closePath()
            cg.fillPath()
        }
        return SKTexture(image: image)
    }

    private static func makeStarSpark(size: CGFloat) -> SKTexture {
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: format)
        let image = renderer.image { ctx in
            let cg = ctx.cgContext
            let c = size * 0.5
            let rOuter = size * 0.48
            let rInner = size * 0.12
            cg.setFillColor(UIColor.white.cgColor)
            cg.move(to: CGPoint(x: c, y: c - rOuter))
            cg.addLine(to: CGPoint(x: c + rInner, y: c - rInner))
            cg.addLine(to: CGPoint(x: c + rOuter, y: c))
            cg.addLine(to: CGPoint(x: c + rInner, y: c + rInner))
            cg.addLine(to: CGPoint(x: c, y: c + rOuter))
            cg.addLine(to: CGPoint(x: c - rInner, y: c + rInner))
            cg.addLine(to: CGPoint(x: c - rOuter, y: c))
            cg.addLine(to: CGPoint(x: c - rInner, y: c - rInner))
            cg.closePath()
            cg.fillPath()
        }
        return SKTexture(image: image)
    }

    private static func makeLaserBeam1D(size: CGSize) -> SKTexture {
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { ctx in
            let cg = ctx.cgContext
            let colors = [
                UIColor.white.withAlphaComponent(0.0).cgColor,
                UIColor.white.withAlphaComponent(0.95).cgColor,
                UIColor.white.withAlphaComponent(0.0).cgColor
            ] as CFArray
            let locations: [CGFloat] = [0.0, 0.5, 1.0]
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: locations) {
                cg.drawLinearGradient(
                    gradient,
                    start: CGPoint(x: 0, y: 0),
                    end: CGPoint(x: 0, y: size.height),
                    options: []
                )
            }
        }
        return SKTexture(image: image)
    }
}

// MARK: - Nodos Visuales de Criaturas Antinaturales (Relicario de Ceniza y Carmesí)

final class DesolladoVisualNode: SKNode {
    private let eyeFlashOverlay: SKShapeNode
    private let pupilNode: SKShapeNode
    private let leftWing: SKShapeNode
    private let rightWing: SKShapeNode

    init(textures: ProceduralTextureCache, sharedPaths: SharedCreaturePaths) {
        let glow = SKSpriteNode(texture: textures.softGlow, color: RelicarioPalette.vermilion, size: CGSize(width: 34, height: 34))
        glow.colorBlendFactor = 1.0
        glow.alpha = 0.36
        glow.blendMode = .add
        glow.zPosition = -1.0

        leftWing = SKShapeNode(path: sharedPaths.desolladoWingLeft)
        leftWing.fillColor = RelicarioPalette.darkFlesh
        leftWing.strokeColor = RelicarioPalette.vermilion
        leftWing.lineWidth = 1.6
        leftWing.lineJoin = .miter
        leftWing.position = CGPoint(x: 0, y: 3)
        leftWing.zPosition = -0.2

        rightWing = SKShapeNode(path: sharedPaths.desolladoWingRight)
        rightWing.fillColor = RelicarioPalette.darkFlesh
        rightWing.strokeColor = RelicarioPalette.vermilion
        rightWing.lineWidth = 1.6
        rightWing.lineJoin = .miter
        rightWing.position = CGPoint(x: 0, y: -3)
        rightWing.zPosition = -0.2

        let sclera = SKShapeNode(path: sharedPaths.desolladoEye)
        sclera.fillColor = RelicarioPalette.ivory
        sclera.strokeColor = RelicarioPalette.vermilion
        sclera.lineWidth = 1.8
        sclera.zPosition = 0.1

        pupilNode = SKShapeNode(path: sharedPaths.desolladoPupil)
        pupilNode.fillColor = RelicarioPalette.voidBlack
        pupilNode.strokeColor = RelicarioPalette.vermilion
        pupilNode.lineWidth = 1.0
        pupilNode.position = CGPoint(x: 1.5, y: 0)
        pupilNode.zPosition = 0.2

        eyeFlashOverlay = SKShapeNode(path: sharedPaths.desolladoEye)
        eyeFlashOverlay.fillColor = .white
        eyeFlashOverlay.strokeColor = .white
        eyeFlashOverlay.alpha = 0.0
        eyeFlashOverlay.zPosition = 0.5

        super.init()

        addChild(glow)
        addChild(leftWing)
        addChild(rightWing)
        addChild(sclera)
        addChild(pupilNode)
        addChild(eyeFlashOverlay)

        // Aleteo espasmódico asimétrico para transmitir incomodidad antinatural
        let leftFlap = SKAction.sequence([
            SKAction.rotate(toAngle: 0.42, duration: 0.11),
            SKAction.rotate(toAngle: -0.28, duration: 0.15)
        ])
        let rightFlap = SKAction.sequence([
            SKAction.rotate(toAngle: -0.46, duration: 0.13),
            SKAction.rotate(toAngle: 0.25, duration: 0.14)
        ])
        leftWing.run(SKAction.repeatForever(leftFlap))
        rightWing.run(SKAction.repeatForever(rightFlap))

        // Tic nervioso de la pupila vertical
        let pupilTwitch = SKAction.sequence([
            SKAction.scaleX(to: 1.4, y: 0.85, duration: 0.06),
            SKAction.wait(forDuration: 0.35),
            SKAction.scaleX(to: 0.75, y: 1.15, duration: 0.05),
            SKAction.wait(forDuration: 0.22)
        ])
        pupilNode.run(SKAction.repeatForever(pupilTwitch))
    }

    @available(*, unavailable)
    required init?(coder aDecoder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func triggerHitFlash() {
        eyeFlashOverlay.removeAllActions()
        eyeFlashOverlay.alpha = 0.9
        eyeFlashOverlay.run(SKAction.fadeAlpha(to: 0.0, duration: 0.07))
    }
}

final class JaulaViscerasVisualNode: SKNode {
    private let coreOrgan: SKShapeNode
    private let coreGlow: SKSpriteNode
    private let coreFlashOverlay: SKShapeNode
    private let eyeCore: SKNode
    private let armorRing = SKNode()
    private var jawRibs: [SKShapeNode] = []
    private let frenzyAura: SKShapeNode
    private var isFrenzied = false

    init(textures: ProceduralTextureCache, sharedPaths: SharedCreaturePaths) {
        coreGlow = SKSpriteNode(texture: textures.softGlow, color: RelicarioPalette.visceralCore, size: CGSize(width: 68, height: 68))
        coreGlow.colorBlendFactor = 1.0
        coreGlow.alpha = 0.45
        coreGlow.blendMode = .add
        coreGlow.zPosition = -1.0

        coreOrgan = SKShapeNode(path: sharedPaths.jaulaCore)
        coreOrgan.fillColor = RelicarioPalette.visceralCore
        coreOrgan.strokeColor = RelicarioPalette.vermilion
        coreOrgan.lineWidth = 2.0
        coreOrgan.zPosition = 0.1

        coreFlashOverlay = SKShapeNode(path: sharedPaths.jaulaCore)
        coreFlashOverlay.fillColor = .white
        coreFlashOverlay.strokeColor = .white
        coreFlashOverlay.alpha = 0.0
        coreFlashOverlay.zPosition = 0.6

        // Ojo central atrapado dentro del órgano
        let eyeNode = SKNode()
        eyeNode.zPosition = 0.3
        let sclera = SKShapeNode(ellipseOf: CGSize(width: 14, height: 10))
        sclera.fillColor = RelicarioPalette.ivory
        sclera.strokeColor = RelicarioPalette.voidBlack
        sclera.lineWidth = 1.2
        let iris = SKShapeNode(circleOfRadius: 3.8)
        iris.fillColor = RelicarioPalette.liturgicalGold
        iris.strokeColor = RelicarioPalette.vermilion
        iris.lineWidth = 1.0
        let slit = SKShapeNode(rectOf: CGSize(width: 1.8, height: 7.5), cornerRadius: 0.8)
        slit.fillColor = RelicarioPalette.voidBlack
        slit.strokeColor = .clear
        eyeNode.addChild(sclera)
        eyeNode.addChild(iris)
        eyeNode.addChild(slit)
        eyeCore = eyeNode

        frenzyAura = SKShapeNode(circleOfRadius: 26)
        frenzyAura.fillColor = .clear
        frenzyAura.strokeColor = RelicarioPalette.liturgicalGold
        frenzyAura.lineWidth = 2.0
        frenzyAura.alpha = 0.0
        frenzyAura.blendMode = .add
        frenzyAura.zPosition = 0.05

        super.init()

        addChild(coreGlow)
        addChild(frenzyAura)
        addChild(coreOrgan)
        addChild(eyeCore)
        addChild(armorRing)
        addChild(coreFlashOverlay)

        // 4 mandíbulas/costillas dentadas alrededor del núcleo
        armorRing.zPosition = 0.4
        for i in 0..<4 {
            let rib = SKShapeNode(path: sharedPaths.jaulaJawRib)
            rib.fillColor = RelicarioPalette.oldBone
            rib.strokeColor = RelicarioPalette.vermilion
            rib.lineWidth = 1.3
            rib.lineJoin = .miter
            rib.zRotation = CGFloat(i) * (.pi * 0.5)
            armorRing.addChild(rib)
            jawRibs.append(rib)
        }

        // Latido visceral continuo del núcleo
        let heartbeat = SKAction.sequence([
            SKAction.scale(to: 1.09, duration: 0.18),
            SKAction.scale(to: 0.94, duration: 0.22),
            SKAction.scale(to: 1.04, duration: 0.12),
            SKAction.scale(to: 1.0, duration: 0.35)
        ])
        coreOrgan.run(SKAction.repeatForever(heartbeat))

        let rotate = SKAction.rotate(byAngle: .pi * 2.0, duration: 5.2)
        armorRing.run(SKAction.repeatForever(rotate), withKey: "spin")
    }

    @available(*, unavailable)
    required init?(coder aDecoder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func updateLookAngle(_ angle: CGFloat) {
        eyeCore.zRotation = angle
    }

    func updateArmor(hp: Int, maxHP: Int, worldLayer: SKNode, textures: ProceduralTextureCache) {
        let ratio = Double(hp) / Double(max(1, maxHP))
        let targetRibs: Int
        if hp <= 3 { targetRibs = 0 }
        else if ratio > 0.78 { targetRibs = 4 }
        else if ratio > 0.60 { targetRibs = 3 }
        else if ratio > 0.42 { targetRibs = 2 }
        else { targetRibs = 1 }

        while jawRibs.count > targetRibs {
            let detached = jawRibs.removeLast()
            let worldPos = armorRing.convert(detached.position, to: worldLayer)
            let worldRot = detached.zRotation + armorRing.zRotation + zRotation
            detached.removeFromParent()
            detached.position = worldPos
            detached.zRotation = worldRot
            detached.zPosition = 5
            worldLayer.addChild(detached)

            let flingAngle = worldRot + CGFloat.random(in: -0.4...0.4)
            let push = CGVector(dx: cos(flingAngle) * 48, dy: sin(flingAngle) * 48)
            detached.run(SKAction.sequence([
                SKAction.group([
                    SKAction.move(by: push, duration: 0.38),
                    SKAction.rotate(byAngle: CGFloat.random(in: -2.4...2.4), duration: 0.38),
                    SKAction.fadeOut(withDuration: 0.38)
                ]),
                SKAction.removeFromParent()
            ]))

            let burst = ParticleFactory.makeBoneBurst(at: position, textures: textures)
            worldLayer.addChild(burst)
        }

        // Acelera giro al perder costillas
        let lostCount = 4 - jawRibs.count
        if let spin = armorRing.action(forKey: "spin") {
            spin.speed = 1.0 + CGFloat(lostCount) * 0.45
        }

        // Entra en frenesí dorado-carmesí al romperse las 4 costillas
        if jawRibs.isEmpty && !isFrenzied {
            isFrenzied = true
            coreGlow.color = RelicarioPalette.liturgicalGold
            coreGlow.alpha = 0.72
            let pulse = SKAction.repeatForever(SKAction.sequence([
                SKAction.group([
                    SKAction.fadeAlpha(to: 0.9, duration: 0.05),
                    SKAction.scale(to: 0.75, duration: 0.05)
                ]),
                SKAction.group([
                    SKAction.fadeAlpha(to: 0.0, duration: 0.48),
                    SKAction.scale(to: 1.75, duration: 0.48)
                ])
            ]))
            frenzyAura.run(pulse)
        }
    }

    func triggerHitFlash() {
        coreFlashOverlay.removeAllActions()
        coreFlashOverlay.alpha = 0.85
        coreFlashOverlay.run(SKAction.fadeAlpha(to: 0.0, duration: 0.07))
    }
}

final class MartirVisualNode: SKNode {
    private let torsoNode: SKShapeNode
    private let torsoFlashOverlay: SKShapeNode
    private let haloRing: SKNode
    private let leftArm: SKShapeNode
    private let rightArm: SKShapeNode
    private let chestSeam: SKShapeNode
    private let laserSight: SKSpriteNode
    private let crosshairReticle: SKShapeNode

    init(textures: ProceduralTextureCache, sharedPaths: SharedCreaturePaths) {
        let glow = SKSpriteNode(texture: textures.softGlow, color: RelicarioPalette.vermilion, size: CGSize(width: 44, height: 44))
        glow.colorBlendFactor = 1.0
        glow.alpha = 0.32
        glow.blendMode = .add
        glow.zPosition = -1.0

        // Brazos guadaña descoyuntados
        leftArm = SKShapeNode(path: sharedPaths.martirArm)
        leftArm.fillColor = RelicarioPalette.oldBone
        leftArm.strokeColor = RelicarioPalette.vermilion
        leftArm.lineWidth = 1.2
        leftArm.position = CGPoint(x: 2, y: 7)
        leftArm.zRotation = 0.45
        leftArm.zPosition = -0.1

        rightArm = SKShapeNode(path: sharedPaths.martirArm)
        rightArm.fillColor = RelicarioPalette.oldBone
        rightArm.strokeColor = RelicarioPalette.vermilion
        rightArm.lineWidth = 1.2
        rightArm.position = CGPoint(x: 2, y: -7)
        rightArm.yScale = -1.0
        rightArm.zRotation = -0.58
        rightArm.zPosition = -0.1

        // Silueta negra retorcida del Mártir
        torsoNode = SKShapeNode(path: sharedPaths.martirTorso)
        torsoNode.fillColor = RelicarioPalette.voidBlack
        torsoNode.strokeColor = RelicarioPalette.vermilion
        torsoNode.lineWidth = 2.0
        torsoNode.lineJoin = .miter
        torsoNode.zPosition = 0.2

        torsoFlashOverlay = SKShapeNode(path: sharedPaths.martirTorso)
        torsoFlashOverlay.fillColor = .white
        torsoFlashOverlay.strokeColor = .white
        torsoFlashOverlay.alpha = 0.0
        torsoFlashOverlay.zPosition = 0.6

        // Halo litúrgico fracturado flotante
        haloRing = SKNode()
        haloRing.position = CGPoint(x: -6, y: 0)
        haloRing.zPosition = 0.3
        let arc1 = SKShapeNode(path: sharedPaths.martirBrokenHalo1)
        arc1.strokeColor = RelicarioPalette.liturgicalGold
        arc1.lineWidth = 2.0
        let arc2 = SKShapeNode(path: sharedPaths.martirBrokenHalo2)
        arc2.strokeColor = RelicarioPalette.liturgicalGold
        arc2.lineWidth = 1.6
        haloRing.addChild(arc1)
        haloRing.addChild(arc2)

        // Costura/Ojo en el pecho que se abre al apuntar
        chestSeam = SKShapeNode(ellipseOf: CGSize(width: 4, height: 8))
        chestSeam.fillColor = RelicarioPalette.vermilion
        chestSeam.strokeColor = RelicarioPalette.liturgicalGold
        chestSeam.lineWidth = 1.0
        chestSeam.position = CGPoint(x: 2, y: 0)
        chestSeam.zPosition = 0.4

        // Mira láser dorada procedural (1D gradient estirado)
        laserSight = SKSpriteNode(texture: textures.laserBeam1D, color: RelicarioPalette.liturgicalGold, size: CGSize(width: 240, height: 8))
        laserSight.colorBlendFactor = 1.0
        laserSight.anchorPoint = CGPoint(x: 0.0, y: 0.5)
        laserSight.position = CGPoint(x: 12, y: 0)
        laserSight.blendMode = .add
        laserSight.alpha = 0.0
        laserSight.zPosition = -0.3

        crosshairReticle = SKShapeNode(path: sharedPaths.diamondReticle)
        crosshairReticle.fillColor = .clear
        crosshairReticle.strokeColor = RelicarioPalette.liturgicalGold
        crosshairReticle.lineWidth = 1.5
        crosshairReticle.alpha = 0.0
        crosshairReticle.zPosition = 0.45

        super.init()

        addChild(glow)
        addChild(laserSight)
        addChild(leftArm)
        addChild(rightArm)
        addChild(torsoNode)
        addChild(haloRing)
        addChild(chestSeam)
        addChild(crosshairReticle)
        addChild(torsoFlashOverlay)

        // Rotación rota del halo + tics espasmódicos de brazos
        haloRing.run(SKAction.repeatForever(SKAction.rotate(byAngle: .pi * 2.0, duration: 3.4)))

        let leftTwitch = SKAction.sequence([
            SKAction.wait(forDuration: 0.65),
            SKAction.rotate(toAngle: 0.85, duration: 0.04),
            SKAction.rotate(toAngle: 0.42, duration: 0.09)
        ])
        let rightTwitch = SKAction.sequence([
            SKAction.wait(forDuration: 0.42),
            SKAction.rotate(toAngle: -0.92, duration: 0.05),
            SKAction.rotate(toAngle: -0.55, duration: 0.10)
        ])
        leftArm.run(SKAction.repeatForever(leftTwitch))
        rightArm.run(SKAction.repeatForever(rightTwitch))
    }

    @available(*, unavailable)
    required init?(coder aDecoder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func setTelegraph(active: Bool, distance: CGFloat) {
        if active {
            let reticleDist = max(60, distance)
            laserSight.size = CGSize(width: max(48, reticleDist - 12), height: 7)
            laserSight.alpha = 0.82
            crosshairReticle.position = CGPoint(x: reticleDist, y: 0)
            crosshairReticle.alpha = 0.95
            chestSeam.fillColor = RelicarioPalette.liturgicalGold
            chestSeam.xScale = 1.9
            chestSeam.yScale = 1.3
        } else {
            laserSight.alpha = 0.0
            crosshairReticle.alpha = 0.0
            chestSeam.fillColor = RelicarioPalette.vermilion
            chestSeam.xScale = 1.0
            chestSeam.yScale = 1.0
        }
    }

    func spawnGhostTrail(in worldLayer: SKNode, sharedPaths: SharedCreaturePaths) {
        let ghost = SKShapeNode(path: sharedPaths.martirTorso)
        ghost.fillColor = .clear
        ghost.strokeColor = RelicarioPalette.vermilion
        ghost.lineWidth = 2.0
        ghost.blendMode = .add
        ghost.position = position
        ghost.zRotation = zRotation
        ghost.alpha = 0.58
        ghost.zPosition = 2.0
        worldLayer.addChild(ghost)

        ghost.run(SKAction.sequence([
            SKAction.group([
                SKAction.fadeOut(withDuration: 0.22),
                SKAction.scale(to: 0.78, duration: 0.22)
            ]),
            SKAction.removeFromParent()
        ]))
    }

    func triggerHitFlash() {
        torsoFlashOverlay.removeAllActions()
        torsoFlashOverlay.alpha = 0.9
        torsoFlashOverlay.run(SKAction.fadeAlpha(to: 0.0, duration: 0.07))
    }
}

// MARK: - Caminos CGPath Compartidos e Inmutables

final class SharedCreaturePaths {
    let desolladoEye: CGPath
    let desolladoPupil: CGPath
    let desolladoWingLeft: CGPath
    let desolladoWingRight: CGPath

    let jaulaCore: CGPath
    let jaulaJawRib: CGPath

    let martirTorso: CGPath
    let martirArm: CGPath
    let martirBrokenHalo1: CGPath
    let martirBrokenHalo2: CGPath
    let diamondReticle: CGPath

    let playerSigil: CGPath
    let playerRingArc: CGPath
    let projectileShard: CGPath
    let medkitDiamond: CGPath
    let medkitCross: CGPath

    init() {
        desolladoEye = CGPath(ellipseIn: CGRect(x: -8, y: -6.5, width: 16, height: 13), transform: nil)
        desolladoPupil = CGPath(ellipseIn: CGRect(x: -1.4, y: -4.8, width: 2.8, height: 9.6), transform: nil)

        // Ala guadaña asimétrica izquierda
        let lw = CGMutablePath()
        lw.move(to: CGPoint(x: 0, y: 0))
        lw.addCurve(to: CGPoint(x: -14, y: 17), control1: CGPoint(x: 4, y: 11), control2: CGPoint(x: -4, y: 19))
        lw.addLine(to: CGPoint(x: -8, y: 9))
        lw.addLine(to: CGPoint(x: -16, y: 7))
        lw.addLine(to: CGPoint(x: -4, y: 1))
        lw.closeSubpath()
        desolladoWingLeft = lw

        let rw = CGMutablePath()
        rw.move(to: CGPoint(x: 0, y: 0))
        rw.addCurve(to: CGPoint(x: -12, y: -18), control1: CGPoint(x: 5, y: -11), control2: CGPoint(x: -3, y: -19))
        rw.addLine(to: CGPoint(x: -6, y: -10))
        rw.addLine(to: CGPoint(x: -15, y: -6))
        rw.addLine(to: CGPoint(x: -4, y: -1))
        rw.closeSubpath()
        desolladoWingRight = rw

        // Núcleo visceral octogonal irregular
        let jc = CGMutablePath()
        for i in 0..<8 {
            let a = CGFloat(i) * (.pi * 2.0 / 8.0)
            let r: CGFloat = (i % 2 == 0) ? 16.5 : 13.5
            let p = CGPoint(x: cos(a) * r, y: sin(a) * r)
            if i == 0 { jc.move(to: p) } else { jc.addLine(to: p) }
        }
        jc.closeSubpath()
        jaulaCore = jc

        // Costilla dentada de hueso
        let jr = CGMutablePath()
        let innerR: CGFloat = 19.5
        let outerR: CGFloat = 27.5
        let startA: CGFloat = -0.58
        let endA: CGFloat = 0.58
        jr.addArc(center: .zero, radius: outerR, startAngle: startA, endAngle: endA, clockwise: false)
        jr.addLine(to: CGPoint(x: cos(endA * 0.72) * (innerR - 4.0), y: sin(endA * 0.72) * (innerR - 4.0)))
        jr.addLine(to: CGPoint(x: cos(0.18) * innerR, y: sin(0.18) * innerR))
        jr.addLine(to: CGPoint(x: innerR - 4.8, y: 0))
        jr.addLine(to: CGPoint(x: cos(-0.18) * innerR, y: sin(-0.18) * innerR))
        jr.addLine(to: CGPoint(x: cos(startA * 0.72) * (innerR - 4.0), y: sin(startA * 0.72) * (innerR - 4.0)))
        jr.closeSubpath()
        jaulaJawRib = jr

        // Mártir Descoyuntado: torso estrecho torcido
        let mt = CGMutablePath()
        mt.move(to: CGPoint(x: 15, y: 0))
        mt.addLine(to: CGPoint(x: 2, y: 9))
        mt.addLine(to: CGPoint(x: -14, y: 4))
        mt.addLine(to: CGPoint(x: -9, y: 0))
        mt.addLine(to: CGPoint(x: -16, y: -5))
        mt.addLine(to: CGPoint(x: 1, y: -8))
        mt.closeSubpath()
        martirTorso = mt

        let ma = CGMutablePath()
        ma.move(to: .zero)
        ma.addLine(to: CGPoint(x: 11, y: 8))
        ma.addLine(to: CGPoint(x: 19, y: 2))
        ma.addLine(to: CGPoint(x: 12, y: 3))
        ma.closeSubpath()
        martirArm = ma

        let h1 = CGMutablePath()
        h1.addArc(center: .zero, radius: 13, startAngle: 0.25, endAngle: 2.35, clockwise: false)
        martirBrokenHalo1 = h1

        let h2 = CGMutablePath()
        h2.addArc(center: .zero, radius: 14.5, startAngle: 3.3, endAngle: 5.7, clockwise: false)
        martirBrokenHalo2 = h2

        let dr = CGMutablePath()
        dr.move(to: CGPoint(x: 8, y: 0))
        dr.addLine(to: CGPoint(x: 0, y: 8))
        dr.addLine(to: CGPoint(x: -8, y: 0))
        dr.addLine(to: CGPoint(x: 0, y: -8))
        dr.closeSubpath()
        diamondReticle = dr

        // Jugador (Sello del Relicario apuntando a +X)
        let ps = CGMutablePath()
        ps.move(to: CGPoint(x: 15, y: 0))
        ps.addLine(to: CGPoint(x: -4, y: 10))
        ps.addLine(to: CGPoint(x: -11, y: 0))
        ps.addLine(to: CGPoint(x: -4, y: -10))
        ps.closeSubpath()
        playerSigil = ps

        let pra = CGMutablePath()
        pra.addArc(center: .zero, radius: 18, startAngle: 0.4, endAngle: .pi * 0.92, clockwise: false)
        pra.move(to: CGPoint(x: cos(.pi * 1.1) * 18, y: sin(.pi * 1.1) * 18))
        pra.addArc(center: .zero, radius: 18, startAngle: .pi * 1.1, endAngle: .pi * 1.85, clockwise: false)
        playerRingArc = pra

        // Astilla de Plata
        let proj = CGMutablePath()
        proj.move(to: CGPoint(x: 11, y: 0))
        proj.addLine(to: CGPoint(x: -5, y: 3.2))
        proj.addLine(to: CGPoint(x: -9, y: 0))
        proj.addLine(to: CGPoint(x: -5, y: -3.2))
        proj.closeSubpath()
        projectileShard = proj

        // Gota de Gracia (Botiquín)
        let md = CGMutablePath()
        md.move(to: CGPoint(x: 0, y: 13))
        md.addLine(to: CGPoint(x: 11, y: 0))
        md.addLine(to: CGPoint(x: 0, y: -13))
        md.addLine(to: CGPoint(x: -11, y: 0))
        md.closeSubpath()
        medkitDiamond = md

        let mc = CGMutablePath()
        mc.addRect(CGRect(x: -1.6, y: -5.5, width: 3.2, height: 11))
        mc.addRect(CGRect(x: -5.5, y: -1.6, width: 11, height: 3.2))
        medkitCross = mc
    }
}

// MARK: - Fábrica de Partículas y Nodos del Jugador/Botiquín

enum ParticleFactory {
    static func makePlayerNode(textures: ProceduralTextureCache, paths: SharedCreaturePaths) -> SKNode {
        let root = SKNode()

        let glow = SKSpriteNode(texture: textures.softGlow, color: RelicarioPalette.coldSilver, size: CGSize(width: 56, height: 56))
        glow.colorBlendFactor = 1.0
        glow.alpha = 0.35
        glow.blendMode = .add
        glow.zPosition = -1

        let outerRing = SKShapeNode(path: paths.playerRingArc)
        outerRing.strokeColor = RelicarioPalette.coldSilver
        outerRing.lineWidth = 1.8
        outerRing.lineCap = .round
        outerRing.zPosition = 0.1
        outerRing.run(SKAction.repeatForever(SKAction.rotate(byAngle: .pi * 2.0, duration: 4.5)))

        let body = SKShapeNode(path: paths.playerSigil)
        body.fillColor = RelicarioPalette.ivory
        body.strokeColor = RelicarioPalette.coldSilver
        body.lineWidth = 2.0
        body.lineJoin = .miter
        body.zPosition = 0.2

        root.addChild(glow)
        root.addChild(outerRing)
        root.addChild(body)
        return root
    }

    static func makeMedkitNode(textures: ProceduralTextureCache, paths: SharedCreaturePaths) -> SKNode {
        let root = SKNode()

        let glow = SKSpriteNode(texture: textures.softGlow, color: RelicarioPalette.graceJade, size: CGSize(width: 54, height: 54))
        glow.colorBlendFactor = 1.0
        glow.alpha = 0.55
        glow.blendMode = .add
        glow.zPosition = -0.5

        let ring = SKShapeNode(circleOfRadius: 15)
        ring.fillColor = .clear
        ring.strokeColor = RelicarioPalette.graceJade
        ring.lineWidth = 1.4
        ring.alpha = 0.75
        ring.run(SKAction.repeatForever(SKAction.sequence([
            SKAction.group([SKAction.scale(to: 1.45, duration: 0.7), SKAction.fadeAlpha(to: 0.1, duration: 0.7)]),
            SKAction.group([SKAction.scale(to: 0.9, duration: 0.01), SKAction.fadeAlpha(to: 0.75, duration: 0.01)])
        ])))

        let diamond = SKShapeNode(path: paths.medkitDiamond)
        diamond.fillColor = RelicarioPalette.voidBlack
        diamond.strokeColor = RelicarioPalette.graceJade
        diamond.lineWidth = 2.4
        diamond.zPosition = 0.1

        let cross = SKShapeNode(path: paths.medkitCross)
        cross.fillColor = RelicarioPalette.ivory
        cross.strokeColor = .clear
        cross.zPosition = 0.2

        root.addChild(glow)
        root.addChild(ring)
        root.addChild(diamond)
        root.addChild(cross)

        root.run(SKAction.repeatForever(SKAction.sequence([
            SKAction.scale(to: 1.08, duration: 0.45),
            SKAction.scale(to: 0.95, duration: 0.45)
        ])))
        return root
    }

    static func makeDeathBurst(
        at position: CGPoint,
        color: UIColor,
        count: Int,
        textures: ProceduralTextureCache
    ) -> SKNode {
        let emitter = SKEmitterNode()
        emitter.position = position
        emitter.zPosition = 6
        emitter.particleTexture = textures.emberMote
        emitter.particleBirthRate = 400
        emitter.numParticlesToEmit = count
        emitter.particleLifetime = 0.38
        emitter.particleLifetimeRange = 0.14
        emitter.emissionAngleRange = .pi * 2.0
        emitter.particleSpeed = 125
        emitter.particleSpeedRange = 75
        emitter.particleScale = 0.72
        emitter.particleScaleSpeed = -1.3
        emitter.particleAlpha = 0.95
        emitter.particleAlphaSpeed = -2.4
        emitter.particleColor = color
        emitter.particleColorBlendFactor = 1.0
        emitter.particleBlendMode = .add
        emitter.run(SKAction.sequence([
            SKAction.wait(forDuration: 0.6),
            SKAction.removeFromParent()
        ]))
        return emitter
    }

    static func makeBoneBurst(at position: CGPoint, textures: ProceduralTextureCache) -> SKNode {
        let emitter = SKEmitterNode()
        emitter.position = position
        emitter.zPosition = 6
        emitter.particleTexture = textures.boneSplinter
        emitter.particleBirthRate = 300
        emitter.numParticlesToEmit = 8
        emitter.particleLifetime = 0.42
        emitter.emissionAngleRange = .pi * 2.0
        emitter.particleSpeed = 105
        emitter.particleSpeedRange = 45
        emitter.particleRotationRange = .pi * 2.0
        emitter.particleRotationSpeed = 6.0
        emitter.particleScale = 0.9
        emitter.particleAlpha = 0.95
        emitter.particleAlphaSpeed = -2.2
        emitter.particleColor = RelicarioPalette.oldBone
        emitter.particleColorBlendFactor = 1.0
        emitter.run(SKAction.sequence([
            SKAction.wait(forDuration: 0.55),
            SKAction.removeFromParent()
        ]))
        return emitter
    }

    static func makeSparkBurst(at position: CGPoint, color: UIColor, textures: ProceduralTextureCache) -> SKNode {
        let emitter = SKEmitterNode()
        emitter.position = position
        emitter.zPosition = 6
        emitter.particleTexture = textures.starSpark
        emitter.particleBirthRate = 320
        emitter.numParticlesToEmit = 6
        emitter.particleLifetime = 0.22
        emitter.emissionAngleRange = .pi * 2.0
        emitter.particleSpeed = 85
        emitter.particleSpeedRange = 35
        emitter.particleScale = 0.55
        emitter.particleScaleSpeed = -1.8
        emitter.particleAlpha = 0.9
        emitter.particleAlphaSpeed = -3.8
        emitter.particleColor = color
        emitter.particleColorBlendFactor = 1.0
        emitter.particleBlendMode = .add
        emitter.run(SKAction.sequence([
            SKAction.wait(forDuration: 0.35),
            SKAction.removeFromParent()
        ]))
        return emitter
    }
}

// MARK: - Barra Flotante de XP y Nivel encima del Puntero

final class PlayerXPBarNode: SKNode {
    private let trackNode: SKShapeNode
    private let fillSprite: SKSpriteNode
    private let levelLabel: SKLabelNode
    private let barInnerWidth: CGFloat = 42.0

    override init() {
        let trackRect = CGRect(x: -23, y: -3, width: 46, height: 6)
        let trackPath = CGPath(roundedRect: trackRect, cornerWidth: 3, cornerHeight: 3, transform: nil)
        trackNode = SKShapeNode(path: trackPath)
        trackNode.fillColor = RelicarioPalette.voidBlack.withAlphaComponent(0.86)
        trackNode.strokeColor = RelicarioPalette.oldBone.withAlphaComponent(0.70)
        trackNode.lineWidth = 0.9
        trackNode.zPosition = 0

        fillSprite = SKSpriteNode(
            color: RelicarioPalette.coldSilver,
            size: CGSize(width: barInnerWidth, height: 3.4)
        )
        fillSprite.anchorPoint = CGPoint(x: 0.0, y: 0.5)
        fillSprite.position = CGPoint(x: -barInnerWidth * 0.5, y: 0)
        fillSprite.xScale = 0.0
        fillSprite.zPosition = 0.2

        levelLabel = SKLabelNode(fontNamed: "Menlo-Bold")
        levelLabel.text = "NV.1"
        levelLabel.fontSize = 9.5
        levelLabel.fontColor = RelicarioPalette.liturgicalGold
        levelLabel.horizontalAlignmentMode = .center
        levelLabel.verticalAlignmentMode = .bottom
        levelLabel.position = CGPoint(x: 0, y: 5.5)
        levelLabel.zPosition = 0.3

        super.init()

        addChild(trackNode)
        addChild(fillSprite)
        addChild(levelLabel)
    }

    @available(*, unavailable)
    required init?(coder aDecoder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func updateXP(progress: Double, level: Int, leveledUp: Bool = false) {
        let clamped = CGFloat(min(1.0, max(0.0, progress)))
        let targetColor = level >= 3 ? RelicarioPalette.liturgicalGold : RelicarioPalette.coldSilver
        levelLabel.text = "NV.\(level)"

        fillSprite.removeAction(forKey: "xpFill")
        if leveledUp {
            fillSprite.run(SKAction.sequence([
                SKAction.scaleX(to: 1.0, duration: 0.05),
                SKAction.wait(forDuration: 0.08),
                SKAction.scaleX(to: 0.0, duration: 0.0),
                SKAction.scaleX(to: clamped, duration: 0.14)
            ]), withKey: "xpFill")
        } else {
            fillSprite.color = targetColor
            fillSprite.run(SKAction.scaleX(to: clamped, duration: 0.12), withKey: "xpFill")
        }
    }

    func playLevelUpEffect(level: Int, in worldLayer: SKNode, playerPos: CGPoint, textures: ProceduralTextureCache) {
        // Pulso en el texto y barra
        trackNode.removeAction(forKey: "barPulse")
        trackNode.run(SKAction.sequence([
            SKAction.scale(to: 1.16, duration: 0.08),
            SKAction.scale(to: 1.0, duration: 0.18)
        ]), withKey: "barPulse")

        levelLabel.removeAction(forKey: "lvlBounce")
        levelLabel.run(SKAction.sequence([
            SKAction.scale(to: 1.45, duration: 0.09),
            SKAction.scale(to: 1.0, duration: 0.18)
        ]), withKey: "lvlBounce")

        fillSprite.removeAction(forKey: "xpColorFlash")
        fillSprite.run(SKAction.sequence([
            SKAction.colorize(with: .white, colorBlendFactor: 1.0, duration: 0.06),
            SKAction.colorize(with: level >= 3 ? RelicarioPalette.liturgicalGold : RelicarioPalette.coldSilver, colorBlendFactor: 1.0, duration: 0.20)
        ]), withKey: "xpColorFlash")

        // Onda expansiva dorada alrededor del puntero
        let ring = SKShapeNode(circleOfRadius: 16)
        ring.position = playerPos
        ring.fillColor = .clear
        ring.strokeColor = RelicarioPalette.liturgicalGold
        ring.lineWidth = 2.4
        ring.blendMode = .add
        ring.zPosition = 5.5
        worldLayer.addChild(ring)
        ring.run(SKAction.sequence([
            SKAction.group([
                SKAction.scale(to: 2.9, duration: 0.40),
                SKAction.fadeOut(withDuration: 0.40)
            ]),
            SKAction.removeFromParent()
        ]))

        // Aviso flotante de subida de nivel
        let popup = SKLabelNode(fontNamed: "Menlo-Bold")
        popup.text = "¡NIVEL \(level)! +PODER"
        popup.fontSize = 11.5
        popup.fontColor = RelicarioPalette.liturgicalGold
        popup.position = CGPoint(x: playerPos.x, y: playerPos.y + 42)
        popup.zPosition = 9
        worldLayer.addChild(popup)
        popup.run(SKAction.sequence([
            SKAction.group([
                SKAction.moveBy(x: 0, y: 20, duration: 0.85),
                SKAction.sequence([
                    SKAction.wait(forDuration: 0.45),
                    SKAction.fadeOut(withDuration: 0.40)
                ])
            ]),
            SKAction.removeFromParent()
        ]))

        worldLayer.addChild(ParticleFactory.makeDeathBurst(at: playerPos, color: RelicarioPalette.liturgicalGold, count: 14, textures: textures))
    }
}


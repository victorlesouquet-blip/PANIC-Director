# PANIC DIRECTOR

Prototipo jugable de 60 segundos para iPhone (iOS 17+, orientación vertical) desarrollado en **SwiftUI + SpriteKit** para demostrar en vivo la diferencia entre las reglas matemáticas fijas de **1985** y una **IA Directora adaptativa (2026)** basada en el Índice de Estrés del jugador.

## Temática: Relicario de Ceniza y Carmesí (Aberraciones Antinaturales)
Renderizado **100 % procedural** en SpriteKit (`SKShapeNode`, `CGPath`, texturas radiales y gradientes generados en memoria con `UIGraphicsImageRenderer` y emisores `SKEmitterNode` por código — **cero archivos `.png` o `.sks` en la escena**):

1. **Querubín Desollado** *(Enjambre rápido)*: ojo desorbitado de esclerótica marfil y pupila vertical carmesí con alas de hueso en guadaña que aletean de forma espasmódica y asimétrica.
2. **Jaula de Vísceras** *(Tanque lento y resistente)*: órgano carmesí palpitante con un ojo central que vigila al jugador, encerrado entre 4 costillas dentadas rotatorias que se quiebran una a una cada 25 % de daño hasta desatar un frenesí dorado.
3. **Mártir Descoyuntado** *(Acosador impredecible)*: silueta negra retorcida con halo litúrgico fracturado y brazos guadaña con tics nerviosos; abre el pecho para proyectar una mira láser dorada antes de embestir dejando estelas fantasma.

## Estructura del proyecto Xcode
- `PANICDirector.xcodeproj` — Proyecto Xcode completo y preconfigurado (iOS 17.0+, iPhone, orientación vertical bloqueada, `GENERATE_INFOPLIST_FILE = YES`, esquema compartido `PANICDirector`).
- `PANICDirector/Assets.xcassets` — Icono de app iOS (`AppIcon` 1024×1024 RGB opaco) y `AccentColor`.
- `PANICDirector/PANICDirectorApp.swift` — Punto de entrada `@main`, bloqueo vertical (`.portrait`) y coordinador de pantallas.
- `PANICDirector/GameModels.swift` — Paleta, modelos de datos, persistencia local en `UserDefaults` (`TelemetryStore`) y respuesta háptica (`HapticManager` con `UIImpactFeedbackGenerator`).
- `PANICDirector/AIDirectorEngine.swift` — Medidor del Índice de Estrés (0–100 %) + comparación de motores `Classic1985Engine` vs `Adaptive2026Director`.
- `PANICDirector/ProceduralAssets.swift` — Caché de texturas en memoria y nodos procedurales de las 3 criaturas antinaturales, jugador y Gotas de Gracia.
- `PANICDirector/PanicGameScene.swift` — Escena SpriteKit, joystick táctil flotante, auto-disparo al enemigo más cercano, colisiones y telemetría HUD.
- `PANICDirector/StartAndGameViews.swift` — Pantalla recreativa inicial (3 iniciales + selector 1985/2026) y HUD en partida con micro-mensajes en vivo.
- `PANICDirector/ResultsTelemetryView.swift` — Resumen de partida y tabla comparativa **Telemetría de Clase (1985 vs 2026)**.

## Cómo abrir y desplegar en iPhone desde tu Mac (Desktop)
1. Clona el repositorio en tu Desktop (o descarga el ZIP desde GitHub):
   ```bash
   git clone https://github.com/victorlesouquet-blip/PANIC-Director.git ~/Desktop/PANIC-Director
   ```
2. Abre **`PANICDirector.xcodeproj`** con Xcode (`open ~/Desktop/PANIC-Director/PANICDirector.xcodeproj`).
3. Para **Simulador iOS 17+**: selecciona cualquier iPhone y pulsa **Run (`Cmd + R`)** directamente.
4. Para **iPhone físico**:
   - Conecta tu iPhone por cable/Wi-Fi.
   - En Xcode ve al target **PANICDirector → Signing & Capabilities → Team** y elige tu cuenta/Apple ID (si dice que el Bundle ID está en uso, cambia `com.victorlesouquet.PANICDirector` añadiendo cualquier sufijo).
   - Pulsa **Run (`Cmd + R`)** (y si es tu primera app con cuenta personal en ese iPhone, confía en tu certificado en *Ajustes → General → Gestión de dispositivos y VPN*).
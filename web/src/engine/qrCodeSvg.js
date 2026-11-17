// Generador autónomo de códigos QR en SVG puro (ISO/IEC 18004, modo Byte UTF-8, ECC Nivel M/L)
// Cero dependencias externas: funciona 100% offline y en cualquier red escolar.

const EC_CODEWORDS_PER_BLOCK_L = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const NUM_BLOCKS_L = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];

const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

const ALIGNMENT_POSITIONS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
];

// Tablas log/exp para GF(256) con polinomio primitivo 0x11D
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsComputeRemainder(data, degree) {
  const gen = rsGeneratorPoly(degree);
  const rem = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < degree - 1; j++) {
      rem[j] = rem[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    rem[degree - 1] = gfMul(gen[degree], factor);
  }
  return rem;
}

function selectVersion(byteLength) {
  for (let v = 1; v <= 10; v++) {
    const total = TOTAL_CODEWORDS[v];
    const ecTotal = EC_CODEWORDS_PER_BLOCK_L[v] * NUM_BLOCKS_L[v];
    const dataCapacityBytes = total - ecTotal;
    const headerBits = v <= 9 ? 4 + 8 : 4 + 16;
    const availableForPayload = Math.floor((dataCapacityBytes * 8 - headerBits) / 8);
    if (byteLength <= availableForPayload) return v;
  }
  throw new Error('Texto demasiado largo para QR v1-v10');
}

function encodeDataCodewords(utf8Bytes, version) {
  const total = TOTAL_CODEWORDS[version];
  const ecPerBlock = EC_CODEWORDS_PER_BLOCK_L[version];
  const numBlocks = NUM_BLOCKS_L[version];
  const dataCapacity = total - ecPerBlock * numBlocks;

  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Modo Byte = 0100
  pushBits(0b0100, 4);
  pushBits(utf8Bytes.length, version <= 9 ? 8 : 16);
  for (const b of utf8Bytes) pushBits(b, 8);

  const maxBits = dataCapacity * 8;
  const termLen = Math.min(4, maxBits - bits.length);
  pushBits(0, termLen);

  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(dataCapacity);
  const byteLen = bits.length / 8;
  for (let i = 0; i < byteLen; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i * 8 + j];
    }
    codewords[i] = b;
  }

  let padToggle = true;
  for (let i = byteLen; i < dataCapacity; i++) {
    codewords[i] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  // Dividir en bloques e intercalar con Reed-Solomon
  const blocksData = [];
  const blocksEc = [];
  const baseBlockSize = Math.floor(dataCapacity / numBlocks);
  const extraBlocks = dataCapacity % numBlocks;

  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = baseBlockSize + (b >= numBlocks - extraBlocks ? 1 : 0);
    const slice = codewords.slice(offset, offset + len);
    offset += len;
    blocksData.push(slice);
    blocksEc.push(rsComputeRemainder(slice, ecPerBlock));
  }

  const finalCodewords = [];
  const maxDataLen = baseBlockSize + (extraBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < blocksData[b].length) finalCodewords.push(blocksData[b][i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < numBlocks; b++) {
      finalCodewords.push(blocksEc[b][i]);
    }
  }

  return finalCodewords;
}

function createBaseMatrix(version) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Uint8Array(size));
  const isFunction = Array.from({ length: size }, () => new Uint8Array(size));

  const setFunctionModule = (r, c, dark) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark ? 1 : 0;
    isFunction[r][c] = 1;
  };

  const drawFinder = (topR, leftC) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr;
        const c = leftC + dc;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(r, c, inOuter && (onBorder || inInner));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Patrones de sincronización (Timing)
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Patrones de alineación
  const alignCoords = ALIGNMENT_POSITIONS[version];
  for (let i = 0; i < alignCoords.length; i++) {
    for (let j = 0; j < alignCoords.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === alignCoords.length - 1) ||
        (i === alignCoords.length - 1 && j === 0)
      ) {
        continue;
      }
      const cr = alignCoords[i];
      const cc = alignCoords[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunctionModule(cr + dr, cc + dc, dark);
        }
      }
    }
  }

  // Módulo oscuro fijo y reserva de formato
  setFunctionModule(4 * version + 9, 8, true);
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      if (!isFunction[8][i]) setFunctionModule(8, i, false);
      if (!isFunction[i][8]) setFunctionModule(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
    if (!isFunction[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
  }

  // Información de versión para v >= 7
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(a, b, bit);
      setFunctionModule(b, a, bit);
    }
  }

  return { size, modules, isFunction };
}

function drawFormatBits(modules, size, mask) {
  // Nivel L = 01 en formato QR
  const data = (0b01 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  // Primera copia alrededor del buscador superior izquierdo
  for (let i = 0; i <= 5; i++) modules[i][8] = (bits >>> i) & 1;
  modules[7][8] = (bits >>> 6) & 1;
  modules[8][8] = (bits >>> 7) & 1;
  modules[8][7] = (bits >>> 8) & 1;
  for (let i = 9; i < 15; i++) modules[8][14 - i] = (bits >>> i) & 1;

  // Segunda copia (superior derecha e inferior izquierda)
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = (bits >>> i) & 1;
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = (bits >>> i) & 1;
  modules[size - 8][8] = 1;
}

function maskBit(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

export function generateQrMatrix(text) {
  const utf8Bytes = new TextEncoder().encode(String(text || ''));
  const version = selectVersion(utf8Bytes.length);
  const codewords = encodeDataCodewords(utf8Bytes, version);
  const { size, modules, isFunction } = createBaseMatrix(version);

  // Colocar bits en zigzag de derecha a izquierda
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunction[r][c] && bitIdx < totalBits) {
          const byte = codewords[bitIdx >>> 3];
          const bit = (byte >>> (7 - (bitIdx & 7))) & 1;
          modules[r][c] = bit;
          bitIdx++;
        }
      }
    }
  }

  // Aplicar máscara 0 (óptima y rápida para URLs) y bits de formato
  const chosenMask = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunction[r][c] && maskBit(chosenMask, r, c)) {
        modules[r][c] ^= 1;
      }
    }
  }
  drawFormatBits(modules, size, chosenMask);

  return modules.map((row) => Array.from(row, (v) => v === 1));
}

export function renderQrCodeSvg(text, { sizePx = 220, darkColor = '#080606', lightColor = '#F5EFE6', margin = 3 } = {}) {
  const matrix = generateQrMatrix(text);
  const n = matrix.length;
  const total = n + margin * 2;

  const paths = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        paths.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }

  return `<svg class="qr-code-svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="Código QR para unirse al juego">
    <rect width="${total}" height="${total}" rx="2.2" fill="${lightColor}" />
    <path d="${paths.join('')}" fill="${darkColor}" />
  </svg>`;
}

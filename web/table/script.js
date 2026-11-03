import * as THREE from 'three';
import { attachBridge } from './bridge.js';
import * as CANNON from './vendor/cannon-es.js';
import {
    RoundedBoxGeometry
} from 'three/addons/RoundedBoxGeometry.js';
import {
    OrbitControls
} from 'three/addons/OrbitControls.js';

const HOLE_RX = 5.85;
const HOLE_RZ = 3.38;
const BOARD_W = 13;
const BOARD_H = 10;
const BOARD_THICK = 0.6;
const WELL_DEPTH = 0;
const INNER_WALL_H = 0.52;
const DICE_SIZE = 0.6;
const GRAVITY = -18;
const CUP_RADIUS = DICE_SIZE * 0.8;
const CUP_HOLE_RADIUS = CUP_RADIUS + 0.05;
const CUP_INNER_RADIUS = CUP_RADIUS - 0.02;
const CUP_WALL_HEIGHT = 0.28;
const MIN_LOAD_TIME = 150;
const PHYSICS_SLOW_INTERVAL = 0.2;
const VOLUME_KEY = 'gameVolume';
const PRE_ROLL_DELAY_MS = 1400; // стандартная задержка перед броском, когда fastStart выключен
let fastStartEnabled = false; // текущее состояние fastStart
let hasRolledOnce = false; // был ли уже сделан первый бросок в текущей игре
const Rank = {
    NOTHING: 0,
    PAIR: 1,
    TWO_PAIRS: 2,
    THREE: 3,
    STRAIGHT_15: 4,
    STRAIGHT_26: 5,
    FULLHOUSE: 6,
    FOUR: 7,
    FIVE: 8,
};

const diceWord = ['one', 'two', 'three', 'four', 'five', 'six'];

let dotCount = 0;
let dotInterval;
let loadStart = Date.now();
let lastFrameTime = 0;
let physicsSlowMode = false;
let rollActive = false;
let rollImpactPlayed = false;
let hoverIdx = -1;
let goldHintActive = false;
let currentVolume = 1.0;
let resizeTimeout;

const selected = [false, false, false, false, false];
let goldMask = [false, false, false, false, false];
let playerValues = [1, 1, 1, 1, 1];
let aiValues = [1, 1, 1, 1, 1];

const displaySlots = {
    player: [],
    ai: []
};

const up = new THREE.Vector3(0, 1, 0);
const faceNormals = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
];
const faceNumbers = [3, 4, 1, 6, 2, 5];
const displayY = 0.61;

const isMobile =
    /Mobi|Android|iPad|Tablet/i.test(navigator.userAgent) ||
    window.innerWidth <= 1024;

const aiAngles = sampleAngles(220, 270, 5);
const playerAngles = sampleAngles(140, 90, 5);
const playerAngles2 = sampleAngles(90, 40, 5);
const aiAngles2 = sampleAngles(320, 270, 5);

const faceTextures = [
    makeFaceTexture(3),
    makeFaceTexture(4),
    makeFaceTexture(1),
    makeFaceTexture(6),
    makeFaceTexture(2),
    makeFaceTexture(5),
];

// Shared materials for dice faces — reuse across all dice meshes to reduce GC and draw overhead
// NOTE: materials must be unique per-die so we can change color/metalness per mesh.
// We still reuse `faceTextures` (the CanvasTexture instances) as maps, but create
// fresh material objects for each die to avoid shared-state color bugs.

const dieGeom = new RoundedBoxGeometry(
    DICE_SIZE,
    DICE_SIZE,
    DICE_SIZE,
    5,
    DICE_SIZE * 0.12
);

const matDice = new CANNON.Material('dice');
const matTable = new CANNON.Material('table');

const ground = new CANNON.Body({
    mass: 0,
    material: matTable,
    shape: new CANNON.Plane(),
});

const rimBody = new CANNON.Body({
    mass: 0,
    material: matTable
});

const TABLE_SCALE = 4;
const TABLE_SIZE = Math.max(BOARD_W, BOARD_H);

// Physics solver tuning: use higher iterations during active roll, lower when idle
const PHYSICS_ACTIVE_ITER = 20;
const PHYSICS_IDLE_ITER = 12;

const normalColor = 0xffffff;
const selectedColor = 0xe74c3c;
const goldColor = 0xd4af37;
const normalMetalness = 0.1;
const normalRoughness = 0.45;
const goldMetalness = 1.0;
const goldRoughness = 0.4;

const goldMat = new THREE.MeshStandardMaterial({
    color: goldColor,
    metalness: goldMetalness,
    roughness: goldRoughness,
    envMapIntensity: 1.6,
    emissive: 0x080400,
    emissiveIntensity: 0.02,
});

const woodTex = new THREE.TextureLoader().load('src/images/board.png');
const tableTex = new THREE.TextureLoader().load('src/images/table.png');
const backTex = new THREE.TextureLoader().load('src/images/back1.png');

const topMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.85,
    metalness: 0.05,
});

const sideMat = new THREE.MeshStandardMaterial({
    color: 0xcaa57a,
    roughness: 0.85,
    metalness: 0.05,
});

const tableMat = new THREE.MeshStandardMaterial({
    map: tableTex,
    roughness: 0.95,
    metalness: 0.0,
    envMapIntensity: 0.2,
});

const backMat = new THREE.MeshStandardMaterial({
    map: backTex,
    roughness: 0.95,
    metalness: 0.0,
});

const holeMat = new THREE.MeshStandardMaterial({
    color: 0x590000,
    metalness: 0.0,
    roughness: 1.0,
});

const hemi = new THREE.HemisphereLight(0xffffff, 0x2b3540, 0.75);
const dir = new THREE.DirectionalLight(0xffffff, 1.7);

const scene = new THREE.Scene();
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, GRAVITY, 0)
});

const dice = Array.from({
    length: 5
}).map(() => {
    const mesh = new THREE.Mesh(dieGeom, dieMaterials());
    mesh.castShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    const shape = new CANNON.Box(
        new CANNON.Vec3(DICE_SIZE / 2, DICE_SIZE / 2, DICE_SIZE / 2)
    );
    const body = new CANNON.Body({
        mass: 1,
        material: matDice,
        shape,
        angularDamping: 0.28,
        linearDamping: 0.18,
    });
    body.sleepSpeedLimit = 0.12;
    body.sleepTimeLimit = 0.35;
    world.addBody(body);
    body.position.set(0, -10, 0);
    body.sleep();
    return {
        mesh,
        body,
        visible: false
    };
});

const game = {
    balance: 1000,
    aiBalance: 1000,
    baseBet: 50,
    inPlay: 0,
    stage: 'idle',
};

const ui = {
    rollBtn: document.getElementById('rollBtn'),
    balanceEl: document.getElementById('balance'),
    betInput: document.getElementById('betInput'),
    modal: document.getElementById('modal'),
    pHand: document.getElementById('pHand'),
    aHand: document.getElementById('aHand'),
    pIcons: document.getElementById('pIcons'),
    aIcons: document.getElementById('aIcons'),
    winlose: document.getElementById('winlose'),
    sumEl: document.getElementById('sum'),
    newGameBtn: document.getElementById('newGameBtn'),
    inPlayEl: document.getElementById('inPlay'),
    fastStartBtn: document.getElementById('fastStart'),
};

const uiEls = {
    rollBtn: document.getElementById('rollBtn'),
    newGameBtn: document.getElementById('newGameBtn'),
};

const hint = document.getElementById('hint');
const sShake = document.getElementById('sShake');
const sRoll = document.getElementById('sRoll');

// LOADING OVERLAY
const loaderDiv = document.createElement('div');
loaderDiv.id = 'loader';
loaderDiv.style.position = 'fixed';
loaderDiv.style.top = '0';
loaderDiv.style.left = '0';
loaderDiv.style.width = '100vw';
loaderDiv.style.height = '100vh';
loaderDiv.style.background =
    'linear-gradient(180deg, #000000 0%, #0f0f0f 40%, #1a1a1a 100%)';
loaderDiv.style.display = 'flex';
loaderDiv.style.alignItems = 'center';
loaderDiv.style.justifyContent = 'center';
loaderDiv.style.zIndex = '9999';
loaderDiv.innerHTML =
    '<div style="color:#e6e6e6;font-size:2.2em;font-family:Inter, system-ui, sans-serif;text-align:center"><span id="loaderText" style="display:inline-block;margin-bottom:20px;min-width:160px;white-space:nowrap;">LOADING</span><br><img src="src/images/holdDiceIcon.png" alt="dice" style="width:100px;height:100px;object-fit:contain;display:inline-block;margin-top:6px;"/></div>';
document.body.appendChild(loaderDiv);
const loaderText = document.getElementById('loaderText');

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true
});
const camera = new THREE.PerspectiveCamera(
    50,
    innerWidth / innerHeight,
    0.1,
    100
);
const controls = new OrbitControls(camera, renderer.domElement);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const clock = new THREE.Clock();

document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

dotInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    loaderText.textContent = 'LOADING' + '.'.repeat(dotCount);
}, 400);

renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.background = new THREE.Color(0x000000);

// The table's long X axis becomes the phone's vertical axis.
function fitPortrait() {
    const aspect = innerWidth / innerHeight;
    camera.aspect = aspect;
    camera.up.set(1, 0, 0);
    const distance = Math.max(15.5, 10.5 / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(25)));
    camera.position.set(0, distance, 0.001);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
}
controls.enabled = false;
controls.target.set(0, 0, 0);
fitPortrait();

scene.add(hemi);
dir.position.set(6, 12, 0);
dir.castShadow = true;
// smaller shadow map on mobile for performance
dir.shadow.mapSize.set(isMobile ? 512 : 1024, isMobile ? 512 : 1024);
dir.shadow.camera.left = -8;
dir.shadow.camera.right = 8;
dir.shadow.camera.top = 6;
dir.shadow.camera.bottom = -6;
scene.add(dir);

// Стартовый тюнинг (для единообразия c предзагруженными)
// Clamp anisotropy on mobile to save performance; allow higher on desktop
const maxAniso = isMobile ?
    Math.min(4, renderer.capabilities.getMaxAnisotropy()) :
    renderer.capabilities.getMaxAnisotropy();

woodTex.colorSpace = THREE.SRGBColorSpace;
woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
woodTex.repeat.set(0.07, 0.07);
woodTex.anisotropy = maxAniso;

tableTex.colorSpace = THREE.SRGBColorSpace;
tableTex.anisotropy = maxAniso;
tableTex.offset.set(0, 0);
tableTex.wrapS = tableTex.wrapT = THREE.RepeatWrapping;
tableTex.repeat.set(5, 5);

backTex.colorSpace = THREE.SRGBColorSpace;
backTex.anisotropy = maxAniso;
backTex.offset.set(0, 0);

// ---------- ПРЕДЗАГРУЗКА ТЕКСТУР И ПЕРЕКЛЮЧЕНИЕ ----------

function tuneTex(tex, rx, ry) {
    if (!tex) return;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
}

const backFiles = [
    'src/images/back1.png',
    'src/images/back2.png',
    'src/images/back3.png',
    'src/images/back4.png',
];

// Добавляй сюда дополнительные варианты доски:
const boardFiles = ['src/images/board.png'];

let currentBoard = 0;
let currentBack = 0;

let preloadedBacks = [];
let preloadedBoards = [];

const loadingManager = new THREE.LoadingManager();
const preloader = new THREE.TextureLoader(loadingManager);

function loadTex(url, rx, ry) {
    return new Promise((resolve, reject) => {
        preloader.load(
            url,
            (t) => {
                tuneTex(t, rx, ry);
                resolve(t);
            },
            undefined,
            reject
        );
    });
}

async function preloadAll() {
    const backs = await Promise.all(backFiles.map((u) => loadTex(u, 1, 1)));
    const boards = await Promise.all(
        boardFiles.map((u) => loadTex(u, 0.07, 0.07))
    );
    return {
        backs,
        boards
    };
}

async function initTexturesAndBindUI() {
    try {
        const {
            backs,
            boards
        } = await preloadAll();
        preloadedBacks = backs;
        preloadedBoards = boards;

        // Поставим предзагруженные стартовые карты
        if (boards[0]) {
            if (topMat.map && topMat.map !== boards[0]) {
                try {
                    topMat.map.dispose();
                } catch (e) {}
            }
            topMat.map = boards[0];
            topMat.needsUpdate = true;
        }
        if (backs[0]) {
            if (backMat.map && backMat.map !== backs[0]) {
                try {
                    backMat.map.dispose();
                } catch (e) {}
            }
            backMat.map = backs[0];
            backMat.needsUpdate = true;
            // initialize ART label (currentBack default 0)
            updateArtLabel(currentBack);
        }

        // Кнопка смены подложки (id="changeArt")
        const changeArtBtn = document.getElementById('changeArt');
        if (changeArtBtn) {
            changeArtBtn.addEventListener('click', () => {
                currentBack = (currentBack + 1) % preloadedBacks.length;
                const next = preloadedBacks[currentBack];
                if (!next) return;
                if (backMat.map && backMat.map !== next) {
                    try {
                        backMat.map.dispose();
                    } catch (e) {}
                }
                backMat.map = next;
                backMat.needsUpdate = true;
                updateArtLabel(currentBack);
            });
        }

        // Кнопка смены доски (id="changeBoard" — добавь в HTML, если нужно)
        const changeBoardBtn = document.getElementById('changeBoard');
        if (changeBoardBtn) {
            changeBoardBtn.addEventListener('click', () => {
                currentBoard = (currentBoard + 1) % preloadedBoards.length;
                const next = preloadedBoards[currentBoard];
                if (!next) return;
                if (topMat.map && topMat.map !== next) {
                    try {
                        topMat.map.dispose();
                    } catch (e) {}
                }
                topMat.map = next;
                topMat.needsUpdate = true;
            });
        }
    } catch (err) {
        console.warn('Texture preload failed:', err);
    }
}

// --- UI label helpers for settings panel ---
function getSettingsPEl() {
    const settings = document.querySelector('.settings');
    if (!settings) return null;
    const ps = settings.querySelectorAll('p');
    // expect order: volume, art, shake
    return {
        volumeP: ps[0] || null,
        artP: ps[1] || null,
        shakeP: ps[2] || null,
    };
}

function updateVolumeLabel(vol) {
    const els = getSettingsPEl();
    if (!els || !els.volumeP) return;
    // Map steps 0,0.33,0.66,1 -> 0,1,2,3
    const steps = [0, 0.33, 0.66, 1];
    let i = steps.findIndex((s) => Math.abs(s - vol) < 0.01);
    if (i === -1) i = 3;
    els.volumeP.textContent = `VOLUME: ${i}`;
}

function updateArtLabel(currentBackIndex) {
    const els = getSettingsPEl();
    if (!els || !els.artP) return;
    // currentBack is 0-based, display 1-based
    els.artP.textContent = `IMAGE: ${currentBackIndex + 1}`;
}

function updateShakeLabel(enabled) {
    const els = getSettingsPEl();
    if (!els || !els.shakeP) return;
    els.shakeP.textContent = `SHAKE: ${enabled ? 'OFF' : 'ON'}`;
}

// ---------------------------------------------------------

const tableGeom = new THREE.PlaneGeometry(
    TABLE_SIZE * TABLE_SCALE,
    TABLE_SIZE * TABLE_SCALE
);
const tableMesh = new THREE.Mesh(tableGeom, tableMat);
tableMesh.rotation.x = -Math.PI / 2;
tableMesh.position.y = 0;
tableMesh.receiveShadow = true;
scene.add(tableMesh);

// УДАЛЁН СТАРЫЙ ленивый загрузчик по клику (заменён предзагрузкой)

// Подложка под доской
const underBoardGeom = new THREE.PlaneGeometry(BOARD_W * 0.91, BOARD_H * 0.69);
const underBoard = new THREE.Mesh(underBoardGeom, backMat);
underBoard.rotation.x = -Math.PI / 2;
underBoard.position.y = -BOARD_THICK + 0.63;
underBoard.receiveShadow = true;
scene.add(underBoard);

const rimOuter = ellipsePath(HOLE_RX + 0.125, HOLE_RZ + 0.125);
const rimShape = new THREE.Shape();
rimShape.add(rimOuter);
rimShape.holes.push(ellipsePath(HOLE_RX - 0.125, HOLE_RZ - 0.125));

const rimGeom = new THREE.ExtrudeGeometry(rimShape, {
    depth: INNER_WALL_H,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 2,
    curveSegments: 24,
});
rimGeom.rotateX(-Math.PI / 2);
const rimMesh = new THREE.Mesh(rimGeom, [goldMat]);
rimMesh.position.y = -WELL_DEPTH + 0.01;
rimMesh.castShadow = false;
rimMesh.receiveShadow = true;
scene.add(rimMesh);

const outer = new THREE.Shape();
outer.moveTo(-BOARD_W / 2, -BOARD_H / 2);
outer.lineTo(BOARD_W / 2, -BOARD_H / 2);
outer.lineTo(BOARD_W / 2, BOARD_H / 2);
outer.lineTo(-BOARD_W / 2, BOARD_H / 2);
outer.lineTo(-BOARD_W / 2, -BOARD_H / 2);
outer.holes.push(ellipsePath(HOLE_RX + 0.05, HOLE_RZ + 0.05));

const ownersForHoles = [
    ['player', playerAngles2],
    ['ai', aiAngles],
];
for (const [owner, angles] of ownersForHoles) {
    for (let i = 0; i < 5; i++) {
        const a = THREE.MathUtils.degToRad(angles[i]);
        const x = Math.cos(a) * HOLE_RX * 1.2;
        const z = Math.sin(a) * HOLE_RZ * 1.2;
        outer.holes.push(circlePath(CUP_HOLE_RADIUS, 32, x, z));
    }
}

const frameGeom = new THREE.ExtrudeGeometry(outer, {
    depth: BOARD_THICK,
    steps: 1,
    bevelEnabled: false,
});
frameGeom.rotateX(-Math.PI / 2);
const frame = new THREE.Mesh(frameGeom, [topMat, goldMat, sideMat]);
const inset = 0.25;
const trimShape = new THREE.Shape();

trimShape.moveTo(-BOARD_W / 2, -BOARD_H / 2);
trimShape.lineTo(BOARD_W / 2, -BOARD_H / 2);
trimShape.lineTo(BOARD_W / 2, BOARD_H / 2);
trimShape.lineTo(-BOARD_W / 2, BOARD_H / 2);
trimShape.closePath();

const inner = new THREE.Path();
inner.moveTo(-BOARD_W / 2 + inset, -BOARD_H / 2 + inset);
inner.lineTo(BOARD_W / 2 - inset, -BOARD_H / 2 + inset);
inner.lineTo(BOARD_W / 2 - inset, BOARD_H / 2 - inset);
inner.lineTo(-BOARD_W / 2 + inset, BOARD_H / 2 - inset);
inner.closePath();
trimShape.holes.push(inner);

const trimGeom = new THREE.ExtrudeGeometry(trimShape, {
    depth: 0.04,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 2,
});

const trimMesh = new THREE.Mesh(trimGeom, goldMat);
trimMesh.position.y = BOARD_THICK + 0.001;
trimMesh.castShadow = false;
trimMesh.receiveShadow = true;
scene.add(trimMesh);
trimGeom.rotateX(-Math.PI / 2);
frame.position.y = 0;
frame.castShadow = true;
frame.receiveShadow = true;
scene.add(frame);

world.solver.iterations = PHYSICS_IDLE_ITER;
world.solver.tolerance = 1e-4;
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

world.addContactMaterial(
    new CANNON.ContactMaterial(matDice, matTable, {
        friction: 0.8,
        restitution: 0.04,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
    })
);

world.addContactMaterial(
    new CANNON.ContactMaterial(matDice, matDice, {
        friction: 0.6,
        restitution: 0.02,
    })
);

ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
ground.position.set(0, -WELL_DEPTH, 0);
world.addBody(ground);

const N = 32;
const rx = HOLE_RX - DICE_SIZE * 0.55;
const rz = HOLE_RZ - DICE_SIZE * 0.55;
for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const nx = Math.cos(a) / rx;
    const nz = Math.sin(a) / rz;
    const n = new CANNON.Vec3(nx, 0, nz).unit();
    const d = 1 / Math.hypot(nx, nz);
    const pos = n.scale(d);
    const q = new CANNON.Quaternion().setFromVectors(new CANNON.Vec3(1, 0, 0), n);
    const seg = new CANNON.Box(new CANNON.Vec3(0.05, 0.5, 0.6));
    rimBody.addShape(seg, pos, q);
}
world.addBody(rimBody);

ui.balanceEl.textContent = game.balance;
ui.inPlayEl.textContent = game.inPlay;
ui.balanceEl.textContent = game.balance;
validateBet();
ui.betInput.addEventListener('input', validateBet);

uiEls.newGameBtn.onclick = async () => {
    if (!isMobile) {
        flyCameraTo(new THREE.Vector3(0, 12, 8), {
            duration: 700,
            lookAt: new THREE.Vector3(0, 0, 0),
        });
    }

    document.getElementById('modal').classList.remove('show');
    for (let i = 0; i < 5; i++) {
        setDieAppearance(displaySlots.player[i], 'normal');
        setDieAppearance(displaySlots.ai[i], 'normal');
    }
    hasRolledOnce = false;
    if (ui.fastStartBtn) ui.fastStartBtn.disabled = false;
    startGame();
};

uiEls.rollBtn.onclick = async () => {
    if (game.stage === 'p1_first') {
        game.baseBet = Math.max(0, Math.floor(+ui.betInput.value || 0));
        if (game.baseBet > game.balance) {
            validateBet();
            return;
        }
        game.inPlay = game.baseBet;
        ui.inPlayEl.textContent = game.inPlay;

        ui.betInput.value = game.baseBet;
        ui.betInput.disabled = true;

        if (!isMobile) {
            flyCameraTo(new THREE.Vector3(0, 14, 0), {
                duration: 700,
                lookAt: new THREE.Vector3(0, 0, 0),
            });
        }
        await playerFirstThrow();
    } else if (game.stage === 'p1_select' || game.stage === 'p1_second') {
        await playerSecondThrow();
    }
};

canvas.addEventListener('pointerdown', (e) => {
    if (game.stage !== 'p1_select') return;
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(displaySlots.player);
    if (intersects.length) {
        const idx = displaySlots.player.findIndex(
            (m) => m === intersects[0].object
        );
        if (idx !== -1) {
            selected[idx] = !selected[idx];
            if (goldHintActive) {
                goldHintActive = false;
            }
            refreshPlayerSelectionVisual();
        }
    }
});

function refreshPlayerGlowOnly() {
    for (let i = 0; i < 5; i++) {
        const m = displaySlots.player[i];
        const mode = selected[i] ?
            'selected' :
            goldHintActive && goldMask[i] ?
            'gold' :
            'normal';
        setDieAppearance(m, mode);
        m.scale.setScalar(selected[i] ? 1.07 : 1.0);
    }
}

function refreshPlayerHoverOnly() {
    for (let i = 0; i < 5; i++) {
        const m = displaySlots.player[i];
        const hoverLift = hoverIdx === i ? 0.05 : 0.0;
        const selectedLift = selected[i] ? 0.02 : 0.0;
        m.position.y = displayY + hoverLift + selectedLift;
    }
}

canvas.addEventListener('pointermove', (e) => {
    if (game.stage !== 'p1_select') {
        if (hoverIdx !== -1) {
            hoverIdx = -1;
            canvas.style.cursor = 'default';
            refreshPlayerHoverOnly();
        }
        return;
    }

    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(displaySlots.player);
    const newIdx = intersects.length ?
        displaySlots.player.findIndex((m) => m === intersects[0].object) :
        -1;

    if (newIdx !== hoverIdx) {
        hoverIdx = newIdx;
        canvas.style.cursor = hoverIdx !== -1 ? 'pointer' : 'default';
        refreshPlayerHoverOnly();
    }
});

canvas.addEventListener('pointerleave', () => {
    if (hoverIdx !== -1) {
        hoverIdx = -1;
        canvas.style.cursor = 'default';
        refreshPlayerSelectionVisual();
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key && e.key.toLowerCase() === 'm') {
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) muteBtn.click();
    }
});

window.addEventListener('load', () => {
    const muteBtn = document.getElementById('muteBtn');
    // ... существующий код управления громкостью ...
    // restore saved volume if present
    try {
        const saved = localStorage.getItem(VOLUME_KEY);
        if (saved != null) {
            const v = parseFloat(saved);
            if (!Number.isNaN(v)) currentVolume = v;
        }
    } catch {}
    applyVolumeToAll(currentVolume);
    updateMuteIcon(document.getElementById('muteBtn'), currentVolume);
    updateVolumeLabel(currentVolume);
    muteBtn?.addEventListener('click', () => {
        // 0, 0.33, 0.66, 1
        const steps = [0, 0.33, 0.66, 1];
        let i = steps.findIndex((s) => Math.abs(s - currentVolume) < 0.01);
        i = (i + 1) % steps.length;
        currentVolume = steps[i];
        applyVolumeToAll(currentVolume);
        updateMuteIcon(muteBtn, currentVolume);
        updateVolumeLabel(currentVolume);
        try {
            localStorage.setItem(VOLUME_KEY, String(currentVolume));
        } catch {}
    });
    // NEW: инициализация fastStart
    const btn = ui.fastStartBtn;
    if (btn) {
        // поддержка как <input type="checkbox">, так и обычной <button>
        const readState = () =>
            btn.type === 'checkbox' ?
            !!btn.checked :
            btn.getAttribute('aria-pressed') === 'true';
        const writeState = (v) => {
            if (btn.type === 'checkbox') btn.checked = !!v;
            else btn.setAttribute('aria-pressed', v ? 'true' : 'false');
            // можно менять текст/лейбл:
            if (!btn.dataset.labelStatic) btn.textContent = v ? '⚡' : '🎲';
            // update SHAKE label next to button
            updateShakeLabel(v);
        };

        // стартовое состояние
        writeState(fastStartEnabled);
        // ensure shake label reflects initial state
        updateShakeLabel(fastStartEnabled);

        const toggle = () => {
            // запрет включения после первого броска
            if (hasRolledOnce) {
                // откат UI к текущему состоянию
                writeState(fastStartEnabled);
                return;
            }
            fastStartEnabled = !readState(); // хотим стать противоположным значению до клика
            writeState(fastStartEnabled);
        };

        // для checkbox хватит 'change', для button — 'click'; повесим оба
        btn.addEventListener('change', toggle);
        btn.addEventListener('click', (e) => {
            // если это checkbox, событие click тоже прилетит — игнорируем его,
            // чтобы не перевернуть состояние дважды
            if (btn.type !== 'checkbox') toggle();
        });
    }
});

addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const w = innerWidth;
        const h = innerHeight;
        renderer.setSize(w, h);
        fitPortrait();
    }, 100);
});

// ВАЖНО: теперь ждём предзагрузку текстур перед скрытием лоадера
window.addEventListener('load', async () => {
    // сбрасывать loadStart не обязательно; MIN_LOAD_TIME будет соблюдён внутри finishLoading
    await initTexturesAndBindUI();
    finishLoading();
});

function sampleAngles(s, e, c) {
    const step = (e - s) / (c - 1);
    return Array.from({
        length: c
    }, (_, i) => s + step * i);
}

function ellipsePath(rx, rz, segments = 64, start = Math.PI) {
    const p = new THREE.Path();
    for (let i = 0; i < segments; i++) {
        const a = start + (i / segments) * Math.PI * 2;
        const x = Math.cos(a) * rx;
        const y = Math.sin(a) * rz;
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
    }
    p.closePath();
    return p;
}

function circlePath(radius, segments = 32, offsetX = 0, offsetZ = 0) {
    const p = new THREE.Path();
    for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const x = Math.cos(a) * radius + offsetX;
        const y = Math.sin(a) * radius + offsetZ;
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
    }
    p.closePath();
    return p;
}

function makeFaceTexture(
    n,
    size = 256,
    faceColor = '#f5f5f5',
    pipColor = '#111'
) {
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = size;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = faceColor;
    ctx.fillRect(0, 0, size, size);
    const grd = ctx.createRadialGradient(
        size / 2,
        size / 2,
        size * 0.1,
        size / 2,
        size / 2,
        size * 0.7
    );
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,.12)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.49, 0, Math.PI * 2);
    ctx.fill();
    const r = size * 0.08;
    const off = size * 0.28;
    const pos = {
        1: [
            [0, 0]
        ],
        2: [
            [-1, -1],
            [1, 1],
        ],
        3: [
            [-1, -1],
            [0, 0],
            [1, 1],
        ],
        4: [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
        ],
        5: [
            [-1, -1],
            [-1, 1],
            [0, 0],
            [1, -1],
            [1, 1],
        ],
        6: [
            [-1, -1],
            [-1, 0],
            [-1, 1],
            [1, -1],
            [1, 0],
            [1, 1],
        ],
    }[n];
    pos.forEach(([cx, cy]) => {
        const x = size / 2 + cx * off;
        const y = size / 2 + cy * off;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = pipColor;
        ctx.fill();
    });
    const tex = new THREE.CanvasTexture(cnv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function dieMaterials() {
    return faceTextures.map(
        (tex) =>
        new THREE.MeshStandardMaterial({
            map: tex,
            roughness: normalRoughness,
            metalness: normalMetalness,
        })
    );
}

function readDieTop(mesh) {
    let best = -Infinity;
    let idx = -1;
    for (let i = 0; i < 6; i++) {
        const n = faceNormals[i].clone().applyQuaternion(mesh.quaternion);
        const d = n.dot(up);
        if (d > best) {
            best = d;
            idx = i;
        }
    }
    return faceNumbers[idx];
}

function orientDiceMeshTopValue(mesh, value) {
    mesh.rotation.set(0, 0, 0);
    switch (value) {
        case 1:
            mesh.rotation.set(0, 0, 0);
            break;
        case 2:
            mesh.rotation.set(-Math.PI / 2, 0, 0);
            break;
        case 3:
            mesh.rotation.set(0, 0, Math.PI / 2);
            break;
        case 4:
            mesh.rotation.set(0, 0, -Math.PI / 2);
            break;
        case 5:
            mesh.rotation.set(Math.PI / 2, 0, 0);
            break;
        case 6:
            mesh.rotation.set(Math.PI, 0, 0);
            break;
    }
}

// вместо +0 / -0:
const CUP_OUTER_SHAPE = circlePath(CUP_RADIUS + 0.025, 64);
const CUP_INNER_SHAPE = circlePath(CUP_RADIUS - 0.025, 64);
const cupShapeShared = new THREE.Shape();
cupShapeShared.add(CUP_OUTER_SHAPE);
cupShapeShared.holes.push(CUP_INNER_SHAPE);
const cupGeomShared = new THREE.ExtrudeGeometry(cupShapeShared, {
    depth: CUP_WALL_HEIGHT,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 1,
    curveSegments: 12,
});
cupGeomShared.rotateX(-Math.PI / 2);

const innerDiskGeomShared = new THREE.CircleGeometry(CUP_INNER_RADIUS, 32);

function createRackMeshes() {
    const owners = [
        ['player', playerAngles],
        ['ai', aiAngles2],
    ];
    for (const [owner, angles] of owners) {
        for (let i = 0; i < 5; i++) {
            const a = THREE.MathUtils.degToRad(angles[i]);
            const x = Math.cos(a) * HOLE_RX * 1.2;
            const z = Math.sin(a) * HOLE_RZ * 1.2;

            const m = new THREE.Mesh(dieGeom, dieMaterials());
            m.visible = true;
            m.castShadow = true;
            m.position.set(x, displayY, z);
            scene.add(m);

            // reuse shared geometries for cup and inner disk
            const cupMesh = new THREE.Mesh(cupGeomShared, goldMat);
            cupMesh.position.set(x, 0.33, z);
            cupMesh.castShadow = true;
            cupMesh.receiveShadow = true;
            scene.add(cupMesh);

            const innerDisk = new THREE.Mesh(innerDiskGeomShared, holeMat);
            innerDisk.rotation.x = -Math.PI / 2;
            innerDisk.position.set(x, 0.32, z);
            innerDisk.receiveShadow = true;
            scene.add(innerDisk);

            displaySlots[owner].push(m);
        }
    }
}

function setDieAppearance(mesh, mode) {
    const mats = mesh.material;
    let color;
    let metalness;
    let roughness;
    switch (mode) {
        case 'normal':
            color = normalColor;
            metalness = normalMetalness;
            roughness = normalRoughness;
            break;
        case 'selected':
            color = selectedColor;
            metalness = normalMetalness;
            roughness = normalRoughness;
            break;
        case 'gold':
            color = goldColor;
            metalness = goldMetalness;
            roughness = goldRoughness;
            break;
    }
    mats.forEach((mm) => {
        mm.color.setHex(color);
        mm.metalness = metalness;
        mm.roughness = roughness;
        mm.emissive.setHex(0x000000);
        mm.emissiveIntensity = 0;
        mm.needsUpdate = true;
    });
}

function orientRack(owner, values, hideMask = null) {
    const meshes = displaySlots[owner];
    for (let i = 0; i < 5; i++) {
        const m = meshes[i];
        if (hideMask && hideMask[i]) {
            m.visible = false;
            continue;
        }
        m.visible = true;
        orientDiceMeshTopValue(m, values[i] || 1);
        setDieAppearance(m, 'normal');
        m.scale.setScalar(1.0);
    }
}

function randomizeRacks() {
    playerValues = randomHand();
    aiValues = randomHand();
    orientRack('player', playerValues);
    orientRack('ai', aiValues);
}

function setDieActive(idx, active) {
    const d = dice[idx];
    d.visible = active;
    d.mesh.visible = active;
    if (!active) {
        d.body.position.set(0, -10, 0);
        d.body.velocity.scale(0, d.body.velocity);
        d.body.angularVelocity.scale(0, d.body.angularVelocity);
        d.body.sleep();
    }
}

function hideAllPhysical() {
    for (let i = 0; i < 5; i++) setDieActive(i, false);
}

function playShake() {
    try {
        sShake.currentTime = 0;
        sShake.play();
    } catch (e) {}
}

function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function playImpactOnce() {
    if (!rollImpactPlayed) {
        rollImpactPlayed = true;
        try {
            sRoll.currentTime = 0;
            sRoll.play();
        } catch (e) {}
    }
}

function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
}

function randomHand() {
    return [
        randInt(1, 6),
        randInt(1, 6),
        randInt(1, 6),
        randInt(1, 6),
        randInt(1, 6),
    ];
}

function computeGoldMask(values) {
    const sorted = values
        .slice()
        .sort((a, b) => a - b)
        .join(',');
    if (sorted === '1,2,3,4,5' || sorted === '2,3,4,5,6')
        return [true, true, true, true, true];
    const cnt = new Map();
    for (const v of values) cnt.set(v, (cnt.get(v) || 0) + 1);
    for (const [v, n] of cnt) {
        if (n === 5) return values.map(() => true);
        if (n === 4) return values.map((x) => x === v);
    }
    let three = null;
    let pair = null;
    for (const [v, n] of cnt) {
        if (n === 3) three = v;
        else if (n === 2) pair = v;
    }
    if (three && pair) return values.map((x) => x === three || x === pair);
    if (three) return values.map((x) => x === three);
    const pairs = [...cnt.entries()].filter(([, n]) => n === 2).map(([v]) => v);
    if (pairs.length === 2) return values.map((x) => pairs.includes(x));
    if (pairs.length === 1) return values.map((x) => x === pairs[0]);
    return [false, false, false, false, false];
}

function diceIconHTML(v) {
    return `<i class="fa-solid fa-dice-${diceWord[v - 1]}"></i>`;
}

function renderComboIcons(values, containerEl) {
    if (!containerEl) return;
    const mask = computeGoldMask(values);
    const html = values
        .map((v, i) => (mask[i] ? diceIconHTML(v) : ''))
        .filter(Boolean)
        .join('');
    containerEl.innerHTML = html || '';
}

function refreshAIGoldVisual() {
    const mask = computeGoldMask(aiValues);
    for (let i = 0; i < 5; i++) {
        const m = displaySlots.ai[i];
        const mode = mask[i] ? 'gold' : 'normal';
        setDieAppearance(m, mode);
    }
}

function refreshPlayerGoldVisual() {
    const mask = computeGoldMask(playerValues);
    for (let i = 0; i < 5; i++) {
        const m = displaySlots.player[i];
        const mode = mask[i] ? 'gold' : 'normal';
        setDieAppearance(m, mode);
    }
}

function refreshPlayerSelectionVisual() {
    refreshPlayerGlowOnly();
    refreshPlayerHoverOnly();
    updateRollBtnLabel();
    validateBet();
}

function handName(rank) {
    return ({
        [Rank.NOTHING]: 'Nothing',
        [Rank.PAIR]: 'Pair',
        [Rank.TWO_PAIRS]: 'Two Pairs',
        [Rank.THREE]: 'Three of a Kind',
        [Rank.STRAIGHT_15]: 'Small Straight',
        [Rank.STRAIGHT_26]: 'Large Straight',
        [Rank.FULLHOUSE]: 'Full House',
        [Rank.FOUR]: 'Four of a Kind',
        [Rank.FIVE]: 'Five of a Kind',
    }[rank] || '—');
}

function evaluate(values) {
    const counts = new Map();
    values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    const sortedAsc = values.slice().sort((a, b) => a - b);
    const sortedDesc = values.slice().sort((a, b) => b - a);
    const uniq = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const isStraight15 = sortedAsc.join(',') === '1,2,3,4,5';
    const isStraight26 = sortedAsc.join(',') === '2,3,4,5,6';

    if (uniq[0][1] === 5) return {
        rank: Rank.FIVE,
        key: [uniq[0][0]]
    };
    if (uniq[0][1] === 4)
        return {
            rank: Rank.FOUR,
            key: [uniq[0][0], uniq[1]?.[0] || 0]
        };
    if (uniq[0][1] === 3 && uniq[1] && uniq[1][1] === 2) {
        return {
            rank: Rank.FULLHOUSE,
            key: [uniq[0][0], uniq[1][0]]
        };
    }
    if (isStraight26) return {
        rank: Rank.STRAIGHT_26,
        key: [6]
    };
    if (isStraight15) return {
        rank: Rank.STRAIGHT_15,
        key: [5]
    };
    if (uniq[0][1] === 3) {
        const three = uniq[0][0];
        return {
            rank: Rank.THREE,
            key: [three, ...sortedDesc.filter((v) => v !== three)],
        };
    }
    if (uniq[0][1] === 2 && uniq[1] && uniq[1][1] === 2) {
        const p1 = Math.max(uniq[0][0], uniq[1][0]);
        const p2 = Math.min(uniq[0][0], uniq[1][0]);
        const kicker = sortedDesc.find((v) => v !== p1 && v !== p2) || 0;
        return {
            rank: Rank.TWO_PAIRS,
            key: [p1, p2, kicker]
        };
    }
    if (uniq[0][1] === 2) {
        const p = uniq[0][0];
        return {
            rank: Rank.PAIR,
            key: [p, ...sortedDesc.filter((v) => v !== p)]
        };
    }
    return {
        rank: Rank.NOTHING,
        key: sortedDesc
    };
}

function compareHands(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const L = Math.max(a.key.length, b.key.length);
    for (let i = 0; i < L; i++) {
        const av = a.key[i] || 0;
        const bv = b.key[i] || 0;
        if (av !== bv) return av - bv;
    }
    return 0;
}

function aiChooseMask(values) {
    const has = (n) => values.includes(n);
    if (has(2) && has(3) && has(4) && has(5))
        return values.map((v) => !(v === 2 || v === 3 || v === 4 || v === 5));
    const cnt = new Map();
    values.forEach((v) => cnt.set(v, (cnt.get(v) || 0) + 1));
    const keep = new Set(
        [...cnt.entries()].filter(([, n]) => n >= 2).map(([v]) => v)
    );
    if (keep.size) return values.map((v) => !keep.has(v));
    return [true, true, true, true, true];
}

function setStage(s) {
    ui.betInput.disabled = !['idle', 'p1_first'].includes(s);
    game.stage = s;
    ui.rollBtn.disabled = !['p1_first', 'p1_second', 'p1_select'].includes(s);
    if (s === 'p1_first') hint.textContent = 'Roll the dice';
    else if (s === 'ai_first') hint.textContent = "Opponent's roll...";
    else if (s === 'p1_select')
        hint.textContent = 'Select dice for REROLL and click "Roll" (or "Keep").';
    else if (s === 'p1_second') hint.textContent = 'Player rerolling dice...';
    else if (s === 'ai_second') hint.textContent = 'Opponent rerolling dice...';
    else hint.textContent = '';
    updateRollBtnLabel();
    validateBet();
}

function updateRollBtnLabel() {
    const btn = ui.rollBtn;
    btn.textContent = '';
    if (game.stage === 'p1_select') {
        const any = selected.some(Boolean);
        if (any) {
            btn.classList.remove('hold');
            btn.setAttribute('aria-label', 'Roll');
            btn.title = 'Roll';
        } else {
            btn.classList.add('hold');
            btn.setAttribute('aria-label', 'Keep');
            btn.title = 'Keep';
        }
    } else {
        btn.classList.remove('hold');
        btn.setAttribute('aria-label', 'Roll');
        btn.title = 'Roll';
    }
}

function validateBet() {
    // Нормализация значения инпута
    const raw = Math.floor(+ui.betInput.value || 0);
    ui.betInput.value = Math.max(0, raw);

    // Текущее значение ставки с учётом минимумов/дефолтов
    const bet = Math.max(0, Math.floor(+ui.betInput.value || 0));
    const tooHigh = bet > game.balance;

    // Кнопку Roll можно жать только на ходах игрока
    const stageAllowsRoll =
        game.stage === 'p1_first' ||
        game.stage === 'p1_second' ||
        game.stage === 'p1_select';
    ui.rollBtn.disabled = !(stageAllowsRoll && !tooHigh);

    // ВАЖНО: не затираем подсказку на ходах AI
    if (tooHigh) {
        hint.textContent = 'Bet exceeds balance — adjust the amount.';
    } else if (game.stage === 'p1_select') {
        hint.textContent = 'Select dice for REROLL and click "Roll" (or "Keep").';
    } else if (game.stage === 'p1_first') {
        // Только для первого броска игрока явно пишем подсказку
        hint.textContent = 'Roll the dice';
    }
    // На стадиях ai_first / ai_second подсказка останется той, что выставил setStage()
}

function clampBetToBalance() {
    // читаем что сейчас в инпуте ставки
    const raw = Math.floor(+ui.betInput.value || 50);

    // ограничиваем сверху балансом и снизу нулём (если у тебя минимум 10 — поставь Math.max(10, …))
    const clamped = Math.max(0, Math.min(raw, game.balance));

    // синхронизируем UI и игровое состояние
    ui.betInput.value = clamped;
    game.baseBet = clamped;
}

function startGame() {
    clampBetToBalance();
    ui.pIcons.innerHTML = '';
    ui.aIcons.innerHTML = '';

    game.baseBet = Math.max(50, Math.floor(+ui.betInput.value || 50));
    ui.betInput.value = game.baseBet;

    game.inPlay = 0;
    ui.inPlayEl.textContent = game.inPlay;

    ui.balanceEl.textContent = game.balance;

    ui.betInput.disabled = false;

    setStage('p1_first');
    ui.rollBtn.disabled = false;
    validateBet();
}

async function playerFirstThrow() {
    hasRolledOnce = true;
    if (ui.fastStartBtn) ui.fastStartBtn.disabled = true;

    ui.rollBtn.disabled = true;
    hint.textContent = "Player's roll...";
    ui.rollBtn.disabled = true;
    hint.textContent = "Player's roll...";
    orientRack('player', playerValues, [true, true, true, true, true]);
    const vals = await rollWithAudio(5);
    playerValues = vals.slice(0, 5);
    orientRack('player', playerValues);

    setStage('ai_first');
    await aiFirstThrow();
}

async function aiFirstThrow() {
    orientRack('ai', aiValues, [true, true, true, true, true]);
    const vals = await rollWithAudio(5);
    aiValues = vals.slice(0, 5);
    orientRack('ai', aiValues);
    refreshPlayerGoldVisual();
    refreshAIGoldVisual();
    setStage('p1_select');
    selected.fill(false);
    goldMask = computeGoldMask(playerValues);
    goldHintActive = true;
    refreshPlayerSelectionVisual();
    ui.rollBtn.disabled = false;
}

async function playerSecondThrow() {
    const rerollIdx = selected
        .map((v, i) => (v ? i : null))
        .filter((v) => v !== null);
    if (rerollIdx.length === 0) {
        ui.rollBtn.disabled = true;
        await delay(700);
        await aiSecondThrow();
        return;
    }
    ui.rollBtn.disabled = true;
    hint.textContent = 'Player rerolling dice...';
    const mask = [false, false, false, false, false];
    rerollIdx.forEach((i) => (mask[i] = true));
    orientRack('player', playerValues, mask);
    const vals = await rollWithAudio(rerollIdx.length);
    for (let k = 0; k < rerollIdx.length; k++)
        playerValues[rerollIdx[k]] = vals[k];
    orientRack('player', playerValues);
    await aiSecondThrow();
}

async function aiSecondThrow() {
    setStage('ai_second');
    const maskArr = aiChooseMask(aiValues);
    const rerollIdx = maskArr
        .map((v, i) => (v ? i : null))
        .filter((v) => v !== null);
    if (rerollIdx.length > 0) {
        orientRack('ai', aiValues, maskArr);
        const vals = await rollWithAudio(rerollIdx.length);
        for (let k = 0; k < rerollIdx.length; k++) aiValues[rerollIdx[k]] = vals[k];
        orientRack('ai', aiValues);
        refreshPlayerGoldVisual();
        refreshAIGoldVisual();
    } else {
        await delay(700);
    }

    finishHand();
}

function finishHand() {
    const ph = evaluate(playerValues);
    const ah = evaluate(aiValues);
    const cmp = compareHands(ph, ah);

    let net = 0;
    if (cmp > 0) {
        game.balance += game.inPlay;
        net = +game.inPlay;
    } else if (cmp < 0) {
        game.balance -= game.inPlay;
        net = -game.inPlay;
    } else {
        net = 0;
    }

    ui.balanceEl.textContent = game.balance;
    validateBet();

    ui.pHand.textContent = handName(ph.rank);
    ui.aHand.textContent = handName(ah.rank);
    renderComboIcons(playerValues, ui.pIcons);
    renderComboIcons(aiValues, ui.aIcons);

    // color winning/losing hand labels
    if (cmp === 0) {
        ui.pHand.classList.remove('winner', 'loser');
        ui.aHand.classList.remove('winner', 'loser');
    } else if (cmp > 0) {
        ui.pHand.classList.add('winner');
        ui.pHand.classList.remove('loser');
        ui.aHand.classList.add('loser');
        ui.aHand.classList.remove('winner');
    } else {
        ui.aHand.classList.add('winner');
        ui.aHand.classList.remove('loser');
        ui.pHand.classList.add('loser');
        ui.pHand.classList.remove('winner');
    }

    ui.winlose.textContent = cmp === 0 ? 'DRAW' : cmp > 0 ? 'WIN' : 'LOSE';
    ui.winlose.className = 'result ' + (cmp > 0 ? 'win' : cmp < 0 ? 'lose' : '');

    ui.sumEl.textContent = (net > 0 ? '+' : net < 0 ? '−' : '') + Math.abs(net);

    refreshAIGoldVisual();
    refreshPlayerGoldVisual();

    hint.textContent = '';
    ui.modal.classList.add('show');
    game.stage = 'idle';
    ui.rollBtn.disabled = true;
}

function flyCameraTo(
    targetVec3, {
        duration = 700,
        lookAt = new THREE.Vector3(0, 0, 0),
        ease = (t) => 1 - Math.pow(1 - t, 3),
    } = {}
) {
    return new Promise((resolve) => {
        const from = camera.position.clone();
        const to = targetVec3.clone();
        const t0 = performance.now();

        function step(now) {
            const raw = Math.min((now - t0) / duration, 1);
            const k = ease(raw);

            camera.position.lerpVectors(from, to, k);
            camera.lookAt(lookAt);

            if (raw < 1) requestAnimationFrame(step);
            else resolve();
        }
        requestAnimationFrame(step);
    });
}

function applyVolumeToAll(v) {
    const audios = document.querySelectorAll('audio');
    audios.forEach((a) => {
        a.volume = v;
    });
}

function updateMuteIcon(btn, vol) {
    if (!btn) return;
    if (vol === 0) btn.textContent = '🔇';
    else if (vol <= 0.33) btn.textContent = '🔈';
    else if (vol <= 0.66) btn.textContent = '🔉';
    else btn.textContent = '🔊';
}

function isDiceMoving() {
    for (const d of dice) {
        if (!d.visible) continue;
        const b = d.body;
        if (
            b.velocity.lengthSquared() > 0.01 ||
            b.angularVelocity.lengthSquared() > 0.01
        ) {
            return true;
        }
    }
    return false;
}

function animate(now) {
    requestAnimationFrame(animate);
    if (lastFrameTime && now - lastFrameTime < 1000 / 60) return;
    const dt = clock.getDelta();
    lastFrameTime = now;

    physicsSlowMode = !isDiceMoving();
    if (physicsSlowMode) {
        if (dt > PHYSICS_SLOW_INTERVAL) {
            world.step(1 / 60, dt, 10);
        }
    } else {
        world.step(1 / 60, dt, 15);
    }

    for (const d of dice) {
        if (!d.visible) continue;
        d.mesh.position.copy(d.body.position);
        d.mesh.quaternion.copy(d.body.quaternion);
    }
    controls.update();
    renderer.render(scene, camera);
}

function finishLoading() {
    const elapsed = Date.now() - loadStart;
    const delayMs = Math.max(0, MIN_LOAD_TIME - elapsed);
    setTimeout(() => {
        clearInterval(dotInterval);
        loaderDiv.style.opacity = '0';
        setTimeout(() => loaderDiv.remove(), 500);
        const gameScreen = document.getElementById('game-screen');
        const loadingOverlay = document.getElementById('loading-overlay');
        if (gameScreen) {
            gameScreen.classList.add('visible');
            gameScreen.style.removeProperty('display');
        }
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        const dockPanel = document.querySelector('.dock-panel');
        if (dockPanel) dockPanel.removeAttribute('hidden');
        orientRack('player', [1, 1, 1, 1, 1], [true, true, true, true, true]);
        orientRack('ai', [1, 1, 1, 1, 1], [true, true, true, true, true]);
        bridge.ready();
    }, delayMs);
}

const stored = localStorage.getItem(VOLUME_KEY);
currentVolume = stored !== null ? parseFloat(stored) : 1.0;
currentVolume = Number.isFinite(currentVolume) ?
    Math.max(0, Math.min(1, currentVolume)) :
    1.0;

world.addEventListener('postStep', () => {
    if (!rollActive) return;
    const eps = 0.1;
    for (const d of dice) {
        if (!d.visible) continue;
        const b = d.body;
        const nx = b.position.x / HOLE_RX;
        const nz = b.position.z / HOLE_RZ;
        const k = nx * nx + nz * nz;
        if (k > 1.0 - eps) {
            const scale = Math.sqrt(k);
            if (scale > 0) {
                const npx = b.position.x / (scale * HOLE_RX);
                const npz = b.position.z / (scale * HOLE_RZ);
                const inwardX = (npx * HOLE_RX * (1.0 - eps)) / scale;
                const inwardZ = (npz * HOLE_RZ * (1.0 - eps)) / scale;
                b.position.x = inwardX;
                b.position.z = inwardZ;
                const vOut = b.velocity.x * npx + b.velocity.z * npz;
                if (vOut > 0) {
                    b.velocity.x -= 1.5 * vOut * npx;
                    b.velocity.z -= 1.5 * vOut * npz;
                }
            }
        }
    }
    for (const d of dice) {
        if (!d.visible) continue;
        if (d.body.velocity.y > -0.1) {
            playImpactOnce();
            break;
        }
    }
});

const rand = (a, b) => a + Math.random() * (b - a);

async function rollWithAudio(count) {
    rollActive = false;
    rollImpactPlayed = false;

    if (!fastStartEnabled) {
        // стандартный режим: звук + пауза 1 секунда
        playShake();
        await delay(PRE_ROLL_DELAY_MS);
    }
    // fastStart: сразу бросаем, без звука и паузы
    // increase solver iterations while dice are active for more stable simulation
    world.solver.iterations = PHYSICS_ACTIVE_ITER;
    rollActive = true;
    const vals = await performRoll(count, 300);
    rollActive = false;
    // restore idle iterations
    world.solver.iterations = PHYSICS_IDLE_ITER;
    return vals;
}

function sampleNearCenterInEllipse(rx, rz, k = 1.8, margin = 0.72) {
    const ang = Math.random() * Math.PI * 2;
    const r01 = Math.pow(Math.random(), k);
    const r = r01 * margin;
    return [Math.cos(ang) * rx * r, Math.sin(ang) * rz * r];
}

function performRoll(count, lingerMs = 2000) {
    hideAllPhysical();
    return new Promise((resolve) => {
        const taken = [];
        for (let i = 0; i < count; i++) {
            setDieActive(i, true);
            const d = dice[i];

            let x;
            let z;
            let ok = false;
            const minDist = DICE_SIZE * 1.05;
            for (let tries = 0; tries < 40 && !ok; tries++) {
                [x, z] = sampleNearCenterInEllipse(HOLE_RX, HOLE_RZ, 1.9, 0.72);
                ok = taken.every(([tx, tz]) => {
                    const dx = x - tx;
                    const dz = z - tz;
                    return Math.hypot(dx, dz) >= minDist;
                });
            }
            taken.push([x, z]);
            const y = 3.2 + i * 0.03;
            d.body.position.set(x, y, z);
            d.body.quaternion.set(
                Math.random(),
                Math.random(),
                Math.random(),
                Math.random()
            );
            d.body.quaternion.normalize();
            const h = rand(0.8, 1.6);
            const dir = new CANNON.Vec3(rand(-1, 1), 0, rand(-1, 1)).unit();
            d.body.velocity.set(dir.x * h, -rand(4.0, 6.0), dir.z * h);
            d.body.angularVelocity.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
            d.body.wakeUp();
        }
        const rollStarted = performance.now();
        const check = () => {
            let moving = false;
            for (let i = 0; i < count; i++) {
                const b = dice[i].body;
                if (
                    b.velocity.lengthSquared() > 0.01 ||
                    b.angularVelocity.lengthSquared() > 0.01
                ) {
                    moving = true;
                    break;
                }
            }
            if (moving && performance.now() - rollStarted < 4500) {
                requestAnimationFrame(check);
                return;
            }
            const vals = dice.slice(0, count).map((die) => readDieTop(die.mesh));
            setTimeout(() => {
                for (let i = 0; i < count; i++) setDieActive(i, false);
                resolve(vals);
            }, lingerMs);
        };
        check();
    });
}

createRackMeshes();
hideAllPhysical();
requestAnimationFrame(animate);

// Keep the supplied renderer; connected gameplay is decided outside this module.
ui.betInput.removeEventListener('input', validateBet);
const bridge = attachBridge({canvas, ui, hint, roll: rollWithAudio, setDice(values, other) {
    for (const [owner, hand] of [['player', values], ['ai', other]]) {
        orientRack(owner, [0,1,2,3,4].map(i => hand[i] || 1), [0,1,2,3,4].map(i => i >= hand.length));
    }
}});

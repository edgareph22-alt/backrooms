import * as THREE from 'three';
import { MazeGenerator } from './maze.js';
import { Monster } from './entity.js';

// --- CONFIG ---
const CELL_SIZE = 10;
const WALL_HEIGHT = 5;
const WALK_SPEED = 4.8;
const SPRINT_SPEED = 8.0;
const PLAYER_RADIUS = 0.7;

let currentLevel = 1;
let maze = null;
let monster = null;
let scene, camera, renderer;
let player = { x: 0, z: 0, stamina: 100, exhausted: false, isHidden: false };
let keys = { w: false, a: false, s: false, d: false, shift: false };
let tapes = [];
let hideSpots = [];
let exitPos = new THREE.Vector3();
let isRunning = false;
let fluorescentLights = [];

// --- TEXTURAS SIMPLES PERO BUENAS ---
function makeTex(kind) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');

    if (kind === 'wall') {
        g.fillStyle = '#d4c27a';
        g.fillRect(0, 0, 256, 256);
        g.fillStyle = 'rgba(140,120,50,0.2)';
        for (let x = 0; x < 256; x += 24) g.fillRect(x, 0, 2, 256);
        g.fillStyle = '#6b5a2a';
        g.fillRect(0, 240, 256, 16);
    } else if (kind === 'floor') {
        g.fillStyle = '#a08c4a';
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 30; i++) {
            g.fillStyle = 'rgba(60,45,20,0.12)';
            g.beginPath();
            g.arc(Math.random()*256, Math.random()*256, 10 + Math.random()*20, 0, 7);
            g.fill();
        }
    } else {
        g.fillStyle = '#e8e0c0';
        g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(100,90,60,0.5)';
        g.lineWidth = 4;
        g.strokeRect(4, 4, 248, 248);
        g.beginPath();
        g.moveTo(128, 0); g.lineTo(128, 256);
        g.moveTo(0, 128); g.lineTo(256, 128);
        g.stroke();
    }

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// --- COLISIÓN SÓLIDA ---
function collides(x, z, radius = PLAYER_RADIUS) {
    const checks = [
        [0, 0],
        [radius, 0], [-radius, 0],
        [0, radius], [0, -radius],
        [radius*0.7, radius*0.7], [radius*0.7, -radius*0.7],
        [-radius*0.7, radius*0.7], [-radius*0.7, -radius*0.7]
    ];
    for (const [ox, oz] of checks) {
        if (maze.isWall(x + ox, z + oz)) return true;
    }
    return false;
}

// --- CASILLEROS ---
function addLockers(mazeSize) {
    hideSpots = [];

    const metalMat = new THREE.MeshStandardMaterial({
        color: 0x6a7078,
        roughness: 0.4,
        metalness: 0.8
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: 0x2e3238,
        roughness: 0.5,
        metalness: 0.7
    });
    const handleMat = new THREE.MeshStandardMaterial({
        color: 0x1a1c20,
        roughness: 0.3,
        metalness: 0.9
    });

    let placed = 0;
    const tries = 40;

    for (let i = 0; i < tries && placed < 8; i++) {
        const tx = 2 + Math.floor(Math.random() * (mazeSize - 4));
        const ty = 2 + Math.floor(Math.random() * (mazeSize - 4));

        if (maze.grid[ty][tx] === 1) continue;
        // No poner cerca del spawn
        if (tx < 3 && ty < 3) continue;

        const group = new THREE.Group();

        // Cuerpo
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3.8, 0.9), metalMat);
        body.position.y = 1.9;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Línea de puerta
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.6, 0.03), darkMat);
        seam.position.set(0, 1.9, 0.47);
        group.add(seam);

        // Asas
        const hL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.14), handleMat);
        hL.position.set(-0.38, 2.0, 0.52);
        group.add(hL);
        const hR = hL.clone();
        hR.position.x = 0.38;
        group.add(hR);

        // Rejilla superior
        const vent = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 0.06), darkMat);
        vent.position.set(0, 3.55, 0.46);
        group.add(vent);

        // Base
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.95), darkMat);
        base.position.y = 0.08;
        group.add(base);

        const wx = tx * CELL_SIZE + CELL_SIZE / 2;
        const wz = ty * CELL_SIZE + CELL_SIZE / 2;
        group.position.set(wx, 0, wz);
        group.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2; // 0, 90, 180, 270

        scene.add(group);
        hideSpots.push({ x: wx, z: wz, radius: 2.1 });
        placed++;
    }
    console.log('Casilleros colocados:', placed);
}

// --- INIT ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6b5f3a);
    scene.fog = new THREE.FogExp2(0x6b5f3a, 0.026);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    loadLevel(currentLevel);
    setupControls();
    window.addEventListener('resize', onWindowResize);
}

function loadLevel(level) {
    while (scene.children.length > 0) scene.remove(scene.children[0]);
    fluorescentLights = [];
    hideSpots = [];
    tapes = [];

    const mazeSize = 15 + Math.min(level * 2, 10);
    maze = new MazeGenerator(mazeSize);

    // Luces
    scene.add(new THREE.AmbientLight(0xfff4d0, 0.3));
    scene.add(new THREE.HemisphereLight(0xfff6dd, 0x5a4a2a, 0.5));

    const flashlight = new THREE.SpotLight(0xfff4d8, 40, 28, Math.PI / 5.5, 0.45, 1.4);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
    flashlight.position.set(0.25, -0.15, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight);
    camera.add(flashlight.target);
    scene.add(camera);

    // Paneles fluorescentes
    const panelGeo = new THREE.BoxGeometry(CELL_SIZE * 0.5, 0.05, CELL_SIZE * 0.25);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
    for (let y = 1; y < mazeSize; y += 3) {
        for (let x = 1; x < mazeSize; x += 3) {
            if (maze.grid[y][x] === 1) continue;
            const cx = x * CELL_SIZE + CELL_SIZE / 2;
            const cz = y * CELL_SIZE + CELL_SIZE / 2;
            const panel = new THREE.Mesh(panelGeo, panelMat);
            panel.position.set(cx, WALL_HEIGHT - 0.03, cz);
            scene.add(panel);
            const pl = new THREE.PointLight(0xfff2c8, 14, CELL_SIZE * 3.5, 1.5);
            pl.position.set(cx, WALL_HEIGHT - 0.4, cz);
            scene.add(pl);
            fluorescentLights.push(pl);
        }
    }

    // Texturas y geometría
    const wallTex = makeTex('wall'); wallTex.repeat.set(2, 1);
    const floorTex = makeTex('floor'); floorTex.repeat.set(mazeSize, mazeSize);
    const ceilTex = makeTex('ceil'); ceilTex.repeat.set(mazeSize, mazeSize);

    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 });
    const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 });

    const floorGeo = new THREE.PlaneGeometry(mazeSize * CELL_SIZE, mazeSize * CELL_SIZE);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.position.set((mazeSize * CELL_SIZE) / 2, 0, (mazeSize * CELL_SIZE) / 2);
    scene.add(floor);

    const ceil = new THREE.Mesh(floorGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((mazeSize * CELL_SIZE) / 2, WALL_HEIGHT, (mazeSize * CELL_SIZE) / 2);
    scene.add(ceil);

    // Paredes
    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            if (maze.grid[y][x] === 1) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMat);
                wall.position.set(x * CELL_SIZE + CELL_SIZE / 2, WALL_HEIGHT / 2, y * CELL_SIZE + CELL_SIZE / 2);
                wall.castShadow = true;
                wall.receiveShadow = true;
                scene.add(wall);
            }
        }
    }

    // Jugador
    player.x = CELL_SIZE * 1.5;
    player.z = CELL_SIZE * 1.5;
    player.stamina = 100;
    player.exhausted = false;
    player.isHidden = false;

    // Monstruo
    monster = new Monster(scene);
    monster.speed = 5.0 + level * 0.4;
    monster.mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    monster.setPosition((mazeSize - 2.5) * CELL_SIZE, (mazeSize - 2.5) * CELL_SIZE);

    // Cintas
    const tapeMat = new THREE.MeshStandardMaterial({
        color: 0x222222, roughness: 0.4,
        emissive: 0x550000, emissiveIntensity: 0.6
    });
    for (let i = 0; i < 3; i++) {
        let tx, ty;
        do {
            tx = 1 + Math.floor(Math.random() * (mazeSize - 2));
            ty = 1 + Math.floor(Math.random() * (mazeSize - 2));
        } while (maze.grid[ty][tx] === 1 || (tx < 3 && ty < 3));

        const tape = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1.5), tapeMat);
        tape.position.set(tx * CELL_SIZE + CELL_SIZE / 2, 0.4, ty * CELL_SIZE + CELL_SIZE / 2);
        tape.castShadow = true;
        scene.add(tape);
        tapes.push({ mesh: tape, taken: false });
    }

    // Salida
    exitPos.set((mazeSize - 2) * CELL_SIZE, 2, (mazeSize - 2) * CELL_SIZE);
    const door = new THREE.Mesh(
        new THREE.BoxGeometry(2, 4, 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff55 })
    );
    door.position.copy(exitPos);
    scene.add(door);

    // CASILLEROS
    addLockers(mazeSize);

    document.getElementById('level-ui').innerText = `NIVEL ${level}`;
    showMsg(`NIVEL ${level}: ENCUENTRA 3 CINTAS\nEscóndete en casilleros con E`, 3500);
}

// --- CONTROLES ---
function setupControls() {
    window.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        if (k === 'w' || e.key === 'ArrowUp') keys.w = true;
        if (k === 's' || e.key === 'ArrowDown') keys.s = true;
        if (k === 'a' || e.key === 'ArrowLeft') keys.a = true;
        if (k === 'd' || e.key === 'ArrowRight') keys.d = true;
        if (e.key === 'Shift') keys.shift = true;
        if (k === 'e' || k === ' ') tryHide();
    });
    window.addEventListener('keyup', e => {
        const k = e.key.toLowerCase();
        if (k === 'w' || e.key === 'ArrowUp') keys.w = false;
        if (k === 's' || e.key === 'ArrowDown') keys.s = false;
        if (k === 'a' || e.key === 'ArrowLeft') keys.a = false;
        if (k === 'd' || e.key === 'ArrowRight') keys.d = false;
        if (e.key === 'Shift') keys.shift = false;
    });

    // Mouse look
    let locked = false;
    renderer.domElement.addEventListener('click', () => {
        if (!locked && isRunning) renderer.domElement.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
        locked = document.pointerLockElement === renderer.domElement;
    });
    document.addEventListener('mousemove', e => {
        if (!locked || !isRunning) return;
        camera.rotation.y -= e.movementX * 0.0021;
        camera.rotation.x -= e.movementY * 0.0019;
        camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x));
    });

    // Touch
    const joy = document.getElementById('joy');
    const joyKnob = document.getElementById('joyKnob');
    let joyId = null, center = {x:0,y:0};

    joy.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        if (joyId !== null) return;
        joyId = t.identifier;
        const r = joy.getBoundingClientRect();
        center = { x: r.left + r.width/2, y: r.top + r.height/2 };
    }, {passive:false});

    joy.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier !== joyId) continue;
            let dx = t.clientX - center.x, dy = t.clientY - center.y;
            const max = 42, mag = Math.hypot(dx, dy);
            if (mag > max) { dx = dx/mag*max; dy = dy/mag*max; }
            joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            keys.w = dy < -12; keys.s = dy > 12;
            keys.a = dx < -12; keys.d = dx > 12;
        }
    }, {passive:false});

    joy.addEventListener('touchend', e => {
        for (const t of e.changedTouches) if (t.identifier === joyId) {
            joyId = null;
            keys.w = keys.s = keys.a = keys.d = false;
            joyKnob.style.transform = 'translate(-50%, -50%)';
        }
    });

    const sprintBtn = document.getElementById('sprintBtn');
    sprintBtn.addEventListener('touchstart', e => { e.preventDefault(); keys.shift = true; sprintBtn.classList.add('active'); }, {passive:false});
    sprintBtn.addEventListener('touchend', e => { e.preventDefault(); keys.shift = false; sprintBtn.classList.remove('active'); });

    // Look touch
    let lookId = null, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('touchstart', e => {
        if (e.target.closest('#joy') || e.target.closest('#sprintBtn')) return;
        e.preventDefault();
        const t = e.changedTouches[0];
        if (lookId === null) { lookId = t.identifier; lastX = t.clientX; lastY = t.clientY; }
    }, {passive:false});
    renderer.domElement.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === lookId) {
                camera.rotation.y -= (t.clientX - lastX) * 0.005;
                camera.rotation.x -= (t.clientY - lastY) * 0.004;
                camera.rotation.x = Math.max(-1.15, Math.min(1.15, camera.rotation.x));
                lastX = t.clientX; lastY = t.clientY;
            }
        }
    }, {passive:false});
    renderer.domElement.addEventListener('touchend', e => {
        for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    });
}

function tryHide() {
    let near = false;
    for (const h of hideSpots) {
        if (Math.hypot(player.x - h.x, player.z - h.z) < h.radius) {
            near = true;
            break;
        }
    }
    if (near) {
        player.isHidden = !player.isHidden;
        showMsg(player.isHidden ? 'TE ESCONDISTE EN EL CASILLERO' : 'SALISTE', 1400);
    } else {
        showMsg('Acércate a un casillero', 1000);
    }
}

// --- UPDATE ---
function update(dt) {
    if (!isRunning) return;

    let moveX = 0, moveZ = 0;
    const speed = (keys.shift && !player.exhausted && !player.isHidden) ? SPRINT_SPEED : WALK_SPEED;

    if (!player.isHidden) {
        if (keys.w) moveZ -= 1;
        if (keys.s) moveZ += 1;
        if (keys.a) moveX -= 1;
        if (keys.d) moveX += 1;
    }

    if (moveX !== 0 || moveZ !== 0) {
        const len = Math.hypot(moveX, moveZ);
        moveX /= len;
        moveZ /= len;

        const sin = Math.sin(camera.rotation.y);
        const cos = Math.cos(camera.rotation.y);

        let vx = (moveX * cos - moveZ * sin) * speed * dt;
        let vz = (moveX * sin + moveZ * cos) * speed * dt;

        // Movimiento en sub-pasos + wall sliding
        const steps = 4;
        for (let i = 0; i < steps; i++) {
            const sx = vx / steps;
            const sz = vz / steps;

            // Eje X
            if (!collides(player.x + sx, player.z)) {
                player.x += sx;
            }

            // Eje Z
            if (!collides(player.x, player.z + sz)) {
                player.z += sz;
            }
        }

        if (keys.shift) {
            player.stamina = Math.max(0, player.stamina - 23 * dt);
            if (player.stamina === 0) player.exhausted = true;
        } else {
            player.stamina = Math.min(100, player.stamina + 14 * dt);
            if (player.stamina > 28) player.exhausted = false;
        }
    } else {
        player.stamina = Math.min(100, player.stamina + 17 * dt);
        if (player.stamina > 28) player.exhausted = false;
    }

    camera.position.set(player.x, 1.7, player.z);

    // UI
    const bat = document.getElementById('battery-fill');
    bat.style.width = player.stamina + '%';
    bat.style.background = player.exhausted ? '#ff2222' : (player.isHidden ? '#44aaff' : '#fff');

    // Monstruo
    const dir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
    monster.update(dt, camera.position, dir, maze);

    // Si estás escondido el monstruo no te atrapa
    const distM = Math.hypot(player.x - monster.mesh.position.x, player.z - monster.mesh.position.z);
    if (distM < 1.8 && !player.isHidden) {
        player.x = CELL_SIZE * 1.5;
        player.z = CELL_SIZE * 1.5;
        player.isHidden = false;
        showMsg('MINI MINI.EXE TE ATRAPÓ', 2000);
    }

    // Cintas
    tapes.forEach(t => {
        if (!t.taken && Math.hypot(player.x - t.mesh.position.x, player.z - t.mesh.position.z) < 2) {
            t.taken = true;
            scene.remove(t.mesh);
            showMsg('CINTA RECUPERADA', 1300);
        }
    });

    // Salida
    if (Math.hypot(player.x - exitPos.x, player.z - exitPos.z) < 3 && tapes.every(t => t.taken)) {
        currentLevel++;
        loadLevel(currentLevel);
    }

    // Parpadeo luces
    if (fluorescentLights.length) {
        const t = performance.now() * 0.001;
        fluorescentLights.forEach((l, i) => {
            l.intensity = 12 + Math.sin(t * 2.3 + i * 1.5) * 2 + (Math.random() > 0.98 ? -5 : 0);
        });
    }
}

// --- LOOP ---
let lastTime = 0;
function animate(time) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;
    update(dt);
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

let msgTimer = null;
function showMsg(txt, ms) {
    const m = document.getElementById('msg');
    m.innerHTML = txt.replace(/\n/g, '<br>');
    m.classList.add('show');
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(() => m.classList.remove('show'), ms);
}

document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('startScreen').style.display = 'none';
    isRunning = true;
    animate(performance.now());
});

init();

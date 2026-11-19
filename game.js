import * as THREE from 'three';
import { MazeGenerator } from './maze.js';
import { Monster } from './entity.js';

// --- CONFIGURACIÓN ---
const CELL_SIZE = 10;
const WALL_HEIGHT = 5;
const WALK_SPEED = 5;
const SPRINT_SPEED = 8.5;

let currentLevel = 1;
let maze = null;
let monster = null;
let scene, camera, renderer;
let player = { x: 0, z: 0, stamina: 100, exhausted: false };
let keys = { w: false, a: false, s: false, d: false, shift: false };
let tapes = [];
let exitPos = new THREE.Vector3();
let isRunning = false;
let zBuffer = []; // No necesario en Three.js, pero ayuda conceptualmente

// --- TEXTURAS PROCEDURALES ---
function makeTex(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const noise = a => { const d = g.getImageData(0,0,256,256); for (let i=0;i<d.data.length;i+=4){ const n=(Math.random()-.5)*a; d.data[i]+=n; d.data[i+1]+=n; d.data[i+2]+=n; } g.putImageData(d,0,0); };
    if (kind === 'wall') {
        g.fillStyle = '#d6c274'; g.fillRect(0,0,256,256);
        g.fillStyle = 'rgba(150,125,50,.35)'; for (let x=0;x<256;x+=32) g.fillRect(x,0,3,256);
        g.fillStyle = 'rgba(160,130,55,.3)'; for (let x=16;x<256;x+=32) for (let y=12;y<256;y+=24){ g.beginPath(); g.arc(x,y,3,0,7); g.fill(); }
        for (let i=0;i<5;i++){ const x=Math.random()*256,y=150+Math.random()*100; const r=g.createRadialGradient(x,y,0,x,y,45); r.addColorStop(0,'rgba(90,70,20,.25)'); r.addColorStop(1,'rgba(90,70,20,0)'); g.fillStyle=r; g.fillRect(0,0,256,256); }
        g.fillStyle = '#7a6528'; g.fillRect(0,240,256,16);
        noise(16);
    } else if (kind === 'floor') {
        g.fillStyle = '#8a7440'; g.fillRect(0,0,256,256); noise(45);
        for (let i=0;i<25;i++){ g.fillStyle='rgba(60,45,20,.12)'; g.beginPath(); g.arc(Math.random()*256,Math.random()*256,Math.random()*30+5,0,7); g.fill(); }
    } else {
        g.fillStyle = '#e6dfc0'; g.fillRect(0,0,256,256); noise(12);
        g.strokeStyle = 'rgba(110,100,70,.55)'; g.lineWidth = 4; g.strokeRect(0,0,256,256);
        g.beginPath(); g.moveTo(128,0); g.lineTo(128,256); g.moveTo(0,128); g.lineTo(256,128); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
}

// --- LUCES (luz fluorescente de techo + linterna con sombras) ---
function addLights(mazeSize) {
    scene.add(new THREE.AmbientLight(0xfff4d0, 0.35));
    scene.add(new THREE.HemisphereLight(0xfff6dd, 0x5a4a2a, 0.6));
    // Linterna del jugador: proyecta sombras reales
    const flashlight = new THREE.SpotLight(0xfff4d8, 40, 30, Math.PI / 5, 0.5, 1.5);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
    flashlight.shadow.bias = -0.0005; flashlight.shadow.normalBias = 0.03;
    flashlight.position.set(0.3, -0.2, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight); camera.add(flashlight.target);
    scene.add(camera);
    // Paneles de luz en el techo (cada 3 celdas libres)
    const panelGeo = new THREE.BoxGeometry(CELL_SIZE * 0.5, 0.05, CELL_SIZE * 0.25);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
    for (let y = 1; y < mazeSize; y += 4) for (let x = 1; x < mazeSize; x += 4) {
        if (!maze.grid[y] || maze.grid[y][x] === 1) continue;
        const cx = x * CELL_SIZE + CELL_SIZE/2, cz = y * CELL_SIZE + CELL_SIZE/2;
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(cx, WALL_HEIGHT - 0.03, cz); scene.add(panel);
        const pl = new THREE.PointLight(0xfff2c8, 18, CELL_SIZE * 4, 1.6);
        pl.position.set(cx, WALL_HEIGHT - 0.4, cz); scene.add(pl);
    }
}

// --- INICIALIZACIÓN ---
function init() {
    // 1. Configurar Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6b5f3a);
    scene.fog = new THREE.FogExp2(0x6b5f3a, 0.028);

    // 2. Cámara
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.rotation.order = 'YXZ';

    // 3. Renderizador
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    // 4. Luces (Optimizadas para evitar pantallas negras)
    // (Las luces se crean en loadLevel, porque ahí se limpia la escena)

    // 5. Generar Nivel
    loadLevel(currentLevel);

    // 6. Event Listeners
    setupControls();
    window.addEventListener('resize', onWindowResize);
}

function loadLevel(level) {
    // Limpiar escena anterior
    while(scene.children.length > 0){ 
        scene.remove(scene.children[0]); 
    }

    // Generar nuevo laberinto (más grande por nivel)
    const mazeSize = 15 + (level * 5);
    maze = new MazeGenerator(mazeSize);
    maze.cellSize = CELL_SIZE;

    addLights(mazeSize);
    const wallTex = makeTex('wall'); wallTex.repeat.set(2, 1);
    const floorTex = makeTex('floor'); floorTex.repeat.set(mazeSize, mazeSize);
    const ceilTex = makeTex('ceil'); ceilTex.repeat.set(mazeSize, mazeSize);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 });
    const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 });

    // Crear Suelo y Techo
    const floorGeo = new THREE.PlaneGeometry(mazeSize * CELL_SIZE, mazeSize * CELL_SIZE);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    floor.position.set((mazeSize * CELL_SIZE) / 2, 0, (mazeSize * CELL_SIZE) / 2);
    scene.add(floor);

    const ceil = new THREE.Mesh(floorGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2; ceil.receiveShadow = true;
    ceil.position.set((mazeSize * CELL_SIZE) / 2, WALL_HEIGHT, (mazeSize * CELL_SIZE) / 2);
    scene.add(ceil);

    // Crear Paredes
    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            if (maze.grid[y][x] === 1) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMat);
                wall.position.set(x * CELL_SIZE + CELL_SIZE/2, WALL_HEIGHT/2, y * CELL_SIZE + CELL_SIZE/2);
                wall.castShadow = true; wall.receiveShadow = true;
                scene.add(wall);
            }
        }
    }

    // Jugador
    player.x = CELL_SIZE * 1.5;
    player.z = CELL_SIZE * 1.5;
    player.stamina = 100;

    // Crear Monstruo
    monster = new Monster(scene);
    monster.speed = 5.0 + (level * 0.5);
    monster.mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    monster.setPosition((mazeSize - 2) * CELL_SIZE, (mazeSize - 2) * CELL_SIZE);

    // Crear Cintas
    tapes = [];
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, emissive: 0x550000, emissiveIntensity: 0.6 });
    for (let i = 0; i < 3; i++) {
        let tx, ty;
        do {
            tx = Math.floor(Math.random() * (mazeSize - 2)) + 1;
            ty = Math.floor(Math.random() * (mazeSize - 2)) + 1;
        } while (maze.grid[ty][tx] === 1 || (tx === 1 && ty === 1));

        const tape = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1.5), tapeMat);
        tape.position.set(tx * CELL_SIZE + CELL_SIZE/2, 0.5, ty * CELL_SIZE + CELL_SIZE/2);
        tape.castShadow = true;
        scene.add(tape);
        tapes.push({ mesh: tape, taken: false });
    }

    // Salida
    exitPos.set((mazeSize - 2) * CELL_SIZE, 2, (mazeSize - 2) * CELL_SIZE);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    door.position.copy(exitPos);
    scene.add(door);

    document.getElementById('level-ui').innerText = `NIVEL ${level}`;
    showMsg(`NIVEL ${level}: ENCUENTRA 3 CINTAS`, 3000);
}

// --- CONTROLES ---
function setupControls() {
    // Teclado (PC)
    window.addEventListener('keydown', e => {
        if (e.key === 'w' || e.key === 'ArrowUp') keys.w = true;
        if (e.key === 's' || e.key === 'ArrowDown') keys.s = true;
        if (e.key === 'a' || e.key === 'ArrowLeft') keys.a = true;
        if (e.key === 'd' || e.key === 'ArrowRight') keys.d = true;
        if (e.key === 'Shift') keys.shift = true;
    });
    window.addEventListener('keyup', e => {
        if (e.key === 'w' || e.key === 'ArrowUp') keys.w = false;
        if (e.key === 's' || e.key === 'ArrowDown') keys.s = false;
        if (e.key === 'a' || e.key === 'ArrowLeft') keys.a = false;
        if (e.key === 'd' || e.key === 'ArrowRight') keys.d = false;
        if (e.key === 'Shift') keys.shift = false;
    });

    // Táctil (iPhone/Android)
    const joy = document.getElementById('joy');
    const joyKnob = document.getElementById('joyKnob');
    let joyId = null, joyCenter = { x: 0, y: 0 };

    joy.addEventListener('touchstart', e => {
        e.preventDefault(); const t = e.changedTouches[0];
        if (joyId !== null) return;
        joyId = t.identifier; const r = joy.getBoundingClientRect();
        joyCenter = { x: r.left + r.width/2, y: r.top + r.height/2 };
    });
    joy.addEventListener('touchmove', e => {
        e.preventDefault();
        for(const t of e.changedTouches) {
            if(t.identifier !== joyId) continue;
            let dx = t.clientX - joyCenter.x, dy = t.clientY - joyCenter.y;
            const max = 45, mag = Math.hypot(dx, dy);
            if(mag > max) { dx = dx/mag*max; dy = dy/mag*max; }
            joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            
            // Simular teclas
            keys.w = dy < -15; keys.s = dy > 15;
            keys.a = dx < -15; keys.d = dx > 15;
        }
    });
    joy.addEventListener('touchend', e => {
        for(const t of e.changedTouches) if(t.identifier === joyId) {
            joyId = null; keys.w = keys.s = keys.a = keys.d = false;
            joyKnob.style.transform = 'translate(-50%, -50%)';
        }
    });

    // Sprint táctil
    const sprintBtn = document.getElementById('sprintBtn');
    sprintBtn.addEventListener('touchstart', e => { e.preventDefault(); keys.shift = true; sprintBtn.classList.add('active'); });
    sprintBtn.addEventListener('touchend', e => { e.preventDefault(); keys.shift = false; sprintBtn.classList.remove('active'); });

    // Mirar con el dedo (Swipe)
    let lookId = null, lastX = 0;
    renderer.domElement.addEventListener('touchstart', e => {
        e.preventDefault(); const t = e.changedTouches[0];
        if (lookId === null) { lookId = t.identifier; lastX = t.clientX; }
    });
    renderer.domElement.addEventListener('touchmove', e => {
        e.preventDefault();
        for(const t of e.changedTouches) {
            if(t.identifier === lookId) {
                camera.rotation.y -= (t.clientX - lastX) * 0.005;
                lastX = t.clientX;
            }
        }
    });
    renderer.domElement.addEventListener('touchend', e => {
        for(const t of e.changedTouches) if(t.identifier === lookId) lookId = null;
    });
}

// --- LÓGICA DEL JUEGO ---
const PLAYER_R = 1.0;
function blocked(x, z) {
    return maze.isWall(x - PLAYER_R, z - PLAYER_R) || maze.isWall(x + PLAYER_R, z - PLAYER_R) ||
           maze.isWall(x - PLAYER_R, z + PLAYER_R) || maze.isWall(x + PLAYER_R, z + PLAYER_R);
}
function update(dt) {
    if (!isRunning) return;

    // Movimiento del jugador
    let moveX = 0, moveZ = 0;
    const speed = keys.shift && !player.exhausted ? SPRINT_SPEED : WALK_SPEED;

    if (keys.w) moveZ -= 1;
    if (keys.s) moveZ += 1;
    if (keys.a) moveX -= 1;
    if (keys.d) moveX += 1;

    if (moveX !== 0 || moveZ !== 0) {
        const length = Math.hypot(moveX, moveZ);
        moveX /= length; moveZ /= length;

        // Rotar movimiento según la cámara
        const sin = Math.sin(camera.rotation.y);
        const cos = Math.cos(camera.rotation.y);
        const nextX = player.x + (moveX * cos + moveZ * sin) * speed * dt;
        const nextZ = player.z + (-moveX * sin + moveZ * cos) * speed * dt;

        // Colisión con paredes
        if (!blocked(nextX, player.z)) player.x = nextX;
        if (!blocked(player.x, nextZ)) player.z = nextZ;

        // Energía
        if (keys.shift) {
            player.stamina = Math.max(0, player.stamina - 20 * dt);
            if (player.stamina === 0) player.exhausted = true;
        } else {
            player.stamina = Math.min(100, player.stamina + 15 * dt);
            if (player.stamina > 30) player.exhausted = false;
        }
    }

    // Actualizar cámara
    camera.position.set(player.x, 2, player.z);

    // Actualizar UI
    document.getElementById('battery-fill').style.width = player.stamina + '%';
    document.getElementById('battery-fill').style.background = player.exhausted ? '#ff0000' : '#fff';

    // Actualizar Monstruo
    const dir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
    monster.update(dt, camera.position, dir, maze);

    // Distancia al monstruo
    const distToMonster = Math.hypot(player.x - monster.mesh.position.x, player.z - monster.mesh.position.z);
    if (distToMonster < 2) {
        // Atrapado
        player.x = CELL_SIZE * 1.5;
        player.z = CELL_SIZE * 1.5;
        showMsg('MINI MINI.EXE TE ATRAPÓ', 2000);
    }

    // Recolectar cintas
    tapes.forEach(t => {
        if (!t.taken) {
            const d = Math.hypot(player.x - t.mesh.position.x, player.z - t.mesh.position.z);
            if (d < 2) {
                t.taken = true;
                scene.remove(t.mesh);
                showMsg('CINTA RECUPERADA', 1500);
            }
        }
    });

    // Llegar a la salida
    const distToExit = Math.hypot(player.x - exitPos.x, player.z - exitPos.z);
    if (distToExit < 3 && tapes.every(t => t.taken)) {
        currentLevel++;
        loadLevel(currentLevel);
    }
}

// --- BUCLE DE RENDERIZADO ---
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
    const m = document.getElementById('msg'); m.textContent = txt; m.classList.add('show');
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(() => m.classList.remove('show'), ms);
}

// --- INICIO ---
document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('startScreen').style.display = 'none';
    isRunning = true;
    animate(performance.now());
});

init();

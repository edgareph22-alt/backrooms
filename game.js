import * as THREE from 'three';
import { MazeGenerator } from './maze.js';
import { Monster } from './entity.js';

const CELL_SIZE = 10;
const WALL_HEIGHT = 5;
const WALK_SPEED = 4.0;
const SPRINT_SPEED = 7.5;
const PLAYER_RADIUS = 0.7;

let currentLevel = 1;
let maze, monster, scene, camera, renderer;
let player = { x: 0, z: 0, isHidden: false, joyX: 0, joyY: 0, lastX: 0, lastZ: 0, stamina: 100, exhausted: false };
let keys = { w: false, a: false, s: false, d: false, shift: false };
let tapes = [], hideSpots = [];
let exitPos = new THREE.Vector3();
let isRunning = false;
let isForestLevel = false;
let playerMesh = null;

let peer = null, conn = null, isHost = false, remotePlayerMesh = null;
let remoteData = { x: 0, z: 0, rot: 0, isHidden: false };

let points = parseInt(localStorage.getItem('br_points') || '0');
let activeSkin = localStorage.getItem('br_activeSkin') || 'blue';

// --- SISTEMA DE AUDIO ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let heartbeatOsc = null;
let stepTimer = 0;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new AudioContext();
    
    // Zumbido de luces
    const humOsc = audioCtx.createOscillator();
    const humGain = audioCtx.createGain();
    humOsc.type = 'sawtooth';
    humOsc.frequency.value = 60;
    humGain.gain.value = 0.03;
    humOsc.connect(humGain); humGain.connect(audioCtx.destination);
    humOsc.start();

    // Música oscura (Drone)
    const droneOsc = audioCtx.createOscillator();
    const droneGain = audioCtx.createGain();
    droneOsc.type = 'sine';
    droneOsc.frequency.value = 40;
    droneGain.gain.value = 0.05;
    droneOsc.connect(droneGain); droneGain.connect(audioCtx.destination);
    droneOsc.start();
}

function playStep() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.1);
    g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.1);
}

function playScare() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const bufferSize = audioCtx.sampleRate * 0.5;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource(); src.buffer = buffer;
    const g = audioCtx.createGain(); g.gain.setValueAtTime(0.5, t);
    src.connect(g); g.connect(audioCtx.destination); src.start(t);
}

function updateHeartbeat(isNear) {
    if (!audioCtx) return;
    if (isNear && !heartbeatOsc) {
        heartbeatOsc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        heartbeatOsc.type = 'sine'; 
        heartbeatOsc.frequency.setValueAtTime(50, audioCtx.currentTime);
        g.gain.setValueAtTime(0.2, audioCtx.currentTime);
        heartbeatOsc.connect(g); g.connect(audioCtx.destination); 
        heartbeatOsc.start();
    } else if (!isNear && heartbeatOsc) {
        heartbeatOsc.stop(); heartbeatOsc = null;
    }
}

document.getElementById('pointsVal').innerText = points;

// --- FUNCIONES GLOBALES ---
window.showScreen = function(id) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};
window.saveSettings = function() { showScreen('mainMenu'); };
window.startSinglePlayer = function() { 
    initAudio(); // Inicializar audio al hacer clic
    isHost = true; 
    startGame(); 
};
window.buySkin = function(color, cost) {
    if (points >= cost) {
        points -= cost; localStorage.setItem('br_points', points);
        localStorage.setItem('br_activeSkin', color); activeSkin = color;
        document.getElementById('pointsVal').innerText = points; alert("¡Skin equipada!");
    } else { alert("No tienes suficientes puntos."); }
};

window.hostGame = function() {
    const status = document.getElementById('hostStatus');
    const createBtn = document.getElementById('createRoomBtn');
    status.style.display = 'block'; status.innerText = 'Conectando...'; status.style.color = '#ffd23f'; createBtn.disabled = true;
    if (typeof Peer === 'undefined') { status.innerText = 'Error: Sin internet.'; status.style.color = 'red'; createBtn.disabled = false; return; }
    
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    peer = new Peer('BR-' + code);
    peer.on('open', () => {
        isHost = true;
        status.innerText = '¡Sala creada! Esperando...';
        document.getElementById('hostCodeContainer').style.display = 'block';
        document.getElementById('hostCodeDisplay').innerText = code;
    });
    peer.on('error', (err) => { status.innerText = 'Error: ' + err.type; status.style.color = 'red'; createBtn.disabled = false; });
    peer.on('connection', (connection) => { conn = connection; setupConnection(); status.innerText = '¡Jugador conectado!'; });
};

window.startHostGame = function() {
    initAudio(); // Inicializar audio
    startGame();
    if(conn && conn.open) conn.send({ type: 'loadLevel', level: currentLevel });
};

window.joinGame = function() {
    const code = document.getElementById('joinCodeInput').value.toUpperCase();
    if(code.length < 4) return alert("Código inválido.");
    if (typeof Peer === 'undefined') return alert("Error: Sin internet.");
    
    initAudio(); // Inicializar audio
    
    peer = new Peer();
    peer.on('open', () => {
        conn = peer.connect('BR-' + code); setupConnection();
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
        document.getElementById('ui').style.display = 'block'; document.getElementById('controls').style.display = 'block';
        setTimeout(() => { init(true); }, 500); 
    });
    peer.on('error', (err) => { alert("No se pudo conectar a la sala."); });
};

function startGame() {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById('ui').style.display = 'block'; document.getElementById('controls').style.display = 'block';
    init(false);
}

// --- TEXTURAS ---
function makeTex(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    if (kind === 'wall') {
        g.fillStyle = '#a89245'; g.fillRect(0, 0, 256, 256);
        g.fillStyle = 'rgba(80,60,20,0.3)'; 
        for (let i = 0; i < 40; i++) {
            g.beginPath(); g.arc(Math.random()*256, Math.random()*256, Math.random()*30+10, 0, 7); g.fill();
        }
        g.fillStyle = '#5a4a1e'; for (let x = 0; x < 256; x += 24) g.fillRect(x, 0, 2, 256);
        g.fillStyle = '#3a2e10'; g.fillRect(0, 240, 256, 16); 
    } else if (kind === 'floor') {
        g.fillStyle = '#6b5a2e'; g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 80; i++) { g.fillStyle = 'rgba(20,15,5,0.2)'; g.beginPath(); g.arc(Math.random()*256, Math.random()*256, 10 + Math.random()*20, 0, 7); g.fill(); }
    } else {
        g.fillStyle = '#555'; g.fillRect(0, 0, 256, 256); 
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function collides(x, z, radius = PLAYER_RADIUS) {
    const checks = [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[radius*0.7,radius*0.7],[radius*0.7,-radius*0.7],[-radius*0.7,radius*0.7],[-radius*0.7,-radius*0.7]];
    for (const [ox, oz] of checks) if (maze.isWall(x + ox, z + oz)) return true;
    return false;
}

function addHideSpots(mazeSize, isForest) {
    hideSpots = []; let placed = 0;
    for (let i = 0; i < 40 && placed < 8; i++) {
        const tx = 2 + Math.floor(Math.random() * (mazeSize - 4)), ty = 2 + Math.floor(Math.random() * (mazeSize - 4));
        if (maze.grid[ty][tx] === 1 || (tx < 3 && ty < 3)) continue;
        const group = new THREE.Group();
        const wx = tx * CELL_SIZE + CELL_SIZE / 2, wz = ty * CELL_SIZE + CELL_SIZE / 2;
        group.position.set(wx, 0, wz); group.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2;
        if (!isForest) {
            const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6, metalness: 0.8 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3.8, 0.9), metalMat); body.position.y = 1.9; 
            body.castShadow = true; body.receiveShadow = true;
            group.add(body);
        } else {
            const hayMat = new THREE.MeshStandardMaterial({ color: 0x8a6a1c, roughness: 1 });
            const hay = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 8), hayMat); hay.rotation.z = Math.PI / 2; hay.position.y = 1.2; 
            hay.castShadow = true;
            group.add(hay);
        }
        scene.add(group); hideSpots.push({ x: wx, z: wz, radius: 2.1 }); placed++;
    }
}

function loadLevel(level) {
    while (scene.children.length > 0) scene.remove(scene.children[0]);
    hideSpots = []; tapes = []; isForestLevel = (level % 2 === 0);
    
    const bgColor = isForestLevel ? 0x050806 : 0x1a150a;
    scene.background = new THREE.Color(bgColor); 
    scene.fog = new THREE.FogExp2(bgColor, isForestLevel ? 0.08 : 0.06);
    
    const mazeSize = 15 + Math.min(level * 2, 10); maze = new MazeGenerator(mazeSize);

    scene.add(new THREE.AmbientLight(0xffffff, 0.1)); 
    scene.add(new THREE.HemisphereLight(0x3a3a3a, 0x000000, 0.2));
    
    const flashlight = new THREE.SpotLight(0xfff4d8, 50, 25, Math.PI / 5.5, 0.5, 1.5);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.width = 1024;
    flashlight.shadow.mapSize.height = 1024;
    flashlight.position.set(0.25, -0.15, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight); camera.add(flashlight.target); scene.add(camera);

    const wallTex = makeTex(isForestLevel ? 'floor' : 'wall'); wallTex.repeat.set(2, 1);
    const floorTex = makeTex('floor'); floorTex.repeat.set(mazeSize, mazeSize);
    const ceilTex = makeTex('ceil'); ceilTex.repeat.set(mazeSize, mazeSize);

    let wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.1 });
    if (isForestLevel) wallMat = new THREE.MeshStandardMaterial({ color: 0x0a1a0a, roughness: 1 });
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 });

    const floorGeo = new THREE.PlaneGeometry(mazeSize * CELL_SIZE, mazeSize * CELL_SIZE);
    const floor = new THREE.Mesh(floorGeo, floorMat); 
    floor.rotation.x = -Math.PI / 2; floor.position.set((mazeSize * CELL_SIZE) / 2, 0, (mazeSize * CELL_SIZE) / 2); 
    floor.receiveShadow = true;
    scene.add(floor);
    
    if (!isForestLevel) {
        const ceil = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 }));
        ceil.rotation.x = Math.PI / 2; ceil.position.set((mazeSize * CELL_SIZE) / 2, WALL_HEIGHT, (mazeSize * CELL_SIZE) / 2); 
        ceil.receiveShadow = true;
        scene.add(ceil);
    }

    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            if (maze.grid[y][x] === 1) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMat);
                wall.position.set(x * CELL_SIZE + CELL_SIZE / 2, WALL_HEIGHT / 2, y * CELL_SIZE + CELL_SIZE / 2); 
                wall.castShadow = true; wall.receiveShadow = true;
                scene.add(wall);
            }
        }
    }

    player.x = CELL_SIZE * 1.5; player.z = CELL_SIZE * 1.5; player.isHidden = false;
    player.stamina = 100; player.exhausted = false;
    
    if(playerMesh) scene.remove(playerMesh);
    playerMesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), new THREE.MeshLambertMaterial({color: getColorHex(activeSkin)}));
    body.position.y = 1; body.castShadow = true;
    playerMesh.add(body); scene.add(playerMesh);

    if(isHost) {
        monster = new Monster(scene, isForestLevel ? 'scarecrow' : 'smiler');
        monster.speed = 5.0 + level * 0.4;
        monster.setPosition((mazeSize - 4) * CELL_SIZE, (mazeSize - 4) * CELL_SIZE);
        monster.mesh.traverse(o => { if(o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    }

    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x880000, emissiveIntensity: 2 });
    for (let i = 0; i < 3; i++) {
        let tx, ty;
        do { tx = 1 + Math.floor(Math.random() * (mazeSize - 2)); ty = 1 + Math.floor(Math.random() * (mazeSize - 2)); } while (maze.grid[ty][tx] === 1 || (Math.hypot(tx, ty) < 6));
        const tape = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1.5), tapeMat);
        tape.position.set(tx * CELL_SIZE + CELL_SIZE / 2, 1, ty * CELL_SIZE + CELL_SIZE / 2); 
        tape.castShadow = true;
        scene.add(tape);
        tapes.push({ mesh: tape, taken: false });
    }

    exitPos.set((mazeSize - 2) * CELL_SIZE, 2, (mazeSize - 2) * CELL_SIZE);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial({ color: 0x00ff55 })); 
    door.position.copy(exitPos); scene.add(door);

    addHideSpots(mazeSize, isForestLevel);
    document.getElementById('level-ui').innerText = isForestLevel ? `BOSQUE ${level}` : `NIVEL ${level}`;
}

function getColorHex(color) {
    if(color === 'red') return 0xff0000; if(color === 'green') return 0x00ff00; return 0x0000ff;
}

function init(isClient) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.rotation.order = 'YXZ';
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    loadLevel(currentLevel); setupControls(); window.addEventListener('resize', onWindowResize);
    isRunning = true; animate(performance.now());
}

function setupConnection() {
    conn.on('open', () => { conn.send({ type: 'init', skin: activeSkin }); });
    conn.on('data', (data) => {
        if(data.type === 'move') {
            remoteData.x = data.x; remoteData.z = data.z; remoteData.rot = data.rot; remoteData.isHidden = data.isHidden;
            if(!remotePlayerMesh) {
                remotePlayerMesh = new THREE.Group();
                const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), new THREE.MeshLambertMaterial({color: 0xff0000}));
                body.position.y = 1; remotePlayerMesh.add(body); scene.add(remotePlayerMesh);
            }
        } else if (data.type === 'monsterSync' && !isHost) {
            if(!monster) monster = new Monster(scene, isForestLevel ? 'scarecrow' : 'smiler');
            monster.mesh.position.x = data.x; monster.mesh.position.z = data.z;
        } else if (data.type === 'tapeTaken' && !isHost) {
            const t = tapes[data.index]; if(t && !t.taken) { t.taken = true; scene.remove(t.mesh); }
        } else if (data.type === 'loadLevel' && !isHost) {
            currentLevel = data.level; loadLevel(currentLevel);
        }
    });
}

function setupControls() {
    window.addEventListener('keydown', e => {
        if (e.key.toLowerCase() === 'w') keys.w = true; if (e.key.toLowerCase() === 's') keys.s = true;
        if (e.key.toLowerCase() === 'a') keys.a = true; if (e.key.toLowerCase() === 'd') keys.d = true;
        if (e.key === 'Shift') keys.shift = true; if (e.key.toLowerCase() === 'e' || e.key === ' ') tryHide();
    });
    window.addEventListener('keyup', e => {
        if (e.key.toLowerCase() === 'w') keys.w = false; if (e.key.toLowerCase() === 's') keys.s = false;
        if (e.key.toLowerCase() === 'a') keys.a = false; if (e.key.toLowerCase() === 'd') keys.d = false;
        if (e.key === 'Shift') keys.shift = false;
    });

    let locked = false;
    document.getElementById('game-canvas').addEventListener('click', () => { if (!locked && isRunning) renderer.domElement.requestPointerLock(); });
    document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === renderer.domElement; });
    document.addEventListener('mousemove', e => {
        if (!locked || !isRunning) return;
        camera.rotation.y -= e.movementX * 0.0021; camera.rotation.x -= e.movementY * 0.0019;
        camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x));
    });

    const joy = document.getElementById('joy'); const joyKnob = document.getElementById('joyKnob');
    let joyId = null, center = {x:0,y:0};
    joy.addEventListener('touchstart', e => {
        e.preventDefault(); const t = e.changedTouches[0]; if (joyId !== null) return;
        joyId = t.identifier; const r = joy.getBoundingClientRect(); center = { x: r.left + r.width/2, y: r.top + r.height/2 };
    }, {passive:false});
    joy.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier !== joyId) continue;
            let dx = t.clientX - center.x, dy = t.clientY - center.y;
            const max = 42, mag = Math.hypot(dx, dy);
            if (mag > max) { dx = dx/mag*max; dy = dy/mag*max; }
            joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            player.joyX = dx / max; player.joyY = dy / max;
        }
    }, {passive:false});
    joy.addEventListener('touchend', e => {
        for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; player.joyX = 0; player.joyY = 0; joyKnob.style.transform = 'translate(-50%, -50%)'; }
    });

    let lookId = null, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('touchstart', e => {
        if (e.target.closest('#joy') || e.target.closest('#sprintBtn') || e.target.closest('#hideBtn')) return;
        e.preventDefault(); const t = e.changedTouches[0];
        if (lookId === null) { lookId = t.identifier; lastX = t.clientX; lastY = t.clientY; }
    }, {passive:false});
    renderer.domElement.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === lookId) {
                camera.rotation.y -= (t.clientX - lastX) * 0.005; camera.rotation.x -= (t.clientY - lastY) * 0.004;
                camera.rotation.x = Math.max(-1.15, Math.min(1.15, camera.rotation.x));
                lastX = t.clientX; lastY = t.clientY;
            }
        }
    }, {passive:false});
    renderer.domElement.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; });

    document.getElementById('sprintBtn').addEventListener('touchstart', e => { e.preventDefault(); keys.shift = true; document.getElementById('sprintBtn').classList.add('active'); }, {passive:false});
    document.getElementById('sprintBtn').addEventListener('touchend', e => { e.preventDefault(); keys.shift = false; document.getElementById('sprintBtn').classList.remove('active'); });
    document.getElementById('hideBtn').addEventListener('touchstart', e => { e.preventDefault(); tryHide(); }, {passive:false});
}

function tryHide() {
    if (!player.isHidden) {
        for (const h of hideSpots) {
            if (Math.hypot(player.x - h.x, player.z - h.z) < h.radius) {
                player.lastX = player.x; player.lastZ = player.z; player.x = h.x; player.z = h.z; player.isHidden = true;
                document.getElementById('locker-overlay').style.display = 'block'; return;
            }
        }
    } else {
        player.x = player.lastX; player.z = player.lastZ; player.isHidden = false;
        document.getElementById('locker-overlay').style.display = 'none';
    }
}

let lastTime = 0;
function animate(time) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (time - lastTime) / 1000); lastTime = time;
    update(dt);
    if(renderer && scene && camera) renderer.render(scene, camera);
}

function update(dt) {
    if (!isRunning) return;

    let moveX = player.joyX; let moveZ = player.joyY;
    if (keys.w) moveZ -= 1; if (keys.s) moveZ += 1; if (keys.a) moveX -= 1; if (keys.d) moveX += 1;
    const len = Math.hypot(moveX, moveZ); if (len > 1) { moveX /= len; moveZ /= len; }

    const isMoving = !player.isHidden && (moveX !== 0 || moveZ !== 0);
    let currentSpeed = WALK_SPEED;
    
    if (keys.shift && isMoving && !player.exhausted && player.stamina > 0) {
        currentSpeed = SPRINT_SPEED;
        player.stamina = Math.max(0, player.stamina - 20 * dt);
        if (player.stamina <= 0) player.exhausted = true;
    } else {
        player.stamina = Math.min(100, player.stamina + 12 * dt);
        if (player.stamina > 30) player.exhausted = false;
    }
    
    const bat = document.getElementById('battery-fill');
    bat.style.width = player.stamina + '%';
    bat.style.background = player.exhausted ? '#ff2222' : (player.isHidden ? '#44aaff' : '#fff');

    if (isMoving) {
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
        const moveDir = forward.multiplyScalar(-moveZ).add(right.multiplyScalar(moveX));
        
        const vx = moveDir.x * currentSpeed * dt; const vz = moveDir.z * currentSpeed * dt;
        if (!collides(player.x + vx, player.z)) player.x += vx;
        if (!collides(player.x, player.z + vz)) player.z += vz;

        // Sonido de pasos
        stepTimer += dt;
        if (stepTimer > (keys.shift ? 0.3 : 0.5)) { stepTimer = 0; playStep(); }
    }

    camera.position.set(player.x, 1.7, player.z);
    if(playerMesh) { playerMesh.position.set(player.x, 0, player.z); playerMesh.rotation.y = camera.rotation.y; }

    if(conn && conn.open) conn.send({ type: 'move', x: player.x, z: player.z, rot: camera.rotation.y, isHidden: player.isHidden });

    if(remotePlayerMesh) {
        remotePlayerMesh.position.lerp(new THREE.Vector3(remoteData.x, 0, remoteData.z), 0.2);
        remotePlayerMesh.rotation.y = remoteData.rot; remotePlayerMesh.visible = !remoteData.isHidden;
    }

    tapes.forEach((t, i) => {
        if (!t.taken) {
            t.mesh.rotation.y += dt * 2; 
            if (Math.hypot(player.x - t.mesh.position.x, player.z - t.mesh.position.z) < 2) {
                t.taken = true; scene.remove(t.mesh);
                if(conn && conn.open && isHost) conn.send({ type: 'tapeTaken', index: i });
                showMsg("Cinta Recuperada"); // Añadí un aviso visual
            }
        }
    });

    if (tapes.every(t => t.taken) && Math.hypot(player.x - exitPos.x, player.z - exitPos.z) < 3) {
        currentLevel++;
        loadLevel(currentLevel);
        if(conn && conn.open && isHost) conn.send({ type: 'loadLevel', level: currentLevel });
    }

    if(isHost && monster) {
        monster.update(dt, camera.position, new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0)), maze, player.isHidden);
        if(conn && conn.open) conn.send({ type: 'monsterSync', x: monster.mesh.position.x, z: monster.mesh.position.z });
        
        // Latidos y muerte
        const distM = Math.hypot(player.x - monster.mesh.position.x, player.z - monster.mesh.position.z);
        updateHeartbeat(distM < 12 && !player.isHidden); // Late si está a menos de 12 metros

        if (distM < 1.8 && !player.isHidden) {
            playScare(); // Grito al morir
            player.x = CELL_SIZE * 1.5; player.z = CELL_SIZE * 1.5; player.isHidden = false;
            document.getElementById('locker-overlay').style.display = 'none';
        }
    }
}

function showMsg(txt) {
    const m = document.getElementById('msg'); m.textContent = txt; m.classList.add('show');
    setTimeout(() => m.classList.remove('show'), 2000);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
}

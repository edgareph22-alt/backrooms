import * as THREE from 'three';
import { MazeGenerator } from './maze.js';
import { Monster } from './entity.js';
import { getActiveSkin, getActiveMonster, addPoints } from './auth.js';

const CELL_SIZE = 10;
const WALL_HEIGHT = 5;
const WALK_SPEED = 4.2;
const SPRINT_SPEED = 7.8;
const PLAYER_RADIUS = 0.7;

let currentLevel = 1;
let maze, monster, scene, camera, renderer, levelGroup, flashlight;
let player = { x: 0, z: 0, isHidden: false, joyX: 0, joyY: 0, lastX: 0, lastZ: 0, stamina: 100, exhausted: false };
let keys = { w: false, a: false, s: false, d: false, shift: false };
let tapes = [], hideSpots = [], ceilingLights = [];
let exitPos = new THREE.Vector3();
let isRunning = false;
let playerMesh = null;

let peer = null, conn = null, isHost = false, remotePlayerMesh = null;
let remoteData = { x: 0, z: 0, rot: 0, isHidden: false };

// --- AUDIO ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null, bgMusicOsc = null, buzzOsc = null, buzzGain = null, heartbeatOsc = null, stepTimer = 0;

function initAudio() {
    try {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (!bgMusicOsc) {
            bgMusicOsc = audioCtx.createOscillator(); const g = audioCtx.createGain();
            bgMusicOsc.type = 'sine'; bgMusicOsc.frequency.value = 40; g.gain.value = 0.1;
            bgMusicOsc.connect(g); g.connect(audioCtx.destination); bgMusicOsc.start();
        }
        if (!buzzOsc) {
            buzzOsc = audioCtx.createOscillator(); buzzGain = audioCtx.createGain();
            buzzOsc.type = 'sawtooth'; buzzOsc.frequency.value = 120; buzzGain.gain.value = 0;
            buzzOsc.connect(buzzGain); buzzGain.connect(audioCtx.destination); buzzOsc.start();
        }
    } catch(e) { console.log(e); }
}

function playStep(isRunning) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime; const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(isRunning ? 90 : 60, t);
    o.frequency.exponentialRampToValueAtTime(20, t + 0.15);
    g.gain.setValueAtTime(isRunning ? 0.4 : 0.15, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.15);
}

function updateHeartbeat(isNear) {
    if (!audioCtx) return;
    if (isNear && !heartbeatOsc) {
        heartbeatOsc = audioCtx.createOscillator(); const g = audioCtx.createGain();
        heartbeatOsc.type = 'sine'; heartbeatOsc.frequency.setValueAtTime(50, audioCtx.currentTime);
        g.gain.setValueAtTime(0.5, audioCtx.currentTime);
        heartbeatOsc.connect(g); g.connect(audioCtx.destination); heartbeatOsc.start();
    } else if (!isNear && heartbeatOsc) { heartbeatOsc.stop(); heartbeatOsc = null; }
}

// --- MENÚS ---
window.showScreen = function(id) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};
window.startSinglePlayer = function() { initAudio(); isHost = true; startGame(); };

window.hostGame = function() {
    initAudio(); const status = document.getElementById('hostStatus'); const createBtn = document.getElementById('createRoomBtn');
    if(status) { status.style.display = 'block'; status.innerText = 'Conectando...'; status.style.color = '#ffd23f'; createBtn.disabled = true; }
    if (typeof Peer === 'undefined') { if(status) { status.innerText = 'Error: Sin internet.'; status.style.color = 'red'; createBtn.disabled = false; } return; }
    
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    peer = new Peer('BR-' + code);
    peer.on('open', () => {
        isHost = true; if(status) { status.innerText = '¡Sala creada! Esperando...'; }
        document.getElementById('hostCodeContainer').style.display = 'block';
        document.getElementById('hostCodeDisplay').innerText = code;
    });
    peer.on('connection', (connection) => { conn = connection; setupConnection(); if(status) status.innerText = '¡Jugador conectado!'; });
};

window.startHostGame = function() { initAudio(); startGame(); if(conn && conn.open) conn.send({ type: 'syncLevel', level: currentLevel, grid: maze.grid, monster: getActiveMonster() }); };

window.joinGame = function() {
    initAudio(); const code = document.getElementById('joinCodeInput').value.toUpperCase();
    if(code.length < 4) return alert("Código inválido.");
    
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
    const size = 256;
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');

    if (kind === 'wall1') {
        g.fillStyle = '#b89e34'; g.fillRect(0, 0, size, size);
        g.fillStyle = 'rgba(40,30,10,0.2)'; 
        for (let i = 0; i < 20; i++) { g.beginPath(); g.arc(Math.random()*size, Math.random()*size, Math.random()*20+5, 0, 7); g.fill(); }
        g.fillStyle = '#4a3b22'; g.fillRect(0, size-16, size, 16);
    } 
    else if (kind === 'floor1') {
        g.fillStyle = '#6b5a2e'; g.fillRect(0, 0, size, size);
        for (let i = 0; i < 500; i++) { g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)'; g.fillRect(Math.random()*size, Math.random()*size, 2, 2); }
    }
    else if (kind === 'industrial') {
        g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, size, size);
        g.strokeStyle = '#333'; g.lineWidth = 4;
        for(let i=0; i<size; i+=32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.stroke(); }
        for(let i=0; i<size; i+=32) { g.beginPath(); g.moveTo(0, i); g.lineTo(size, i); g.stroke(); }
    }
    else {
        g.fillStyle = '#111'; g.fillRect(0, 0, size, size);
        for (let i = 0; i < 100; i++) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(Math.random()*size, Math.random()*size, Math.random()*20, 0, 7); g.fill(); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function collides(x, z, radius = PLAYER_RADIUS) {
    const checks = [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[radius*0.7,radius*0.7],[radius*0.7,-radius*0.7],[-radius*0.7,radius*0.7],[-radius*0.7,-radius*0.7]];
    for (const [ox, oz] of checks) if (maze.isWall(x + ox, z + oz)) return true;
    return false;
}

function loadLevel(level, customGrid = null, forcedMonster = null) {
    if (levelGroup) scene.remove(levelGroup);
    levelGroup = new THREE.Group(); scene.add(levelGroup);
    
    hideSpots = []; tapes = []; ceilingLights = [];
    let theme = (level - 1) % 3; 

    let bgColor = theme === 0 ? 0x110d05 : theme === 1 ? 0x050806 : 0x111111;
    scene.background = new THREE.Color(bgColor); 
    scene.fog = new THREE.FogExp2(bgColor, 0.06); 
    
    let mazeSize;
    if (customGrid) { mazeSize = customGrid.length; maze = new MazeGenerator(mazeSize, customGrid); }
    else { mazeSize = 15 + Math.min(level * 2, 10); maze = new MazeGenerator(mazeSize); }

    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let y = 1; y < mazeSize; y += 3) {
        for (let x = 1; x < mazeSize; x += 3) {
            if (maze.grid[y][x] === 1) continue;
            const cx = x * CELL_SIZE + CELL_SIZE / 2;
            const cz = y * CELL_SIZE + CELL_SIZE / 2;
            const tube = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.5), tubeMat);
            tube.position.set(cx, WALL_HEIGHT - 0.05, cz); levelGroup.add(tube);
            const pl = new THREE.PointLight(0xfff8d7, 1.5, 12);
            pl.position.set(cx, WALL_HEIGHT - 0.5, cz); levelGroup.add(pl);
            ceilingLights.push({ x: cx, z: cz });
        }
    }

    let wallTex = makeTex(theme === 2 ? 'industrial' : 'wall1');
    let floorTex = makeTex(theme === 2 ? 'industrial' : 'floor1');
    wallTex.repeat.set(1, 1); floorTex.repeat.set(mazeSize, mazeSize);
    
    let wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    let floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 });

    const floorGeo = new THREE.PlaneGeometry(mazeSize * CELL_SIZE, mazeSize * CELL_SIZE);
    const floor = new THREE.Mesh(floorGeo, floorMat); 
    floor.rotation.x = -Math.PI / 2; floor.position.set((mazeSize * CELL_SIZE) / 2, 0, (mazeSize * CELL_SIZE) / 2); 
    floor.receiveShadow = true; levelGroup.add(floor);
    
    const ceil = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: bgColor }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set((mazeSize * CELL_SIZE) / 2, WALL_HEIGHT, (mazeSize * CELL_SIZE) / 2); 
    ceil.receiveShadow = true; levelGroup.add(ceil);

    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            if (maze.grid[y][x] === 1) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMat);
                wall.position.set(x * CELL_SIZE + CELL_SIZE / 2, WALL_HEIGHT / 2, y * CELL_SIZE + CELL_SIZE / 2); 
                wall.castShadow = true; wall.receiveShadow = true;
                levelGroup.add(wall);
            }
        }
    }

    player.x = CELL_SIZE * 1.5; player.z = CELL_SIZE * 1.5; player.isHidden = false;
    player.stamina = 100; player.exhausted = false;
    
    if(playerMesh) scene.remove(playerMesh);
    playerMesh = new THREE.Group();
    const bodyColor = getActiveSkin() === 'red' ? 0xff0000 : getActiveSkin() === 'green' ? 0x00ff00 : getActiveSkin() === 'gold' ? 0xffd700 : 0x0000ff;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), new THREE.MeshStandardMaterial({color: bodyColor}));
    body.position.y = 1; 
    body.castShadow = false; // Evitar que el jugador proyecte sombra sobre sí mismo
    playerMesh.add(body); scene.add(playerMesh);

    if(isHost) {
        const monType = forcedMonster || getActiveMonster();
        monster = new Monster(scene, monType);
        monster.speed = 4.5 + level * 0.3;
        monster.setPosition((mazeSize - 4) * CELL_SIZE, (mazeSize - 4) * CELL_SIZE);
        monster.mesh.traverse(o => { if(o.isMesh) o.castShadow = true; });
    }

    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.8 });
    for (let i = 0; i < 3; i++) {
        let tx, ty;
        do { tx = 1 + Math.floor(Math.random() * (mazeSize - 2)); ty = 1 + Math.floor(Math.random() * (mazeSize - 2)); } while (maze.grid[ty][tx] === 1 || (Math.hypot(tx, ty) < 6));
        const tapeGroup = new THREE.Group();
        const tapeBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.8), tapeMat);
        tapeBox.castShadow = true;
        tapeGroup.add(tapeBox);
        tapeGroup.position.set(tx * CELL_SIZE + CELL_SIZE / 2, 0.5, ty * CELL_SIZE + CELL_SIZE / 2); 
        levelGroup.add(tapeGroup);
        tapes.push({ mesh: tapeGroup, taken: false });
    }

    exitPos.set((mazeSize - 2) * CELL_SIZE, 2, (mazeSize - 2) * CELL_SIZE);
    const doorGroup = new THREE.Group(); doorGroup.position.copy(exitPos);
    const doorBase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.5, 0.3), new THREE.MeshStandardMaterial({color: 0x3a2e1a}));
    doorBase.position.y = -0.5; doorBase.rotation.y = Math.PI/2; doorBase.castShadow = true; doorGroup.add(doorBase);
    const spot1 = new THREE.SpotLight(0xffffff, 10, 10, Math.PI/4, 0.5, 1); spot1.position.set(0, 3, 2); spot1.target = doorBase;
    const spot2 = new THREE.SpotLight(0xffffff, 10, 10, Math.PI/4, 0.5, 1); spot2.position.set(0, 3, -2); spot2.target = doorBase;
    doorGroup.add(spot1); doorGroup.add(spot2); levelGroup.add(doorGroup);

    document.getElementById('level-ui').innerText = `NIVEL ${level}`;
    showMsg("Encuentra 3 cintas VHS");
}

function init(isClient) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.rotation.order = 'YXZ';
    
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); 
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; 

    // --- CONFIGURACIÓN DE LA LINTERNA (ARREGLO DE LA SOMBRA) ---
    flashlight = new THREE.SpotLight(0xfff4d8, 100, 50, Math.PI / 4, 0.5, 1.5); 
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.width = 1024; 
    flashlight.shadow.mapSize.height = 1024;
    
    // ESTOS SON LOS ARREGLOS CLAVE PARA LA SOMBRA PEGADA:
    flashlight.shadow.bias = -0.002; 
    flashlight.shadow.normalBias = 0.05;
    flashlight.shadow.camera.near = 1.0; // Evita que la sombra se calcule a ras de la cámara
    
    flashlight.position.set(0.2, -0.1, 0); 
    flashlight.target.position.set(0, 0, -1); 
    camera.add(flashlight); camera.add(flashlight.target);
    scene.add(camera);

    scene.add(new THREE.AmbientLight(0xffffff, 0.15)); 

    if(isClient) {
        maze = new MazeGenerator(15);
        scene.background = new THREE.Color(0x000000);
    } else {
        loadLevel(currentLevel); 
    }
    
    setupControls(); 
    
    // --- ARREGLO PARA GIRAR EL CELULAR ---
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', () => {
        setTimeout(onWindowResize, 200); // Esperar a que iOS termine de girar
    });

    isRunning = true; 
    animate(performance.now());
}

function setupConnection() {
    conn.on('open', () => { conn.send({ type: 'init', skin: getActiveSkin() }); });
    conn.on('data', (data) => {
        if(data.type === 'move') {
            remoteData.x = data.x; remoteData.z = data.z; remoteData.rot = data.rot; remoteData.isHidden = data.isHidden;
            if(!remotePlayerMesh) {
                remotePlayerMesh = new THREE.Group();
                const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), new THREE.MeshLambertMaterial({color: 0xff0000}));
                body.position.y = 1; remotePlayerMesh.add(body); scene.add(remotePlayerMesh);
            }
        } else if (data.type === 'monsterSync' && !isHost) {
            if(!monster) monster = new Monster(scene, getActiveMonster());
            monster.mesh.position.x = data.x; monster.mesh.position.z = data.z;
        } else if (data.type === 'tapeTaken') {
            const t = tapes[data.index]; 
            if(t && !t.taken) { t.taken = true; t.mesh.visible = false; }
        } else if (data.type === 'syncLevel' && !isHost) {
            currentLevel = data.level; loadLevel(currentLevel, data.grid, data.monster);
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
    let isRunningNow = false;
    
    if (keys.shift && isMoving && !player.exhausted && player.stamina > 0) {
        currentSpeed = SPRINT_SPEED;
        player.stamina = Math.max(0, player.stamina - 25 * dt);
        if (player.stamina <= 0) player.exhausted = true;
        isRunningNow = true;
    } else {
        player.stamina = Math.min(100, player.stamina + 15 * dt);
        if (player.stamina > 30) player.exhausted = false;
    }
    
    const bat = document.getElementById('battery-fill');
    if (bat) {
        bat.style.width = player.stamina + '%';
        bat.style.background = player.exhausted ? '#ff2222' : (player.isHidden ? '#44aaff' : '#fff');
    }

    if (isMoving) {
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
        const moveDir = forward.multiplyScalar(-moveZ).add(right.multiplyScalar(moveX));
        
        const vx = moveDir.x * currentSpeed * dt; const vz = moveDir.z * currentSpeed * dt;
        if (!collides(player.x + vx, player.z)) player.x += vx;
        if (!collides(player.x, player.z + vz)) player.z += vz;

        stepTimer += dt;
        const stepInterval = isRunningNow ? 0.28 : 0.45;
        if (stepTimer > stepInterval) { stepTimer = 0; playStep(isRunningNow); }
    }

    camera.position.set(player.x, 1.7, player.z);
    if(playerMesh) { playerMesh.position.set(player.x, 0, player.z); playerMesh.rotation.y = camera.rotation.y; }

    if (audioCtx && buzzGain && ceilingLights.length > 0) {
        let minDist = Infinity;
        for (let l of ceilingLights) {
            const d = Math.hypot(player.x - l.x, player.z - l.z);
            if (d < minDist) minDist = d;
        }
        if (minDist < 15) {
            const vol = Math.max(0, 1 - (minDist / 15)) * 0.4; 
            buzzGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.1);
        } else {
            buzzGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        }
    }

    if(conn && conn.open) conn.send({ type: 'move', x: player.x, z: player.z, rot: camera.rotation.y, isHidden: player.isHidden });

    if(remotePlayerMesh) {
        remotePlayerMesh.position.lerp(new THREE.Vector3(remoteData.x, 0, remoteData.z), 0.2);
        remotePlayerMesh.rotation.y = remoteData.rot; remotePlayerMesh.visible = !remoteData.isHidden;
    }

    tapes.forEach((t, i) => {
        if (!t.taken) {
            t.mesh.rotation.y += dt * 2; 
            if (Math.hypot(player.x - t.mesh.position.x, player.z - t.mesh.position.z) < 2) {
                t.taken = true; t.mesh.visible = false; 
                if(conn && conn.open) conn.send({ type: 'tapeTaken', index: i });
                showMsg("Cinta Recuperada"); 
            }
        }
    });

    if (isHost && tapes.every(t => t.taken) && Math.hypot(player.x - exitPos.x, player.z - exitPos.z) < 3) {
        currentLevel++;
        addPoints(50); 
        loadLevel(currentLevel);
        if(conn && conn.open) conn.send({ type: 'syncLevel', level: currentLevel, grid: maze.grid, monster: getActiveMonster() });
    }

    if(isHost && monster) {
        monster.update(dt, camera.position, new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0)), maze, player.isHidden);
        if(conn && conn.open) conn.send({ type: 'monsterSync', x: monster.mesh.position.x, z: monster.mesh.position.z });
        
        if (Math.hypot(player.x - monster.mesh.position.x, player.z - monster.mesh.position.z) < 1.8 && !player.isHidden) {
            player.x = CELL_SIZE * 1.5; player.z = CELL_SIZE * 1.5; player.isHidden = false;
            document.getElementById('locker-overlay').style.display = 'none';
        }
    } else if (!isHost && monster) {
        if (Math.hypot(player.x - monster.mesh.position.x, player.z - monster.mesh.position.z) < 1.8 && !player.isHidden) {
            player.x = CELL_SIZE * 1.5; player.z = CELL_SIZE * 1.5; player.isHidden = false;
            document.getElementById('locker-overlay').style.display = 'none';
        }
    }

    if(monster) {
        const distM = Math.hypot(player.x - monster.mesh.position.x, player.z - monster.mesh.position.z);
        updateHeartbeat(distM < 12 && !player.isHidden); 
    }
}

function showMsg(txt) {
    const m = document.getElementById('msg'); 
    if(m) { m.textContent = txt; m.classList.add('show'); setTimeout(() => m.classList.remove('show'), 2000); }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight; 
    camera.updateProjectionMatrix(); 
    renderer.setSize(window.innerWidth, window.innerHeight);
}

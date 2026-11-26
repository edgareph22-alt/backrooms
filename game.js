import * as THREE from 'three';
import { MazeGenerator } from './maze.js';
import { Monster } from './entity.js';
import { getActiveSkin, getActiveMonster, addPoints } from './auth.js';

// --- LEER CALIDAD GUARDADA ---
const QUALITY = localStorage.getItem('br_quality') || 'MEDIUM';

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

// --- TEXTURAS DINÁMICAS ---
function makeTex(kind) {
    let size = 512;
    if (QUALITY === 'MEDIUM') size = 256;
    if (QUALITY === 'LOW') size = 128;

    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
    const scale = size / 512;

    if (kind === 'wall1') { // Backrooms
        g.fillStyle = '#b89e34'; g.fillRect(0, 0, size, size);
        g.fillStyle = 'rgba(40,30,10,0.2)'; 
        for (let i = 0; i < 40 * scale; i++) { g.beginPath(); g.arc(Math.random()*size, Math.random()*size, Math.random()*20*scale+5, 0, 7); g.fill(); }
        g.fillStyle = '#4a3b22'; g.fillRect(0, size-(16*scale), size, 16*scale);
    } 
    else if (kind === 'floor1') {
        g.fillStyle = '#6b5a2e'; g.fillRect(0, 0, size, size);
        for (let i = 0; i < 500 * scale; i++) { g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)'; g.fillRect(Math.random()*size, Math.random()*size, 2*scale, 2*scale); }
    }
    else if (kind === 'forest') { // Nivel 2 (Bosque)
        g.fillStyle = '#0a1a0a'; g.fillRect(0, 0, size, size);
        for (let i = 0; i < 200 * scale; i++) {
            g.fillStyle = Math.random() > 0.5 ? '#153015' : '#0d200d';
            g.beginPath(); g.arc(Math.random()*size, Math.random()*size, Math.random()*10*scale+2, 0, 7); g.fill();
        }
    }
    else if (kind === 'industrial') { // Nivel 3
        g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, size, size);
        g.strokeStyle = '#333'; g.lineWidth = 4*scale;
        for(let i=0; i<size; i+=32*scale) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.stroke(); }
        for(let i=0; i<size; i+=32*scale) { g.beginPath(); g.moveTo(0, i); g.lineTo(size, i); g.stroke(); }
    }
    else if (kind === 'sewer') { // Nivel 4
        g.fillStyle = '#111'; g.fillRect(0, 0, size, size);
        for (let i = 0; i < 100 * scale; i++) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(Math.random()*size, Math.random()*size, Math.random()*20*scale, 0, 7); g.fill(); }
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2*scale;
        for(let i=0; i<5; i++) {
            g.beginPath(); g.moveTo(Math.random()*size, 0); 
            g.lineTo(Math.random()*size, size/2); g.lineTo(Math.random()*size, size); g.stroke();
        }
    }
    else {
        g.fillStyle = '#111'; g.fillRect(0, 0, size, size);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function collides(x, z, radius = PLAYER_RADIUS) {
    const checks = [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[radius*0.7,radius*0.7],[radius*0.7,-radius*0.7],[-radius*0.7,radius*0.7],[-radius*0.7,-radius*0.7]];
    for (const [ox, oz] of checks) if (maze.isWall(x + ox, z + oz)) return true;
    return false;
}

// --- CREACIÓN DEL PERSONAJE SEGÚN SKIN ---
function createPlayerMesh(skinType) {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.8 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), skinMat); head.position.y = 1.7; group.add(head);

    let bodyColor = 0x555555, hasBackpack = false, hasBriefcase = false, hasHelmet = false, hasSpikes = false;

    if (skinType === 'explorer') { bodyColor = 0x334433; hasBackpack = true; }
    else if (skinType === 'business') { bodyColor = 0x222233; hasBriefcase = true; }
    else if (skinType === 'tactical') { bodyColor = 0x556644; hasHelmet = true; }
    else if (skinType === 'survivor') { bodyColor = 0x553322; hasSpikes = true; }
    else if (skinType === 'scavenger') { bodyColor = 0x442211; hasSpikes = true; hasBriefcase = true; }
    else if (skinType === 'scientist') { bodyColor = 0xeeeeee; hasBackpack = true; }

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8), new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.9 })); body.position.y = 0.9; group.add(body);

    const legMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), legMat); legL.position.set(-0.15, 0.4, 0); group.add(legL);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), legMat); legR.position.set(0.15, 0.4, 0); group.add(legR);

    if (hasBackpack) { const bp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.2), new THREE.MeshStandardMaterial({color: 0x4a3b22})); bp.position.set(0, 1.0, 0.3); group.add(bp); }
    if (hasBriefcase) { const bc = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.4), new THREE.MeshStandardMaterial({color: 0x221100})); bc.position.set(-0.4, 0.5, 0); group.add(bc); }
    if (hasHelmet) { const hm = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshStandardMaterial({color: 0x333333, metalness: 0.5})); hm.position.y = 1.75; group.add(hm); }
    if (hasSpikes) {
        const spMat = new THREE.MeshStandardMaterial({color: 0x777777, metalness: 0.8});
        const spL = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), spMat); spL.position.set(-0.4, 1.4, 0); spL.rotation.z = 0.5; group.add(spL);
        const spR = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), spMat); spR.position.set(0.4, 1.4, 0); spR.rotation.z = -0.5; group.add(spR);
    }

    group.traverse(o => { if(o.isMesh) o.castShadow = QUALITY !== 'LOW'; });
    return group;
}

function loadLevel(level, customGrid = null, forcedMonster = null) {
    if (levelGroup) scene.remove(levelGroup);
    levelGroup = new THREE.Group(); scene.add(levelGroup);
    
    hideSpots = []; tapes = []; ceilingLights = [];
    
    // 0: Backrooms, 1: Bosque, 2: Industrial, 3: Alcantarilla
    let theme = (level - 1) % 4; 

    let bgColor = theme === 0 ? 0x110d05 : theme === 1 ? 0x050806 : theme === 2 ? 0x111111 : 0x050000;
    scene.background = new THREE.Color(bgColor); 
    scene.fog = new THREE.FogExp2(bgColor, 0.06); 
    
    let mazeSize;
    if (customGrid) { mazeSize = customGrid.length; maze = new MazeGenerator(mazeSize, customGrid); }
    else { mazeSize = 15 + Math.min(level * 2, 10); maze = new MazeGenerator(mazeSize); }

    const tubeMat = new THREE.MeshBasicMaterial({ color: theme === 2 ? 0xff0000 : 0xffffff });
    for (let y = 1; y < mazeSize; y += 3) {
        for (let x = 1; x < mazeSize; x += 3) {
            if (maze.grid[y][x] === 1) continue;
            const cx = x * CELL_SIZE + CELL_SIZE / 2;
            const cz = y * CELL_SIZE + CELL_SIZE / 2;
            const tube = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.5), tubeMat);
            tube.position.set(cx, WALL_HEIGHT - 0.05, cz); levelGroup.add(tube);
            const pl = new THREE.PointLight(theme === 2 ? 0xff0000 : 0xfff8d7, 1.5, 12);
            pl.position.set(cx, WALL_HEIGHT - 0.5, cz); levelGroup.add(pl);
            ceilingLights.push({ x: cx, z: cz });
        }
    }

    // TEXTURAS SEGÚN EL TEMA
    let wallTex = makeTex(theme === 1 ? 'forest' : theme === 2 ? 'industrial' : theme === 3 ? 'sewer' : 'wall1');
    let floorTex = makeTex(theme === 1 ? 'forest' : theme === 2 ? 'industrial' : theme === 3 ? 'sewer' : 'floor1');
    wallTex.repeat.set(1, 1); floorTex.repeat.set(mazeSize, mazeSize);
    
    let wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    let floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 });

    const floorGeo = new THREE.PlaneGeometry(mazeSize * CELL_SIZE, mazeSize * CELL_SIZE);
    const floor = new THREE.Mesh(floorGeo, floorMat); 
    floor.rotation.x = -Math.PI / 2; floor.position.set((mazeSize * CELL_SIZE) / 2, 0, (mazeSize * CELL_SIZE) / 2); 
    floor.receiveShadow = QUALITY !== 'LOW'; levelGroup.add(floor);
    
    const ceil = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: bgColor }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set((mazeSize * CELL_SIZE) / 2, WALL_HEIGHT, (mazeSize * CELL_SIZE) / 2); 
    ceil.receiveShadow = QUALITY !== 'LOW'; levelGroup.add(ceil);

    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            if (maze.grid[y][x] === 1) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMat);
                wall.position.set(x * CELL_SIZE + CELL_SIZE / 2, WALL_HEIGHT / 2, y * CELL_SIZE + CELL_SIZE / 2); 
                wall.castShadow = QUALITY !== 'LOW'; wall.receiveShadow = QUALITY !== 'LOW';
                levelGroup.add(wall);
            }
        }
    }

    player.x = CELL_SIZE * 1.5; player.z = CELL_SIZE * 1.5; player.isHidden = false;
    player.stamina = 100; player.exhausted = false;
    
    if(playerMesh) scene.remove(playerMesh);
    playerMesh = createPlayerMesh(getActiveSkin());
    scene.add(playerMesh);

    if(isHost) {
        const monType = forcedMonster || getActiveMonster();
        monster = new Monster(scene, monType);
        monster.speed = 4.5 + level * 0.3;
        monster.setPosition((mazeSize - 4) * CELL_SIZE, (mazeSize - 4) * CELL_SIZE);
        monster.mesh.traverse(o => { if(o.isMesh && QUALITY !== 'LOW') o.castShadow = true; });
    }

    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.8 });
    for (let i = 0; i < 3; i++) {
        let tx, ty;
        do { tx = 1 + Math.floor(Math.random() * (mazeSize - 2)); ty = 1 + Math.floor(Math.random() * (mazeSize - 2)); } while (maze.grid[ty][tx] === 1 || (Math.hypot(tx, ty) < 6));
        const tapeGroup = new THREE.Group();
        const tapeBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.8), tapeMat);
        tapeBox.castShadow = QUALITY !== 'LOW';
        tapeGroup.add(tapeBox);
        tapeGroup.position.set(tx * CELL_SIZE + CELL_SIZE / 2, 0.5, ty * CELL_SIZE + CELL_SIZE / 2); 
        levelGroup.add(tapeGroup);
        tapes.push({ mesh: tapeGroup, taken: false });
    }

    exitPos.set((mazeSize - 2) * CELL_SIZE, 2, (mazeSize - 2) * CELL_SIZE);
    const doorGroup = new THREE.Group(); doorGroup.position.copy(exitPos);
    const doorBase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.5, 0.3), new THREE.MeshStandardMaterial({color: 0x3a2e1a}));
    doorBase.position.y = -0.5; doorBase.rotation.y = Math.PI/2; doorBase.castShadow = QUALITY !== 'LOW'; doorGroup.add(doorBase);
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
    
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: QUALITY === 'HIGH' });
    
    let pixelRatio = 1.0;
    if (QUALITY === 'HIGH') pixelRatio = Math.min(window.devicePixelRatio, 2);
    else if (QUALITY === 'MEDIUM') pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    
    renderer.setPixelRatio(pixelRatio); 
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (QUALITY === 'LOW') {
        renderer.shadowMap.enabled = false; 
    } else {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    }

    flashlight = new THREE.SpotLight(0xfff4d8, 120, 60, Math.PI / 4, 0.5, 1.5); 
    
    if (QUALITY !== 'LOW') {
        flashlight.castShadow = true;
        flashlight.shadow.mapSize.width = QUALITY === 'HIGH' ? 1024 : 512; 
        flashlight.shadow.mapSize.height = QUALITY === 'HIGH' ? 1024 : 512;
        flashlight.shadow.bias = -0.0005; 
        flashlight.shadow.normalBias = 0.02;
    }
    
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
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', () => { setTimeout(onWindowResize, 200); });
    isRunning = true; 
    animate(performance.now());
}

function setupConnection() {
    conn.on('open', () => { conn.send({ type: 'init', skin: getActiveSkin() }); });
    conn.on('data', (data) => {
        if(data.type === 'move') {
            remoteData.x = data.x; remoteData.z = data.z; remoteData.rot = data.rot; remoteData.isHidden = data.isHidden;
            if(!remotePlayerMesh) {
                remotePlayerMesh = createPlayerMesh(data.skin);
                scene.add(remotePlayerMesh);
            }
        } else if (data.type === 'init') {
            if (remotePlayerMesh) scene.remove(remotePlayerMesh);
            remotePlayerMesh = createPlayerMesh(data.skin);
            scene.add(remotePlayerMesh);
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

// ... (El resto de setupControls, tryHide, animate y update se mantienen exactamente igual que en el código anterior, ya que manejan el movimiento, la linterna y el multijugador correctamente)

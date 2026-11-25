import * as THREE from 'three';
import { MazeGenerator } from './maze.js';
import { Monster } from './entity.js';

// PeerJS ya está cargado globalmente desde el index.html

const CELL_SIZE = 10;
const WALL_HEIGHT = 5;
const WALK_SPEED = 4.8;
const PLAYER_RADIUS = 0.7;

let currentLevel = 1;
let maze, monster, scene, camera, renderer;
let player = { x: 0, z: 0, isHidden: false, joyX: 0, joyY: 0, lastX: 0, lastZ: 0 };
let keys = { w: false, a: false, s: false, d: false, shift: false };
let tapes = [], hideSpots = [];
let exitPos = new THREE.Vector3();
let isRunning = false;
let isForestLevel = false;
let playerMesh = null;

let peer = null;
let conn = null;
let isHost = false;
let remotePlayerMesh = null;
let remoteData = { x: 0, z: 0, rot: 0, isHidden: false };

let points = parseInt(localStorage.getItem('br_points') || '0');
let activeSkin = localStorage.getItem('br_activeSkin') || 'blue';

document.getElementById('pointsVal').innerText = points;

// --- MENÚS ---
window.startSinglePlayer = function() {
    isHost = true;
    startGame();
};

window.hostGame = function() {
    const status = document.getElementById('hostStatus');
    const createBtn = document.getElementById('createRoomBtn');
    
    status.style.display = 'block';
    status.innerText = 'Conectando al servidor (requiere internet)...';
    status.style.color = '#ffd23f';
    createBtn.disabled = true;

    if (typeof Peer === 'undefined') {
        status.innerText = 'Error: El servidor de PeerJS no cargó. Revisa tu internet.';
        status.style.color = 'red';
        createBtn.disabled = false;
        return;
    }

    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    try {
        peer = new Peer('BR-' + code);
        
        peer.on('open', () => {
            isHost = true;
            status.innerText = '¡Sala creada! Esperando a tu amigo...';
            document.getElementById('hostCodeContainer').style.display = 'block';
            document.getElementById('hostCodeDisplay').innerText = code;
        });

        peer.on('error', (err) => {
            status.innerText = 'Error de conexión: ' + err.type;
            status.style.color = 'red';
            createBtn.disabled = false;
            console.error(err);
        });

        peer.on('connection', (connection) => {
            conn = connection;
            setupConnection();
            status.innerText = '¡Jugador conectado!';
        });
    } catch (e) {
        status.innerText = 'Error inesperado. Verifica tu red.';
        status.style.color = 'red';
        createBtn.disabled = false;
    }
};

window.startHostGame = function() {
    startGame();
    if(conn && conn.open) conn.send({ type: 'loadLevel', level: currentLevel });
};

window.joinGame = function() {
    const code = document.getElementById('joinCodeInput').value.toUpperCase();
    if(code.length < 4) return alert("Código inválido. Deben ser 4 letras.");
    
    if (typeof Peer === 'undefined') return alert("Error: No hay conexión a internet.");

    try {
        peer = new Peer();
        peer.on('open', () => {
            conn = peer.connect('BR-' + code);
            setupConnection();
            
            document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
            document.getElementById('ui').style.display = 'block';
            document.getElementById('controls').style.display = 'block';
            
            setTimeout(() => { init(true); }, 500); 
        });
        
        peer.on('error', (err) => {
            alert("No se pudo conectar a la sala. Verifica el código y tu internet.");
        });
    } catch(e) {
        alert("Error de conexión a internet.");
    }
};

function startGame() {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById('ui').style.display = 'block';
    document.getElementById('controls').style.display = 'block';
    init(false);
}

// --- JUEGO ---
function init(isClient) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.rotation.order = 'YXZ';
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    loadLevel(currentLevel);
    setupControls();
    window.addEventListener('resize', onWindowResize);
    isRunning = true;
    animate(performance.now());
}

function collides(x, z, radius = PLAYER_RADIUS) {
    const checks = [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[radius*0.7,radius*0.7],[radius*0.7,-radius*0.7],[-radius*0.7,radius*0.7],[-radius*0.7,-radius*0.7]];
    for (const [ox, oz] of checks) if (maze.isWall(x + ox, z + oz)) return true;
    return false;
}

function addHideSpots(mazeSize, isForest) {
    hideSpots = [];
    let placed = 0;
    for (let i = 0; i < 40 && placed < 8; i++) {
        const tx = 2 + Math.floor(Math.random() * (mazeSize - 4));
        const ty = 2 + Math.floor(Math.random() * (mazeSize - 4));
        if (maze.grid[ty][tx] === 1 || (tx < 3 && ty < 3)) continue;

        const group = new THREE.Group();
        const wx = tx * CELL_SIZE + CELL_SIZE / 2;
        const wz = ty * CELL_SIZE + CELL_SIZE / 2;
        group.position.set(wx, 0, wz);
        group.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2;

        if (!isForest) {
            const metalMat = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.4, metalness: 0.8 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.5 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3.8, 0.9), metalMat);
            body.position.y = 1.9; group.add(body);
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.6, 0.03), darkMat); seam.position.set(0, 1.9, 0.47); group.add(seam);
        } else {
            const hayMat = new THREE.MeshStandardMaterial({ color: 0xd4a72c, roughness: 1 });
            const hay = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 8), hayMat); hay.rotation.z = Math.PI / 2; hay.position.y = 1.2; group.add(hay);
        }
        scene.add(group);
        hideSpots.push({ x: wx, z: wz, radius: 2.1 });
        placed++;
    }
}

function loadLevel(level) {
    while (scene.children.length > 0) scene.remove(scene.children[0]);
    hideSpots = []; tapes = [];
    isForestLevel = (level % 2 === 0);
    
    const bgColor = isForestLevel ? 0x0a1110 : 0x6b5f3a;
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(bgColor, isForestLevel ? 0.04 : 0.026);

    const mazeSize = 15 + Math.min(level * 2, 10);
    maze = new MazeGenerator(mazeSize);

    scene.add(new THREE.AmbientLight(0xffffff, isForestLevel ? 0.2 : 0.3));
    scene.add(new THREE.HemisphereLight(0xfff6dd, 0x5a4a2a, 0.5));
    
    const flashlight = new THREE.SpotLight(0xfff4d8, 40, 28, Math.PI / 5.5, 0.45, 1.4);
    camera.add(flashlight); camera.add(flashlight.target); scene.add(camera);

    const wallMat = new THREE.MeshLambertMaterial({ color: isForestLevel ? 0x1a3311 : 0xd4c27a });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xa08c4a });

    const floorGeo = new THREE.PlaneGeometry(mazeSize * CELL_SIZE, mazeSize * CELL_SIZE);
    const floor = new THREE.Mesh(floorGeo, floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set((mazeSize * CELL_SIZE) / 2, 0, (mazeSize * CELL_SIZE) / 2); scene.add(floor);

    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            if (maze.grid[y][x] === 1) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMat);
                wall.position.set(x * CELL_SIZE + CELL_SIZE / 2, WALL_HEIGHT / 2, y * CELL_SIZE + CELL_SIZE / 2); scene.add(wall);
            }
        }
    }

    player.x = CELL_SIZE * 1.5; player.z = CELL_SIZE * 1.5;
    
    if(playerMesh) scene.remove(playerMesh);
    playerMesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), new THREE.MeshLambertMaterial({color: getColorHex(activeSkin)}));
    body.position.y = 1; playerMesh.add(body); scene.add(playerMesh);

    if(isHost) {
        monster = new Monster(scene, isForestLevel ? 'scarecrow' : 'smiler');
        monster.speed = 5.0 + level * 0.4;
        monster.setPosition((mazeSize - 4) * CELL_SIZE, (mazeSize - 4) * CELL_SIZE);
    }

    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x550000 });
    for (let i = 0; i < 3; i++) {
        let tx, ty;
        do { tx = 1 + Math.floor(Math.random() * (mazeSize - 2)); ty = 1 + Math.floor(Math.random() * (mazeSize - 2)); } while (maze.grid[ty][tx] === 1 || (Math.hypot(tx, ty) < 6));
        const tape = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1.5), tapeMat);
        tape.position.set(tx * CELL_SIZE + CELL_SIZE / 2, 1, ty * CELL_SIZE + CELL_SIZE / 2); scene.add(tape);
        tapes.push({ mesh: tape, taken: false });
    }

    exitPos.set((mazeSize - 2) * CELL_SIZE, 2, (mazeSize - 2) * CELL_SIZE);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial({ color: 0x00ff55 })); door.position.copy(exitPos); scene.add(door);

    addHideSpots(mazeSize, isForestLevel);
    document.getElementById('level-ui').innerText = isForestLevel ? `BOSQUE ${level}` : `NIVEL ${level}`;
}

function getColorHex(color) {
    if(color === 'red') return 0xff0000;
    if(color === 'green') return 0x00ff00;
    return 0x0000ff;
}

function setupConnection() {
    conn.on('open', () => {
        conn.send({ type: 'init', skin: activeSkin });
    });
    conn.on('data', (data) => {
        if(data.type === 'move') {
            remoteData.x = data.x; remoteData.z = data.z; remoteData.rot = data.rot; remoteData.isHidden = data.isHidden;
            if(!remotePlayerMesh) {
                remotePlayerMesh = new THREE.Group();
                const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), new THREE.MeshLambertMaterial({color: 0xff0000}));
                body.position.y = 1; remotePlayerMesh.add(body); scene.add(remotePlayerMesh);
            }
        } else if (data.type === 'monsterSync' && !isHost) {
            if(!monster) {
                monster = new Monster(scene, isForestLevel ? 'scarecrow' : 'smiler');
            }
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
        if (e.key.toLowerCase() === 'w') keys.w = true;
        if (e.key.toLowerCase() === 's') keys.s = true;
        if (e.key.toLowerCase() === 'a') keys.a = true;
        if (e.key.toLowerCase() === 'd') keys.d = true;
        if (e.key === 'Shift') keys.shift = true;
        if (e.key.toLowerCase() === 'e' || e.key === ' ') tryHide();
    });
    window.addEventListener('keyup', e => {
        if (e.key.toLowerCase() === 'w') keys.w = false;
        if (e.key.toLowerCase() === 's') keys.s = false;
        if (e.key.toLowerCase() === 'a') keys.a = false;
        if (e.key.toLowerCase() === 'd') keys.d = false;
        if (e.key === 'Shift') keys.shift = false;
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

    const sprintBtn = document.getElementById('sprintBtn');
    sprintBtn.addEventListener('touchstart', e => { e.preventDefault(); keys.shift = true; sprintBtn.classList.add('active'); }, {passive:false});
    sprintBtn.addEventListener('touchend', e => { e.preventDefault(); keys.shift = false; sprintBtn.classList.remove('active'); });

    const hideBtn = document.getElementById('hideBtn');
    hideBtn.addEventListener('touchstart', e => { e.preventDefault(); tryHide(); }, {passive:false});
}

function tryHide() {
    if (!player.isHidden) {
        for (const h of hideSpots) {
            if (Math.hypot(player.x - h.x, player.z - h.z) < h.radius) {
                player.lastX = player.x; player.lastZ = player.z;
                player.x = h.x; player.z = h.z; player.isHidden = true;
                document.getElementById('locker-overlay').style.display = 'block';
                return;
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
    const dt = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;
    update(dt);
    if(renderer && scene && camera) renderer.render(scene, camera);
}

function update(dt) {
    if (!isRunning) return;

    let moveX = player.joyX; let moveZ = player.joyY;
    if (keys.w) moveZ -= 1; if (keys.s) moveZ += 1; if (keys.a) moveX -= 1; if (keys.d) moveX += 1;
    const len = Math.hypot(moveX, moveZ); if (len > 1) { moveX /= len; moveZ /= len; }

    if (!player.isHidden && (moveX !== 0 || moveZ !== 0)) {
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
        const moveDir = forward.multiplyScalar(-moveZ).add(right.multiplyScalar(moveX));
        
        const vx = moveDir.x * WALK_SPEED * dt;
        const vz = moveDir.z * WALK_SPEED * dt;
        if (!collides(player.x + vx, player.z)) player.x += vx;
        if (!collides(player.x, player.z + vz)) player.z += vz;
    }

    camera.position.set(player.x, 1.7, player.z);
    if(playerMesh) { playerMesh.position.set(player.x, 0, player.z); playerMesh.rotation.y = camera.rotation.y; }

    if(conn && conn.open) conn.send({ type: 'move', x: player.x, z: player.z, rot: camera.rotation.y, isHidden: player.isHidden });

    if(remotePlayerMesh) {
        remotePlayerMesh.position.lerp(new THREE.Vector3(remoteData.x, 0, remoteData.z), 0.2);
        remotePlayerMesh.rotation.y = remoteData.rot;
        remotePlayerMesh.visible = !remoteData.isHidden;
    }

    if(isHost && monster) {
        monster.update(dt, camera.position, new THREE.Vector3(0,0,-1), maze, player.isHidden);
        if(conn && conn.open) conn.send({ type: 'monsterSync', x: monster.mesh.position.x, z: monster.mesh.position.z });
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

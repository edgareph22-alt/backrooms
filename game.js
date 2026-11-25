import * as THREE from 'three';
import { Peer } from 'peerjs';
import { MazeGenerator } from './maze.js';
import { Monster } from './entity.js';

// --- ESTADO GLOBAL Y VARIABLES ---
const CELL_SIZE = 10;
const WALL_HEIGHT = 5;
const WALK_SPEED = 4.8;
const SPRINT_SPEED = 8.0;
const PLAYER_RADIUS = 0.7;

let currentLevel = 1;
let maze, monster, scene, camera, renderer;
let player = { x: 0, z: 0, stamina: 100, exhausted: false, isHidden: false, joyX: 0, joyY: 0, lastX: 0, lastZ: 0, skin: 'blue' };
let keys = { w: false, a: false, s: false, d: false, shift: false };
let tapes = [], hideSpots = [];
let exitPos = new THREE.Vector3();
let isRunning = false;
let isForestLevel = false;
let playerMesh = null;
let sensitivity = 5;

// MULTIJUGADOR
let peer = null;
let conn = null;
let isHost = false;
let remotePlayerMesh = null;
let remoteData = { x: 0, z: 0, rot: 0, skin: 'blue', isHidden: false };

// --- LOCALSTORAGE (PUNTOS Y SKINS) ---
let points = parseInt(localStorage.getItem('br_points') || '0');
let ownedSkins = JSON.parse(localStorage.getItem('br_skins') || '["blue"]');
let activeSkin = localStorage.getItem('br_activeSkin') || 'blue';

document.getElementById('pointsVal').innerText = points;
document.getElementById('sensitivity').value = sensitivity;

window.showScreen = function(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    if(screenId !== 'game') document.getElementById(screenId).style.display = 'flex';
    if(screenId === 'mainMenu') {
        document.getElementById('pointsVal').innerText = points;
    }
};

window.saveSettings = function() {
    sensitivity = parseInt(document.getElementById('sensitivity').value);
    showScreen('mainMenu');
};

window.buySkin = function(color, cost) {
    if(ownedSkins.includes(color)) {
        equipSkin(color);
        return;
    }
    if(points >= cost) {
        points -= cost;
        ownedSkins.push(color);
        localStorage.setItem('br_points', points);
        localStorage.setItem('br_skins', JSON.stringify(ownedSkins));
        equipSkin(color);
        alert("¡Skin comprada!");
    } else {
        alert("No tienes suficientes puntos. Juega para ganar más.");
    }
};

window.equipSkin = function(color) {
    activeSkin = color;
    localStorage.setItem('br_activeSkin', activeSkin);
    alert("Skin equipada: " + color);
};

// --- MULTIJUGADOR (PEERJS) ---
window.hostGame = function() {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    peer = new Peer('BR-' + code);
    
    peer.on('open', (id) => {
        isHost = true;
        document.getElementById('hostCodeContainer').style.display = 'block';
        document.getElementById('hostCodeDisplay').innerText = code;
        startGame();
    });

    peer.on('connection', (connection) => {
        conn = connection;
        setupConnection();
    });
};

window.joinGame = function() {
    const code = document.getElementById('joinCodeInput').value.toUpperCase();
    if(code.length < 4) return alert("Código inválido");
    
    peer = new Peer();
    peer.on('open', () => {
        conn = peer.connect('BR-' + code);
        setupConnection();
        startGame();
    });
};

function setupConnection() {
    conn.on('open', () => {
        // Enviar skin al conectarse
        conn.send({ type: 'init', skin: activeSkin });
    });

    conn.on('data', (data) => {
        if(data.type === 'move') {
            remoteData.x = data.x;
            remoteData.z = data.z;
            remoteData.rot = data.rot;
            remoteData.isHidden = data.isHidden;
        } else if (data.type === 'init') {
            // Recibimos la skin del otro
            remoteData.skin = data.skin;
            if(!remotePlayerMesh) createRemotePlayer();
            remotePlayerMesh.children[0].material.color.set(getColorHex(remoteData.skin));
        }
    });
}

function createRemotePlayer() {
    remotePlayerMesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), new THREE.MeshLambertMaterial({color: 0xff0000}));
    body.position.y = 1;
    remotePlayerMesh.add(body);
    scene.add(remotePlayerMesh);
}

function getColorHex(color) {
    if(color === 'red') return 0xff0000;
    if(color === 'green') return 0x00ff00;
    return 0x0000ff;
}

// --- INICIO DEL JUEGO ---
window.startGame = function() {
    // Ocultar menús
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById('ui').style.display = 'block';
    document.getElementById('controls').style.display = 'block';
    
    init();
};

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    loadLevel(currentLevel);
    setupControls();
    window.addEventListener('resize', onWindowResize);

    // Registrar Service Worker para OFFLINE
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Error', err));
    }

    isRunning = true;
    animate(performance.now());
}

// (AQUÍ DEBAJO VA TODA LA FUNCIÓN loadLevel, collides, makeTex, etc. 
// Puedes copiar las mismas que ya tenías en tu game.js anterior, 
// PERO asegúrate de que al final de loadLevel añadas estas líneas):

// ... [COPIA AQUÍ TUS FUNCIONES makeTex, collides, addHideSpots Y loadLevel] ...

// Al final de loadLevel, asegúrate de crear la malla del jugador local:
function createLocalPlayer() {
    if(playerMesh) scene.remove(playerMesh);
    playerMesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), new THREE.MeshLambertMaterial({color: getColorHex(activeSkin)}));
    body.position.y = 1;
    playerMesh.add(body);
    scene.add(playerMesh);
}

// --- CONTROLES (Mismo de antes + envío de red) ---
function setupControls() {
    // ... [Mantén el mismo código de teclado, mouse y joystick que ya tenías] ...
}

// --- UPDATE LOOP ---
let stepTimer = 0;
function update(dt) {
    if (!isRunning) return;

    let moveX = player.joyX;
    let moveZ = player.joyY;
    if (keys.w) moveZ -= 1;
    if (keys.s) moveZ += 1;
    if (keys.a) moveX -= 1;
    if (keys.d) moveX += 1;

    const len = Math.hypot(moveX, moveZ);
    if (len > 1) { moveX /= len; moveZ /= len; }

    const speed = (keys.shift && !player.exhausted && !player.isHidden) ? SPRINT_SPEED : WALK_SPEED;

    if (!player.isHidden && (moveX !== 0 || moveZ !== 0)) {
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, camera.rotation.y, 0));
        const moveDir = forward.multiplyScalar(-moveZ).add(right.multiplyScalar(moveX));
        
        let vx = moveDir.x * speed * dt;
        let vz = moveDir.z * speed * dt;

        const steps = 4;
        for (let i = 0; i < steps; i++) {
            if (!collides(player.x + vx/steps, player.z)) player.x += vx/steps;
            if (!collides(player.x, player.z + vz/steps)) player.z += vz/steps;
        }

        if (keys.shift) {
            player.stamina = Math.max(0, player.stamina - 23 * dt);
            if (player.stamina === 0) player.exhausted = true;
        } else {
            player.stamina = Math.min(100, player.stamina + 14 * dt);
            if (player.stamina > 28) player.exhausted = false;
        }
        stepTimer += dt;
        // if (stepTimer > (keys.shift ? 0.3 : 0.5)) { stepTimer = 0; playSound('step'); }
    } else {
        player.stamina = Math.min(100, player.stamina + 17 * dt);
        if (player.stamina > 28) player.exhausted = false;
    }

    camera.position.set(player.x, 1.7, player.z);
    if(playerMesh) {
        playerMesh.position.set(player.x, 0, player.z);
        playerMesh.rotation.y = camera.rotation.y;
    }

    // MULTIJUGADOR: Enviar mi posición a mi amigo
    if(conn && conn.open) {
        conn.send({
            type: 'move',
            x: player.x, z: player.z,
            rot: camera.rotation.y,
            isHidden: player.isHidden
        });
    }

    // MULTIJUGADOR: Actualizar visualmente a mi amigo
    if(remotePlayerMesh) {
        remotePlayerMesh.position.lerp(new THREE.Vector3(remoteData.x, 0, remoteData.z), 0.2);
        remotePlayerMesh.rotation.y = remoteData.rot;
        remotePlayerMesh.visible = !remoteData.isHidden;
    }

    // (El resto de la lógica del monstruo, cintas y salida va aquí)
    // ...
}

// (Asegúrate de cambiar la función document.getElementById('startBtn').addEventListener para que no exista, porque ahora usamos el menú HTML).

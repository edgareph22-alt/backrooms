import * as THREE from 'three';
import { MazeGenerator } from './maze.js';
import { Monster } from './entity.js';

const CELL_SIZE = 10;
const WALL_HEIGHT = 5;
const WALK_SPEED = 4.8;
const SPRINT_SPEED = 8.0;
const PLAYER_RADIUS = 0.7;

let currentLevel = 1;
let maze = null;
let monster = null;
let scene, camera, renderer;
let player = { x: 0, z: 0, stamina: 100, exhausted: false, isHidden: false, joyX: 0, joyY: 0 };
let keys = { shift: false };
let tapes = [];
let hideSpots = [];
let exitPos = new THREE.Vector3();
let isRunning = false;
let fluorescentLights = [];
let isForestLevel = false;

// --- AUDIO SYSTEM ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let heartbeatOsc = null;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new AudioContext();
    
    // Zumbido de luces (Ambiente)
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    gain.gain.value = 0.02;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();

    // Música oscura (Drone)
    const drone = audioCtx.createOscillator();
    const droneGain = audioCtx.createGain();
    drone.type = 'sine';
    drone.frequency.value = 40;
    droneGain.gain.value = 0.05;
    drone.connect(droneGain); droneGain.connect(audioCtx.destination);
    drone.start();
}

function playSound(type) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    
    if (type === 'step') {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(80, t);
        o.frequency.exponentialRampToValueAtTime(30, t + 0.1);
        g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.1);
    } else if (type === 'thunder') {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(100, t);
        o.frequency.exponentialRampToValueAtTime(10, t + 1.5);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
        o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 1.5);
    }
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
        heartbeatOsc.stop();
        heartbeatOsc = null;
    }
}

// --- TEXTURAS ---
function makeTex(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    if (kind === 'wall') {
        g.fillStyle = '#d4c27a'; g.fillRect(0, 0, 256, 256);
        g.fillStyle = 'rgba(140,120,50,0.2)';
        for (let x = 0; x < 256; x += 24) g.fillRect(x, 0, 2, 256);
        g.fillStyle = '#6b5a2a'; g.fillRect(0, 240, 256, 16);
    } else if (kind === 'floor') {
        g.fillStyle = '#a08c4a'; g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 30; i++) {
            g.fillStyle = 'rgba(60,45,20,0.12)';
            g.beginPath(); g.arc(Math.random()*256, Math.random()*256, 10 + Math.random()*20, 0, 7); g.fill();
        }
    } else {
        g.fillStyle = '#e8e0c0'; g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(100,90,60,0.5)'; g.lineWidth = 4;
        g.strokeRect(4, 4, 248, 248);
        g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

function collides(x, z, radius = PLAYER_RADIUS) {
    const checks = [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[radius*0.7,radius*0.7],[radius*0.7,-radius*0.7],[-radius*0.7,radius*0.7],[-radius*0.7,-radius*0.7]];
    for (const [ox, oz] of checks) if (maze.isWall(x + ox, z + oz)) return true;
    return false;
}

// --- CASILLEROS Y PACAS ---
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
            // Casillero Metálico
            const metalMat = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.4, metalness: 0.8 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.5 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3.8, 0.9), metalMat);
            body.position.y = 1.9; group.add(body);
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.6, 0.03), darkMat);
            seam.position.set(0, 1.9, 0.47); group.add(seam);
            const hL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.14), darkMat);
            hL.position.set(-0.38, 2.0, 0.52); group.add(hL);
            const hR = hL.clone(); hR.position.x = 0.38; group.add(hR);
        } else {
            // Paca de Paja (Bosque)
            const hayMat = new THREE.MeshStandardMaterial({ color: 0xd4a72c, roughness: 1 });
            const ropeMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 1 });
            const hay = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 8), hayMat);
            hay.rotation.z = Math.PI / 2; hay.position.y = 1.2; group.add(hay);
            // Cuerdas
            const rope1 = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.05, 4, 16), ropeMat);
            rope1.position.set(-0.5, 1.2, 0); rope1.rotation.y = Math.PI / 2; group.add(rope1);
            const rope2 = rope1.clone(); rope2.position.x = 0.5; group.add(rope2);
        }

        scene.add(group);
        hideSpots.push({ x: wx, z: wz, radius: 2.1 });
        placed++;
    }
}

// --- INIT ---
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    loadLevel(currentLevel);
    setupControls();
    window.addEventListener('resize', onWindowResize);
}

function loadLevel(level) {
    while (scene.children.length > 0) scene.remove(scene.children[0]);
    fluorescentLights = [];
    hideSpots = [];
    tapes = [];
    
    // Alternar entre Backrooms (Impar) y Bosque (Par)
    isForestLevel = (level % 2 === 0);

    const bgColor = isForestLevel ? 0x0a1110 : 0x6b5f3a;
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(bgColor, isForestLevel ? 0.04 : 0.026);

    const mazeSize = 15 + Math.min(level * 2, 10);
    maze = new MazeGenerator(mazeSize);

    scene.add(new THREE.AmbientLight(0xffffff, isForestLevel ? 0.2 : 0.3));
    
    if (isForestLevel) {
        scene.add(new THREE.HemisphereLight(0x5577aa, 0x112211, 0.4));
        const lightning = new THREE.DirectionalLight(0xffffff, 0);
        lightning.position.set(10, 20, 10);
        scene.add(lightning);
        
        // Lluvia
        const rainGeo = new THREE.BufferGeometry();
        const rainCount = 3000;
        const rainPos = new Float32Array(rainCount * 3);
        for(let i=0; i<rainCount*3; i+=3) {
            rainPos[i] = Math.random() * mazeSize * CELL_SIZE;
            rainPos[i+1] = Math.random() * 20;
            rainPos[i+2] = Math.random() * mazeSize * CELL_SIZE;
        }
        rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
        const rainMat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.1 });
        const rain = new THREE.Points(rainGeo, rainMat);
        scene.add(rain);
        
        // Rayos
        setInterval(() => {
            if(!isRunning || !isForestLevel) return;
            lightning.intensity = 2.0;
            playSound('thunder');
            setTimeout(() => lightning.intensity = 0, 150);
        }, 8000 + Math.random() * 7000);
        
    } else {
        scene.add(new THREE.HemisphereLight(0xfff6dd, 0x5a4a2a, 0.5));
    }

    const flashlight = new THREE.SpotLight(0xfff4d8, 40, 28, Math.PI / 5.5, 0.45, 1.4);
    flashlight.castShadow = true;
    flashlight.position.set(0.25, -0.15, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight); camera.add(flashlight.target);
    scene.add(camera);

    const panelGeo = new THREE.BoxGeometry(CELL_SIZE * 0.5, 0.05, CELL_SIZE * 0.25);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
    
    for (let y = 1; y < mazeSize; y += 3) {
        for (let x = 1; x < mazeSize; x += 3) {
            if (maze.grid[y][x] === 1) continue;
            const cx = x * CELL_SIZE + CELL_SIZE / 2;
            const cz = y * CELL_SIZE + CELL_SIZE / 2;
            
            if (!isForestLevel) {
                if (Math.random() > 0.2) {
                    const panel = new THREE.Mesh(panelGeo, panelMat);
                    panel.position.set(cx, WALL_HEIGHT - 0.03, cz);
                    scene.add(panel);
                    const pl = new THREE.PointLight(0xfff2c8, 14, CELL_SIZE * 3.5, 1.5);
                    pl.position.set(cx, WALL_HEIGHT - 0.4, cz);
                    scene.add(pl);
                    fluorescentLights.push(pl);
                }
            } else {
                // Faroles en el bosque
                if (Math.random() > 0.5) {
                    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), new THREE.MeshStandardMaterial({color: 0x111111}));
                    pole.position.set(cx, 1.5, cz); scene.add(pole);
                    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({color: 0xffaa00}));
                    lamp.position.set(cx, 3, cz); scene.add(lamp);
                    const pl = new THREE.PointLight(0xffaa00, 10, 15, 1.5);
                    pl.position.set(cx, 3, cz); scene.add(pl);
                }
            }
        }
    }

    const wallTex = makeTex(isForestLevel ? 'floor' : 'wall'); wallTex.repeat.set(2, 1);
    const floorTex = makeTex('floor'); floorTex.repeat.set(mazeSize, mazeSize);
    const ceilTex = makeTex('ceil'); ceilTex.repeat.set(mazeSize, mazeSize);

    let wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
    if (isForestLevel) wallMat = new THREE.MeshStandardMaterial({ color: 0x1a3311, roughness: 1 }); // Arbustos
    
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 });
    const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 });

    const floorGeo = new THREE.PlaneGeometry(mazeSize * CELL_SIZE, mazeSize * CELL_SIZE);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((mazeSize * CELL_SIZE) / 2, 0, (mazeSize * CELL_SIZE) / 2);
    scene.add(floor);

    if (!isForestLevel) {
        const ceil = new THREE.Mesh(floorGeo, ceilMat);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set((mazeSize * CELL_SIZE) / 2, WALL_HEIGHT, (mazeSize * CELL_SIZE) / 2);
        scene.add(ceil);
    }

    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            if (maze.grid[y][x] === 1) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMat);
                wall.position.set(x * CELL_SIZE + CELL_SIZE / 2, WALL_HEIGHT / 2, y * CELL_SIZE + CELL_SIZE / 2);
                scene.add(wall);
            }
        }
    }

    player.x = CELL_SIZE * 1.5;
    player.z = CELL_SIZE * 1.5;
    player.stamina = 100;
    player.isHidden = false;

    monster = new Monster(scene, isForestLevel ? 'scarecrow' : 'smiler');
    monster.speed = 5.0 + level * 0.4;
    // Aparece más cerca
    monster.setPosition((mazeSize - 4) * CELL_SIZE, (mazeSize - 4) * CELL_SIZE);

    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, emissive: 0x550000, emissiveIntensity: 0.8 });
    for (let i = 0; i < 3; i++) {
        let tx, ty;
        do {
            tx = 1 + Math.floor(Math.random() * (mazeSize - 2));
            ty = 1 + Math.floor(Math.random() * (mazeSize - 2));
        } while (maze.grid[ty][tx] === 1 || (Math.hypot(tx, ty) < 6));
        
        const tape = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1.5), tapeMat);
        tape.position.set(tx * CELL_SIZE + CELL_SIZE / 2, 1, ty * CELL_SIZE + CELL_SIZE / 2);
        scene.add(tape);
        tapes.push({ mesh: tape, taken: false });
    }

    exitPos.set((mazeSize - 2) * CELL_SIZE, 2, (mazeSize - 2) * CELL_SIZE);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial({ color: 0x00ff55 }));
    door.position.copy(exitPos);
    scene.add(door);

    addHideSpots(mazeSize, isForestLevel);

    document.getElementById('level-ui').innerText = isForestLevel ? `BOSQUE ${level}` : `NIVEL ${level}`;
    showMsg(`ENCUENTRA 3 CINTAS\nEscóndete con E o el botón`, 3500);
}

// --- CONTROLES ---
function setupControls() {
    window.addEventListener('keydown', e => {
        if (e.key === 'Shift') keys.shift = true;
        if (e.key.toLowerCase() === 'e' || e.key === ' ') tryHide();
    });
    window.addEventListener('keyup', e => {
        if (e.key === 'Shift') keys.shift = false;
    });

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

    // Joystick Analógico
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
            // Normalizar valor entre -1 y 1
            player.joyX = dx / max;
            player.joyY = dy / max;
        }
    }, {passive:false});

    joy.addEventListener('touchend', e => {
        for (const t of e.changedTouches) if (t.identifier === joyId) {
            joyId = null; player.joyX = 0; player.joyY = 0;
            joyKnob.style.transform = 'translate(-50%, -50%)';
        }
    });

    const sprintBtn = document.getElementById('sprintBtn');
    sprintBtn.addEventListener('touchstart', e => { e.preventDefault(); keys.shift = true; sprintBtn.classList.add('active'); }, {passive:false});
    sprintBtn.addEventListener('touchend', e => { e.preventDefault(); keys.shift = false; sprintBtn.classList.remove('active'); });

    const hideBtn = document.getElementById('hideBtn');
    hideBtn.addEventListener('touchstart', e => { e.preventDefault(); tryHide(); }, {passive:false});

    let lookId = null, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('touchstart', e => {
        if (e.target.closest('#joy') || e.target.closest('#sprintBtn') || e.target.closest('#hideBtn')) return;
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

let lastHideToggle = 0;
function tryHide() {
    // Prevenir doble toque
    const now = performance.now();
    if (now - lastHideToggle < 500) return;
    
    let near = false;
    for (const h of hideSpots) {
        if (Math.hypot(player.x - h.x, player.z - h.z) < h.radius) { near = true; break; }
    }
    
    if (near) {
        player.isHidden = !player.isHidden;
        lastHideToggle = now;
        showMsg(player.isHidden ? 'TE ESCONDISTE' : 'SALISTE', 1400);
        document.getElementById('hideBtn').classList.toggle('active', player.isHidden);
    } else {
        showMsg('Acércate a un escondite', 1000);
    }
}

// --- UPDATE ---
let stepTimer = 0;
function update(dt) {
    if (!isRunning) return;

    let moveX = player.joyX;
    let moveZ = player.joyY;
    
    // Teclado
    if (keys['w']) moveZ -= 1;
    if (keys['s']) moveZ += 1;
    if (keys['a']) moveX -= 1;
    if (keys['d']) moveX += 1;
    
    // Normalizar si es mayor a 1 (para diagonales o joystick al máximo)
    const len = Math.hypot(moveX, moveZ);
    if (len > 1) { moveX /= len; moveZ /= len; }

    const speed = (keys.shift && !player.exhausted && !player.isHidden) ? SPRINT_SPEED : WALK_SPEED;

    if (!player.isHidden && (moveX !== 0 || moveZ !== 0)) {
        const sin = Math.sin(camera.rotation.y);
        const cos = Math.cos(camera.rotation.y);

        let vx = (moveX * cos - moveZ * sin) * speed * dt;
        let vz = (moveX * sin + moveZ * cos) * speed * dt;

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

        // Sonido de pasos
        stepTimer += dt;
        if (stepTimer > (keys.shift ? 0.3 : 0.5)) { stepTimer = 0; playSound('step'); }

    } else {
        player.stamina = Math.min(100, player.stamina + 17 * dt);
        if (player.stamina > 28) player.exhausted = false;
    }

    camera.position.set(player.x, 1.7, player.z);

    const bat = document.getElementById('battery-fill');
    bat.style.width = player.stamina + '%';
    bat.style.background = player.exhausted ? '#ff2222' : (player.isHidden ? '#44aaff' : '#fff');

    // Monstruo
    const dir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
    monster.update(dt, camera.position, dir, maze, player.isHidden);

    const distM = Math.hypot(player.x - monster.mesh.position.x, player.z - monster.mesh.position.z);
    
    // Alerta de proximidad (Corazón y borde rojo)
    const isNear = distM < 12 && !player.isHidden;
    document.getElementById('red-vignette').style.opacity = isNear ? (1 - distM/12) : 0;
    updateHeartbeat(isNear);

    if (distM < 1.8 && !player.isHidden) {
        player.x = CELL_SIZE * 1.5; player.z = CELL_SIZE * 1.5;
        player.isHidden = false;
        document.getElementById('hideBtn').classList.remove('active');
        showMsg('TE ATRAPÓ', 2000);
    }

    // Cintas flotantes
    tapes.forEach((t, i) => {
        if (!t.taken) {
            t.mesh.rotation.y += dt * 2;
            t.mesh.position.y = 1 + Math.sin(performance.now() * 0.003 + i) * 0.2;
            if (Math.hypot(player.x - t.mesh.position.x, player.z - t.mesh.position.z) < 2) {
                t.taken = true;
                scene.remove(t.mesh);
                showMsg('CINTA RECUPERADA', 1300);
            }
        }
    });

    if (Math.hypot(player.x - exitPos.x, player.z - exitPos.z) < 3 && tapes.every(t => t.taken)) {
        currentLevel++;
        loadLevel(currentLevel);
    }

    // Luces parpadeantes
    if (fluorescentLights.length > 0) {
        const t = performance.now() * 0.001;
        fluorescentLights.forEach((l, i) => {
            l.intensity = 12 + Math.sin(t * 3 + i * 1.5) * 4 + (Math.random() > 0.95 ? -10 : 0);
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
    initAudio();
    document.getElementById('startScreen').style.display = 'none';
    isRunning = true;
    animate(performance.now());
});

init();

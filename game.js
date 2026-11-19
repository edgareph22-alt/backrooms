import * as THREE from 'three';
import { MazeGenerator } from './maze.js';
import { Monster } from './entity.js';

// --- CONFIGURACIÓN ---
const CELL_SIZE = 10;
const WALL_HEIGHT = 5;
const WALK_SPEED = 5.2;
const SPRINT_SPEED = 9.0;

let currentLevel = 1;
let levelType = 'backrooms';
let maze = null;
let monster = null;
let scene, camera, renderer;
let player = { x: 0, z: 0, stamina: 100, exhausted: false, isHidden: false };
let keys = { w: false, a: false, s: false, d: false, shift: false };
let tapes = [];
let hideSpots = [];
let exitPos = new THREE.Vector3();
let isRunning = false;
let rainSystem = null;
let audioCtx = null;
let ambientNodes = {};
let fluorescentLights = [];
let lastThunder = 0;

// --- TEXTURAS ---
function makeTex(kind, style = 'backrooms') {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    const noise = (a) => {
        const d = g.getImageData(0,0,512,512);
        for (let i=0; i<d.data.length; i+=4) {
            const n = (Math.random()-0.5)*a;
            d.data[i] = Math.max(0,Math.min(255,d.data[i]+n));
            d.data[i+1] = Math.max(0,Math.min(255,d.data[i+1]+n));
            d.data[i+2] = Math.max(0,Math.min(255,d.data[i+2]+n));
        }
        g.putImageData(d,0,0);
    };

    if (style === 'forest') {
        if (kind === 'wall') {
            g.fillStyle = '#1a2e14'; g.fillRect(0,0,512,512);
            for (let i=0; i<80; i++) {
                const x = Math.random()*512;
                g.fillStyle = `rgb(${20+Math.random()*40},${40+Math.random()*50},${15+Math.random()*25})`;
                g.fillRect(x, 0, 4+Math.random()*8, 512);
            }
            for (let i=0; i<120; i++) {
                g.fillStyle = `rgba(${30+Math.random()*40},${60+Math.random()*40},${20},0.4)`;
                g.beginPath();
                g.arc(Math.random()*512, Math.random()*512, 8+Math.random()*20, 0, 7);
                g.fill();
            }
            noise(25);
        } else if (kind === 'floor') {
            g.fillStyle = '#2a2218'; g.fillRect(0,0,512,512);
            for (let i=0; i<200; i++) {
                g.fillStyle = `rgba(${40+Math.random()*30},${50+Math.random()*25},${20},0.35)`;
                g.beginPath();
                g.ellipse(Math.random()*512, Math.random()*512, 10+Math.random()*25, 4+Math.random()*8, Math.random()*3, 0, 7);
                g.fill();
            }
            noise(40);
        } else {
            const grd = g.createLinearGradient(0,0,0,512);
            grd.addColorStop(0, '#0a0e14');
            grd.addColorStop(1, '#1a2430');
            g.fillStyle = grd; g.fillRect(0,0,512,512);
            noise(15);
        }
    } else {
        if (kind === 'wall') {
            g.fillStyle = '#d4c27a'; g.fillRect(0,0,512,512);
            g.fillStyle = 'rgba(140,120,50,0.18)';
            for (let x=0; x<512; x+=28) g.fillRect(x,0,2,512);
            for (let i=0; i<12; i++) {
                const x = Math.random()*512, y = 80+Math.random()*350;
                const r = g.createRadialGradient(x,y,0,x,y,60+Math.random()*40);
                r.addColorStop(0, 'rgba(90,70,30,0.22)');
                r.addColorStop(1, 'rgba(90,70,30,0)');
                g.fillStyle = r; g.fillRect(0,0,512,512);
            }
            g.fillStyle = '#6b5a2a'; g.fillRect(0,480,512,32);
            noise(18);
        } else if (kind === 'floor') {
            g.fillStyle = '#a08c4a'; g.fillRect(0,0,512,512);
            for (let y=0; y<512; y+=4) {
                g.fillStyle = `rgba(80,65,30,${0.05+Math.random()*0.08})`;
                g.fillRect(0,y,512,2);
            }
            for (let i=0; i<40; i++) {
                g.fillStyle = 'rgba(60,45,20,0.12)';
                g.beginPath(); g.arc(Math.random()*512, Math.random()*512, 15+Math.random()*30, 0, 7); g.fill();
            }
            noise(30);
        } else {
            g.fillStyle = '#e8e0c0'; g.fillRect(0,0,512,512);
            g.strokeStyle = 'rgba(100,90,60,0.5)'; g.lineWidth = 6;
            g.strokeRect(8,8,496,496);
            g.beginPath(); g.moveTo(256,0); g.lineTo(256,512); g.moveTo(0,256); g.lineTo(512,256); g.stroke();
            for (let i=0; i<6; i++) {
                g.fillStyle = 'rgba(80,70,40,0.12)';
                g.beginPath(); g.arc(Math.random()*512, Math.random()*512, 30+Math.random()*40, 0, 7); g.fill();
            }
            noise(12);
        }
    }

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}

// --- AUDIO ---
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Zumbido fluorescente
    const humOsc = audioCtx.createOscillator();
    const humGain = audioCtx.createGain();
    const humFilter = audioCtx.createBiquadFilter();
    humOsc.type = 'sawtooth';
    humOsc.frequency.value = 60;
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 180;
    humGain.gain.value = 0.012;
    humOsc.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(audioCtx.destination);
    humOsc.start();
    ambientNodes.hum = { osc: humOsc, gain: humGain };

    function createRainLayer(freq, q, type = 'bandpass') {
        const bufferSize = 3 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const source = audioCtx.createBufferSource();
        source.buffer = noiseBuffer;
        source.loop = true;

        const filter = audioCtx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        filter.Q.value = q;

        const gain = audioCtx.createGain();
        gain.gain.value = 0;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        source.start();

        return { source, filter, gain };
    }

    ambientNodes.rainLow  = createRainLayer(400, 0.7, 'lowpass');
    ambientNodes.rainMid  = createRainLayer(1200, 0.9, 'bandpass');
    ambientNodes.rainHigh = createRainLayer(3500, 0.6, 'highpass');
}

function setRainVolume(vol) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    ambientNodes.rainLow.gain.gain.setTargetAtTime(vol * 0.7, t, 0.4);
    ambientNodes.rainMid.gain.gain.setTargetAtTime(vol * 1.0, t, 0.4);
    ambientNodes.rainHigh.gain.gain.setTargetAtTime(vol * 0.55, t, 0.4);
}

function playThunder() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(18, now + 1.8);
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 3);

    setTimeout(() => {
        if (!audioCtx) return;
        const now2 = audioCtx.currentTime;
        const osc2 = audioCtx.createOscillator();
        const g2 = audioCtx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(120, now2);
        osc2.frequency.exponentialRampToValueAtTime(30, now2 + 0.8);
        g2.gain.setValueAtTime(0.15, now2);
        g2.gain.exponentialRampToValueAtTime(0.001, now2 + 1.2);
        osc2.connect(g2);
        g2.connect(audioCtx.destination);
        osc2.start(now2);
        osc2.stop(now2 + 1.3);
    }, 180 + Math.random() * 300);
}

function setAmbientForLevel(type) {
    if (!audioCtx) return;
    if (type === 'forest') {
        setRainVolume(0.14);
        ambientNodes.hum.gain.gain.setTargetAtTime(0.003, audioCtx.currentTime, 0.6);
    } else {
        setRainVolume(0.0);
        ambientNodes.hum.gain.gain.setTargetAtTime(0.016, audioCtx.currentTime, 0.6);
    }
}

// --- LLUVIA VISUAL ---
function createRain(scene) {
    const count = 7000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        positions[i*3] = (Math.random()-0.5) * 200;
        positions[i*3+1] = Math.random() * 45 + 5;
        positions[i*3+2] = (Math.random()-0.5) * 200;
        velocities[i] = 20 + Math.random() * 25;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
        color: 0xaabbcc,
        size: 0.18,
        transparent: true,
        opacity: 0.6,
        depthWrite: false
    });

    const points = new THREE.Points(geo, mat);
    points.userData = { velocities, count };
    scene.add(points);
    return points;
}

function updateRain(dt) {
    if (!rainSystem) return;
    const pos = rainSystem.geometry.attributes.position.array;
    const vels = rainSystem.userData.velocities;
    const count = rainSystem.userData.count;
    const px = player.x, pz = player.z;

    for (let i = 0; i < count; i++) {
        pos[i*3+1] -= vels[i] * dt;
        if (pos[i*3+1] < 0) {
            pos[i*3] = px + (Math.random()-0.5)*90;
            pos[i*3+1] = 28 + Math.random()*22;
            pos[i*3+2] = pz + (Math.random()-0.5)*90;
        }
    }
    rainSystem.geometry.attributes.position.needsUpdate = true;
}

// --- LUCES ---
function addLights(mazeSize, style) {
    fluorescentLights = [];
    if (style === 'forest') {
        scene.add(new THREE.AmbientLight(0x334455, 0.25));
        scene.add(new THREE.HemisphereLight(0x445566, 0x112211, 0.4));
        const moon = new THREE.DirectionalLight(0x8899aa, 0.35);
        moon.position.set(30, 50, 20);
        moon.castShadow = true;
        scene.add(moon);
    } else {
        scene.add(new THREE.AmbientLight(0xfff4d0, 0.28));
        scene.add(new THREE.HemisphereLight(0xfff6dd, 0x5a4a2a, 0.45));
    }

    const flashlight = new THREE.SpotLight(0xfff4d8, 45, 28, Math.PI / 5.5, 0.45, 1.4);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
    flashlight.shadow.bias = -0.0005;
    flashlight.shadow.normalBias = 0.03;
    flashlight.position.set(0.25, -0.15, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight);
    camera.add(flashlight.target);
    scene.add(camera);

    if (style === 'backrooms') {
        const panelGeo = new THREE.BoxGeometry(CELL_SIZE * 0.55, 0.06, CELL_SIZE * 0.28);
        const panelMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
        for (let y = 1; y < mazeSize; y += 3) {
            for (let x = 1; x < mazeSize; x += 3) {
                if (!maze.grid[y] || maze.grid[y][x] === 1) continue;
                const cx = x * CELL_SIZE + CELL_SIZE/2;
                const cz = y * CELL_SIZE + CELL_SIZE/2;
                const panel = new THREE.Mesh(panelGeo, panelMat);
                panel.position.set(cx, WALL_HEIGHT - 0.04, cz);
                scene.add(panel);

                const pl = new THREE.PointLight(0xfff2c8, 14, CELL_SIZE * 3.8, 1.5);
                pl.position.set(cx, WALL_HEIGHT - 0.5, cz);
                scene.add(pl);
                fluorescentLights.push(pl);
            }
        }
    }
}

// --- MUEBLES ---
function addFurniture(mazeSize, style) {
    hideSpots = [];
    if (style !== 'backrooms') return;

    const chairMat = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.8 });
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 0.7 });

    for (let i = 0; i < 10; i++) {
        let tx, ty;
        do {
            tx = 2 + Math.floor(Math.random() * (mazeSize - 4));
            ty = 2 + Math.floor(Math.random() * (mazeSize - 4));
        } while (maze.grid[ty][tx] === 1);

        const group = new THREE.Group();
        const desk = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 1.4), deskMat);
        desk.position.y = 0.5;
        desk.castShadow = true;
        desk.receiveShadow = true;
        group.add(desk);

        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.9), chairMat);
        seat.position.set(0, 0.55, -1.3);
        group.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.12), chairMat);
        back.position.set(0, 1.1, -1.7);
        group.add(back);

        const wx = tx * CELL_SIZE + CELL_SIZE/2;
        const wz = ty * CELL_SIZE + CELL_SIZE/2;
        group.position.set(wx, 0, wz);
        group.rotation.y = Math.random() * Math.PI * 2;
        scene.add(group);

        hideSpots.push({ x: wx, z: wz, radius: 2.2 });
    }
}

// --- INIT ---
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 120);
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
    rainSystem = null;
    fluorescentLights = [];
    hideSpots = [];

    levelType = (level % 2 === 1) ? 'backrooms' : 'forest';
    const mazeSize = 13 + Math.min(level * 3, 18);

    maze = new MazeGenerator(mazeSize, levelType);

    if (levelType === 'forest') {
        scene.background = new THREE.Color(0x0a1218);
        scene.fog = new THREE.FogExp2(0x0a1218, 0.032);
    } else {
        scene.background = new THREE.Color(0x6b5f3a);
        scene.fog = new THREE.FogExp2(0x6b5f3a, 0.025);
    }

    addLights(mazeSize, levelType);

    const wallTex = makeTex('wall', levelType);
    wallTex.repeat.set(levelType === 'forest' ? 1.5 : 2, 1);
    const floorTex = makeTex('floor', levelType);
    floorTex.repeat.set(mazeSize * 0.8, mazeSize * 0.8);
    const ceilTex = makeTex('ceil', levelType);
    ceilTex.repeat.set(mazeSize * 0.6, mazeSize * 0.6);

    const wallMat = new THREE.MeshStandardMaterial({
        map: wallTex,
        roughness: levelType === 'forest' ? 0.95 : 0.88,
        metalness: 0.02
    });
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.96 });
    const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 });

    const floorGeo = new THREE.PlaneGeometry(mazeSize * CELL_SIZE, mazeSize * CELL_SIZE);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.position.set((mazeSize * CELL_SIZE) / 2, 0, (mazeSize * CELL_SIZE) / 2);
    scene.add(floor);

    if (levelType === 'backrooms') {
        const ceil = new THREE.Mesh(floorGeo, ceilMat);
        ceil.rotation.x = Math.PI / 2;
        ceil.receiveShadow = true;
        ceil.position.set((mazeSize * CELL_SIZE) / 2, WALL_HEIGHT, (mazeSize * CELL_SIZE) / 2);
        scene.add(ceil);
    }

    const wallH = levelType === 'forest' ? 6.5 : WALL_HEIGHT;
    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            if (maze.grid[y][x] === 1) {
                const wall = new THREE.Mesh(
                    new THREE.BoxGeometry(CELL_SIZE, wallH, CELL_SIZE),
                    wallMat
                );
                wall.position.set(x * CELL_SIZE + CELL_SIZE/2, wallH/2, y * CELL_SIZE + CELL_SIZE/2);
                wall.castShadow = true;
                wall.receiveShadow = true;
                scene.add(wall);
            }
        }
    }

    player.x = CELL_SIZE * 1.5;
    player.z = CELL_SIZE * 1.5;
    player.stamina = 100;
    player.exhausted = false;
    player.isHidden = false;

    const mType = levelType === 'forest' ? 'scarecrow' : 'clown';
    monster = new Monster(scene, mType);
    monster.speed = 4.8 + (level * 0.4);
    monster.aggroRange = 26 + level;
    monster.mesh.traverse(o => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    monster.setPosition((mazeSize - 2.5) * CELL_SIZE, (mazeSize - 2.5) * CELL_SIZE);

    tapes = [];
    const tapeMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, roughness: 0.4,
        emissive: levelType === 'forest' ? 0x334400 : 0x550000,
        emissiveIntensity: 0.7
    });
    for (let i = 0; i < 3; i++) {
        let tx, ty;
        do {
            tx = Math.floor(Math.random() * (mazeSize - 2)) + 1;
            ty = Math.floor(Math.random() * (mazeSize - 2)) + 1;
        } while (maze.grid[ty][tx] === 1 || (tx < 3 && ty < 3));

        const tape = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 1.6), tapeMat);
        tape.position.set(tx * CELL_SIZE + CELL_SIZE/2, 0.4, ty * CELL_SIZE + CELL_SIZE/2);
        tape.castShadow = true;
        scene.add(tape);
        tapes.push({ mesh: tape, taken: false });
    }

    exitPos.set((mazeSize - 2) * CELL_SIZE, 2, (mazeSize - 2) * CELL_SIZE);
    const doorColor = levelType === 'forest' ? 0x44aa44 : 0x00ff55;
    const door = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 4.2, 2.2),
        new THREE.MeshBasicMaterial({ color: doorColor })
    );
    door.position.copy(exitPos);
    scene.add(door);

    addFurniture(mazeSize, levelType);

    if (levelType === 'forest') {
        rainSystem = createRain(scene);
    }

    setAmbientForLevel(levelType);

    const levelName = levelType === 'forest' ? 'BOSQUE LIMINAL' : 'BACKROOMS';
    document.getElementById('level-ui').innerText = `NIVEL ${level} · ${levelName}`;
    const msg = levelType === 'forest'
        ? `NIVEL ${level}: BOSQUE — ENCUENTRA 3 CINTAS\nLluvia + Espantapájaros...`
        : `NIVEL ${level}: ENCUENTRA 3 CINTAS\nMira al payaso. Escóndete con E.`;
    showMsg(msg, 4000);
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

    let pointerLocked = false;
    renderer.domElement.addEventListener('click', () => {
        if (!pointerLocked && isRunning) {
            renderer.domElement.requestPointerLock();
        }
    });
    document.addEventListener('pointerlockchange', () => {
        pointerLocked = document.pointerLockElement === renderer.domElement;
    });
    document.addEventListener('mousemove', e => {
        if (!pointerLocked || !isRunning) return;
        camera.rotation.y -= e.movementX * 0.0022;
        camera.rotation.x -= e.movementY * 0.0020;
        camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x));
    });

    const joy = document.getElementById('joy');
    const joyKnob = document.getElementById('joyKnob');
    let joyId = null, joyCenter = { x: 0, y: 0 };

    joy.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        if (joyId !== null) return;
        joyId = t.identifier;
        const r = joy.getBoundingClientRect();
        joyCenter = { x: r.left + r.width/2, y: r.top + r.height/2 };
    }, { passive: false });

    joy.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier !== joyId) continue;
            let dx = t.clientX - joyCenter.x, dy = t.clientY - joyCenter.y;
            const max = 45, mag = Math.hypot(dx, dy);
            if (mag > max) { dx = dx/mag*max; dy = dy/mag*max; }
            joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            keys.w = dy < -15; keys.s = dy > 15;
            keys.a = dx < -15; keys.d = dx > 15;
        }
    }, { passive: false });

    joy.addEventListener('touchend', e => {
        for (const t of e.changedTouches) if (t.identifier === joyId) {
            joyId = null;
            keys.w = keys.s = keys.a = keys.d = false;
            joyKnob.style.transform = 'translate(-50%, -50%)';
        }
    });

    const sprintBtn = document.getElementById('sprintBtn');
    sprintBtn.addEventListener('touchstart', e => {
        e.preventDefault();
        keys.shift = true;
        sprintBtn.classList.add('active');
    }, { passive: false });
    sprintBtn.addEventListener('touchend', e => {
        e.preventDefault();
        keys.shift = false;
        sprintBtn.classList.remove('active');
    });

    let lookId = null, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('touchstart', e => {
        if (e.target.closest('#joy') || e.target.closest('#sprintBtn')) return;
        e.preventDefault();
        const t = e.changedTouches[0];
        if (lookId === null) {
            lookId = t.identifier;
            lastX = t.clientX;
            lastY = t.clientY;
        }
    }, { passive: false });

    renderer.domElement.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === lookId) {
                camera.rotation.y -= (t.clientX - lastX) * 0.0055;
                camera.rotation.x -= (t.clientY - lastY) * 0.0045;
                camera.rotation.x = Math.max(-1.15, Math.min(1.15, camera.rotation.x));
                lastX = t.clientX;
                lastY = t.clientY;
            }
        }
    }, { passive: false });

    renderer.domElement.addEventListener('touchend', e => {
        for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    });
}

function tryHide() {
    if (levelType !== 'backrooms') return;
    let near = false;
    for (const h of hideSpots) {
        const d = Math.hypot(player.x - h.x, player.z - h.z);
        if (d < h.radius) {
            near = true;
            break;
        }
    }
    if (near) {
        player.isHidden = !player.isHidden;
        showMsg(player.isHidden ? 'TE ESCONDISTE...' : 'SALISTE DEL ESCONDITE', 1200);
    } else {
        showMsg('No hay dónde esconderse cerca', 1000);
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
        const length = Math.hypot(moveX, moveZ);
        moveX /= length; moveZ /= length;

        const sin = Math.sin(camera.rotation.y);
        const cos = Math.cos(camera.rotation.y);
        const nextX = player.x + (moveX * cos - moveZ * sin) * speed * dt;
        const nextZ = player.z + (moveX * sin + moveZ * cos) * speed * dt;

        if (!maze.isWall(nextX, player.z)) player.x = nextX;
        if (!maze.isWall(player.x, nextZ)) player.z = nextZ;

        if (keys.shift) {
            player.stamina = Math.max(0, player.stamina - 22 * dt);
            if (player.stamina === 0) player.exhausted = true;
        } else {
            player.stamina = Math.min(100, player.stamina + 14 * dt);
            if (player.stamina > 28) player.exhausted = false;
        }
    } else if (!keys.shift) {
        player.stamina = Math.min(100, player.stamina + 18 * dt);
        if (player.stamina > 28) player.exhausted = false;
    }

    camera.position.set(player.x, 1.75, player.z);

    const batFill = document.getElementById('battery-fill');
    batFill.style.width = player.stamina + '%';
    batFill.style.background = player.exhausted ? '#ff2222' : (player.isHidden ? '#44aaff' : '#fff');

    const dir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
    monster.update(dt, camera.position, dir, maze, player.isHidden);

    const distToMonster = Math.hypot(player.x - monster.mesh.position.x, player.z - monster.mesh.position.z);
    if (distToMonster < monster.catchRange && !player.isHidden) {
        player.x = CELL_SIZE * 1.5;
        player.z = CELL_SIZE * 1.5;
        player.isHidden = false;
        showMsg(levelType === 'forest' ? 'EL ESPANTAPÁJAROS TE ENCONTRÓ...' : 'MINI MINI.EXE TE ATRAPÓ', 2200);
    }

    tapes.forEach(t => {
        if (!t.taken) {
            const d = Math.hypot(player.x - t.mesh.position.x, player.z - t.mesh.position.z);
            if (d < 2.1) {
                t.taken = true;
                scene.remove(t.mesh);
                showMsg('CINTA RECUPERADA', 1400);
            }
        }
    });

    const distToExit = Math.hypot(player.x - exitPos.x, player.z - exitPos.z);
    if (distToExit < 3.2 && tapes.every(t => t.taken)) {
        currentLevel++;
        loadLevel(currentLevel);
    }

    if (levelType === 'forest') {
        updateRain(dt);
        if (performance.now() - lastThunder > 7000 + Math.random() * 14000) {
            playThunder();
            lastThunder = performance.now();
            scene.background.setHex(0x556677);
            setTimeout(() => {
                if (levelType === 'forest') scene.background.setHex(0x0a1218);
            }, 60 + Math.random()*150);
        }
    }

    if (levelType === 'backrooms' && fluorescentLights.length) {
        const t = performance.now() * 0.001;
        fluorescentLights.forEach((l, i) => {
            l.intensity = 12 + Math.sin(t * 2.5 + i * 1.7) * 2.5 + (Math.random() > 0.97 ? -6 : 0);
        });
    }
}

// --- RENDER ---
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

// --- START ---
document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('startScreen').style.display = 'none';
    isRunning = true;
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    animate(performance.now());
});

init();

import * as THREE from 'three';
import { MazeGenerator } from './maze.js';
import { Monster } from './entity.js';

const CELL_SIZE = 6; // Celdas más pequeñas para pasillos más definidos
const WALL_HEIGHT = 4;
const WALK_SPEED = 6;
const SPRINT_SPEED = 10;

let currentLevel = 1;
let maze = null;
let monster = null;
let scene, camera, renderer;
let player = { x: 0, z: 0, stamina: 100, exhausted: false };
let keys = { w: false, a: false, s: false, d: false, shift: false };
let tapes = [];
let exitPos = new THREE.Vector3();
let isRunning = false;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd4be5a); // Fondo amarillo claro
    scene.fog = new THREE.Fog(0xd4be5a, 10, 40); // Niebla lineal (lejos)

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    // ILUMINACIÓN EXTREMA (Anti-oscuridad)
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5); // Luz global fuerte
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    const flashlight = new THREE.PointLight(0xffffff, 5, 25); // Linterna pegada al jugador
    camera.add(flashlight);
    scene.add(camera);

    loadLevel(currentLevel);
    setupControls();
    window.addEventListener('resize', onWindowResize);
}

function loadLevel(level) {
    while(scene.children.length > 0){ 
        scene.remove(scene.children[0]); 
    }
    // Añadir luces de nuevo porque se borraron al limpiar la escena
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    camera.add(new THREE.PointLight(0xffffff, 5, 25));
    scene.add(camera);

    // Mapa más chico para que se vea todo
    const mazeSize = 10 + (level * 2);
    maze = new MazeGenerator(mazeSize);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0xe6d17a }); // Amarillo más claro y brillante
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x8c7a4e }); // Marrón claro
    const ceilMat = new THREE.MeshLambertMaterial({ color: 0xcccccc }); // Gris claro

    const floorGeo = new THREE.PlaneGeometry(mazeSize * CELL_SIZE, mazeSize * CELL_SIZE);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((mazeSize * CELL_SIZE) / 2, 0, (mazeSize * CELL_SIZE) / 2);
    scene.add(floor);

    const ceil = new THREE.Mesh(floorGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((mazeSize * CELL_SIZE) / 2, WALL_HEIGHT, (mazeSize * CELL_SIZE) / 2);
    scene.add(ceil);

    for (let y = 0; y < mazeSize; y++) {
        for (let x = 0; x < mazeSize; x++) {
            if (maze.grid[y][x] === 1) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMat);
                wall.position.set(x * CELL_SIZE + CELL_SIZE/2, WALL_HEIGHT/2, y * CELL_SIZE + CELL_SIZE/2);
                scene.add(wall);
            }
        }
    }

    player.x = CELL_SIZE * 1.5;
    player.z = CELL_SIZE * 1.5;
    player.stamina = 100;

    monster = new Monster(scene);
    monster.speed = 5.0 + (level * 0.5);
    monster.setPosition((mazeSize - 2) * CELL_SIZE, (mazeSize - 2) * CELL_SIZE);

    tapes = [];
    const tapeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Rojo brillante
    for (let i = 0; i < 3; i++) {
        let tx, ty;
        do {
            tx = Math.floor(Math.random() * (mazeSize - 2)) + 1;
            ty = Math.floor(Math.random() * (mazeSize - 2)) + 1;
        } while (maze.grid[ty][tx] === 1 || (tx === 1 && ty === 1));

        const tape = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1.5), tapeMat);
        tape.position.set(tx * CELL_SIZE + CELL_SIZE/2, 0.5, ty * CELL_SIZE + CELL_SIZE/2);
        scene.add(tape);
        tapes.push({ mesh: tape, taken: false });
    }

    exitPos.set((mazeSize - 2) * CELL_SIZE, 2, (mazeSize - 2) * CELL_SIZE);
    const door = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 3), new THREE.MeshBasicMaterial({ color: 0x00ff00 })); // Verde brillante
    door.position.copy(exitPos);
    scene.add(door);

    document.getElementById('level-ui').innerText = `NIVEL ${level}`;
    showMsg(`NIVEL ${level}: ENCUENTRA 3 CINTAS`, 3000);
}

function setupControls() {
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

    const sprintBtn = document.getElementById('sprintBtn');
    sprintBtn.addEventListener('touchstart', e => { e.preventDefault(); keys.shift = true; sprintBtn.classList.add('active'); });
    sprintBtn.addEventListener('touchend', e => { e.preventDefault(); keys.shift = false; sprintBtn.classList.remove('active'); });

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

function update(dt) {
    if (!isRunning) return;

    let moveX = 0, moveZ = 0;
    const speed = keys.shift && !player.exhausted ? SPRINT_SPEED : WALK_SPEED;

    if (keys.w) moveZ -= 1;
    if (keys.s) moveZ += 1;
    if (keys.a) moveX -= 1;
    if (keys.d) moveX += 1;

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
            player.stamina = Math.max(0, player.stamina - 20 * dt);
            if (player.stamina === 0) player.exhausted = true;
        } else {
            player.stamina = Math.min(100, player.stamina + 15 * dt);
            if (player.stamina > 30) player.exhausted = false;
        }
    }

    camera.position.set(player.x, 1.5, player.z); // Altura de los ojos

    document.getElementById('battery-fill').style.width = player.stamina + '%';
    document.getElementById('battery-fill').style.background = player.exhausted ? '#ff0000' : '#fff';

    const dir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
    monster.update(dt, camera.position, dir, maze);

    const distToMonster = Math.hypot(player.x - monster.mesh.position.x, player.z - monster.mesh.position.z);
    if (distToMonster < 2) {
        player.x = CELL_SIZE * 1.5;
        player.z = CELL_SIZE * 1.5;
        showMsg('MINI MINI.EXE TE ATRAPÓ', 2000);
    }

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

    const distToExit = Math.hypot(player.x - exitPos.x, player.z - exitPos.z);
    if (distToExit < 3 && tapes.every(t => t.taken)) {
        currentLevel++;
        loadLevel(currentLevel);
    }
}

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

document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('startScreen').style.display = 'none';
    isRunning = true;
    animate(performance.now());
});

init();

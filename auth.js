export let currentUser = null;
export let deviceQualityLock = 'HIGH';

// Detectar capacidad del dispositivo para bloquear la calidad
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const cores = navigator.hardwareConcurrency || 4;
const memory = navigator.deviceMemory || 4;

if (isMobile) {
    deviceQualityLock = 'MEDIUM';
    if (cores <= 4 || memory <= 4) deviceQualityLock = 'LOW';
}

window.loginUser = function() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (!user || !pass) return alert("Llena todos los campos");

    const users = JSON.parse(localStorage.getItem('br_users') || '{}');
    if (users[user] && users[user].password === pass) {
        currentUser = user;
        localStorage.setItem('br_session', user);
        loadUserData();
    } else {
        alert("Usuario o contraseña incorrectos.");
    }
};

window.registerUser = function() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (!user || !pass) return alert("Llena todos los campos");

    const users = JSON.parse(localStorage.getItem('br_users') || '{}');
    if (users[user]) return alert("El usuario ya existe.");

    users[user] = { password: pass, points: 0, skins: ["explorer"], activeSkin: "explorer", monsters: ["balloon", "cat"], activeMonster: "balloon" };
    localStorage.setItem('br_users', JSON.stringify(users));
    alert("Registrado con éxito. Iniciando sesión...");
    window.loginUser();
};

window.logoutUser = function() {
    currentUser = null;
    localStorage.removeItem('br_session');
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
};

function loadUserData() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainMenu').style.display = 'flex';
    
    const users = JSON.parse(localStorage.getItem('br_users'));
    const data = users[currentUser];
    
    document.getElementById('pointsVal').innerText = data.points;
    document.getElementById('user-display').innerText = "User: " + currentUser;
    
    renderMonsterShop(data);
    renderSkinShop(data);
    setupQualityMenu();
}

window.addEventListener('load', () => {
    const session = localStorage.getItem('br_session');
    if (session) {
        document.getElementById('username').value = session;
        currentUser = session;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainMenu').style.display = 'flex';
        const users = JSON.parse(localStorage.getItem('br_users'));
        document.getElementById('pointsVal').innerText = users[session].points;
        document.getElementById('user-display').innerText = "User: " + session;
        renderMonsterShop(users[session]);
        renderSkinShop(users[session]);
        setupQualityMenu();
    }
});

// --- CONFIGURACIÓN DE CALIDAD ---
function setupQualityMenu() {
    const qLow = document.getElementById('btnLow');
    const qMed = document.getElementById('btnMedium');
    const qHigh = document.getElementById('btnHigh');
    
    qMed.classList.remove('locked', 'active'); qHigh.classList.remove('locked', 'active');
    qMed.disabled = false; qHigh.disabled = false;
    qHigh.innerText = "Alta";

    if (deviceQualityLock === 'LOW') {
        qMed.classList.add('locked'); qMed.disabled = true;
        qHigh.classList.add('locked'); qHigh.disabled = true;
        qHigh.innerText = "Alta 🔒";
    } else if (deviceQualityLock === 'MEDIUM') {
        qHigh.classList.add('locked'); qHigh.disabled = true;
        qHigh.innerText = "Alta 🔒";
    }

    const saved = localStorage.getItem('br_quality') || deviceQualityLock;
    window.setQuality(saved);
}

window.setQuality = function(level) {
    if (level === 'HIGH' && document.getElementById('btnHigh').disabled) return;
    if (level === 'MEDIUM' && document.getElementById('btnMedium').disabled) return;
    
    localStorage.setItem('br_quality', level);
    document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
    if(level === 'LOW') document.getElementById('btnLow').classList.add('active');
    if(level === 'MEDIUM') document.getElementById('btnMedium').classList.add('active');
    if(level === 'HIGH') document.getElementById('btnHigh').classList.add('active');
}

// --- MONSTRUOS (10 Criaturas) ---
const MONSTERS = {
    balloon: { name: "Globo Feliz", cost: 0, icon: "🎈" },
    cat: { name: "Gato Frágil", cost: 0, icon: "🐈" },
    smiler: { name: "Sonriente", cost: 100, icon: "😁" },
    skinny: { name: "Demacrado", cost: 200, icon: "👽" },
    dj: { name: "Alien DJ", cost: 300, icon: "🎧" },
    berserker: { name: "El Mutante", cost: 400, icon: "🧟" },
    barista: { name: "Barista Café", cost: 500, icon: "🍄" },
    cloak: { name: "El Caminante", cost: 600, icon: "👻" },
    shadow: { name: "Sombra", cost: 700, icon: "🌑" },
    slender: { name: "Slender", cost: 800, icon: "🕴️" }
};

function renderMonsterShop(data) {
    const list = document.getElementById('monsterList'); list.innerHTML = '';
    for (const [key, info] of Object.entries(MONSTERS)) {
        const card = document.createElement('div'); card.className = 'skin-card';
        let equippedText = data.activeMonster === key ? '✅ EQUIPADO' : 'EQUIPAR';
        let btnBg = data.activeMonster === key ? '#44ff44' : '#ffd23f';
        let btnText = data.monsters.includes(key) ? equippedText : `COMPRAR (${info.cost} pts)`;

        card.innerHTML = `<div class="card-icon">${info.icon}</div><p>${info.name}</p>`;
        const btn = document.createElement('button');
        btn.innerText = btnText;
        
        if (data.monsters.includes(key)) {
            btn.style.background = btnBg;
            btn.onclick = () => { data.activeMonster = key; saveData(data); renderMonsterShop(data); };
        } else {
            btn.onclick = () => {
                if (data.points >= info.cost) {
                    data.points -= info.cost; data.monsters.push(key); data.activeMonster = key;
                    saveData(data); document.getElementById('pointsVal').innerText = data.points; renderMonsterShop(data);
                } else { alert("No tienes suficientes puntos."); }
            };
        }
        card.appendChild(btn); list.appendChild(card);
    }
}

// --- SKINS (6 Personajes) ---
const SKINS = {
    explorer: { name: "Explorador", cost: 0, icon: "🎒" },
    business: { name: "Negocios", cost: 150, icon: "💼" },
    tactical: { name: "Táctica", cost: 300, icon: "🪖" },
    survivor: { name: "Superviviente", cost: 500, icon: "🛡️" },
    scavenger: { name: "Carroñero", cost: 600, icon: "🪓" },
    scientist: { name: "Científico", cost: 800, icon: "🥼" }
};

function renderSkinShop(data) {
    const list = document.getElementById('skinsList'); list.innerHTML = '';
    for (const [key, info] of Object.entries(SKINS)) {
        const card = document.createElement('div'); card.className = 'skin-card';
        let equippedText = data.activeSkin === key ? '✅ EQUIPADO' : 'EQUIPAR';
        let btnBg = data.activeSkin === key ? '#44ff44' : '#ffd23f';
        let btnText = data.skins.includes(key) ? equippedText : `COMPRAR (${info.cost} pts)`;

        card.innerHTML = `<div class="card-icon">${info.icon}</div><p>${info.name}</p>`;
        const btn = document.createElement('button');
        btn.innerText = btnText;
        
        if (data.skins.includes(key)) {
            btn.style.background = btnBg;
            btn.onclick = () => { data.activeSkin = key; saveData(data); renderSkinShop(data); };
        } else {
            btn.onclick = () => {
                if (data.points >= info.cost) {
                    data.points -= info.cost; data.skins.push(key); data.activeSkin = key;
                    saveData(data); document.getElementById('pointsVal').innerText = data.points; renderSkinShop(data);
                } else { alert("No tienes suficientes puntos."); }
            };
        }
        card.appendChild(btn); list.appendChild(card);
    }
}

function saveData(data) {
    const users = JSON.parse(localStorage.getItem('br_users'));
    users[currentUser] = data;
    localStorage.setItem('br_users', JSON.stringify(users));
}

export function getActiveSkin() {
    if(!currentUser) return 'explorer';
    const users = JSON.parse(localStorage.getItem('br_users'));
    return users[currentUser].activeSkin || 'explorer';
}
export function getActiveMonster() {
    if(!currentUser) return 'balloon';
    const users = JSON.parse(localStorage.getItem('br_users'));
    return users[currentUser].activeMonster || 'balloon';
}
export function addPoints(amount) {
    if(!currentUser) return;
    const users = JSON.parse(localStorage.getItem('br_users'));
    users[currentUser].points += amount;
    localStorage.setItem('br_users', JSON.stringify(users));
    const pointsElement = document.getElementById('pointsVal');
    if (pointsElement) pointsElement.innerText = users[currentUser].points;
}

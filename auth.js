// auth.js
export let currentUser = null;

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

    // Al registrarse, obtienen los gratis por defecto
    users[user] = { password: pass, points: 0, skins: ["blue"], activeSkin: "blue", monsters: ["balloon", "cat"], activeMonster: "balloon" };
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
}

// Auto login
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
    }
});

// --- MONSTRUOS CON ICONOS ---
const MONSTERS = {
    balloon: { name: "Globo Feliz", cost: 0, icon: "🎈" },
    cat: { name: "Gato Frágil", cost: 0, icon: "🐈" },
    smiler: { name: "Sonriente", cost: 100, icon: "😁" },
    skinny: { name: "Demacrado", cost: 200, icon: "👽" },
    dj: { name: "Alien DJ", cost: 300, icon: "🎧" },
    berserker: { name: "El Mutante", cost: 400, icon: "🧟" },
    barista: { name: "Barista Café", cost: 500, icon: "🍄" },
    cloak: { name: "El Caminante", cost: 600, icon: "👻" },
    slender: { name: "Slender", cost: 800, icon: "🕴️" }
};

function renderMonsterShop(data) {
    const list = document.getElementById('monsterList'); list.innerHTML = '';
    for (const [key, info] of Object.entries(MONSTERS)) {
        const card = document.createElement('div'); card.className = 'skin-card';
        
        let equippedText = data.activeMonster === key ? '✅ EQUIPADO' : 'EQUIPAR';
        let btnBg = data.activeMonster === key ? '#44ff44' : '#ffd23f';
        let btnText = ownedMonsters(data, key) ? equippedText : `COMPRAR (${info.cost} pts)`;

        card.innerHTML = `
            <div class="card-icon">${info.icon}</div>
            <p>${info.name}</p>
        `;
        
        const btn = document.createElement('button');
        btn.innerText = btnText;
        
        if (ownedMonsters(data, key)) {
            btn.style.background = btnBg;
            btn.onclick = () => { data.activeMonster = key; saveData(data); renderMonsterShop(data); };
        } else {
            btn.onclick = () => {
                if (data.points >= info.cost) {
                    data.points -= info.cost;
                    data.monsters.push(key);
                    data.activeMonster = key;
                    saveData(data);
                    document.getElementById('pointsVal').innerText = data.points;
                    renderMonsterShop(data);
                } else { alert("No tienes suficientes puntos."); }
            };
        }
        card.appendChild(btn); list.appendChild(card);
    }
}

function ownedMonsters(data, key) {
    return data.monsters.includes(key);
}

// --- SKINS CON ICONOS ---
const SKINS = {
    blue: { name: "Azul", color: "#0000ff", cost: 0 },
    red: { name: "Rojo", color: "#ff0000", cost: 100 },
    green: { name: "Verde", color: "#00ff00", cost: 200 },
    gold: { name: "Oro", color: "#ffd700", cost: 500 }
};

function renderSkinShop(data) {
    const list = document.getElementById('skinsList'); list.innerHTML = '';
    for (const [key, info] of Object.entries(SKINS)) {
        const card = document.createElement('div'); card.className = 'skin-card';
        
        let equippedText = data.activeSkin === key ? '✅ EQUIPADO' : 'EQUIPAR';
        let btnBg = data.activeSkin === key ? '#44ff44' : '#ffd23f';
        let btnText = ownedSkins(data, key) ? equippedText : `COMPRAR (${info.cost} pts)`;

        // Dibujamos un círculo del color de la skin con brillo
        card.innerHTML = `
            <div class="card-icon">
                <div class="skin-color-circle" style="background: ${info.color}; box-shadow: 0 0 15px ${info.color};"></div>
            </div>
            <p>${info.name}</p>
        `;
        
        const btn = document.createElement('button');
        btn.innerText = btnText;
        
        if (ownedSkins(data, key)) {
            btn.style.background = btnBg;
            btn.onclick = () => { data.activeSkin = key; saveData(data); renderSkinShop(data); };
        } else {
            btn.onclick = () => {
                if (data.points >= info.cost) {
                    data.points -= info.cost;
                    data.skins.push(key);
                    data.activeSkin = key;
                    saveData(data);
                    document.getElementById('pointsVal').innerText = data.points;
                    renderSkinShop(data);
                } else { alert("No tienes suficientes puntos."); }
            };
        }
        card.appendChild(btn); list.appendChild(card);
    }
}

function ownedSkins(data, key) {
    return data.skins.includes(key);
}

function saveData(data) {
    const users = JSON.parse(localStorage.getItem('br_users'));
    users[currentUser] = data;
    localStorage.setItem('br_users', JSON.stringify(users));
}

export function getActiveSkin() {
    if(!currentUser) return 'blue';
    const users = JSON.parse(localStorage.getItem('br_users'));
    return users[currentUser].activeSkin || 'blue';
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

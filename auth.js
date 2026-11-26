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

    users[user] = { password: pass, points: 0, skins: ["blue"], monsters: ["balloon", "cat"] };
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
    
    // Renderizar tiendas
    renderMonsterShop(data);
    renderSkinShop(data);
}

// Auto login si ya hay sesión
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

// --- TIENDAS ---
const MONSTERS = {
    balloon: { name: "Globo Feliz", cost: 0 },
    cat: { name: "Gato Frágil", cost: 0 },
    smiler: { name: "Sonriente", cost: 100 },
    skinny: { name: "Demacrado", cost: 200 },
    dj: { name: "Alien DJ", cost: 300 },
    berserker: { name: "El Mutante", cost: 400 },
    barista: { name: "Barista Café", cost: 500 },
    cloak: { name: "El Caminante", cost: 600 },
    slender: { name: "Slender", cost: 800 }
};

function renderMonsterShop(data) {
    const list = document.getElementById('monsterList'); list.innerHTML = '';
    for (const [key, info] of Object.entries(MONSTERS)) {
        const card = document.createElement('div'); card.className = 'skin-card';
        card.innerHTML = `<p>${info.name}</p>`;
        const btn = document.createElement('button');
        
        if (data.monsters.includes(key)) {
            btn.innerText = data.activeMonster === key ? 'EQUIPADO' : 'EQUIPAR';
            btn.style.background = data.activeMonster === key ? '#44ff44' : '#ffd23f';
            btn.onclick = () => { data.activeMonster = key; saveData(data); renderMonsterShop(data); };
        } else {
            btn.innerText = `COMPRAR (${info.cost} pts)`;
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
        card.innerHTML = `<div style="width:40px; height:40px; background:${info.color}; border-radius:50%; margin:0 auto 10px;"></div><p>${info.name}</p>`;
        const btn = document.createElement('button');
        
        if (data.skins.includes(key)) {
            btn.innerText = data.activeSkin === key ? 'EQUIPADO' : 'EQUIPAR';
            btn.style.background = data.activeSkin === key ? '#44ff44' : '#ffd23f';
            btn.onclick = () => { data.activeSkin = key; saveData(data); renderSkinShop(data); };
        } else {
            btn.innerText = `COMPRAR (${info.cost} pts)`;
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
    document.getElementById('pointsVal').innerText = users[currentUser].points;
}

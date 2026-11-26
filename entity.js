import * as THREE from 'three';

export class Monster {
    constructor(scene, type = 'smiler', isForest = false) {
        this.mesh = new THREE.Group();
        this.speed = 5.0;
        this.isFrozen = false;
        this.type = type;
        this.legs = [];
        
        this.buildMonster(type);
        scene.add(this.mesh);
    }

    buildMonster(type) {
        const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const pale = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
        const red = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const glowRed = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 });

        if (type === 'balloon') {
            // Globo Feliz
            const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 32), new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.1 }));
            body.scale.set(1, 1.2, 0.5);
            body.position.y = 3.0;
            this.mesh.add(body);
            
            const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), dark); eyeL.position.set(-0.5, 3.3, -0.7); this.mesh.add(eyeL);
            const eyeR = eyeL.clone(); eyeR.position.x = 0.5; this.mesh.add(eyeR);
            
            const smile = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 8, 16, Math.PI), dark);
            smile.position.set(0, 2.8, -0.7); smile.rotation.z = Math.PI; smile.rotation.x = -0.2; this.mesh.add(smile);
            
            const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3, 4), pale);
            string.position.y = 1.5; this.mesh.add(string);
        } 
        else if (type === 'cat') {
            // Gato en caja
            const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({color: 0x8b5a2b}));
            box.position.y = 1.0; this.mesh.add(box);
            
            const catBody = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 1 }));
            catBody.position.y = 1.8; this.mesh.add(catBody);
            
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 1 }));
            head.position.y = 2.6; head.position.z = -0.3; this.mesh.add(head);
            
            const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({color: 0xffff00})); eyeL.position.set(-0.25, 2.7, -0.8); this.mesh.add(eyeL);
            const eyeR = eyeL.clone(); eyeR.position.x = 0.25; this.mesh.add(eyeR);
            
            const earL = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0x666666 })); earL.position.set(-0.4, 3.1, -0.3); this.mesh.add(earL);
            const earR = earL.clone(); earR.position.x = 0.4; this.mesh.add(earR);
        }
        else if (type === 'berserker') {
            // Mutante con bate
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 3.0, 8), new THREE.MeshStandardMaterial({ color: 0x4a1a1a, roughness: 0.8 }));
            body.position.y = 2.0; this.mesh.add(body);
            
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), new THREE.MeshStandardMaterial({ color: 0x4a1a1a }));
            head.position.y = 3.8; this.mesh.add(head);
            
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), glowRed);
            eye.position.set(0.2, 3.9, -0.5); this.mesh.add(eye);
            
            const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, 2.5, 8), new THREE.MeshStandardMaterial({color: 0x333333}));
            bat.position.set(1.2, 2.0, -0.5); bat.rotation.z = -0.5; this.mesh.add(bat);
            
            this.addLegs(dark, 1.0);
        }
        else if (type === 'skinny') {
            // Demacrado
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.5, 6), pale);
            body.position.y = 2.2; this.mesh.add(body);
            
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), pale);
            head.scale.set(0.8, 1.2, 0.8); head.position.y = 4.2; this.mesh.add(head);
            
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({color: 0x000000}));
            mouth.position.set(0, 4.0, -0.3); this.mesh.add(mouth);
            
            const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 6), pale);
            armL.position.set(-0.4, 2.0, 0); armL.rotation.z = 0.3; this.mesh.add(armL);
            const armR = armL.clone(); armR.position.x = 0.4; armR.rotation.z = -0.3; this.mesh.add(armR);
            
            this.addLegs(pale, 1.0);
        }
        else if (type === 'dj') {
            // Alien DJ
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), new THREE.MeshStandardMaterial({ color: 0x00aaff }));
            body.scale.set(1, 1.2, 1); body.position.y = 2.0; this.mesh.add(body);
            
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), new THREE.MeshStandardMaterial({ color: 0x00aaff }));
            head.position.y = 3.2; this.mesh.add(head);
            
            const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.2), new THREE.MeshBasicMaterial({color: 0x111111}));
            glasses.position.set(0, 3.3, -0.5); this.mesh.add(glasses);
            
            const table = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 1), new THREE.MeshStandardMaterial({color: 0x8b5a2b}));
            table.position.set(0, 1.2, -1); this.mesh.add(table);
            
            const vinyl1 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), new THREE.MeshStandardMaterial({color: 0x111111}));
            vinyl1.position.set(-0.4, 1.3, -1); this.mesh.add(vinyl1);
            const vinyl2 = vinyl1.clone(); vinyl2.position.x = 0.4; this.mesh.add(vinyl2);
        }
        else if (type === 'barista') {
            // Barista de café
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2, 12), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
            body.position.y = 1.5; this.mesh.add(body);
            
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffddaa }));
            head.position.y = 3.0; this.mesh.add(head);
            
            const hat = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshStandardMaterial({ color: 0xcc2222 }));
            hat.position.y = 3.3; this.mesh.add(hat);
            
            const cart = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 1.5), new THREE.MeshStandardMaterial({color: 0x888888, metalness: 0.8}));
            cart.position.set(0, 0.75, -1); this.mesh.add(cart);
        }
        else if (type === 'cloak') {
            // El caminante
            const body = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 }));
            body.position.y = 2.25; this.mesh.add(body);
            
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({color: 0xffaa00}));
            eye.position.set(0, 3.5, -0.8); this.mesh.add(eye);
            
            const light = new THREE.PointLight(0xffaa00, 2, 5); light.position.set(0, 3.5, -0.8); this.mesh.add(light);
        }
        else if (type === 'slender') {
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4.5, 8), dark);
            body.position.y = 2.5; this.mesh.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), pale);
            head.position.y = 5.0; this.mesh.add(head);
            this.addLegs(dark, 0.5);
            this.addArms(dark, 2.5);
        }
        else {
            // Smiler por defecto
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.9, 3.8, 12), dark);
            body.rotation.x = Math.PI / 2; body.rotation.z = Math.PI / 10; body.position.y = 2.0; this.mesh.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 24, 24), pale);
            head.scale.set(1, 1.3, 0.9); head.position.set(0, 2.6, -2.1); this.mesh.add(head);
            const smile = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.1, 12, 24, Math.PI), red);
            smile.position.set(0, 2.2, -2.7); smile.rotation.x = Math.PI / 2; smile.rotation.z = Math.PI; this.mesh.add(smile);
            this.addLegs(dark, 2.0);
            this.addArms(dark, 2.2);
        }
    }

    addLegs(mat, height) {
        const legPositions = [{x: -0.45, z: -0.6}, {x: 0.45, z: -0.6}, {x: -0.45, z: 0.6}, {x: 0.45, z: 0.6}];
        legPositions.forEach(pos => {
            const leg = new THREE.Group(); leg.position.set(pos.x, height, pos.z);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, height, 8), mat);
            lower.position.y = -height/2; leg.add(lower);
            this.mesh.add(leg); this.legs.push({ group: leg, lower: lower });
        });
    }

    addArms(mat, height) {
        const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 3.5, 8), mat);
        armL.position.set(-0.7, height, 0); armL.rotation.z = 0.25; this.mesh.add(armL);
        const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 3.5, 8), mat);
        armR.position.set(0.7, height, 0); armR.rotation.z = -0.25; this.mesh.add(armR);
    }

    update(dt, playerPos, playerDir, maze, isPlayerHidden) {
        if (this.isFrozen) return;
        const dx = playerPos.x - this.mesh.position.x, dz = playerPos.z - this.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        this.mesh.rotation.y = Math.atan2(dx, dz);

        if (dist < 35 && dist > 1.2 && !isPlayerHidden) {
            const nextX = this.mesh.position.x + (dx / dist) * this.speed * dt;
            const nextZ = this.mesh.position.z + (dz / dist) * this.speed * dt;
            if (!maze.isWall(nextX, this.mesh.position.z)) this.mesh.position.x = nextX;
            if (!maze.isWall(this.mesh.position.x, nextZ)) this.mesh.position.z = nextZ;
            
            if (this.legs.length > 0) {
                const time = performance.now() * 0.01;
                this.legs.forEach((leg, i) => { leg.lower.rotation.x += Math.sin(time + (i % 2 === 0 ? 0 : Math.PI)) * 0.1; });
            }
        }

        if (this.type === 'smiler' || this.type === 'skinny' || this.type === 'cloak') {
            const dirToMonster = { x: dx / dist, z: dz / dist };
            const dot = playerDir.x * dirToMonster.x + playerDir.z * dirToMonster.z;
            this.isFrozen = dot > 0.7 && !isPlayerHidden;
        }
    }

    setPosition(x, z) { this.mesh.position.set(x, 0, z); }
}

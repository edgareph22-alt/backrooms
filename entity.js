import * as THREE from 'three';

export class Monster {
    constructor(scene, type = 'smiler') {
        this.mesh = new THREE.Group();
        this.speed = 6.0;
        this.isFrozen = false;
        this.type = type;
        
        if (type === 'scarecrow') {
            this.buildScarecrow();
        } else {
            this.buildSmiler();
        }
        scene.add(this.mesh);
    }

    buildSmiler() {
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
        const paleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444 }); 
        const redMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3.5, 8), darkMat);
        body.rotation.x = Math.PI / 2; body.rotation.z = Math.PI / 8; body.position.y = 2.0;
        this.mesh.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), paleMat);
        head.scale.set(1, 1.2, 0.9); head.position.set(0, 2.4, -2.0);
        this.mesh.add(head);

        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), blackMat);
        eyeL.position.set(-0.3, 2.6, -2.6); this.mesh.add(eyeL);
        const eyeR = eyeL.clone(); eyeR.position.x = 0.3; this.mesh.add(eyeR);

        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), redMat);
        nose.position.set(0, 2.3, -2.8); this.mesh.add(nose);

        const smile = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 8, 16, Math.PI), redMat);
        smile.position.set(0, 2.0, -2.6); smile.rotation.x = Math.PI / 2; smile.rotation.z = Math.PI;
        this.mesh.add(smile);

        this.legs = [];
        const legPositions = [{x: -0.6, z: -1.0}, {x: 0.6, z: -1.0}, {x: -0.6, z: 1.0}, {x: 0.6, z: 1.0}];
        legPositions.forEach(pos => {
            const leg = new THREE.Group();
            leg.position.set(pos.x, 2.0, pos.z);
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.5, 6), darkMat);
            upper.position.y = -0.75; upper.rotation.x = pos.z < 0 ? 0.5 : -0.5; leg.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6), darkMat);
            lower.position.set(0, -1.5, pos.z < 0 ? 0.6 : -0.6); lower.rotation.x = pos.z < 0 ? -1.0 : 1.0; leg.add(lower);
            this.mesh.add(leg); this.legs.push({ group: leg, upper: upper, lower: lower });
        });

        const light = new THREE.PointLight(0xff0000, 4, 10);
        light.position.set(0, 2.5, -2); this.mesh.add(light);
    }

    buildScarecrow() {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 1 });
        const clothMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 1 });
        const hatMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 1 });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

        // Poste central
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.5, 6), woodMat);
        pole.position.y = 2.25; this.mesh.add(pole);

        // Travesaño (brazos)
        const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), woodMat);
        cross.rotation.z = Math.PI / 2; cross.position.y = 3.2; this.mesh.add(cross);

        // Cuerpo de saco
        const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 2, 8), clothMat);
        sack.position.y = 2.5; this.mesh.add(sack);

        // Cabeza de saco
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), clothMat);
        head.position.y = 3.8; this.mesh.add(head);

        // Sombrero
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.5, 8), hatMat);
        hat.position.y = 4.2; this.mesh.add(hat);

        // Ojos brillantes
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), glowMat);
        eyeL.position.set(-0.2, 3.9, -0.4); this.mesh.add(eyeL);
        const eyeR = eyeL.clone(); eyeR.position.x = 0.2; this.mesh.add(eyeR);

        this.legs = [];
        const light = new THREE.PointLight(0xffaa00, 4, 12);
        light.position.set(0, 3.5, -0.5); this.mesh.add(light);
    }

    update(dt, playerPos, playerDir, maze, isPlayerHidden) {
        if (this.isFrozen) return;

        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.hypot(dx, dz);

        this.mesh.rotation.y = Math.atan2(dx, dz);

        if (dist < 30 && dist > 1.2 && !isPlayerHidden) {
            const nextX = this.mesh.position.x + (dx / dist) * this.speed * dt;
            const nextZ = this.mesh.position.z + (dz / dist) * this.speed * dt;

            if (!maze.isWall(nextX, this.mesh.position.z)) this.mesh.position.x = nextX;
            if (!maze.isWall(this.mesh.position.x, nextZ)) this.mesh.position.z = nextZ;

            if (this.legs && this.legs.length > 0) {
                const time = performance.now() * 0.01;
                this.legs.forEach((leg, i) => {
                    leg.upper.rotation.x += Math.sin(time + (i % 2 === 0 ? 0 : Math.PI)) * 0.1;
                });
            }
        }

        // El jugador debe estar mirándolo para congelarlo (solo funciona con el Smiler)
        if (this.type === 'smiler') {
            const dirToMonster = { x: dx / dist, z: dz / dist };
            const dot = playerDir.x * dirToMonster.x + playerDir.z * dirToMonster.z;
            this.isFrozen = dot > 0.7 && !isPlayerHidden;
        }
    }

    setPosition(x, z) {
        this.mesh.position.set(x, 0, z);
    }
}

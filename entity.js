import * as THREE from 'three';

export class Monster {
    constructor(scene, type = 'clown') {
        this.mesh = new THREE.Group();
        this.speed = 6.0;
        this.isFrozen = false;
        this.type = type;
        this.aggroRange = 28;
        this.catchRange = 1.8;
        this.buildModel();
        scene.add(this.mesh);
    }

    buildModel() {
        while (this.mesh.children.length) this.mesh.remove(this.mesh.children[0]);
        this.legs = [];

        if (this.type === 'scarecrow') {
            this.buildScarecrow();
        } else {
            this.buildClown();
        }
    }

    buildClown() {
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.85, metalness: 0.3 });
        const paleMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.4, metalness: 0.2 });
        const redMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        const eyeGlow = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 3.8, 10), darkMat);
        body.rotation.x = Math.PI / 2;
        body.rotation.z = Math.PI / 7;
        body.position.y = 2.1;
        this.mesh.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 20), paleMat);
        head.scale.set(1.05, 1.25, 0.95);
        head.position.set(0, 2.55, -2.15);
        this.mesh.add(head);

        const eyeGeo = new THREE.SphereGeometry(0.18, 10, 10);
        const eyeL = new THREE.Mesh(eyeGeo, blackMat);
        eyeL.position.set(-0.32, 2.75, -2.85);
        this.mesh.add(eyeL);
        const eyeR = eyeL.clone();
        eyeR.position.x = 0.32;
        this.mesh.add(eyeR);

        const pupilGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const pupilL = new THREE.Mesh(pupilGeo, eyeGlow);
        pupilL.position.set(-0.32, 2.75, -2.95);
        this.mesh.add(pupilL);
        const pupilR = pupilL.clone();
        pupilR.position.x = 0.32;
        this.mesh.add(pupilR);

        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), redMat);
        nose.position.set(0, 2.4, -3.0);
        this.mesh.add(nose);

        const smile = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.09, 8, 20, Math.PI), redMat);
        smile.position.set(0, 2.05, -2.75);
        smile.rotation.x = Math.PI / 2;
        smile.rotation.z = Math.PI;
        this.mesh.add(smile);

        const legPositions = [
            {x: -0.65, z: -1.1}, {x: 0.65, z: -1.1},
            {x: -0.65, z: 1.1}, {x: 0.65, z: 1.1}
        ];

        legPositions.forEach(pos => {
            const leg = new THREE.Group();
            leg.position.set(pos.x, 2.1, pos.z);

            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 8), darkMat);
            upper.position.y = -0.8;
            upper.rotation.x = pos.z < 0 ? 0.55 : -0.55;
            leg.add(upper);

            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 1.55, 8), darkMat);
            lower.position.set(0, -1.55, pos.z < 0 ? 0.65 : -0.65);
            lower.rotation.x = pos.z < 0 ? -1.05 : 1.05;
            leg.add(lower);

            this.mesh.add(leg);
            this.legs.push({ group: leg, upper: upper, lower: lower });
        });

        const light = new THREE.PointLight(0xff0000, 3.5, 12);
        light.position.set(0, 2.6, -2.2);
        this.mesh.add(light);

        const halo = new THREE.PointLight(0xff2222, 1.2, 6);
        halo.position.set(0, 3.2, -1.5);
        this.mesh.add(halo);
    }

    buildScarecrow() {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9, metalness: 0.05 });
        const clothMat = new THREE.MeshStandardMaterial({ color: 0x2a3a1a, roughness: 0.95 });
        const strawMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.85 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4.2, 8), woodMat);
        pole.position.y = 2.1;
        this.mesh.add(pole);

        const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8), woodMat);
        arms.rotation.z = Math.PI / 2;
        arms.position.y = 3.3;
        this.mesh.add(arms);

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.0, 10), clothMat);
        body.position.y = 2.4;
        this.mesh.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.65, 14, 14), strawMat);
        head.position.y = 3.9;
        this.mesh.add(head);

        const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 16), darkMat);
        hatBrim.position.y = 4.35;
        this.mesh.add(hatBrim);
        const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.55, 12), darkMat);
        hatTop.position.y = 4.65;
        this.mesh.add(hatTop);

        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), eyeMat);
        eyeL.position.set(-0.22, 4.0, 0.55);
        this.mesh.add(eyeL);
        const eyeR = eyeL.clone();
        eyeR.position.x = 0.22;
        this.mesh.add(eyeR);

        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.08), darkMat);
        mouth.position.set(0, 3.7, 0.58);
        this.mesh.add(mouth);

        const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 1.4, 6), strawMat);
        armL.position.set(-1.5, 3.3, 0);
        armL.rotation.z = 0.3;
        this.mesh.add(armL);
        const armR = armL.clone();
        armR.position.x = 1.5;
        armR.rotation.z = -0.3;
        this.mesh.add(armR);

        const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 1.8, 6), clothMat);
        legL.position.set(-0.3, 0.9, 0);
        this.mesh.add(legL);
        const legR = legL.clone();
        legR.position.x = 0.3;
        this.mesh.add(legR);

        const light = new THREE.PointLight(0xff8800, 2.8, 14);
        light.position.set(0, 3.8, 0.8);
        this.mesh.add(light);
    }

    update(dt, playerPos, playerDir, maze, isHidden = false) {
        if (this.isFrozen || isHidden) {
            if (isHidden) this.isFrozen = true;
            return;
        }

        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist > 0.1) {
            this.mesh.rotation.y = Math.atan2(dx, dz);
        }

        if (dist < this.aggroRange && dist > this.catchRange) {
            const nextX = this.mesh.position.x + (dx / dist) * this.speed * dt;
            const nextZ = this.mesh.position.z + (dz / dist) * this.speed * dt;

            if (!maze.isWall(nextX, this.mesh.position.z)) this.mesh.position.x = nextX;
            if (!maze.isWall(this.mesh.position.x, nextZ)) this.mesh.position.z = nextZ;

            if (this.type === 'clown' && this.legs.length) {
                const time = performance.now() * 0.012;
                this.legs.forEach((leg, i) => {
                    leg.upper.rotation.x = (i % 2 === 0 ? 0.5 : -0.5) + Math.sin(time + i) * 0.35;
                });
            }
        }

        if (dist > 0.5) {
            const dirToMonster = { x: dx / dist, z: dz / dist };
            const dot = playerDir.x * dirToMonster.x + playerDir.z * dirToMonster.z;
            this.isFrozen = dot > 0.65;
        }
    }

    setPosition(x, z) {
        this.mesh.position.set(x, 0, z);
    }

    setType(type) {
        this.type = type;
        this.buildModel();
    }
}

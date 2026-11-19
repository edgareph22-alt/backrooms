import * as THREE from 'three';

export class Monster {
    constructor(scene, type = 'clown') {
        this.mesh = new THREE.Group();
        this.speed = 5.5;
        this.isFrozen = false;
        this.type = type;
        this.aggroRange = 26;
        this.catchRange = 1.7;
        this.buildModel();
        scene.add(this.mesh);
    }

    buildModel() {
        while (this.mesh.children.length) this.mesh.remove(this.mesh.children[0]);
        this.legs = [];
        if (this.type === 'scarecrow') this.buildScarecrow();
        else this.buildClown();
    }

    buildClown() {
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.85, metalness: 0.25 });
        const paleMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.4 });
        const redMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        const eyeGlow = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.85, 3.6, 10), darkMat);
        body.rotation.x = Math.PI / 2;
        body.rotation.z = Math.PI / 7;
        body.position.y = 2.0;
        this.mesh.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 18), paleMat);
        head.scale.set(1.05, 1.22, 0.95);
        head.position.set(0, 2.45, -2.05);
        this.mesh.add(head);

        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), blackMat);
        eyeL.position.set(-0.3, 2.65, -2.7);
        this.mesh.add(eyeL);
        const eyeR = eyeL.clone(); eyeR.position.x = 0.3; this.mesh.add(eyeR);

        const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeGlow);
        pupilL.position.set(-0.3, 2.65, -2.8);
        this.mesh.add(pupilL);
        const pupilR = pupilL.clone(); pupilR.position.x = 0.3; this.mesh.add(pupilR);

        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), redMat);
        nose.position.set(0, 2.3, -2.9);
        this.mesh.add(nose);

        const smile = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 8, 16, Math.PI), redMat);
        smile.position.set(0, 1.95, -2.6);
        smile.rotation.x = Math.PI / 2;
        smile.rotation.z = Math.PI;
        this.mesh.add(smile);

        const legPositions = [
            {x: -0.6, z: -1.0}, {x: 0.6, z: -1.0},
            {x: -0.6, z: 1.0}, {x: 0.6, z: 1.0}
        ];
        legPositions.forEach(pos => {
            const leg = new THREE.Group();
            leg.position.set(pos.x, 2.0, pos.z);
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.5, 6), darkMat);
            upper.position.y = -0.75;
            upper.rotation.x = pos.z < 0 ? 0.5 : -0.5;
            leg.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 1.45, 6), darkMat);
            lower.position.set(0, -1.45, pos.z < 0 ? 0.55 : -0.55);
            lower.rotation.x = pos.z < 0 ? -1.0 : 1.0;
            leg.add(lower);
            this.mesh.add(leg);
            this.legs.push({ upper });
        });

        const light = new THREE.PointLight(0xff0000, 3.2, 11);
        light.position.set(0, 2.5, -2.1);
        this.mesh.add(light);
    }

    buildScarecrow() {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
        const clothMat = new THREE.MeshStandardMaterial({ color: 0x2a3a1a, roughness: 0.95 });
        const strawMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.85 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 4.0, 8), woodMat);
        pole.position.y = 2.0; this.mesh.add(pole);

        const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.0, 8), woodMat);
        arms.rotation.z = Math.PI / 2; arms.position.y = 3.15; this.mesh.add(arms);

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.9, 10), clothMat);
        body.position.y = 2.3; this.mesh.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), strawMat);
        head.position.y = 3.7; this.mesh.add(head);

        const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.07, 14), darkMat);
        hatBrim.position.y = 4.15; this.mesh.add(hatBrim);
        const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 10), darkMat);
        hatTop.position.y = 4.45; this.mesh.add(hatTop);

        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
        eyeL.position.set(-0.2, 3.8, 0.5); this.mesh.add(eyeL);
        const eyeR = eyeL.clone(); eyeR.position.x = 0.2; this.mesh.add(eyeR);

        const light = new THREE.PointLight(0xff8800, 2.5, 12);
        light.position.set(0, 3.6, 0.7); this.mesh.add(light);
    }

    update(dt, playerPos, playerDir, maze, isHidden = false) {
        if (this.isFrozen || isHidden) {
            if (isHidden) this.isFrozen = true;
            return;
        }

        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist > 0.1) this.mesh.rotation.y = Math.atan2(dx, dz);

        if (dist < this.aggroRange && dist > this.catchRange) {
            const nextX = this.mesh.position.x + (dx / dist) * this.speed * dt;
            const nextZ = this.mesh.position.z + (dz / dist) * this.speed * dt;
            if (!maze.isWall(nextX, this.mesh.position.z)) this.mesh.position.x = nextX;
            if (!maze.isWall(this.mesh.position.x, nextZ)) this.mesh.position.z = nextZ;

            if (this.type === 'clown' && this.legs.length) {
                const time = performance.now() * 0.012;
                this.legs.forEach((leg, i) => {
                    leg.upper.rotation.x = (i % 2 === 0 ? 0.5 : -0.5) + Math.sin(time + i) * 0.3;
                });
            }
        }

        if (dist > 0.5) {
            const dirToM = { x: dx / dist, z: dz / dist };
            const dot = playerDir.x * dirToM.x + playerDir.z * dirToM.z;
            this.isFrozen = dot > 0.65;
        }
    }

    setPosition(x, z) {
        this.mesh.position.set(x, 0, z);
    }
}

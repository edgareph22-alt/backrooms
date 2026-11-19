export class MazeGenerator {
    constructor(size, style = 'backrooms') {
        this.size = size;
        this.style = style;
        this.grid = [];
        this.generate();
    }

    generate() {
        this.grid = Array(this.size).fill().map(() => Array(this.size).fill(1));
        
        const stack = [{ x: 1, y: 1 }];
        this.grid[1][1] = 0;

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const dirs = [
                { dx: 0, dy: -2 }, { dx: 2, dy: 0 },
                { dx: 0, dy: 2 }, { dx: -2, dy: 0 }
            ];

            const valid = dirs.filter(d => {
                const nx = current.x + d.dx, ny = current.y + d.dy;
                return nx > 0 && nx < this.size - 1 && ny > 0 && ny < this.size - 1 && this.grid[ny][nx] === 1;
            });

            if (valid.length > 0) {
                const next = valid[Math.floor(Math.random() * valid.length)];
                const nx = current.x + next.dx, ny = current.y + next.dy;
                
                this.grid[ny][nx] = 0;
                this.grid[current.y + next.dy / 2][current.x + next.dx / 2] = 0;
                stack.push({ x: nx, y: ny });
            } else {
                stack.pop();
            }
        }

        // Menos abierto para que no se sienta "despejado"
        const openness = this.style === 'forest' ? this.size * 2.8 : this.size * 1.4;
        for (let i = 0; i < openness; i++) {
            const x = 1 + Math.floor(Math.random() * (this.size - 2));
            const y = 1 + Math.floor(Math.random() * (this.size - 2));
            this.grid[y][x] = 0;
        }

        this.grid[1][1] = 0;
        this.grid[this.size - 2][this.size - 2] = 0;
        this.grid[this.size - 3][this.size - 2] = 0;
        this.grid[this.size - 2][this.size - 3] = 0;

        if (this.style === 'forest') {
            for (let i = 0; i < 5; i++) {
                const cx = 2 + Math.floor(Math.random() * (this.size - 4));
                const cy = 2 + Math.floor(Math.random() * (this.size - 4));
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx > 0 && nx < this.size - 1 && ny > 0 && ny < this.size - 1) {
                            this.grid[ny][nx] = 0;
                        }
                    }
                }
            }
        }
    }

    isWall(x, y) {
        const cx = Math.floor(x / 10);
        const cy = Math.floor(y / 10);
        if (cx < 0 || cx >= this.size || cy < 0 || cy >= this.size) return true;
        return this.grid[cy][cx] === 1;
    }
}

const fs = require('fs');
const geoms = JSON.parse(fs.readFileSync('src/data/road_geometries.json', 'utf8'));

const jData = {
  J1: { inc: ['R11','R12','R13','R14'], outg: ['R21','R31','R41','R51'] },
  J2: { inc: ['R11','R32','R42','R62','R72','R52','R23','R25','R26'], outg: [] },
  J3: { inc: ['R31','R32','R35','R38','R13','R23','R53','R83','R93'], outg: [] },
  J4: { inc: ['R42','R45','R46','R49','R14','R54','R64','R94'], outg: [] },
  J5: { inc: ['R52','R53','R54','R57','R58'], outg: [] },
  J6: { inc: ['R62','R64','R610'], outg: [] },
  J7: { inc: ['R72','R75','R710'], outg: [] },
  J8: { inc: ['R83','R85','R89'], outg: [] },
  J9: { inc: ['R93','R94','R98'], outg: [] },
  J10: { inc: ['R106','R107'], outg: [] }
};

function lineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    let denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denom == 0) return null;
    let ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    return {
        x: x1 + ua * (x2 - x1),
        y: y1 + ua * (y2 - y1)
    };
}

const out = {};

for (const jId of Object.keys(jData)) {
    const inc = jData[jId].inc;
    let pts = [];
    
    // We want the intersection of the extended last segments
    for (let i=0; i<inc.length; i++) {
        for (let j=i+1; j<inc.length; j++) {
            const rA = geoms[inc[i]];
            const rB = geoms[inc[j]];
            if (!rA || !rB || rA.length < 2 || rB.length < 2) continue;
            
            const p1 = rA[rA.length-2];
            const p2 = rA[rA.length-1];
            
            const p3 = rB[rB.length-2];
            const p4 = rB[rB.length-1];
            
            const inter = lineIntersect(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]);
            if (inter) {
               // Calculate how far inter is from the original endpoints to ensure they actually cross nearby
               const distA = Math.sqrt((inter.x - p2[0])**2 + (inter.y - p2[1])**2);
               const distB = Math.sqrt((inter.x - p4[0])**2 + (inter.y - p4[1])**2);
               if (distA < 0.005 && distB < 0.005) {
                   pts.push([inter.x, inter.y]);
               }
            }
        }
    }
    
    if (pts.length > 0) {
        let ax = 0, ay = 0;
        for (const p of pts) { ax += p[0]; ay += p[1]; }
        ax /= pts.length;
        ay /= pts.length;
        out[jId] = [ax, ay];
    } else {
        out[jId] = null;
    }
}

console.log(JSON.stringify(out, null, 2));

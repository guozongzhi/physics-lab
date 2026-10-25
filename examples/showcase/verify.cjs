// Run: node examples/showcase/verify.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
const html = fs.readFileSync(path.join(root, 'damped-oscillator.html'), 'utf8');
// Test the exact analytical function shipped in the standalone HTML.
const source = html.slice(html.indexOf('function stateAt('), html.indexOf('let k=18'));
const stateAt = vm.runInNewContext(source + ';stateAt');
let samples = 0;
for (const k of [5,18,40]) for (const A of [.1,.4,.6]) {
  for (const c of [0,.8,2*Math.sqrt(k),2*Math.sqrt(k)-1e-7,2*Math.sqrt(k)+1e-7,20]) {
    const initial=stateAt(0,k,c,A);
    assert(Math.abs(initial.x-A)<1e-12 && Math.abs(initial.v)<1e-12);
    let previousEnergy=.5*k*A*A;
    for(let i=0;i<=1200;i++) {
      const t=i/100,{x,v}=stateAt(t,k,c,A),E=.5*v*v+.5*k*x*x;
      assert(Number.isFinite(x) && Number.isFinite(v));
      assert(E<=previousEnergy+1e-10,'Energy must not increase');
      if(c===0)assert(Math.abs(E-.5*k*A*A)<1e-10,'Undamped energy conservation');
      if(c>=2*Math.sqrt(k))assert(x>=-1e-12 && v<=1e-12,'No overshoot at/above critical damping');
      const dt=1e-5,before=stateAt(t-dt,k,c,A),after=stateAt(t+dt,k,c,A);
      assert(Math.abs((after.x-before.x)/(2*dt)-v)<1e-6,'Position/velocity consistency');
      assert(Math.abs((after.v-before.v)/(2*dt)+c*v+k*x)<1e-5,'ODE residual');
      previousEnergy=E;samples++;
    }
  }
}
assert(!/<(?:script|link)[^>]+(?:src|href)=/i.test(html),'Demo must be standalone');
assert(!/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\b/.test(html),'No network or storage');
console.log(`Oscillator: ${samples} analytical samples passed`);
for (const filename of ['helmholtz.obj','cyclotron.obj']) {
  const vertices=[],faces=[];
  const data=fs.readFileSync(path.join(root,filename),'utf8');
  assert(Buffer.byteLength(data)<1_000_000);
  for(const line of data.split('\n')) {
    if(line.startsWith('v '))vertices.push(line.split(/\s+/).slice(1).map(Number));
    if(line.startsWith('f '))faces.push(line.split(/\s+/).slice(1).map(x=>Number(x)-1));
  }
  assert(vertices.length>100 && faces.length>100);
  for(const v of vertices)assert(v.length===3 && v.every(Number.isFinite));
  for(const face of faces) {
    assert(face.length>=3 && face.every(i=>Number.isInteger(i)&&i>=0&&i<vertices.length));
    for(let i=1;i<face.length-1;i++) {
      const a=vertices[face[0]],b=vertices[face[i]],c=vertices[face[i+1]];
      const u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]);
      const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      assert(Math.hypot(...cross)>1e-10,`${filename}: non-degenerate triangulation`);
    }
  }
  console.log(`${filename}: ${vertices.length} vertices, ${faces.length} faces passed`);
}
for(const item of JSON.parse(fs.readFileSync(path.join(root,'curated.json')))) {
  assert(fs.existsSync(path.join(root,item.file)) && fs.existsSync(path.join(root,item.cover)));
  assert(item.description && item.title);
}
console.log('Curated manifest: all three files and covers present');

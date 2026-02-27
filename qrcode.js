(function(g){'use strict';
/* minimal QR (Byte, ECC M, v1..10) */
const CAP=[0,14,26,42,62,84,106,122,152,180,213],ECC=[0,10,16,26,36,48,64,72,88,110,130],TOTAL=[0,26,44,70,100,134,172,196,242,292,346];
const GF_EXP=new Array(512),GF_LOG=new Array(256);(function(){let x=1;for(let i=0;i<255;i++){GF_EXP[i]=x;GF_LOG[x]=i;x<<=1;if(x&0x100)x^=0x11D;}for(let i=255;i<512;i++)GF_EXP[i]=GF_EXP[i-255];})();
const gfMul=(a,b)=>a&&b?GF_EXP[GF_LOG[a]+GF_LOG[b]]:0;
const rsGen=(deg)=>{let p=[1];for(let i=0;i<deg;i++){const n=new Array(p.length+1).fill(0);for(let j=0;j<p.length;j++){n[j]^=gfMul(p[j],GF_EXP[i]);n[j+1]^=p[j];}p=n;}return p;};
const rsRem=(data,gen)=>{const r=data.slice();for(let i=0;i<data.length-(gen.length-1);i++){const f=r[i];if(!f)continue;for(let j=1;j<gen.length;j++)r[i+j]^=gfMul(gen[j],f);}return r.slice(r.length-(gen.length-1));};
const mm=(n,v)=>Array.from({length:n},()=>Array.from({length:n},()=>v));
function drawFinder(m,x,y){for(let dy=-1;dy<=7;dy++)for(let dx=-1;dx<=7;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||yy>=m.length||xx>=m.length)continue;
const on=(dx>=0&&dx<=6&&dy>=0&&dy<=6&&(dx==0||dx==6||dy==0||dy==6||(dx>=2&&dx<=4&&dy>=2&&dy<=4)));m[yy][xx]=on;}}
function drawTiming(m){const n=m.length;for(let i=8;i<n-8;i++){const on=(i%2)==0;if(m[6][i]===null)m[6][i]=on;if(m[i][6]===null)m[i][6]=on;}}
function reserveFormat(m){const n=m.length;for(let i=0;i<9;i++){if(m[8][i]===null)m[8][i]=false;if(m[i][8]===null)m[i][8]=false;}for(let i=n-8;i<n;i++){if(m[8][i]===null)m[8][i]=false;if(m[i][8]===null)m[i][8]=false;}m[8][8]=false;m[n-8][8]=false;}
function isFunc(x,y,n){const inF=(x<=8&&y<=8)||(x>=n-9&&y<=8)||(x<=8&&y>=n-9);if(inF)return true;if(x==6||y==6)return true;if(y==8||x==8)return true;if(x==8&&y==n-8)return true;return false;}
function addData(m,bits){const n=m.length;let i=0,dir=-1;for(let x=n-1;x>0;x-=2){if(x==6)x--;for(let y=(dir==-1?n-1:0);y>=0&&y<n;y+=dir){for(let xx=0;xx<2;xx++){const cx=x-xx;if(m[y][cx]!==null)continue;const bit=i<bits.length?bits[i]:0;m[y][cx]=bit==1;i++;}}}dir=-dir;}}
function mask(m,mid){const n=m.length;for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(isFunc(x,y,n))continue;let inv=false;switch(mid){case 0:inv=((x+y)%2)==0;break;case 1:inv=(y%2)==0;break;case 2:inv=(x%3)==0;break;case 3:inv=((x+y)%3)==0;break;default:inv=((x*y)%2+(x*y)%3)==0;}if(inv)m[y][x]=!m[y][x];}}
function pen(m){const n=m.length;let p=0;for(let y=0;y<n;y++){let c=m[y][0],run=1;for(let x=1;x<n;x++){if(m[y][x]==c){run++;if(run==5)p+=3;else if(run>5)p+=1;}else{c=m[y][x];run=1;}}}for(let x=0;x<n;x++){let c=m[0][x],run=1;for(let y=1;y<n;y++){if(m[y][x]==c){run++;if(run==5)p+=3;else if(run>5)p+=1;}else{c=m[y][x];run=1;}}}for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){const c=m[y][x];if(c==m[y][x+1]&&c==m[y+1][x]&&c==m[y+1][x+1])p+=3;}let dark=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(m[y][x])dark++;const total=n*n;const k=Math.abs(dark*20-total*10)/total;p+=Math.floor(k)*10;return p;}
function buildCW(ver,data){const total=TOTAL[ver],ecc=ECC[ver],cap=total-ecc;const bits=[];const pb=(v,l)=>{for(let i=l-1;i>=0;i--)bits.push((v>>>i)&1);};
pb(0b0100,4);pb(data.length,ver<=9?8:16);for(const b of data)pb(b,8);
const maxBits=cap*8;const rem=maxBits-bits.length;if(rem>0)pb(0,Math.min(4,rem));while(bits.length%8)bits.push(0);
const bytes=[];for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bits[i+j];bytes.push(v);}
let pad=0;while(bytes.length<cap){bytes.push(pad?0x11:0xEC);pad^=1;}
const gen=rsGen(ecc);const r=rsRem(bytes.concat(new Array(ecc).fill(0)),gen);return bytes.concat(r);}
const cwBits=(cw)=>{const b=[];for(const x of cw)for(let i=7;i>=0;i--)b.push((x>>>i)&1);return b;};
function make(text){const bytes=Array.from(new TextEncoder().encode(text));let ver=1;while(ver<=10&&bytes.length>CAP[ver])ver++;if(ver>10)ver=10;
const n=ver*4+17;const m=mm(n,null);drawFinder(m,0,0);drawFinder(m,n-7,0);drawFinder(m,0,n-7);drawTiming(m);m[4*ver+9][8]=true;reserveFormat(m);
addData(m,cwBits(buildCW(ver,bytes.slice(0,CAP[ver]))));
let best=null,bp=1e9;for(let mid=0;mid<=4;mid++){const t=m.map(r=>r.slice());mask(t,mid);const p=pen(t);if(p<bp){bp=p;best=t;}}
for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(best[y][x]===null)best[y][x]=false;return {n, best};}
function toCanvas(canvas,text,opts){opts=opts||{};const width=opts.width||260,margin=(opts.margin??1);const qr=make(text);const n=qr.n;const scale=Math.max(1,Math.floor(width/(n+margin*2)));
const real=scale*(n+margin*2);canvas.width=real;canvas.height=real;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,real,real);ctx.fillStyle='#000';
for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.best[y][x])ctx.fillRect((x+margin)*scale,(y+margin)*scale,scale,scale);}
g.QRCode={toCanvas:(c,t,o)=>Promise.resolve(toCanvas(c,t,o)),toDataURL:(t,o)=>{const c=document.createElement('canvas');toCanvas(c,t,o);return Promise.resolve(c.toDataURL('image/png'));}};
})(window);

/*
  Tiny QR generator (browser) - builds QR Code Model 2 for byte mode, error correction L.
  This is a compact adaptation inspired by "qrcode-generator" style APIs.
  For this prototype: good enough for URLs and short text.
*/
(function(global){
  // ---- Galois field tables for Reed-Solomon ----
  const EXP = new Array(512);
  const LOG = new Array(256);
  (function initGF(){
    let x=1;
    for(let i=0;i<255;i++){
      EXP[i]=x;
      LOG[x]=i;
      x<<=1;
      if(x & 0x100) x ^= 0x11d;
    }
    for(let i=255;i<512;i++) EXP[i]=EXP[i-255];
  })();

  function gfMul(a,b){
    if(a===0||b===0) return 0;
    return EXP[LOG[a]+LOG[b]];
  }

  function rsGeneratorPoly(deg){
    let poly=[1];
    for(let i=0;i<deg;i++){
      poly = polyMultiply(poly, [1, EXP[i]]);
    }
    return poly;
  }
  function polyMultiply(p,q){
    const r=new Array(p.length+q.length-1).fill(0);
    for(let i=0;i<p.length;i++){
      for(let j=0;j<q.length;j++){
        r[i+j] ^= gfMul(p[i], q[j]);
      }
    }
    return r;
  }
  function rsComputeRemainder(data, gen){
    const res = data.slice();
    for(let i=0;i<data.length - (gen.length-1); i++){
      const coef = res[i];
      if(coef!==0){
        for(let j=1;j<gen.length;j++){
          res[i+j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(res.length-(gen.length-1));
  }

  // ---- Bit buffer ----
  class BitBuffer{
    constructor(){ this.bits=[]; }
    put(num, length){
      for(let i=length-1;i>=0;i--){
        this.bits.push(((num>>>i)&1)===1);
      }
    }
    putBytes(bytes){
      for(const b of bytes) this.put(b,8);
    }
    get length(){ return this.bits.length; }
  }

  function utf8Bytes(str){
    return new TextEncoder().encode(str);
  }

  // ---- QR capacities table (version 1-10, ECC L) ----
  // Each entry: [version, totalCodewords, ecCodewordsPerBlock, numBlocks]
  const VTABLE = {
    1:[1,26,7,1],
    2:[2,44,10,1],
    3:[3,70,15,1],
    4:[4,100,20,1],
    5:[5,134,26,1],
    6:[6,172,36,1],
    7:[7,196,40,1],
    8:[8,242,48,1],
    9:[9,292,60,1],
    10:[10,346,72,1],
  };

  function chooseVersion(bytesLen){
    // Byte mode capacity for ECC L roughly:
    const cap = {1:17,2:32,3:53,4:78,5:106,6:134,7:154,8:192,9:230,10:271};
    for(let v=1; v<=10; v++){
      if(bytesLen<=cap[v]) return v;
    }
    return 10;
  }

  function makeMatrix(size){
    const m=new Array(size);
    for(let y=0;y<size;y++){
      m[y]=new Array(size).fill(null);
    }
    return m;
  }

  function placeFinder(m, x, y){
    for(let dy=-1;dy<=7;dy++){
      for(let dx=-1;dx<=7;dx++){
        const xx=x+dx, yy=y+dy;
        if(xx<0||yy<0||yy>=m.length||xx>=m.length) continue;
        const on = (dx>=0&&dx<=6&&dy>=0&&dy<=6&&(dx===0||dx===6||dy===0||dy===6|| (dx>=2&&dx<=4&&dy>=2&&dy<=4)));
        m[yy][xx]=on?1:0;
      }
    }
  }

  function placeTiming(m){
    const n=m.length;
    for(let i=8;i<n-8;i++){
      if(m[6][i]===null) m[6][i]=(i%2===0)?1:0;
      if(m[i][6]===null) m[i][6]=(i%2===0)?1:0;
    }
  }

  function reserveFormatInfo(m){
    const n=m.length;
    for(let i=0;i<9;i++){
      if(m[8][i]===null) m[8][i]=0;
      if(m[i][8]===null) m[i][8]=0;
    }
    for(let i=n-8;i<n;i++){
      if(m[8][i]===null) m[8][i]=0;
      if(m[i][8]===null) m[i][8]=0;
    }
    m[n-8][8]=1; // dark module
  }

  function placeAlignment(m, version){
    // For v>=2, alignment patterns positions:
    const posTable={
      2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]
    };
    const pos = posTable[version];
    if(!pos) return;
    const n=m.length;
    for(let i=0;i<pos.length;i++){
      for(let j=0;j<pos.length;j++){
        const cx=pos[i], cy=pos[j];
        // skip overlaps with finders
        if((cx===6 && cy===6) || (cx===6 && cy===n-7) || (cx===n-7 && cy===6)) continue;
        placeAlignAt(m, cx, cy);
      }
    }
  }
  function placeAlignAt(m, cx, cy){
    for(let dy=-2;dy<=2;dy++){
      for(let dx=-2;dx<=2;dx++){
        const xx=cx+dx, yy=cy+dy;
        const dist=Math.max(Math.abs(dx),Math.abs(dy));
        m[yy][xx] = (dist===2 || dist===0) ? 1 : 0;
      }
    }
  }

  function buildDataBits(text, version){
    const bytes = utf8Bytes(text);
    const [v,total,ec,blocks]=VTABLE[version];
    const dataCw = total - ec*blocks;

    const bb=new BitBuffer();
    // mode: byte (0100)
    bb.put(0b0100, 4);
    // length: 8 bits for v1-9, 16 for >=10 (we cap 10)
    bb.put(bytes.length, version<10 ? 8 : 16);
    bb.putBytes(bytes);
    // terminator
    const maxBits = dataCw*8;
    const remain = maxBits - bb.length;
    if(remain>0) bb.put(0, Math.min(4, remain));
    while(bb.length % 8 !== 0) bb.put(0,1);

    // pad bytes
    const pads=[0xec,0x11];
    let padIdx=0;
    const data=[];
    for(let i=0;i<bb.bits.length;i+=8){
      let b=0;
      for(let j=0;j<8;j++) b=(b<<1) | (bb.bits[i+j]?1:0);
      data.push(b);
    }
    while(data.length < dataCw){
      data.push(pads[padIdx%2]); padIdx++;
    }

    // EC
    const gen = rsGeneratorPoly(ec);
    const full = data.concat(new Array(ec).fill(0));
    const rem = rsComputeRemainder(full, gen);
    const codewords = data.concat(rem);

    // interleaving (single block)
    return codewords;
  }

  function mapData(m, codewords){
    const n=m.length;
    let bitIdx=0;
    const getBit = ()=>{
      const cw = codewords[Math.floor(bitIdx/8)];
      const b = (cw >>> (7-(bitIdx%8))) & 1;
      bitIdx++;
      return b;
    };
    let dirUp=true;
    for(let x=n-1; x>0; x-=2){
      if(x===6) x--; // skip timing col
      for(let y=0;y<n;y++){
        const yy = dirUp ? (n-1-y) : y;
        for(let dx=0;dx<2;dx++){
          const xx=x-dx;
          if(m[yy][xx]!==null) continue;
          const b=getBit();
          // mask 0: (row+col)%2==0
          const masked = ((yy+xx)%2===0) ? (b^1) : b;
          m[yy][xx]=masked;
        }
      }
      dirUp=!dirUp;
    }
  }

  function formatBits(eccLevel, mask){
    // ECC L=01, M=00, Q=11, H=10. We use L=01.
    const ecMap = {L:1,M:0,Q:3,H:2};
    let data = (ecMap[eccLevel] << 3) | mask;
    // BCH(15,5)
    let d = data << 10;
    const poly=0b10100110111;
    for(let i=14;i>=10;i--){
      if((d>>i)&1) d ^= poly << (i-10);
    }
    const bits = ((data<<10) | d) ^ 0b101010000010010;
    return bits & 0x7fff;
  }

  function placeFormat(m, bits){
    const n=m.length;
    const b = (i)=> (bits >> i) & 1;
    // around top-left
    const coords1 = [
      [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
    ];
    for(let i=0;i<15;i++){
      const [x,y]=coords1[i];
      m[y][x]=b(14-i);
    }
    // top-right / bottom-left
    const coords2 = [];
    for(let i=0;i<8;i++) coords2.push([n-1-i,8]);
    for(let i=0;i<7;i++) coords2.push([8,n-7+i]);
    for(let i=0;i<15;i++){
      const [x,y]=coords2[i];
      m[y][x]=b(14-i);
    }
  }

  function generateQR(text){
    const bytesLen = utf8Bytes(text).length;
    const version = chooseVersion(bytesLen);
    const size = 21 + (version-1)*4;
    const m = makeMatrix(size);

    placeFinder(m,0,0);
    placeFinder(m,size-7,0);
    placeFinder(m,0,size-7);
    placeTiming(m);
    placeAlignment(m, version);
    reserveFormatInfo(m);

    const codewords = buildDataBits(text, version);
    mapData(m, codewords);
    const fmt = formatBits("L", 0);
    placeFormat(m, fmt);

    // replace any null with 0
    for(let y=0;y<size;y++){
      for(let x=0;x<size;x++){
        if(m[y][x]===null) m[y][x]=0;
      }
    }
    return {version, size, matrix:m};
  }

  function renderToCanvas(text, canvas, scale=6, margin=4){
    const qr = generateQR(text);
    const size = (qr.size + margin*2) * scale;
    canvas.width=size; canvas.height=size;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#fff";
    ctx.fillRect(0,0,size,size);
    ctx.fillStyle="#000";
    for(let y=0;y<qr.size;y++){
      for(let x=0;x<qr.size;x++){
        if(qr.matrix[y][x]){
          ctx.fillRect((x+margin)*scale,(y+margin)*scale,scale,scale);
        }
      }
    }
    return canvas;
  }

  global.TinyQR = { generateQR, renderToCanvas };
})(window);

/* Parça Oturtucu: 3B geometri, hizalama, STL ve 3MF okuma/yazma. Tarayıcıya ve three.js'e bağlı değildir. */
"use strict";
const Core = (() => {
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
  const mv=(R,p)=>[R[0]*p[0]+R[1]*p[1]+R[2]*p[2],R[3]*p[0]+R[4]*p[1]+R[5]*p[2],R[6]*p[0]+R[7]*p[1]+R[8]*p[2]];
  const mm=(A,B)=>{const C=new Array(9);for(let i=0;i<3;i++)for(let j=0;j<3;j++)C[i*3+j]=A[i*3]*B[j]+A[i*3+1]*B[3+j]+A[i*3+2]*B[6+j];return C;};
  const perp=n=>norm(cross(n,Math.abs(n[0])<0.9?[1,0,0]:[0,1,0]));
  function axisAngle(k,t){
    const c=Math.cos(t),s=Math.sin(t),C=1-c,[x,y,z]=k;
    return [c+x*x*C,x*y*C-z*s,x*z*C+y*s, y*x*C+z*s,c+y*y*C,y*z*C-x*s, z*x*C-y*s,z*y*C+x*s,c+z*z*C];
  }
  function rotFromTo(a,b){
    const c=dot(a,b);
    if(c<-0.999999) return axisAngle(perp(a),Math.PI);
    const v=cross(a,b),s=Math.hypot(v[0],v[1],v[2]);
    if(s<1e-12) return [1,0,0,0,1,0,0,0,1];
    return axisAngle([v[0]/s,v[1]/s,v[2]/s],Math.atan2(s,c));
  }

  function parseSTL(buf){
    if(buf.byteLength>=84){
      const dv=new DataView(buf),n=dv.getUint32(80,true);
      if(n>0&&84+50*n===buf.byteLength){
        const pos=new Float32Array(n*9);
        for(let i=0;i<n;i++){const o=84+50*i+12;for(let k=0;k<9;k++)pos[i*9+k]=dv.getFloat32(o+4*k,true);}
        return pos;
      }
    }
    const txt=new TextDecoder().decode(buf),re=/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g,arr=[];let m;
    while((m=re.exec(txt)))arr.push(+m[1],+m[2],+m[3]);
    if(!arr.length||arr.length%9||arr.some(Number.isNaN))throw new Error("Bu dosya STL olarak okunamadı.");
    return new Float32Array(arr);
  }

  function bbox(pos){
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<pos.length;i+=3)for(let k=0;k<3;k++){const v=pos[i+k];if(v<lo[k])lo[k]=v;if(v>hi[k])hi[k]=v;}
    return {lo,hi,size:sub(hi,lo)};
  }

  function topology(pos){
    const n=pos.length/9,bb=bbox(pos),diag=Math.hypot(...bb.size)||1,q=1/(diag*1e-5);
    const map=new Map(),vid=new Int32Array(n*3);let count=0;
    for(let i=0;i<n*3;i++){
      const key=Math.round(pos[i*3]*q)+","+Math.round(pos[i*3+1]*q)+","+Math.round(pos[i*3+2]*q);
      let id=map.get(key);if(id===undefined){id=count++;map.set(key,id);}vid[i]=id;
    }
    const nrm=new Float32Array(n*3),area=new Float32Array(n);
    for(let t=0;t<n;t++){
      const o=t*9,a=[pos[o],pos[o+1],pos[o+2]],b=[pos[o+3],pos[o+4],pos[o+5]],c=[pos[o+6],pos[o+7],pos[o+8]];
      const x=cross(sub(b,a),sub(c,a)),l=Math.hypot(x[0],x[1],x[2]);
      area[t]=l/2;if(l>0){nrm[t*3]=x[0]/l;nrm[t*3+1]=x[1]/l;nrm[t*3+2]=x[2]/l;}
    }
    const adj=new Int32Array(n*3).fill(-1),edges=new Map();
    for(let t=0;t<n;t++)for(let e=0;e<3;e++){
      const a=vid[t*3+e],b=vid[t*3+(e+1)%3];if(a===b)continue;
      const key=a<b?a*count+b:b*count+a,prev=edges.get(key);
      if(prev===undefined)edges.set(key,t*3+e);
      else if(prev>=0){adj[t*3+e]=(prev/3)|0;adj[prev]=t;edges.set(key,-1);}
    }
    return {n,nrm,area,adj,bb};
  }

  function growRegion(pos,topo,seed,tolDeg){
    const {n,nrm,area,adj}=topo,cosT=Math.cos(tolDeg*Math.PI/180);
    const sn=[nrm[seed*3],nrm[seed*3+1],nrm[seed*3+2]];
    const inR=new Uint8Array(n),stack=[seed],tris=[];inR[seed]=1;
    while(stack.length){
      const t=stack.pop();tris.push(t);
      for(let e=0;e<3;e++){
        const nb=adj[t*3+e];if(nb<0||inR[nb])continue;
        /* Komşudan komşuya bak: yumuşak eğri yüzey bütün seçilir, keskin kenarda durur. Tohumdan 80°'den fazla sapma. */
        const d=nrm[nb*3]*nrm[t*3]+nrm[nb*3+1]*nrm[t*3+1]+nrm[nb*3+2]*nrm[t*3+2];
        if(d>=cosT&&nrm[nb*3]*sn[0]+nrm[nb*3+1]*sn[1]+nrm[nb*3+2]*sn[2]>=0.1736){inR[nb]=1;stack.push(nb);}
      }
    }
    let A=0;const c=[0,0,0],nn=[0,0,0],bnd=[];
    for(const t of tris){
      const o=t*9,a=area[t];A+=a;
      for(let k=0;k<3;k++){c[k]+=a*(pos[o+k]+pos[o+3+k]+pos[o+6+k])/3;nn[k]+=a*nrm[t*3+k];}
      for(let e=0;e<3;e++){
        const nb=adj[t*3+e];
        if(nb<0||!inR[nb]){const p=o+e*3,r=o+((e+1)%3)*3;bnd.push(pos[p],pos[p+1],pos[p+2],pos[r],pos[r+1],pos[r+2]);}
      }
    }
    if(!(A>0))return null;
    return {tris:Int32Array.from(tris),area:A,centroid:[c[0]/A,c[1]/A,c[2]/A],normal:norm(nn),boundary:new Float32Array(bnd)};
  }

  function samples(bnd,target){
    let L=0;for(let i=0;i<bnd.length;i+=6)L+=Math.hypot(bnd[i+3]-bnd[i],bnd[i+4]-bnd[i+1],bnd[i+5]-bnd[i+2]);
    const step=L/target||1,out=[];
    for(let i=0;i<bnd.length;i+=6){
      const d=[bnd[i+3]-bnd[i],bnd[i+4]-bnd[i+1],bnd[i+5]-bnd[i+2]],k=Math.max(1,Math.round(Math.hypot(...d)/step));
      for(let j=0;j<k;j++){const f=(j+0.5)/k;out.push([bnd[i]+d[0]*f,bnd[i+1]+d[1]*f,bnd[i+2]+d[2]*f]);}
    }
    return out;
  }

  /* Bütün ağı yüzeylere böler (growRegion ile aynı ölçüt). Her yüzey için bir tohum üçgen ve alan döner. */
  function segment(pos,topo,tolDeg){
    const {n,nrm,area,adj}=topo,cosT=Math.cos(tolDeg*Math.PI/180),lab=new Int32Array(n).fill(-1),out=[],st=[];
    for(let s=0;s<n;s++){if(lab[s]>=0||!(area[s]>0))continue;
      const id=out.length,sn=[nrm[s*3],nrm[s*3+1],nrm[s*3+2]];let A=0;lab[s]=id;st.push(s);
      while(st.length){const t=st.pop();A+=area[t];
        for(let e=0;e<3;e++){const nb=adj[t*3+e];if(nb<0||lab[nb]>=0)continue;
          if(nrm[nb*3]*nrm[t*3]+nrm[nb*3+1]*nrm[t*3+1]+nrm[nb*3+2]*nrm[t*3+2]>=cosT&&nrm[nb*3]*sn[0]+nrm[nb*3+1]*sn[1]+nrm[nb*3+2]*sn[2]>=0.1736){lab[nb]=id;st.push(nb);}}}
      out.push({seed:s,area:A});}
    return out;
  }
  /* Yüzeyin dış hattının imzası: merkezden kenara uzaklıklar, sıralı ve alanın kareköküne bölünmüş. Dönüş ve konumdan bağımsız. */
  function shapeSig(reg){
    const n=reg.normal,u=perp(n),v=cross(n,u),d=samples(reg.boundary,96).map(p=>{const q=sub(p,reg.centroid);return Math.hypot(dot(q,u),dot(q,v));}).sort((a,b)=>a-b);
    const s=Math.sqrt(reg.area)||1,K=24,sig=[];for(let i=0;i<K;i++)sig.push((d[Math.min(d.length-1,Math.floor((i+0.5)/K*d.length))]||0)/s);
    return sig;
  }
  function matchScore(a,sa,b,sb){let d=0;for(let i=0;i<sa.length;i++)d+=Math.abs(sa[i]-sb[i]);return Math.abs(Math.log(b.area/a.area))+2*d/sa.length;}
  /* Parçanın yüzeyini gövdeninkine yüz yüze getirir, sonra kenar hatlarını çakıştıran dönüş açısını arar. */
  function fit(regA,regB){
    const nA=regA.normal,u=perp(nA),v=cross(nA,u);
    const R1=rotFromTo(regB.normal,[-nA[0],-nA[1],-nA[2]]);
    const A2=samples(regA.boundary,160).map(p=>{const d=sub(p,regA.centroid);return [dot(d,u),dot(d,v)];});
    const B2=samples(regB.boundary,160).map(p=>{const d=mv(R1,sub(p,regB.centroid));return [dot(d,u),dot(d,v)];});
    const near=(P,Q)=>{let s=0;for(const p of P){let m=Infinity;for(const q of Q){const dx=p[0]-q[0],dy=p[1]-q[1],d=dx*dx+dy*dy;if(d<m)m=d;}s+=m;}return s/P.length;};
    const score=deg=>{const t=deg*Math.PI/180,c=Math.cos(t),s=Math.sin(t),Br=B2.map(p=>[p[0]*c-p[1]*s,p[0]*s+p[1]*c]);return near(Br,A2)+near(A2,Br);};
    const coarse=[];let best=0,bs=Infinity;
    for(let d=-180;d<180;d+=2){const s=score(d);coarse.push([d,s]);if(s<bs){bs=s;best=d;}}
    for(let d=best-2;d<=best+2;d+=0.1){const s=score(d);if(s<bs){bs=s;best=d;}}
    const scale=Math.sqrt(regA.area),tol=(0.01*scale)**2;
    const ambiguous=coarse.some(([d,s])=>{let g=Math.abs(d-best)%360;if(g>180)g=360-g;return g>15&&s<=bs+tol;});
    return {R1,u,v,theta:best,rms:Math.sqrt(bs/2),scale,ambiguous,areaRatio:regB.area/regA.area};
  }

  /* Bağlantı: çocuk modelin koordinatlarını ebeveyninkine taşır. n,u,v,c ince ayarın ekseni ve merkezi (ebeveyn koordinatında). */
  const tp=R=>[R[0],R[3],R[6],R[1],R[4],R[7],R[2],R[5],R[8]];
  const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const mul=(A,B)=>({R:mm(A.R,B.R),t:add(mv(A.R,B.t),A.t)});
  const inv=M=>{const R=tp(M.R),t=mv(R,M.t);return {R,t:[-t[0],-t[1],-t[2]]};};
  function joint(f,regA,regB,depth){
    const n=regA.normal.slice(),R=mm(axisAngle(n,f.theta*Math.PI/180),f.R1);
    return {R,t:sub(regA.centroid,mv(R,regB.centroid)),n,u:f.u,v:f.v,c:regA.centroid.slice(),spin:0,depth:depth||0,du:0,dv:0};
  }
  function jointM(j){
    /* Dönüş, oturma yüzeyinin merkezi etrafında: önce kendi ekseni (açı), sonra iki eğim. */
    const D=Math.PI/180,Rs=mm(axisAngle(j.u,(j.tiltA||0)*D),mm(axisAngle(j.v,(j.tiltB||0)*D),axisAngle(j.n,j.spin*D))),d=mv(Rs,sub(j.t,j.c)),t=[0,0,0];
    for(let k=0;k<3;k++)t[k]=d[k]+j.c[k]-j.n[k]*j.depth+j.u[k]*j.du+j.v[k]*j.dv;
    return {R:mm(Rs,j.R),t};
  }
  /* Çok noktalı bağlantı: ilk çift yüz yüze getirir (düzlem ve derinlik), bütün çiftlerin merkezleri o düzlemde
     en küçük kareler ile hizalanır (dönüş + kayma). Dönen sapma: noktaların düzlemdeki ortalama uzaklığı. */
  function jointPairs(pairs,depth){
    const A0=pairs[0].ra,B0=pairs[0].rb,n=A0.normal.slice(),u=perp(n),v=cross(n,u),R1=rotFromTo(B0.normal,[-n[0],-n[1],-n[2]]);
    const a=[],b=[];
    for(const p of pairs){const d=sub(p.ra.centroid,A0.centroid),e=mv(R1,sub(p.rb.centroid,B0.centroid));a.push([dot(d,u),dot(d,v)]);b.push([dot(e,u),dot(e,v)]);}
    const m=a.length,ma=[0,1].map(k=>a.reduce((s,x)=>s+x[k],0)/m),mb=[0,1].map(k=>b.reduce((s,x)=>s+x[k],0)/m);
    let s1=0,s2=0;for(let i=0;i<m;i++){const ax=a[i][0]-ma[0],ay=a[i][1]-ma[1],bx=b[i][0]-mb[0],by=b[i][1]-mb[1];s1+=bx*ay-by*ax;s2+=bx*ax+by*ay;}
    const th=m>1?Math.atan2(s1,s2):0,c=Math.cos(th),s=Math.sin(th),tx=ma[0]-(c*mb[0]-s*mb[1]),ty=ma[1]-(s*mb[0]+c*mb[1]);
    let err=0;for(let i=0;i<m;i++){const x=c*b[i][0]-s*b[i][1]+tx-a[i][0],y=s*b[i][0]+c*b[i][1]+ty-a[i][1];err+=x*x+y*y;}
    const R=mm(axisAngle(n,th),R1),t=add(sub(A0.centroid,mv(R,B0.centroid)),add([u[0]*tx,u[1]*tx,u[2]*tx],[v[0]*ty,v[1]*ty,v[2]*ty]));
    return {joint:{R,t,n,u,v,c:A0.centroid.slice(),spin:0,depth:depth||0,du:0,dv:0,pairs},rms:Math.sqrt(err/m)};
  }
  function reverse(j){
    const X=inv(jointM(j));
    return {R:X.R,t:X.t,n:mv(X.R,j.n),u:mv(X.R,j.u),v:mv(X.R,j.v),c:add(mv(X.R,j.c),X.t),spin:0,depth:0,du:0,dv:0};
  }
  function apply(pos,M,C){
    const out=new (C||Float32Array)(pos.length),R=M.R,t=M.t;
    for(let i=0;i<pos.length;i+=3){const x=pos[i],y=pos[i+1],z=pos[i+2];
      out[i]=R[0]*x+R[1]*y+R[2]*z+t[0];out[i+1]=R[3]*x+R[4]*y+R[5]*z+t[1];out[i+2]=R[6]*x+R[7]*y+R[8]*z+t[2];}
    return out;
  }
  function merge(a,b){const o=new Float32Array(a.length+b.length);o.set(a);o.set(b,a.length);return o;}

  function writeSTL(pos){
    const n=pos.length/9,buf=new ArrayBuffer(84+50*n),dv=new DataView(buf);
    dv.setUint32(80,n,true);
    for(let t=0;t<n;t++){
      const o=t*9,a=[pos[o],pos[o+1],pos[o+2]],b=[pos[o+3],pos[o+4],pos[o+5]],c=[pos[o+6],pos[o+7],pos[o+8]];
      const x=norm(cross(sub(b,a),sub(c,a))),w=84+50*t;
      for(let k=0;k<3;k++)dv.setFloat32(w+4*k,x[k],true);
      for(let k=0;k<9;k++)dv.setFloat32(w+12+4*k,pos[o+k],true);
    }
    return new Uint8Array(buf);
  }
  let crcT;
  function crc32(u8){
    if(!crcT){crcT=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[i]=c>>>0;}}
    let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=crcT[(c^u8[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;
  }
  /* ---- zip okuma/yazma (3MF bir zip'tir) ---- */
  const pipe=async(u8,S)=>new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new S("deflate-raw"))).arrayBuffer());
  function zipOpen(buf){
    const dv=new DataView(buf),n=buf.byteLength;let e=-1;
    for(let i=n-22;i>=Math.max(0,n-22-65535);i--)if(dv.getUint32(i,true)===0x06054b50){e=i;break;}
    if(e<0)throw new Error("3MF dosyası açılamadı.");
    const cnt=dv.getUint16(e+10,true),map=new Map(),td=new TextDecoder();let o=dv.getUint32(e+16,true);
    for(let k=0;k<cnt;k++){
      const nl=dv.getUint16(o+28,true);
      map.set(td.decode(new Uint8Array(buf,o+46,nl)),{m:dv.getUint16(o+10,true),cs:dv.getUint32(o+20,true),lo:dv.getUint32(o+42,true)});
      o+=46+nl+dv.getUint16(o+30,true)+dv.getUint16(o+32,true);
    }
    return {names:[...map.keys()],async read(name){
      const f=map.get(name)||map.get(name.replace(/^\//,""));if(!f)return null;
      const d=new Uint8Array(buf,f.lo+30+dv.getUint16(f.lo+26,true)+dv.getUint16(f.lo+28,true),f.cs);
      return f.m===0?d.slice():pipe(d,DecompressionStream);
    }};
  }
  async function zipBuild(entries,compress){
    const parts=[],central=[],te=new TextEncoder();let off=0,cs=0;
    for(const en of entries){
      const nm=te.encode(en.name),crc=crc32(en.data),body=compress?await pipe(en.data,CompressionStream):en.data,m=compress?8:0;
      const lh=new DataView(new ArrayBuffer(30)),ch=new DataView(new ArrayBuffer(46));
      lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,m,true);lh.setUint32(14,crc,true);
      lh.setUint32(18,body.length,true);lh.setUint32(22,en.data.length,true);lh.setUint16(26,nm.length,true);
      ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,m,true);ch.setUint32(16,crc,true);
      ch.setUint32(20,body.length,true);ch.setUint32(24,en.data.length,true);ch.setUint16(28,nm.length,true);ch.setUint32(42,off,true);
      parts.push(new Uint8Array(lh.buffer),nm,body);central.push(new Uint8Array(ch.buffer),nm);off+=30+nm.length+body.length;cs+=46+nm.length;
    }
    const eo=new DataView(new ArrayBuffer(22));
    eo.setUint32(0,0x06054b50,true);eo.setUint16(8,entries.length,true);eo.setUint16(10,entries.length,true);eo.setUint32(12,cs,true);eo.setUint32(16,off,true);
    return [...parts,...central,new Uint8Array(eo.buffer)];
  }
  function cat(chunks){let n=0;chunks.forEach(c=>n+=c.length);const o=new Uint8Array(n);let p=0;chunks.forEach(c=>{o.set(c,p);p+=c.length;});return o;}

  /* ---- 3MF (Bambu Studio / OrcaSlicer projesi) ---- */
  const attr=(tag,name)=>{const m=new RegExp('(?:^|\\s)'+name+'="([^"]*)"').exec(tag);return m?m[1]:null;};
  const unesc=s=>s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
  const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const T3=s=>s?s.trim().split(/\s+/).map(Number):[1,0,0,0,1,0,0,0,1,0,0,0];
  /* 3MF dönüşümü satır vektörüyle çalışır: önce a, sonra b. */
  function tMul(a,b){
    const r=new Array(12);
    for(let i=0;i<4;i++)for(let j=0;j<3;j++)r[i*3+j]=a[i*3]*b[j]+a[i*3+1]*b[3+j]+a[i*3+2]*b[6+j]+(i===3?b[9+j]:0);
    return r;
  }
  function parseModel(text){
    const objs=new Map(),re=/<object\b([^>]*)>([\s\S]*?)<\/object>/g,rx=/\sx="([^"]*)"/,ry=/\sy="([^"]*)"/,rz=/\sz="([^"]*)"/;
    const r1=/\sv1="([^"]*)"/,r2=/\sv2="([^"]*)"/,r3=/\sv3="([^"]*)"/,rp=/\s(?:paint_color|slic3rpe:mmu_segmentation)="([^"]*)"/;
    let m;
    while((m=re.exec(text))){
      const id=attr(m[1],"id"),body=m[2];
      if(/<mesh\b/.test(body)){
        const v=[],t=[],paint=[];let k,any=false;
        const rv=/<vertex\b([^>]*)>/g,rt=/<triangle\b([^>]*)>/g;
        while((k=rv.exec(body)))v.push(+rx.exec(k[1])[1],+ry.exec(k[1])[1],+rz.exec(k[1])[1]);
        while((k=rt.exec(body))){t.push(+r1.exec(k[1])[1],+r2.exec(k[1])[1],+r3.exec(k[1])[1]);const p=rp.exec(k[1]);paint.push(p?p[1]:"");if(p)any=true;}
        objs.set(id,{verts:Float64Array.from(v),tris:Uint32Array.from(t),paint:any?paint:null});
      }else objs.set(id,{comps:[...body.matchAll(/<component\b([^>]*)>/g)].map(c=>({path:attr(c[1],"p:path"),id:attr(c[1],"objectid"),t:T3(attr(c[1],"transform"))}))});
    }
    const items=[...text.matchAll(/<item\b([^>]*)>/g)].map(c=>({id:attr(c[1],"objectid"),t:T3(attr(c[1],"transform"))}));
    return {objs,items};
  }
  async function parse3MF(buf){
    const zip=zipOpen(buf),td=new TextDecoder(),txt=async n=>{const d=await zip.read(n);return d?td.decode(d):null;};
    const rootName=zip.names.find(n=>/^\/?3D\/[^/]+\.model$/i.test(n));if(!rootName)throw new Error("3MF içinde model bulunamadı.");
    const cache=new Map(),model=async p=>{p=p.replace(/^\//,"");if(!cache.has(p)){const t=await txt(p);if(t===null)throw new Error("3MF eksik: "+p);cache.set(p,parseModel(t));}return cache.get(p);};
    const root=await model(rootName),set=new Map(),cfg=await txt("Metadata/model_settings.config");
    if(cfg){let m;const re=/<object\b([^>]*)>([\s\S]*?)<\/object>/g,meta=s=>Object.fromEntries([...s.matchAll(/<metadata key="([^"]+)" value="([^"]*)"/g)].map(x=>[x[1],unesc(x[2])]));
      while((m=re.exec(cfg))){const parts=new Map();let p;const rp=/<part\b([^>]*)>([\s\S]*?)<\/part>/g;
        while((p=rp.exec(m[2])))parts.set(attr(p[1],"id"),{...meta(p[2]),subtype:attr(p[1],"subtype")||"normal_part",
          extra:[...p[2].matchAll(/<metadata key="([^"]+)" value="([^"]*)"/g)].map(x=>[x[1],unesc(x[2])]).filter(([k])=>!/^(name|matrix|extruder|source_)/.test(k))});
        set.set(attr(m[1],"id"),{...meta(m[2].split("<part")[0]),parts});}}
    async function resolve(path,id,T,acc){
      const o=(await model(path)).objs.get(id);if(!o)return;
      if(o.comps){for(const c of o.comps)await resolve(c.path||path,c.id,tMul(c.t,T),acc);return;}
      const v=new Float64Array(o.verts.length);
      for(let i=0;i<v.length;i+=3){const x=o.verts[i],y=o.verts[i+1],z=o.verts[i+2];
        v[i]=x*T[0]+y*T[3]+z*T[6]+T[9];v[i+1]=x*T[1]+y*T[4]+z*T[7]+T[10];v[i+2]=x*T[2]+y*T[5]+z*T[8]+T[11];}
      const det=T[0]*(T[4]*T[8]-T[5]*T[7])-T[1]*(T[3]*T[8]-T[5]*T[6])+T[2]*(T[3]*T[7]-T[4]*T[6]);
      let tris=o.tris;if(det<0){tris=Uint32Array.from(o.tris);for(let i=0;i<tris.length;i+=3){const s=tris[i+1];tris[i+1]=tris[i+2];tris[i+2]=s;}}
      acc.push({id,verts:v,tris,paint:det<0?null:o.paint});
    }
    const starts=root.items.length?root.items:[...root.objs.keys()].map(id=>({id,t:T3()})),items=[];
    for(const it of starts){
      const acc=[],s=set.get(it.id)||{parts:new Map()};await resolve(rootName,it.id,it.t,acc);if(!acc.length)continue;
      const name=s.name||("nesne "+it.id);
      items.push({name,colored:true,parts:acc.map(a=>{const ps=s.parts.get(a.id)||{};return {name:ps.name||name,verts:a.verts,tris:a.tris,paint:a.paint,extruder:+(ps.extruder||s.extruder||1)||1,subtype:ps.subtype||"normal_part",extra:ps.extra||[]};})});
    }
    const project=await zip.read("Metadata/project_settings.config");let colours=null;
    if(project)try{colours=JSON.parse(td.decode(project)).filament_colour||null;}catch(_){}
    return {items,project,colours};
  }
  /* Boyama dizgisi: üçgenin alt bölünme ağacı. Ekranda göstermek için en çok alan kaplayan filamenti bul; dosyaya dizgi aynen yazılır. */
  function paintState(s){
    if(!s)return 0;let i=s.length-1;const w={};
    const nib=()=>i<0?0:parseInt(s[i--],16);
    (function node(a){
      const c=nib(),split=c&3;
      if(!split){let st=c>>2;if(st===3){let n=nib();st=3+n;while(n===15){n=nib();st+=n;}}w[st]=(w[st]||0)+a;return;}
      for(let k=0;k<=split;k++)node(a/(split+1));
    })(1);
    let best=0,bw=0;for(const k in w)if(+k>0&&w[k]>bw){bw=w[k];best=+k;}
    return bw>=0.5?best:0;
  }
  function weld(pos){
    const map=new Map(),v=[],t=new Uint32Array(pos.length/3);
    for(let i=0;i<pos.length;i+=3){const key=pos[i]+","+pos[i+1]+","+pos[i+2];let id=map.get(key);
      if(id===undefined){id=v.length/3;map.set(key,id);v.push(pos[i],pos[i+1],pos[i+2]);}t[i/3]=id;}
    return {verts:Float64Array.from(v),tris:t};
  }
  function soup(parts){
    let n=0;parts.forEach(p=>n+=p.tris.length);const o=new Float32Array(n*3);let k=0;
    parts.forEach(p=>{for(let i=0;i<p.tris.length;i++){const a=p.tris[i]*3;o[k++]=p.verts[a];o[k++]=p.verts[a+1];o[k++]=p.verts[a+2];}});return o;
  }
  /* Tek nesne, her parça kendi filamentiyle: OrcaSlicer ve Bambu Studio bunu çok parçalı tek model olarak açar. */
  async function build3MF(parts,opt){
    const te=new TextEncoder(),nf=v=>String(+v.toPrecision(9)),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    const solid=parts.filter(p=>!p.subtype||p.subtype==="normal_part");
    (solid.length?solid:parts).forEach(p=>{for(let i=0;i<p.verts.length;i++){const k=i%3,v=p.verts[i];if(v<lo[k])lo[k]=v;if(v>hi[k])hi[k]=v;}});
    const c=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]],plate=opt.plate||256,rootId=parts.length+1,uid=(a,b)=>`${String(a).padStart(8,"0")}-${b}-4c03-9d28-80fed5dfa1dc`;
    const ns='xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"';
    const sub=['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" '+ns+'>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n'];
    parts.forEach((p,k)=>{
      sub.push(`  <object id="${k+1}" p:UUID="${uid(k+1,"81cb")}" type="model">\n   <mesh>\n    <vertices>\n`);
      for(let i=0;i<p.verts.length;i+=3)sub.push(`     <vertex x="${nf(p.verts[i]-c[0])}" y="${nf(p.verts[i+1]-c[1])}" z="${nf(p.verts[i+2]-c[2])}"/>\n`);
      sub.push("    </vertices>\n    <triangles>\n");
      for(let i=0;i<p.tris.length;i+=3){const pc=p.paint&&p.paint[i/3];sub.push(`     <triangle v1="${p.tris[i]}" v2="${p.tris[i+1]}" v3="${p.tris[i+2]}"${pc?` paint_color="${pc}"`:""}/>\n`);}
      sub.push("    </triangles>\n   </mesh>\n  </object>\n");
    });
    sub.push(" </resources>\n <build/>\n</model>\n");
    const name=esc(opt.name||"birlesik");
    const rootXml='<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" '+ns+'>\n <metadata name="Application">BambuStudio-01.09.00.00</metadata>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n'
      +`  <object id="${rootId}" p:UUID="${uid(rootId,"61cb")}" type="model">\n   <components>\n`
      +parts.map((p,k)=>`    <component p:path="/3D/Objects/object_1.model" objectid="${k+1}" p:UUID="${uid(k+1,"b206")}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n`).join("")
      +`   </components>\n  </object>\n </resources>\n <build p:UUID="${uid(0,"2c7c")}">\n  <item objectid="${rootId}" p:UUID="${uid(rootId,"3d8f")}" transform="1 0 0 0 1 0 0 0 1 ${nf(plate/2)} ${nf(plate/2)} 0" printable="1"/>\n </build>\n</model>\n`;
    const faces=parts.reduce((s,p)=>s+p.tris.length/3,0);
    const cfg='<?xml version="1.0" encoding="UTF-8"?>\n<config>\n'
      +`  <object id="${rootId}">\n    <metadata key="name" value="${name}"/>\n    <metadata key="extruder" value="${(parts.find(p=>!p.subtype||p.subtype==="normal_part")||parts[0]).extruder}"/>\n    <metadata face_count="${faces}"/>\n`
      +parts.map((p,k)=>`    <part id="${k+1}" subtype="${esc(p.subtype||"normal_part")}">\n      <metadata key="name" value="${esc(p.name)}"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n      <metadata key="extruder" value="${p.extruder}"/>\n`+(p.extra||[]).map(([k,v])=>`      <metadata key="${esc(k)}" value="${esc(v)}"/>\n`).join("")+`      <mesh_stat face_count="${p.tris.length/3}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n    </part>\n`).join("")
      +"  </object>\n</config>\n";
    const entries=[
      {name:"[Content_Types].xml",data:te.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>\n')},
      {name:"_rels/.rels",data:te.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n')},
      {name:"3D/3dmodel.model",data:te.encode(rootXml)},
      {name:"3D/_rels/3dmodel.model.rels",data:te.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n')},
      {name:"3D/Objects/object_1.model",data:te.encode(sub.join(""))},
      {name:"Metadata/model_settings.config",data:te.encode(cfg)}];
    if(opt.project)entries.push({name:"Metadata/project_settings.config",data:opt.project});
    return cat(await zipBuild(entries,true));
  }

  /* ---- Oyuk görünümü: negatif parçayı katı parçadan ekranda çıkarır. ----
     Kesişen üçgenler oyuk çizgisinden bölünür, kalanlar "negatifin içinde mi" testiyle ayrılır; negatifin katı içinde kalan yüzeyi oyuğun duvarı olur.
     Yalnızca görünüm ve tıklama içindir: dosyaya parçalar aynen yazılır, gerçek oymayı dilimleyici yapar. */
  const CEPS=1e-7;
  function cplane(a,b,c){const n=norm(cross(sub(b,a),sub(c,a)));return {n,w:dot(n,a)};}
  function csplit(pl,vs,front,back){
    const n=pl.n,w=pl.w,ts=new Array(vs.length);let type=0;
    for(let i=0;i<vs.length;i++){const t=n[0]*vs[i][0]+n[1]*vs[i][1]+n[2]*vs[i][2]-w,ty=t<-CEPS?2:t>CEPS?1:0;type|=ty;ts[i]=ty;}
    if(type!==3){(type===2?back:front).push(vs);return;}
    const f=[],b=[];
    for(let i=0;i<vs.length;i++){const j=(i+1)%vs.length,ti=ts[i],tj=ts[j],vi=vs[i],vj=vs[j];
      if(ti!==2)f.push(vi);if(ti!==1)b.push(vi);
      if((ti|tj)===3){const d=sub(vj,vi),t=(w-dot(n,vi))/dot(n,d),x=[vi[0]+d[0]*t,vi[1]+d[1]*t,vi[2]+d[2]*t];f.push(x);b.push(x);}}
    if(f.length>=3)front.push(f);if(b.length>=3)back.push(b);
  }
  function segTri(p,q,a,b,c){
    const d=sub(q,p),e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-14)return false;
    const f=1/det,s=sub(p,a),u=f*dot(s,h);if(u<0||u>1)return false;const qv=cross(s,e1),v=f*dot(d,qv);if(v<0||u+v>1)return false;
    const t=f*dot(e2,qv);return t>=0&&t<=1;
  }
  const triTri=(A,B)=>segTri(A[0],A[1],...B)||segTri(A[1],A[2],...B)||segTri(A[2],A[0],...B)||segTri(B[0],B[1],...A)||segTri(B[1],B[2],...A)||segTri(B[2],B[0],...A);
  const cen=vs=>{let x=0,y=0,z=0;for(const v of vs){x+=v[0];y+=v[1];z+=v[2];}return [x/vs.length,y/vs.length,z/vs.length];};
  function carveOne(S,N){
    const T=(m,t)=>[0,1,2].map(k=>{const i=m.tris[t*3+k]*3;return [m.verts[i],m.verts[i+1],m.verts[i+2]];});
    const nS=S.tris.length/3,nN=N.tris.length/3,nb=bbox(N.verts),e=1e-4;
    /* N üçgenleri için 3B ızgara */
    const G=Math.max(1,Math.ceil(Math.cbrt(nN/2))),cs=nb.size.map(s=>(s||1)/G+1e-9),grid=new Map();
    const ci=(v,k)=>Math.min(G-1,Math.max(0,Math.floor((v-nb.lo[k])/cs[k])));
    const NT=[];for(let t=0;t<nN;t++){const tr=T(N,t);NT.push(tr);
      const lo=[0,1,2].map(k=>ci(Math.min(tr[0][k],tr[1][k],tr[2][k]),k)),hi=[0,1,2].map(k=>ci(Math.max(tr[0][k],tr[1][k],tr[2][k]),k));
      for(let i=lo[0];i<=hi[0];i++)for(let j=lo[1];j<=hi[1];j++)for(let l=lo[2];l<=hi[2];l++){const key=(i*G+j)*G+l;let c=grid.get(key);if(!c)grid.set(key,c=[]);c.push(t);}}
    const sBand=new Map(),nBand=new Map(),stamp=new Int32Array(nN).fill(-1),near=new Uint8Array(nS);
    for(let t=0;t<nS;t++){const tr=T(S,t);let out=false;
      for(let k=0;k<3;k++)if(Math.max(tr[0][k],tr[1][k],tr[2][k])<nb.lo[k]-e||Math.min(tr[0][k],tr[1][k],tr[2][k])>nb.hi[k]+e){out=true;break;}
      if(out)continue;near[t]=1;
      const lo=[0,1,2].map(k=>ci(Math.min(tr[0][k],tr[1][k],tr[2][k]),k)),hi=[0,1,2].map(k=>ci(Math.max(tr[0][k],tr[1][k],tr[2][k]),k));
      for(let i=lo[0];i<=hi[0];i++)for(let j=lo[1];j<=hi[1];j++)for(let l=lo[2];l<=hi[2];l++){const c=grid.get((i*G+j)*G+l);if(!c)continue;
        for(const u of c){if(stamp[u]===t)continue;stamp[u]=t;if(triTri(tr,NT[u])){(sBand.get(t)||sBand.set(t,[]).get(t)).push(u);(nBand.get(u)||nBand.set(u,[]).get(u)).push(t);}}}
    }
    const inS=insideTester(S.verts,S.tris),inN=insideTester(N.verts,N.tris);
    if(!sBand.size){
      if(inS(NT[0][0]))0;                       /* negatif tamamen içeride: oyuk açılacak */
      else if(inN(T(S,0)[0]))return {part:{...S,verts:new Float64Array(0),tris:new Uint32Array(0),paint:null},changed:true};
      else return {part:S,changed:false};       /* tamamen dışarıda: değişiklik yok */
    }
    const map=new Map(),v=[],tr=[],paint=[];
    const id=p=>{const k=p[0]+","+p[1]+","+p[2];let i=map.get(k);if(i===undefined){i=v.length/3;map.set(k,i);v.push(p[0],p[1],p[2]);}return i;};
    const emit=(vs,pc)=>{const ids=vs.map(id);for(let i=1;i<ids.length-1;i++){const a=ids[0],b=ids[i],c=ids[i+1];if(a===b||b===c||a===c)continue;tr.push(a,b,c);paint.push(pc);}};
    const cut=(vs,planes)=>{let ps=[vs];for(const pl of planes){const nx=[];for(const q of ps)csplit(pl,q,nx,nx);ps=nx;}return ps;};
    for(let t=0;t<nS;t++){const vs=T(S,t),pc=S.paint?S.paint[t]:"";
      if(sBand.has(t)){for(const q of cut(vs,sBand.get(t).map(u=>cplane(...NT[u]))))if(!inN(cen(q)))emit(q,"");}
      else if(!near[t]||!inN(cen(vs)))emit(vs,pc);}
    for(let u=0;u<nN;u++){const vs=NT[u];
      const ps=nBand.has(u)?cut(vs,nBand.get(u).map(t=>cplane(...T(S,t)))):[vs];
      for(const q of ps)if(inS(cen(q)))emit(q.slice().reverse(),"");}
    return {part:{...S,verts:Float64Array.from(v),tris:Uint32Array.from(tr),paint:paint.some(Boolean)?paint:null},changed:true};
  }
  /* İçeride mi testi: +z yönünde ışın, xy ızgarasıyla hızlandırılmış; kesişme sayısı tekse içeride. */
  function insideTester(verts,tris){
    const n=tris.length/3,bb=bbox(verts),G=Math.max(1,Math.ceil(Math.sqrt(n/3))),cw=(bb.size[0]||1)/G,ch=(bb.size[1]||1)/G,cells=Array.from({length:G*G},()=>[]);
    const cx=x=>Math.min(G-1,Math.max(0,Math.floor((x-bb.lo[0])/cw))),cy=y=>Math.min(G-1,Math.max(0,Math.floor((y-bb.lo[1])/ch)));
    for(let t=0;t<n;t++){const a=tris[t*3]*3,b=tris[t*3+1]*3,c=tris[t*3+2]*3;
      for(let i=cx(Math.min(verts[a],verts[b],verts[c]));i<=cx(Math.max(verts[a],verts[b],verts[c]));i++)
        for(let j=cy(Math.min(verts[a+1],verts[b+1],verts[c+1]));j<=cy(Math.max(verts[a+1],verts[b+1],verts[c+1]));j++)cells[j*G+i].push(t);}
    return p=>{
      if(p[0]<bb.lo[0]||p[0]>bb.hi[0]||p[1]<bb.lo[1]||p[1]>bb.hi[1]||p[2]>bb.hi[2])return false;
      const x=p[0]+1.37e-6,y=p[1]+0.71e-6;let k=0;
      for(const t of cells[cy(y)*G+cx(x)]){const a=tris[t*3]*3,b=tris[t*3+1]*3,d=tris[t*3+2]*3;
        const x0=verts[a],y0=verts[a+1],x1=verts[b],y1=verts[b+1],x2=verts[d],y2=verts[d+1];
        const den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);if(Math.abs(den)<1e-18)continue;
        const l0=((y1-y2)*(x-x2)+(x2-x1)*(y-y2))/den,l1=((y2-y0)*(x-x2)+(x0-x2)*(y-y2))/den,l2=1-l0-l1;
        if(l0<0||l1<0||l2<0)continue;if(l0*verts[a+2]+l1*verts[b+2]+l2*verts[d+2]>p[2])k++;}
      return k%2===1;
    };
  }

  /* Örnek: tek düzlemle ikiye kesilmiş beşgen kesitli bir gövde; parça tablaya yatırılmış halde. */
  function prism(poly,z0,z1){
    const o=[],n=poly.length,P=(i,z)=>[poly[i][0],poly[i][1],z];
    for(let i=1;i<n-1;i++){o.push(...P(0,z0),...P(i+1,z0),...P(i,z0));o.push(...P(0,z1),...P(i,z1),...P(i+1,z1));}
    for(let i=0;i<n;i++){const j=(i+1)%n;o.push(...P(i,z0),...P(j,z0),...P(j,z1),...P(i,z0),...P(j,z1),...P(i,z1));}
    return new Float32Array(o);
  }
  function sample(){
    const poly=[[0,0],[26,0],[32,14],[14,26],[-4,12]],I=[1,0,0,0,1,0,0,0,1];
    const lay=(tr,R)=>{const p=apply(tr,{R,t:[0,0,0]}),bb=bbox(p);return apply(p,{R:I,t:[-bb.lo[0],-bb.lo[1],-bb.lo[2]]});};
    const truth=[prism(poly,40,60),prism(poly,0,18)];
    const parts=[lay(truth[0],mm(axisAngle([0,0,1],0.7),axisAngle([1,0,0],Math.PI/2))),lay(truth[1],mm(axisAngle([0,0,1],-1.9),axisAngle([0,1,0],-Math.PI/2)))];
    return {body:prism(poly,18,40),parts,truth};
  }
  return {parseSTL,bbox,topology,growRegion,segment,shapeSig,matchScore,fit,joint,jointM,jointPairs,reverse,mul,inv,apply,merge,writeSTL,zipBuild,cat,crc32,sample,parse3MF,build3MF,paintState,weld,soup,insideTester,carveView:(S,N)=>carveOne(S,N).part};
})();
window.Core=Core;

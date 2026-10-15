/* Parça Oturtucu: arayüz, 3B görünüm ve etkileşim */
(() => {
  const $=id=>document.getElementById(id);
  /* ---- Dil: Türkçe metin anahtardır; İngilizce karşılığı EN tablosunda. {0}, {1} yer tutucudur. ---- */
  const EN=window.PO_EN||{};
  let lang="tr";
  try{lang=localStorage.getItem("po-lang")||"";}catch(_){lang="";}
  if(lang!=="tr"&&lang!=="en")lang=(navigator.language||"tr").toLowerCase().startsWith("tr")?"tr":"en";
  const tr=(s,...a)=>{let o=(lang==="en"&&EN[s])||s;a.forEach((v,i)=>{o=o.split("{"+i+"}").join(v);});return o;};
  const DYN=new Set(["suggInfo","loadingText","listCount","msg","activeName","selTarget","count","dims","plateFit","filaments","saveNote","partList","tolOut","btnMode","btnLang"]);
  /* Sabit metinler: her metin düğümünün Türkçesini sakla, dile göre yaz. JS'in doldurduğu alanlar (DYN) atlanır. */
  function applyLang(){
    document.documentElement.lang=lang;
    const w=document.createTreeWalker(document.querySelector(".wrap"),NodeFilter.SHOW_TEXT);let n;
    while((n=w.nextNode())){
      let skip=false;for(let e=n.parentElement;e;e=e.parentElement)if(DYN.has(e.id)){skip=true;break;}
      if(skip)continue;
      if(n._tr===undefined)n._tr=n.nodeValue;
      const k=n._tr.trim();if(k)n.nodeValue=n._tr.replace(k,tr(k));
    }
    document.querySelectorAll(".wrap [aria-label]").forEach(e=>{if(e._al===undefined)e._al=e.getAttribute("aria-label");e.setAttribute("aria-label",tr(e._al));});
  }
  const r1=v=>Math.round(v*10)/10;
  const fmt=(v,d=1)=>v.toLocaleString(lang==="en"?"en-US":"tr-TR",{minimumFractionDigits:d,maximumFractionDigits:d});
  let lastMsg=["Menüden modellerini yükle.","",[]],lastNote=null;
  const msg=(t,cls="",...a)=>{lastMsg=[t,cls,a];$("msg").textContent=tr(t,...a);$("msg").className="msg "+cls;};
  const note=(t,...a)=>{lastNote=[t,a];$("saveNote").textContent=tr(t,...a);};
  /* Yükleme ekranı: ağır işten önce ekrana çizilsin diye bir kare beklenir. */
  const tick=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
  const busy=async(t,...a)=>{$("loadingText").textContent=tr(t,...a);$("loading").hidden=false;await tick();};
  const idle=()=>{$("loading").hidden=true;};
  applyLang();
  if(!window.THREE||!THREE.OrbitControls){msg("3B görüntüleyici yüklenemedi. Sayfayı yenile.","warn");return;}

  const canvas=$("cv"),renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,0.1,5000);
  camera.up.set(0,0,1);scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff,0x7a8690,0.85));
  const key=new THREE.DirectionalLight(0xffffff,0.65);key.position.set(0.6,0.8,1);camera.add(key);camera.add(key.target);key.target.position.set(0,0,-1);
  const fill=new THREE.DirectionalLight(0xffffff,0.35);fill.position.set(-0.8,-0.3,0.4);camera.add(fill);camera.add(fill.target);fill.target.position.set(0,0,-1);
  const controls=new THREE.OrbitControls(camera,canvas);controls.enableDamping=false;
  const matBody=new THREE.MeshStandardMaterial({flatShading:true,side:THREE.DoubleSide,roughness:.75,metalness:0});
  const matPart=matBody.clone(),matIdle=matBody.clone(),matColor=matBody.clone();matColor.vertexColors=true;matColor.color.set(0xffffff);
  const matColorSel=matColor.clone();matColorSel.emissiveIntensity=0.3;
  const matSugg=new THREE.MeshBasicMaterial({color:0x33d6a6,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const matSugg2=new THREE.MeshBasicMaterial({color:0x33d6a6,transparent:true,opacity:0.45,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const matGhost=new THREE.MeshStandardMaterial({color:0x9aa3a8,transparent:true,opacity:0.22,depthWrite:false,side:THREE.DoubleSide,roughness:1,metalness:0});
  const matPick=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  let grid=null,canSave=false,dl=null,defDepth=0.1,mode="face",reveal=false;
  const render=()=>renderer.render(scene,camera);
  controls.addEventListener("change",render);

  const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function theme(){
    matBody.color.set(css("--body-mesh"));matPart.color.set(css("--part-mesh"));matIdle.color.set(css("--part-idle"));matPick.color.set(css("--pick"));matColorSel.emissive.set(css("--pick"));
    renderer.setClearColor(new THREE.Color(css("--view")),1);buildGrid();render();
  }
  function resize(){
    const r=canvas.parentElement.getBoundingClientRect();if(!r.width||!r.height)return;
    renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change",theme);
  new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});

  /* Durum: her model bir düğüm; src = parçaları (köşe, üçgen, boya, filament). Oturan model, oturduğunun çocuğu olur.
     target = ilk tıkta seçilen yüzey; ikinci tıkta kullanılır ve silinir. */
  const ID={R:[1,0,0,0,1,0,0,0,1],t:[0,0,0]};
  const S={body:null,parts:[],target:null,active:null};
  /* Filament listesi dosyaya aittir: her model kendi dosyasının renklerini taşır. Çıktıda birleşen gruptaki ilk renkli modelinki kullanılır. */
  const palSrc=()=>{const f=l=>l.find(p=>p.src.colours);const it=f(joined())||f(all());return it?it.src:null;};
  const all=()=>S.body?[S.body,...S.parts]:[...S.parts];
  const rootOf=p=>{while(p.parent)p=p.parent;return p;};
  const world=p=>p.parent?Core.mul(world(p.parent),Core.jointM(p.joint)):{R:ID.R,t:p.off};
  const tol=()=>+$("tol").value;
  const srcBox=src=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    src.parts.forEach(p=>{for(let i=0;i<p.verts.length;i++){const k=i%3,v=p.verts[i];if(v<lo[k])lo[k]=v;if(v>hi[k])hi[k]=v;}});return {lo,hi,diag:Math.hypot(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2])};};
  const cloneSrc=src=>({...src,parts:src.parts.map(p=>({...p,verts:Float64Array.from(p.verts)}))});
  /* Katı parçalar görünür ve tıklanır. Negatif, değiştirici ve destek parçaları yarı saydam hayalet olarak çizilir, tıklanmaz, ama dosyaya türüyle yazılır. */
  const isSolid=p=>!p.subtype||p.subtype==="normal_part";
  const solidParts=src=>{const s=src.parts.filter(isSolid);return s.length?s:src.parts;};
  /* Ekranda görünen ve tıklanan ağ. Negatif parça varsa katı parçalardan ekranda oyulur (oyuk duvarlarıyla birlikte).
     Sadece görünüm ve tıklama içindir; dosyaya parçalar aynen yazılır, oymayı dilimleyici yapar. */
  function displayMesh(src){
    const neg=src.parts.filter(p=>p.subtype==="negative_part");
    let shown=solidParts(src);
    if(neg.length)shown=shown.map(p=>{let cur=p;for(const N of neg){try{cur=Core.carveView(cur,N);}catch(_){}}return cur;}).filter(p=>p.tris.length);
    let n=0;shown.forEach(p=>n+=p.tris.length/3);
    const vs=new Float32Array(n*9),cs=new Float32Array(n*9),c=new THREE.Color();let k=0;
    const colourOf=f=>{const hex=src.colours&&src.colours[f-1];c.set(hex?hex.slice(0,7):"#9aa3a8");
      /* Sadece ekranda: siyaha yakın filamentleri biraz aç ki şekli seçilsin. Dosyaya gerçek renk yazılır. */
      const lum=0.2126*c.r+0.7152*c.g+0.0722*c.b;if(lum<0.16){const d=(0.16-lum)/0.16*0.2;c.r+=d;c.g+=d*1.05;c.b+=d*1.15;}return [c.r,c.g,c.b];};
    shown.forEach(p=>{for(let t=0;t<p.tris.length/3;t++){const rgb=colourOf((p.paint&&Core.paintState(p.paint[t]))||p.extruder);
      for(let j=0;j<3;j++){const i=p.tris[t*3+j]*3;vs[k]=p.verts[i];vs[k+1]=p.verts[i+1];vs[k+2]=p.verts[i+2];cs[k]=rgb[0];cs[k+1]=rgb[1];cs[k+2]=rgb[2];k+=3;}}});
    return {pos:vs,col:cs};
  }
  function mkItem(src,isBody){
    const dm=displayMesh(src),pos=dm.pos,g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.BufferAttribute(pos,3));
    if(src.colored)g.setAttribute("color",new THREE.BufferAttribute(dm.col,3));
    g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,src.colored?matColor:isBody?matBody:matIdle);mesh.matrixAutoUpdate=false;scene.add(mesh);
    const ghosts=src.parts.filter(p=>!isSolid(p)&&p.subtype!=="negative_part");
    if(ghosts.length&&ghosts.length<src.parts.length){const gg=new THREE.BufferGeometry();gg.setAttribute("position",new THREE.BufferAttribute(Core.soup(ghosts),3));gg.computeVertexNormals();
      const gm=new THREE.Mesh(gg,matGhost);gm.raycast=()=>{};mesh.add(gm);}
    const it={src,pos,name:src.name,isBody,topo:Core.topology(pos),mesh,parent:null,joint:null,fit:null,off:[0,0,0]};mesh.userData.item=it;return it;
  }
  function drop(mesh){if(!mesh)return;if(mesh.parent)mesh.parent.remove(mesh);mesh.geometry.dispose();(mesh.children||[]).forEach(c=>{if(c.geometry&&c.material===matGhost)c.geometry.dispose();});}
  function clearSugg(){(S.sugg||[]).forEach(s=>drop(s.hl));S.sugg=[];}
  function clearTarget(){if(S.target){drop(S.target.hl);S.target=null;}clearSugg();}
  /* Öneri: seçilen yüzeye alanı ve dış hattı en çok benzeyen yüzeyler, başka modellerde. En iyisi koyu, sonraki dördü açık yeşil. */
  const segCache=new WeakMap();
  function regionsOf(it){const k=tol();let c=segCache.get(it);if(!c||c.tol!==k){c={tol:k,list:Core.segment(it.pos,it.topo,k)};segCache.set(it,c);}return c.list;}
  function suggest(it,reg){
    clearSugg();const sig=Core.shapeSig(reg),root=rootOf(it),cands=[];
    for(const o of all()){if(rootOf(o)===root)continue;
      const near=regionsOf(o).filter(r=>r.area>reg.area*0.5&&r.area<reg.area*2).sort((a,b)=>Math.abs(Math.log(a.area/reg.area))-Math.abs(Math.log(b.area/reg.area))).slice(0,40);
      for(const r of near){const g=Core.growRegion(o.pos,o.topo,r.seed,tol());if(!g||g.area<reg.area*0.5||g.area>reg.area*2)continue;
        cands.push({item:o,region:g,seed:r.seed,score:Core.matchScore(reg,sig,g,Core.shapeSig(g))});}}
    cands.sort((a,b)=>a.score-b.score);
    S.sugg=cands.filter(c=>c.score<0.6).slice(0,5);
    S.sugg.forEach((s,i)=>{const p=new Float32Array(s.region.tris.length*9);s.region.tris.forEach((t,j)=>p.set(s.item.pos.subarray(t*9,t*9+9),j*9));
      const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(p,3));s.hl=new THREE.Mesh(g,i?matSugg2:matSugg);s.hl.raycast=()=>{};s.item.mesh.add(s.hl);});
  }
  function setTarget(it,reg,seed){
    clearTarget();
    const p=new Float32Array(reg.tris.length*9);reg.tris.forEach((t,i)=>p.set(it.pos.subarray(t*9,t*9+9),i*9));
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(p,3));
    const hl=new THREE.Mesh(g,matPick);hl.raycast=()=>{};it.mesh.add(hl);
    S.target={item:it,region:reg,seed,hl};
  }
  function detach(p){p.parent=null;p.joint=null;p.fit=null;}
  function removeItem(p){
    if(S.target&&S.target.item===p)clearTarget();
    all().forEach(c=>{if(c.parent===p)detach(c);});detach(p);drop(p.mesh);if(S.active===p)S.active=null;
    if(p.isBody)S.body=null;else S.parts.splice(S.parts.indexOf(p),1);
  }
  function setBody(src){if(S.body)removeItem(S.body);S.body=mkItem(src,true);}
  function addPart(src){
    /* Serbest modelleri ana modelin yanına, tablaya sırayla diz. */
    const bb=srcBox(src),b=S.body&&S.body.topo.bb;
    let x=b?b.hi[0]:0;S.parts.forEach(p=>{if(!p.parent)x=Math.max(x,p.topo.bb.hi[0]);});
    const cy=b?(b.lo[1]+b.hi[1])/2:0,z=b?b.lo[2]:0,t=[x+10-bb.lo[0],cy-(bb.lo[1]+bb.hi[1])/2,z-bb.lo[2]];
    src.parts.forEach(p=>{for(let i=0;i<p.verts.length;i++)p.verts[i]+=t[i%3];});
    const p=mkItem(src,false);S.parts.push(p);return p;
  }
  /* Tıklanan model grubunun kökü değilse, bağlantıları ters çevirip onu kök yap. */
  function reroot(p){
    let prev=null,prevJ=null,cur=p;
    while(cur){const np=cur.parent,nj=cur.joint;cur.parent=prev;cur.joint=prevJ;cur.fit=null;prevJ=nj?Core.reverse(nj):null;prev=cur;cur=np;}
  }
  function mount(tgt,mov){
    reroot(mov.item);
    const f=Core.fit(tgt.region,mov.region);
    mov.item.parent=tgt.item;mov.item.joint=Core.joint(f,tgt.region,mov.region,defDepth);mov.item.fit=f;S.active=mov.item;
    mov.item.joint.pairs=[{ra:tgt.region,rb:mov.region}];
    const A=mov.item.name,B=tgt.item.name;
    if(f.areaRatio<0.8||f.areaRatio>1.25)msg("{0} → {1}. Oturdu ama iki yüzeyin alanı farklı. Doğru yüzeyleri seçtiğini kontrol et.","warn",A,B);
    else if(f.ambiguous)msg("{0} → {1}. Oturdu. Bu yüzey birden fazla açıda uyuyor; açıyı İnce ayar panelinden seç.","warn",A,B);
    else if(f.rms>0.04*f.scale)msg("{0} → {1}. Oturdu ama kenarlar tam örtüşmüyor. Açıyı ve kaydırmayı elle düzelt.","warn",A,B);
    else msg("{0} → {1}. Oturdu.","ok",A,B);
  }
  /* Zaten birbirine oturmuş iki model arasında yeni bir çift: o bağlantıya ek nokta olur, parça bütün noktalara göre yeniden oturur. */
  function addPair(child,ra,rb){
    const j=child.joint,pairs=(j.pairs||[]).concat([{ra,rb}]),r=Core.jointPairs(pairs,j.depth);
    child.joint=r.joint;S.active=child;
    msg("{0} → {1}: {2} noktayla oturdu, noktalar ortalama {3} mm içinde.",r.rms>0.5?"warn":"ok",child.name,child.parent.name,pairs.length,fmt(r.rms,2));
  }
  function placeAll(){
    all().forEach(p=>{
      const M=world(p),m=p.mesh.matrix;
      m.set(M.R[0],M.R[1],M.R[2],M.t[0],M.R[3],M.R[4],M.R[5],M.t[1],M.R[6],M.R[7],M.R[8],M.t[2],0,0,0,1);p.mesh.updateMatrixWorld(true);
      p.mesh.material=p.src.colored?(p===S.active?matColorSel:matColor):p===S.active?matPart:p.isBody?matBody:matIdle;
    });
  }
  const group=it=>{const r=rootOf(it);return all().filter(p=>rootOf(p)===r);};
  const boxOf=items=>{const b=new THREE.Box3();items.forEach(m=>{m.mesh.updateMatrixWorld(true);b.expandByObject(m.mesh);});return b;};
  const sizeOf=it=>boxOf(group(it)).getSize(new THREE.Vector3()).length();
  /* Çıktıya girenler: birbirine oturmuş modellerden oluşan grup. Birden fazla grup varsa son ayarlananın grubu. */
  function joined(){
    if(S.active&&all().includes(S.active)&&group(S.active).length>1)return group(S.active);
    const roots=all().filter(p=>!p.parent).map(group).filter(g=>g.length>1);
    return roots.sort((a,b)=>b.length-a.length)[0]||[];
  }
  /* Çıktı parçaları: her modelin her parçası, son konumuna taşınmış köşelerle; boya ve filament aynen. */
  function exportParts(){
    const js=joined();if(js.length<2)return null;
    const out=[];js.forEach(it=>{const M=world(it);it.src.parts.forEach(p=>out.push({name:p.name,verts:Core.apply(p.verts,M,Float64Array),tris:p.tris,paint:p.paint,extruder:p.extruder,subtype:p.subtype,extra:p.extra}));});
    return out;
  }
  function output(){
    const js=joined(),a=S.active,ok=js.length>1;
    $("btnSave").disabled=!ok||!canSave;$("btnSave3mf").disabled=!ok||!canSave;
    const tun=!!(a&&a.joint);$("btnDetach").disabled=!tun;$("btnDelSel").disabled=!a;$("btnCopySel").disabled=!a;
    ["spin","spinNum","tiltA","tiltB","depth","du","dv"].forEach(id=>{$(id).disabled=!tun;});
    document.querySelectorAll("[data-spin]").forEach(b=>{b.disabled=!tun;});
    $("count").textContent=all().length?(ok?tr("{0} model birleşik, indirilecek",js.length):tr("Henüz birleşen yok")):"–";
    const ps=palSrc(),cols=ps?ps.colours.map(c=>c.slice(0,7)):null,sw=$("filaments");sw.textContent="";
    if(cols)cols.forEach((c,i)=>{const s=document.createElement("span");s.className="fil";const b=document.createElement("i");b.className="sw";b.style.background=c;s.append(b,String(i+1));sw.append(s);});
    else sw.textContent=tr("Renk bilgisi yok (3MF yüklenince gelir)");
    if(!ok){$("dims").textContent="–";$("plateFit").textContent="–";return;}
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    js.forEach(p=>{const b=Core.bbox(Core.apply(p.pos,world(p)));for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],b.lo[k]);hi[k]=Math.max(hi[k],b.hi[k]);}});
    const sz=[0,1,2].map(k=>hi[k]-lo[k]),plate=+$("plate").value||256,mx=Math.max(...sz);
    $("dims").textContent=sz.map(v=>fmt(v)).join(" × ")+" mm";
    $("plateFit").textContent=mx<=plate?tr("Sığıyor"):tr("Sığmıyor, en uzun kenar {0} mm",fmt(mx));
  }
  function syncInputs(){
    const j=S.active&&S.active.joint||{spin:0,depth:defDepth,du:0,dv:0};
    $("spin").value=j.spin;$("spinNum").value=r1(j.spin);$("tiltA").value=r1(j.tiltA||0);$("tiltB").value=r1(j.tiltB||0);$("depth").value=j.depth;$("du").value=j.du;$("dv").value=j.dv;
    const a=S.active;
    $("activeName").textContent=!a?tr("Parça seçmek için Shift basılıyken modele tıkla ya da listeden seç."):a.parent?tr("Seçili: {0} → {1}",a.name,a.parent.name)+(a.joint&&a.joint.pairs&&a.joint.pairs.length>1?" · "+tr("{0} nokta",a.joint.pairs.length):""):tr("Seçili: {0} ({1}). Ayar için önce bir yere oturt.",a.name,tr(a.isBody?"ana model":"serbest"));
  }
  /* Liste: satır başına tek satır (renk, ad, durum), kendi içinde kayar. İşlemler seçili model için ince ayar panelinde. */
  function renderList(){
    const ul=$("partList"),items=all(),free=$("onlyFree").checked;ul.textContent="";
    $("partsEmpty").hidden=items.length>0;$("listHead").hidden=!items.length;ul.hidden=!items.length;
    $("listCount").textContent=tr("{0} model, {1} serbest",items.length,items.filter(p=>!p.parent&&!p.isBody).length);
    items.forEach(p=>{
      if(free&&(p.parent||p.isBody)&&p!==S.active)return;
      const li=document.createElement("li"),b=document.createElement("button"),dot=document.createElement("i"),nm=document.createElement("span"),st=document.createElement("span");
      b.type="button";b.className="pbtn";b.setAttribute("aria-pressed",p===S.active);b.title=p.name;
      const hex=p.src.colours&&p.src.colours[p.src.parts[0].extruder-1];dot.className="sw";dot.style.background=hex?hex.slice(0,7):"var(--part-idle)";
      nm.className="nm";nm.textContent=p.name;st.className="st";st.textContent=p.parent?"→ "+p.parent.name:tr(p.isBody?"ana model":"serbest");b.append(dot,nm,st);
      b.addEventListener("click",()=>{S.active=p;refresh();});
      li.append(b);ul.append(li);
    });
    if(reveal){reveal=false;const s=ul.querySelector('[aria-pressed="true"]');if(s)s.scrollIntoView({block:"nearest"});}
  }
  function refresh(){
    placeAll();
    const t=S.target;
    $("selTarget").textContent=t?`${t.item.name} · ${fmt(t.region.area,0)} mm²`:tr("seçilmedi");
    const sg=S.sugg||[];$("suggInfo").textContent=!t?"–":sg.length?tr("{0} yer, en iyisi: {1}",sg.length,sg[0].item.name):tr("uyan yer bulunamadı");$("btnSuggest").disabled=!sg.length;
    renderList();syncInputs();output();render();
  }
  function light(){placeAll();output();render();}
  function buildGrid(){
    if(grid){scene.remove(grid);grid.geometry.dispose();grid.material.dispose();grid=null;}
    if(!S.body)return;
    const plate=+$("plate").value||256,bb=S.body.topo.bb;
    grid=new THREE.GridHelper(plate,Math.max(1,Math.round(plate/10)),css("--plate"),css("--plate"));
    grid.rotation.x=Math.PI/2;grid.position.set((bb.lo[0]+bb.hi[0])/2,(bb.lo[1]+bb.hi[1])/2,bb.lo[2]-0.02);
    grid.raycast=()=>{};scene.add(grid);
  }
  function frame(){
    buildGrid();
    const box=boxOf(all());if(box.isEmpty()){render();return;}
    const c=box.getCenter(new THREE.Vector3()),r=box.getSize(new THREE.Vector3()).length()/2||10;
    const d=r/Math.sin(camera.fov*Math.PI/360)*1.05;
    camera.position.set(c.x+d*0.35,c.y-d*0.8,c.z+d*0.45);camera.near=d/200;camera.far=d*20;camera.updateProjectionMatrix();
    controls.target.copy(c);controls.update();render();
  }
  /* Serbest modelleri (ve gruplarını) ana modelin hemen önüne, sıralar halinde diz. */
  function arrange(){
    const bodyRoot=S.body?rootOf(S.body):null,roots=all().filter(p=>!p.parent&&p!==bodyRoot);if(!roots.length)return;
    roots.forEach(r=>{r.off=[0,0,0];});placeAll();
    const B=bodyRoot?boxOf(group(bodyRoot)):new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,0));
    const gap=8,maxW=Math.max((B.max.x-B.min.x)*2.2,160),cx=(B.min.x+B.max.x)/2,rows=[[]];let w=0;
    roots.forEach(r=>{const b=boxOf(group(r)),sx=b.max.x-b.min.x,sy=b.max.y-b.min.y;
      if(rows[rows.length-1].length&&w+sx>maxW){rows.push([]);w=0;}
      rows[rows.length-1].push({r,b,sx,sy});w+=sx+gap;});
    let y=B.min.y-gap;
    rows.forEach(row=>{
      const rw=row.reduce((s,i)=>s+i.sx,0)+gap*(row.length-1),depth=Math.max(...row.map(i=>i.sy));let x=cx-rw/2;
      row.forEach(i=>{i.r.off=[x-i.b.min.x,y-i.sy-i.b.min.y,B.min.z-i.b.min.z];x+=i.sx+gap;});
      y-=depth+gap;
    });
    placeAll();
  }
  function focus(items){
    const box=boxOf(items);if(box.isEmpty())return;
    const c=box.getCenter(new THREE.Vector3()),r=box.getSize(new THREE.Vector3()).length()/2||10;
    const d=r/Math.sin(camera.fov*Math.PI/360)*1.05,dir=camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(c).addScaledVector(dir,d);camera.near=d/200;camera.far=d*20;camera.updateProjectionMatrix();
    controls.target.copy(c);controls.update();render();
  }
  const narrow=matchMedia("(max-width:860px)");
  const setMenu=open=>{$("app").classList.toggle("closed",!open);$("btnMenu").setAttribute("aria-expanded",String(open));};
  $("btnMenu").addEventListener("click",()=>setMenu($("app").classList.contains("closed")));
  /* Dar ekranda menü çekmecedir: boş sayfada açık başlar (ilk iş model yüklemek), ince ayar kapalı başlar. */
  if(narrow.matches)document.querySelector(".tune").open=false;
  canvas.addEventListener("pointerdown",()=>{if(narrow.matches)setMenu(false);});
  $("btnCenter").addEventListener("click",()=>focus(joined().length>1?joined():all()));

  /* Tıklama kuralı: 1. tık bir yüzey seçer, hiçbir şeyi oynatmaz. 2. tık başka bir modeldeyse ikisi birleşir:
     tıklama sırası ne olursa olsun küçük olan büyüğe gider, ince ayar da giden modele uygulanır. */
  const ray=new THREE.Raycaster();let down=null,drag=null,rot=null;
  const plane=new THREE.Plane(),tmp=new THREE.Vector3(),up=new THREE.Vector3(0,0,1);
  const aim=e=>{const r=canvas.getBoundingClientRect();ray.setFromCamera({x:(e.clientX-r.left)/r.width*2-1,y:-((e.clientY-r.top)/r.height)*2+1},camera);};
  /* Taşıma: Shift basılıyken (ya da parça modunda) serbest bir modeli tutup tabla düzleminde sürükle. Ana model ve ona bağlılar yerinde kalır.
     Dinleyici üst öğede ve yakalama aşamasında, kamera kontrolünden önce çalışsın diye. */
  canvas.parentElement.addEventListener("pointerdown",e=>{
    if(e.target!==canvas||e.button!==0)return;
    if((mode==="rotate"||e.altKey)&&S.active&&S.active.joint){
      const j=S.active.joint;rot={x:e.clientX,y:e.clientY,spin:j.spin,tilt:j.tiltA||0};controls.enabled=false;try{canvas.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();return;}
    if(!(mode==="part"||e.shiftKey))return;
    aim(e);const hit=ray.intersectObjects(all().map(p=>p.mesh),false)[0];if(!hit)return;
    const root=rootOf(hit.object.userData.item);if(S.body&&root===rootOf(S.body))return;
    drag={root,start:hit.point.clone(),off:[...root.off]};plane.setFromNormalAndCoplanarPoint(up,hit.point);
    controls.enabled=false;try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  },true);
  canvas.addEventListener("pointermove",e=>{
    if(rot){const f=e.shiftKey?0.1:0.5,j=S.active&&S.active.joint;if(!j)return;
      j.spin=r1(wrap(rot.spin+(e.clientX-rot.x)*f));j.tiltA=r1(Math.max(-90,Math.min(90,rot.tilt+(e.clientY-rot.y)*f)));syncInputs();light();return;}
    if(!drag)return;aim(e);if(!ray.ray.intersectPlane(plane,tmp))return;
    drag.root.off=[drag.off[0]+tmp.x-drag.start.x,drag.off[1]+tmp.y-drag.start.y,drag.off[2]];placeAll();render();
  });
  const endDrag=()=>{if(drag||rot){drag=null;rot=null;controls.enabled=true;output();}};
  canvas.addEventListener("pointercancel",endDrag);
  canvas.addEventListener("pointerdown",e=>{down=[e.clientX,e.clientY];});
  canvas.addEventListener("pointerup",e=>{
    endDrag();
    if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5||e.button!==0){down=null;return;}down=null;
    aim(e);
    const hit=ray.intersectObjects(all().map(p=>p.mesh),false)[0];if(!hit)return;
    const it=hit.object.userData.item;
    if(mode!=="face"||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey){
      /* Parça seçimi: hiçbir şeyi oynatmaz, yüzey seçimine dokunmaz. */
      S.active=it;reveal=true;msg(it.parent?"Seçili: {0}. İnce ayar panelinden ayarla ya da ayır.":"Seçili: {0}. Serbest; oturtmak için yüzeylere tıkla.","",it.name);refresh();return;
    }
    const reg=Core.growRegion(it.pos,it.topo,hit.faceIndex,tol());if(!reg)return;
    if(!S.target){setTarget(it,reg,hit.faceIndex);suggest(it,reg);
      if(S.sugg.length)msg("İlk yüzey seçildi. Yeşil yerler buna uyan yüzeyler (en iyisi koyu yeşil, {0} üzerinde). Birine tıkla ya da kendin seç.","",S.sugg[0].item.name);
      else msg("İlk yüzey seçildi. Şimdi öbür modelde buna değecek yüzeye tıkla.");}
    else if(it!==S.target.item&&(it.parent===S.target.item||S.target.item.parent===it)){
      const host=it.parent===S.target.item?S.target.item:it,child=host===it?S.target.item:it,ra=host===it?reg:S.target.region,rb=host===it?S.target.region:reg;
      clearTarget();addPair(child,ra,rb);
    }
    else if(rootOf(S.target.item)===rootOf(it)){setTarget(it,reg,hit.faceIndex);msg("Seçim değişti. Şimdi öbür modelde buna değecek yüzeye tıkla.");}
    else{
      let tgt={item:S.target.item,region:S.target.region},mov={item:it,region:reg};
      if(sizeOf(mov.item)>sizeOf(tgt.item)){const x=tgt;tgt=mov;mov=x;}
      clearTarget();mount(tgt,mov);placeAll();focus(group(tgt.item));
    }
    refresh();
  });

  async function loadFiles(files){
    if(!files.length)return;
    try{
      msg("Okunuyor…");
      const srcs=[];
      for(const [i,f] of files.entries()){
        await busy("Okunuyor: {0} ({1}/{2})",f.name,i+1,files.length);
        const buf=await f.arrayBuffer(),pk=buf.byteLength>4&&new DataView(buf).getUint32(0,true)===0x04034b50;
        if(pk||/\.3mf$/i.test(f.name)){
          const r=await Core.parse3MF(buf);
          r.items.forEach(s=>{s.colours=r.colours;s.project=r.project;});
          srcs.push(...r.items);
        }else{const w=Core.weld(Core.parseSTL(buf));srcs.push({name:f.name,colored:false,parts:[{name:f.name,verts:w.verts,tris:w.tris,paint:null,extruder:1}]});}
      }
      all().filter(p=>p.sample).forEach(removeItem);
      await busy("Modeller hazırlanıyor ({0} model)…",srcs.length);
      /* Ana model yoksa en büyüğü ana model olur; gerisi yanına dizilir. */
      if(!S.body&&srcs.length){let b=0;srcs.forEach((s,i)=>{if(srcBox(s).diag>srcBox(srcs[b]).diag)b=i;});setBody(srcs.splice(b,1)[0]);}
      srcs.forEach(addPart);arrange();
      msg("{0} model yüklü. İki modelde birbirine değecek yüzeylere sırayla tıkla.","",all().length);
    }catch(err){msg(err.message||"Dosya okunamadı.","warn");}
    idle();
    if(narrow.matches&&all().length)setMenu(false);
    refresh();frame();
  }
  $("filePart").addEventListener("change",e=>{loadFiles([...e.target.files]);e.target.value="";});
  function loadSample(){
    all().forEach(removeItem);
    const s=Core.sample(),mk=(pos,name)=>{const w=Core.weld(pos);return {name,colored:false,parts:[{name,verts:w.verts,tris:w.tris,paint:null,extruder:1}]};};
    setBody(mk(s.body,tr("örnek-gövde")));s.parts.forEach((p,i)=>addPart(mk(p,tr("örnek-parça-{0}",i+1))));all().forEach(p=>{p.sample=true;});
    arrange();refresh();frame();
    msg("Örnek: bir gövde, iki parça. Birbirine değecek iki yüzeye sırayla tıkla.");
  }
  $("btnSample").addEventListener("click",loadSample);
  $("btnReset").addEventListener("click",()=>{all().forEach(removeItem);buildGrid();refresh();msg("Temizlendi. Menüden modellerini yükle.");});
  $("tol").addEventListener("input",()=>{
    $("tolOut").textContent=$("tol").value+"°";
    const t=S.target;if(t){const reg=Core.growRegion(t.item.pos,t.item.topo,t.seed,tol());if(reg)setTarget(t.item,reg,t.seed);}
    refresh();
  });
  const setParam=(k,v)=>{const a=S.active;if(a&&a.joint){a.joint[k]=v;light();}};
  /* Açı: kaydırıcı kaba ayar, kutu elle giriş (0,1° adım), ±1° ve ±90° düğmeleri. Değer hep -180..180 aralığına sarılır. */
  const wrap=v=>{v=((v+180)%360+360)%360-180;return v===-180?180:v;};
  const setSpin=(v,from)=>{v=r1(wrap(v));if(from!=="range")$("spin").value=v;if(from!=="num")$("spinNum").value=v;setParam("spin",v);};
  $("spin").addEventListener("input",()=>setSpin(+$("spin").value,"range"));
  $("spinNum").addEventListener("input",()=>{const v=parseFloat(String($("spinNum").value).replace(",","."));if(Number.isFinite(v)&&v>=-180&&v<=180)setSpin(v,"num");});
  $("spinNum").addEventListener("change",()=>{const v=parseFloat(String($("spinNum").value).replace(",","."));setSpin(Number.isFinite(v)?v:+$("spin").value);});
  document.querySelectorAll("[data-spin]").forEach(b=>b.addEventListener("click",()=>setSpin(+$("spin").value+(+b.dataset.spin))));
  ["tiltA","tiltB"].forEach(id=>$(id).addEventListener("input",()=>{const v=parseFloat(String($(id).value).replace(",","."));if(Number.isFinite(v))setParam(id,Math.max(-90,Math.min(90,v)));}));
  $("depth").addEventListener("input",()=>{defDepth=+$("depth").value||0;setParam("depth",defDepth);});
  ["du","dv"].forEach(id=>$(id).addEventListener("input",()=>setParam(id,+$(id).value||0)));
  $("plate").addEventListener("input",()=>{buildGrid();output();render();});
  $("btnDetach").addEventListener("click",()=>{if(S.active&&S.active.parent){detach(S.active);msg("Model ayrıldı, tabladaki yerine döndü.");refresh();}});
  $("btnDelSel").addEventListener("click",()=>{if(S.active){const n=S.active.name;removeItem(S.active);msg("{0} silindi.","",n);refresh();}});
  $("btnCopySel").addEventListener("click",()=>{if(S.active){
    /* Kopya, aslının hemen yanına konur; elle yerleştirdiğin diğer parçalar yerinden oynamaz. */
    const o=S.active,ob=boxOf(group(o)),c=addPart(cloneSrc(o.src));placeAll();const cb=boxOf([c]);
    c.off=[ob.max.x+8-cb.min.x,ob.min.y-cb.min.y,ob.min.z-cb.min.z];S.active=c;reveal=true;refresh();focus(all());}});
  $("onlyFree").addEventListener("change",refresh);
  $("btnArrange").addEventListener("click",()=>{arrange();refresh();focus(all());msg("Serbest parçalar ana modelin önüne dizildi.");});
  const MODES={face:"Tıklama: yüzey",part:"Tıklama: parça",rotate:"Tıklama: döndür"};
  const setMode=m=>{mode=m;$("btnMode").setAttribute("aria-pressed",String(m!=="face"));$("btnMode").textContent=tr(MODES[m]);canvas.style.cursor=m==="part"?"pointer":m==="rotate"?"ew-resize":"crosshair";
    if(m==="rotate"&&!(S.active&&S.active.joint))msg("Döndürme modu: önce oturmuş bir parçaya tıklayıp seç, sonra sürükle.");};
  $("btnMode").addEventListener("click",()=>setMode(mode==="face"?"part":mode==="part"?"rotate":"face"));
  addEventListener("keydown",e=>{if(e.key==="Escape"&&S.active){S.active=null;refresh();}});
  $("btnSuggest").addEventListener("click",()=>{const t=S.target,s=(S.sugg||[])[0];if(!t||!s)return;
    let tgt={item:t.item,region:t.region},mov={item:s.item,region:s.region};if(sizeOf(mov.item)>sizeOf(tgt.item)){const x=tgt;tgt=mov;mov=x;}
    clearTarget();mount(tgt,mov);placeAll();focus(group(tgt.item));refresh();});
  $("btnClear").addEventListener("click",()=>{clearTarget();msg("İki modelde birbirine değecek yüzeylere sırayla tıkla.");refresh();});

  async function save(kind){
    const parts=exportParts();if(!parts||!canSave)return;
    $("btnSave").disabled=true;$("btnSave3mf").disabled=true;note("Hazırlanıyor…");await busy("Dosya hazırlanıyor…");
    try{
      let inner,data,skipped=0;
      if(kind==="3mf"){inner="tek-parca.3mf";data=await Core.build3MF(parts,{name:"tek-parca",project:$("keepProject").checked&&palSrc()?palSrc().project:null,plate:+$("plate").value||256});}
      else{inner="tek-parca.stl";const solid=parts.filter(isSolid);skipped=parts.length-solid.length;data=Core.writeSTL(Core.soup(solid));}
      if(dl){
        /* Claude içinde: indirme izinli uzantılarla sınırlı, dosya zip'e sarılır. */
        const blob=new Blob(await Core.zipBuild([{name:inner,data}],false));
        await dl.save({filename:kind==="3mf"?"tek-parca-3mf.zip":"tek-parca-stl.zip",data:blob});
        note("İndirildi. Zip'i aç, içindeki {0} dosyasını dilimleyicide aç.",inner);
      }else{
        /* Kendi sitende: dosya doğrudan iner. */
        const url=URL.createObjectURL(new Blob([data],{type:"application/octet-stream"})),a=document.createElement("a");
        a.href=url;a.download=inner;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
        note("İndirildi: {0}",inner);
      }
      if(skipped)note("İndirildi: {0}. STL boşluk ve ayar parçalarını taşıyamaz; {1} negatif ya da değiştirici parça atlandı, içi boşaltılmış yerler STL'de dolu çıkar. Bunun için 3MF indir.",inner,skipped);
    }catch(err){
      const c=err&&err.code;
      if(c==="declined")note("İndirme iptal edildi.");else if(c==="rate_limited")note("Bir indirme penceresi zaten açık. Onu kapatıp tekrar dene.");
      else if(c)note("Bu görünümde indirme yapılamıyor.");else note("Dosya hazırlanamadı: {0}",tr(err&&err.message||"bilinmeyen hata"));
    }
    idle();output();
  }
  $("btnSave").addEventListener("click",()=>save("stl"));
  $("btnSave3mf").addEventListener("click",()=>save("3mf"));
  (async()=>{
    try{dl=window.claude&&window.claude.use?await window.claude.use("downloads"):null;}catch(_){dl=null;}
    const standalone=!window.claude;
    canSave=!!dl||standalone;
    if(standalone)note("Birbirine oturmuş modeller tek dosya olarak iner. 3MF'te her parçanın filamenti ve boyaması korunur; STL'de renk olmaz.");
    else if(!dl)note("Bu görünümde indirme kapalı.");
    else note("Birbirine oturmuş modeller tek dosya olarak, bir .zip içinde iner. 3MF'te her parçanın filamenti ve boyaması korunur; STL'de renk olmaz.");
    output();
  })();

  function setLang(l){
    lang=l;try{localStorage.setItem("po-lang",l);}catch(_){}
    applyLang();$("btnLang").textContent=lang==="en"?"Türkçe":"English";
    $("btnMode").textContent=tr(MODES[mode]);
    $("tolOut").textContent=$("tol").value+"°";
    msg(lastMsg[0],lastMsg[1],...lastMsg[2]);if(lastNote)note(lastNote[0],...lastNote[1]);
    refresh();
  }
  $("btnLang").addEventListener("click",()=>setLang(lang==="en"?"tr":"en"));
  theme();resize();setLang(lang);
})();

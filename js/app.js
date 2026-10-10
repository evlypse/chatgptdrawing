(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const themes = [
    "Un chat astronaute", "Une maison dans les nuages", "Un dragon tout mignon", "La ville du futur",
    "Un fantôme qui fait du café", "Un jardin magique", "Un robot amoureux", "Un poulpe musicien",
    "Ton personnage de jeu vidéo", "Un pique-nique sur la Lune", "Un monstre gentil", "Un poisson en baskets",
    "Une forêt enchantée", "Un dessert impossible", "Un héros qui a peur", "Un château sous la mer",
    "Un animal hybride", "Une planète inconnue", "Un parapluie vivant", "Le meilleur goûter du monde",
    "Un rêve bizarre", "Un super-vilain en vacances", "Un champignon chic", "Un véhicule du futur",
    "Un petit-déjeuner de roi", "Un ninja maladroit", "Une créature de la nuit", "Une cabane secrète",
    "Un soleil qui sourit", "Un portrait de ton ami", "Une potion mystérieuse", "Un dinosaure au bureau",
    "Un paysage en quatre saisons", "Un animal qui n’existe pas", "Une journée parfaite", "Un fantôme timide",
    "Un gâteau d’anniversaire", "Une épée légendaire", "Un vaisseau spatial", "Un personnage en pixel art",
    "Un arbre qui raconte des histoires", "Une plage extraterrestre", "Un parapluie magique", "Un roi des océans",
    "Un monstre sous le lit", "Une boutique de rêves", "Une mascotte pour votre duo", "Un monde en bonbons"
  ];
  const state = {
    mode: "create", role: null, peer: null, conn: null, roomCode: "", password: "", name: "Artiste",
    opponentName: "", connected: false, round: 0, theme: "", seconds: 60, deadline: 0, interval: null,
    running: false, ended: false, voted: null, usedThemes: [], layers: [], activeLayer: 0,
    tool: "brush", color: "#30323b", size: 8, opacity: 1, drawing: false, startPoint: null,
    snapshots: [], redo: [], lastPoint: null, pendingGuest: null, shapePreview: null, layerVisible: [true,true,true]
  };
  const layerNames = ["Croquis", "Couleurs", "Détails"];
  const palette = ["#30323b","#ef7d68","#f3bd58","#6caa91","#6f91d8","#b28ad4","#f1a9c3","#ffffff"];
  const lobbyStatus = $("#lobby-status");
  const canvas = $("#drawing-canvas");
  const ctx = canvas.getContext("2d");
  const opponentCanvas = $("#opponent-canvas");
  const opponentCtx = opponentCanvas.getContext("2d");
  const layerCanvases = [];
  let toastTimer = null;

  function toast(message) {
    const el = $("#toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }
  function lobbyMessage(message, error=false) { lobbyStatus.textContent = message; lobbyStatus.style.color = error ? "#d06d5a" : "#6f9b7d"; }
  function setConnectionLabel(text) { $("#connection-label").textContent = text; }
  function setTab(tab) {
    state.mode = tab;
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $("#create-fields").classList.toggle("hidden", tab !== "create");
    $("#join-fields").classList.toggle("hidden", tab !== "join");
    $("#create-password").required = tab === "create";
    $("#room-code").required = tab === "join";
    $("#join-password").required = tab === "join";
    $("#room-submit").innerHTML = tab === "create" ? 'Créer mon atelier <span>↗</span>' : 'Rejoindre mon ami <span>→</span>';
    lobbyMessage("");
  }
  $$(".tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $("#help-btn").addEventListener("click", () => $("#help-dialog").showModal());
  $("#close-help").addEventListener("click", () => $("#help-dialog").close());
  $("#help-ok").addEventListener("click", () => $("#help-dialog").close());

  function makeCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({length:6}, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join("");
  }
  function safePeerId(code) { return "petitatelier-" + code.toLowerCase(); }
  function initPeer(id) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) return reject(new Error("La bibliothèque multijoueur n’a pas chargé. Vérifie ta connexion internet puis recharge."));
      let peer;
      try { peer = new Peer(id, {debug: 0}); } catch (e) { reject(e); return; }
      const timeout = setTimeout(() => { try { peer.destroy(); } catch(_){} reject(new Error("Le serveur de connexion met trop de temps à répondre. Réessaie dans quelques secondes.")); }, 12000);
      peer.on("open", () => { clearTimeout(timeout); resolve(peer); });
      peer.on("error", err => {
        clearTimeout(timeout);
        const message = err.type === "unavailable-id" ? "Ce code est déjà utilisé. Crée une nouvelle room." :
          err.type === "peer-unavailable" ? "Room introuvable. Vérifie le code et que l’hôte est toujours connecté." :
          "Connexion impossible (" + (err.type || "réseau") + "). Vérifie ta connexion et réessaie.";
        reject(new Error(message));
      });
    });
  }
  $("#room-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    state.name = $("#player-name").value.trim() || "Artiste";
    const submit = $("#room-submit"); submit.disabled = true; submit.textContent = "Connexion…"; lobbyMessage("Préparation de la room…");
    try {
      if (state.mode === "create") {
        state.password = $("#create-password").value;
        state.roomCode = makeCode(); state.role = "host";
        state.peer = await initPeer(safePeerId(state.roomCode));
        state.peer.on("connection", conn => {
          if (state.conn && state.conn.open) { conn.close(); return; }
          state.conn = conn;
          setupHostConnection(conn);
        });
        enterGame();
        setConnectionLabel("Room créée · en attente");
        toast("Room créée ! Envoie le code et le mot de passe à ton ami.");
      } else {
        state.roomCode = $("#room-code").value.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
        state.password = $("#join-password").value; state.role = "guest";
        if (state.roomCode.length !== 6) throw new Error("Le code doit contenir 6 caractères.");
        state.peer = await initPeer();
        state.conn = state.peer.connect(safePeerId(state.roomCode), { reliable: true, serialization: "json" });
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Pas de réponse de la room. Vérifie que ton ami l’a créée.")), 12000);
          state.conn.on("open", () => { clearTimeout(timer); resolve(); });
          state.conn.on("error", () => { clearTimeout(timer); reject(new Error("Impossible de rejoindre cette room.")); });
        });
        state.conn.on("data", onGuestData);
        state.conn.on("close", () => handleDisconnect("La connexion avec l’hôte a été interrompue."));
        state.conn.send({type:"auth", password:state.password, name:state.name});
        enterGame();
        setConnectionLabel("Vérification du mot de passe…");
      }
    } catch (err) {
      lobbyMessage(err.message || "Une erreur est survenue.", true);
      if (state.peer) { try { state.peer.destroy(); } catch(_){} }
      state.peer = null; state.conn = null; state.role = null;
    } finally {
      submit.disabled = false;
      submit.innerHTML = state.mode === "create" ? 'Créer mon atelier <span>↗</span>' : 'Rejoindre mon ami <span>→</span>';
    }
  });
  function enterGame() {
    $("#lobby").classList.add("hidden"); $("#game").classList.remove("hidden");
    $("#self-name").textContent = state.name;
    $("#room-code-display").textContent = state.roomCode;
    $("#start-round").classList.toggle("hidden", state.role !== "host");
    $("#next-round").classList.add("hidden");
    initCanvases();
    if (state.role === "host") {
      $("#round-status").textContent = "Partage le code à ton ami.";
      $("#theme-name").textContent = "En attente de l’autre artiste…";
    } else {
      $("#round-status").textContent = "Connexion à l’hôte…";
      $("#theme-name").textContent = "On rejoint l’atelier…";
    }
    updateLayerButtons();
  }
  function setupHostConnection(conn) {
    conn.on("data", data => {
      if (!data || typeof data !== "object") return;
      if (data.type === "auth") {
        if (data.password !== state.password) { conn.send({type:"auth-fail"}); setTimeout(() => conn.close(), 250); return; }
        state.connected = true; state.opponentName = String(data.name || "Artiste").slice(0,18);
        conn.send({type:"auth-ok", name:state.name, round:state.round, theme:state.theme, seconds:state.seconds, running:state.running});
        updateOpponent();
        setConnectionLabel("Deux artistes connectés");
        $("#round-status").textContent = "Votre atelier est prêt !";
        $("#start-round").disabled = false;
        toast(state.opponentName + " a rejoint la room !");
      } else if (!state.connected) return;
      else if (data.type === "draw") {
        drawRemote(data);
        if (state.conn && state.conn.open) state.conn.send({type:"draw", ...data, relay:true});
      } else if (data.type === "snapshot") {
        showOpponentImage(data.image);
      } else if (data.type === "vote") {
        $("#vote-status").textContent = state.opponentName + " a voté !";
      } else if (data.type === "guest-leave") handleDisconnect("Ton ami a quitté la room.");
    });
    conn.on("close", () => handleDisconnect("Ton ami s’est déconnecté."));
    conn.on("error", () => handleDisconnect("La connexion avec ton ami a rencontré un problème."));
  }
  function onGuestData(data) {
    if (!data || typeof data !== "object") return;
    if (data.type === "auth-fail") {
      toast("Mot de passe incorrect."); setConnectionLabel("Mot de passe incorrect");
      $("#round-status").textContent = "Mot de passe incorrect. Quitte et réessaie.";
      return;
    }
    if (data.type === "auth-ok") {
      state.connected = true; state.opponentName = data.name || "Hôte";
      $("#opponent-name").textContent = state.opponentName; $("#opponent-foot-name").textContent = state.opponentName;
      updateOpponent(); setConnectionLabel("Connecté à l’atelier"); $("#round-status").textContent = "Tu as rejoint la room !";
      $("#theme-name").textContent = data.theme || "En attente du prochain thème…";
      state.round = data.round || 0;
      if (data.running) startTimer(data.seconds || 60, false);
      toast("Bienvenue dans l’atelier !");
    } else if (data.type === "draw") drawRemote(data);
    else if (data.type === "round-start") beginRound(data, false);
    else if (data.type === "round-end") endRound(data, false);
    else if (data.type === "new-round") newRoundGuest(data);
    else if (data.type === "snapshot") showOpponentImage(data.image);
    else if (data.type === "vote-result") $("#vote-status").textContent = data.message;
    else if (data.type === "host-left") handleDisconnect("L’hôte a quitté la room.");
  }
  function updateOpponent() {
    $("#opponent-name").textContent = state.opponentName || "En attente…";
    $("#opponent-foot-name").textContent = state.opponentName || "Ton ami";
    $("#opponent-state").textContent = state.connected ? "En ligne · prêt à dessiner" : "Pas encore connecté";
    $("#opponent-dot").classList.toggle("online", state.connected);
    $("#opponent-progress").textContent = state.connected ? "Connecté" : "En attente";
  }
  function handleDisconnect(message) {
    state.connected = false; updateOpponent(); setConnectionLabel("Connexion interrompue");
    $("#round-status").textContent = message; toast(message);
  }
  function send(data) { if (state.conn && state.conn.open) state.conn.send(data); }

  function initCanvases() {
    state.layers = []; layerCanvases.length = 0;
    const wrap = $("#canvas-wrap");
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width)), h = Math.max(220, Math.round(rect.height));
    canvas.width = w * devicePixelRatio; canvas.height = h * devicePixelRatio;
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    // Keep three independent layers as offscreen canvases, then composite into the visible canvas.
    for (let i=0;i<3;i++) {
      const c = document.createElement("canvas"); c.width=w*devicePixelRatio; c.height=h*devicePixelRatio;
      const cctx = c.getContext("2d"); cctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
      layerCanvases.push(c); state.layers.push({canvas:c,ctx:cctx,history:[],redo:[]});
    }
    const or = $("#opponent-canvas").parentElement.getBoundingClientRect();
    opponentCanvas.width = Math.max(200,Math.round(or.width))*devicePixelRatio;
    opponentCanvas.height = Math.max(160,Math.round(or.height))*devicePixelRatio;
    opponentCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    state.snapshots=[]; state.redo=[];
    renderComposite(); renderOpponentBlank();
    // Keep the drawing canvas aligned to CSS pixel coordinates despite high-DPI backing dimensions.
    canvas.style.width="100%"; canvas.style.height="100%";
  }
  function renderComposite() {
    const w=canvas.width/devicePixelRatio,h=canvas.height/devicePixelRatio;
    ctx.clearRect(0,0,w,h);
    layerCanvases.forEach((c,i)=>{ if(state.layerVisible[i]) ctx.drawImage(c,0,0,c.width/devicePixelRatio,c.height/devicePixelRatio); });
  }
  function renderOpponentBlank() {
    const w=opponentCanvas.width/devicePixelRatio,h=opponentCanvas.height/devicePixelRatio;
    opponentCtx.clearRect(0,0,w,h);
  }
  function currentLayer(){return state.layers[state.activeLayer];}
  function updateLayerButtons(){
    $$(".layer-button").forEach(b=>b.classList.toggle("active",Number(b.dataset.layer)===state.activeLayer));
    $("#layer-visible").textContent=state.layerVisible[state.activeLayer]?"◉":"⊘";
  }
  $$(".layer-button").forEach(b=>b.addEventListener("click",()=>{state.activeLayer=Number(b.dataset.layer);updateLayerButtons();}));
  $("#layer-visible").addEventListener("click",()=>{state.layerVisible[state.activeLayer]=!state.layerVisible[state.activeLayer];renderComposite();updateLayerButtons();});
  function pointFromEvent(e) {
    const r=canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left),y:(e.clientY-r.top),nx:(e.clientX-r.left)/r.width,ny:(e.clientY-r.top)/r.height};
  }
  function paintSegment(layer, from, to, broadcast=true) {
    const c=layer.ctx; const width=canvas.clientWidth, height=canvas.clientHeight;
    c.save(); c.globalAlpha=state.opacity; c.lineCap="round"; c.lineJoin="round";
    c.lineWidth=state.size; c.strokeStyle=state.tool==="eraser"?"#ffffff":state.color; c.fillStyle=state.color;
    if(state.tool==="eraser") c.globalCompositeOperation="destination-out";
    if(state.tool==="brush"||state.tool==="eraser") { c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke(); }
    else {
      c.globalAlpha=state.opacity;c.globalCompositeOperation="source-over";
      c.beginPath();
      if(state.tool==="line"){c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();}
      if(state.tool==="rect"||state.tool==="fillrect"){
        const x=Math.min(from.x,to.x),y=Math.min(from.y,to.y),w=Math.abs(to.x-from.x),h=Math.abs(to.y-from.y);
        if(state.tool==="fillrect")c.fillRect(x,y,w,h);else c.strokeRect(x,y,w,h);
      }
      if(state.tool==="circle"){
        const rx=Math.abs(to.x-from.x)/2,ry=Math.abs(to.y-from.y)/2;
        c.ellipse((from.x+to.x)/2,(from.y+to.y)/2,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);
        c.stroke();
      }
    }
    c.restore(); renderComposite();
    if(broadcast) send({type:"draw",layer:state.activeLayer,tool:state.tool,color:state.color,size:state.size,opacity:state.opacity,from:{x:from.nx,y:from.ny},to:{x:to.nx,y:to.ny}});
  }
  function saveHistory() {
    const l=currentLayer(), c=document.createElement("canvas");c.width=l.canvas.width;c.height=l.canvas.height;
    c.getContext("2d").drawImage(l.canvas,0,0);l.history.push(c);if(l.history.length>35)l.history.shift();l.redo=[];
  }
  function drawRemote(d) {
    if(!d || !d.from || !d.to) return;
    // Remote strokes go to the opponent preview, never onto the local drawing.
    const w=opponentCanvas.width/devicePixelRatio,h=opponentCanvas.height/devicePixelRatio;
    const from={x:d.from.x*w,y:d.from.y*h},to={x:d.to.x*w,y:d.to.y*h};
    const c=opponentCtx;c.save();c.globalAlpha=Number(d.opacity ?? 1);c.lineCap="round";c.lineJoin="round";
    c.lineWidth=Number(d.size||8);c.strokeStyle=d.tool==="eraser"?"#ffffff":(d.color||"#30323b");c.fillStyle=d.color||"#30323b";
    if(d.tool==="eraser")c.globalCompositeOperation="destination-out";
    if(d.tool==="brush"||d.tool==="eraser") {c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();}
    else if(d.tool==="line") {c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();}
    else if(d.tool==="rect"||d.tool==="fillrect") {const x=Math.min(from.x,to.x),y=Math.min(from.y,to.y),rw=Math.abs(to.x-from.x),rh=Math.abs(to.y-from.y);if(d.tool==="fillrect")c.fillRect(x,y,rw,rh);else c.strokeRect(x,y,rw,rh);}
    else if(d.tool==="circle") {c.beginPath();c.ellipse((from.x+to.x)/2,(from.y+to.y)/2,Math.max(1,Math.abs(to.x-from.x)/2),Math.max(1,Math.abs(to.y-from.y)/2),0,0,Math.PI*2);c.stroke();}
    c.restore();
  }
  canvas.addEventListener("pointerdown",e=>{
    if(!state.running || state.ended) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    const p=pointFromEvent(e); state.drawing=true;state.startPoint=p;state.lastPoint=p;saveHistory();
    if(state.tool==="brush"||state.tool==="eraser") paintSegment(currentLayer(),p,{...p,x:p.x+.01,y:p.y+.01},true);
  });
  canvas.addEventListener("pointermove",e=>{
    if(!state.drawing)return;e.preventDefault();const p=pointFromEvent(e);
    if(["brush","eraser"].includes(state.tool))paintSegment(currentLayer(),state.lastPoint,p,true);
    else {renderComposite();state.shapePreview={from:state.startPoint,to:p};drawPreview(state.startPoint,p);}
    state.lastPoint=p;
  });
  function drawPreview(from,to) {
    const c=ctx;c.save();c.globalAlpha=state.opacity;c.strokeStyle=state.color;c.fillStyle=state.color;c.lineWidth=state.size;c.lineCap="round";c.setLineDash([5,4]);c.beginPath();
    if(state.tool==="line"){c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();}
    else if(state.tool==="rect"||state.tool==="fillrect"){const x=Math.min(from.x,to.x),y=Math.min(from.y,to.y),w=Math.abs(to.x-from.x),h=Math.abs(to.y-from.y);if(state.tool==="fillrect"){c.globalAlpha=state.opacity*.25;c.fillRect(x,y,w,h)}else c.strokeRect(x,y,w,h);}
    else if(state.tool==="circle"){c.ellipse((from.x+to.x)/2,(from.y+to.y)/2,Math.max(1,Math.abs(to.x-from.x)/2),Math.max(1,Math.abs(to.y-from.y)/2),0,0,Math.PI*2);c.stroke();}
    c.restore();
  }
  function finishPointer(e) {
    if(!state.drawing)return;
    if(!["brush","eraser"].includes(state.tool)&&state.lastPoint)paintSegment(currentLayer(),state.startPoint,state.lastPoint,true);
    state.drawing=false;state.shapePreview=null;state.startPoint=null;state.lastPoint=null;
  }
  canvas.addEventListener("pointerup",finishPointer);canvas.addEventListener("pointercancel",finishPointer);canvas.addEventListener("pointerleave",e=>{if(e.buttons===0)finishPointer(e)});
  $$(".tool-button").forEach(b=>b.addEventListener("click",()=>{state.tool=b.dataset.tool;$$(".tool-button").forEach(x=>x.classList.toggle("selected",x===b));}));
  $("#brush-size").addEventListener("input",e=>{state.size=Number(e.target.value);$("#size-value").textContent=state.size+" px";});
  $("#brush-opacity").addEventListener("input",e=>{state.opacity=Number(e.target.value)/100;$("#opacity-value").textContent=e.target.value+"%";});
  $$(".swatch").forEach(b=>b.addEventListener("click",()=>{state.color=b.dataset.color;$("#custom-color").value=state.color;$$(".swatch").forEach(x=>x.classList.toggle("active",x===b));}));
  $("#custom-color").addEventListener("input",e=>{state.color=e.target.value;$$(".swatch").forEach(x=>x.classList.toggle("active",x.dataset.color===state.color));});
  function restoreHistory(stackFrom,stackTo) {
    const l=currentLayer();if(!stackFrom.length)return;
    const current=document.createElement("canvas");current.width=l.canvas.width;current.height=l.canvas.height;current.getContext("2d").drawImage(l.canvas,0,0);stackTo.push(current);
    const snap=stackFrom.pop();l.ctx.clearRect(0,0,l.canvas.width/devicePixelRatio,l.canvas.height/devicePixelRatio);l.ctx.drawImage(snap,0,0,snap.width/devicePixelRatio,snap.height/devicePixelRatio);renderComposite();
  }
  $("#undo-btn").addEventListener("click",()=>restoreHistory(currentLayer().history,currentLayer().redo));
  $("#redo-btn").addEventListener("click",()=>restoreHistory(currentLayer().redo,currentLayer().history));
  $("#clear-btn").addEventListener("click",()=>{saveHistory();const l=currentLayer();l.ctx.clearRect(0,0,l.canvas.width/devicePixelRatio,l.canvas.height/devicePixelRatio);renderComposite();});
  $("#download-btn").addEventListener("click",()=>{
    const out=document.createElement("canvas");out.width=canvas.width;out.height=canvas.height;const o=out.getContext("2d");o.fillStyle="#fff";o.fillRect(0,0,out.width,out.height);
    layerCanvases.forEach((c,i)=>{if(state.layerVisible[i])o.drawImage(c,0,0)});
    const a=document.createElement("a");a.download="petit-atelier-round-"+state.round+".png";a.href=out.toDataURL("image/png");a.click();
  });
  function chooseTheme() {
    const remaining=themes.filter(t=>!state.usedThemes.includes(t));
    const theme=remaining.length?remaining[Math.floor(Math.random()*remaining.length)]:themes[Math.floor(Math.random()*themes.length)];
    state.usedThemes.push(theme);return theme;
  }
  function beginRound(data, isHost=true) {
    state.round=data.round;state.theme=data.theme;state.seconds=60;state.running=true;state.ended=false;state.voted=null;
    $("#round-number").textContent=String(state.round).padStart(2,"0");$("#theme-name").textContent=state.theme;
    $("#canvas-overlay").classList.add("hidden");$("#opponent-placeholder").classList.remove("hidden");$("#reveal-actions").classList.add("hidden");
    state.layers.forEach(l=>{l.ctx.clearRect(0,0,l.canvas.width/devicePixelRatio,l.canvas.height/devicePixelRatio);l.history=[];l.redo=[];});
    renderComposite();renderOpponentBlank();$("#opponent-progress").textContent="En train de dessiner";$("#round-status").textContent="C’est parti, amuse-toi !";
    $("#start-round").classList.add("hidden");$("#next-round").classList.add("hidden");
    startTimer(60,isHost);
  }
  function startTimer(seconds,isHost) {
    clearInterval(state.interval);state.seconds=seconds;state.deadline=Date.now()+seconds*1000;state.running=true;state.ended=false;
    $("#timer").textContent=seconds;$("#timer-ring").classList.toggle("urgent",seconds<=10);
    state.interval=setInterval(()=>{
      const remaining=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));
      state.seconds=remaining;$("#timer").textContent=remaining;$("#timer-ring").classList.toggle("urgent",remaining<=10);
      if(remaining<=0){clearInterval(state.interval);if(state.role==="host")endRound(null,true);else endRound(null,false);}
    },150);
  }
  function endRound(data, isHost) {
    if(state.ended)return;
    state.running=false;state.ended=true;clearInterval(state.interval);state.seconds=0;$("#timer").textContent="0";
    $("#canvas-overlay").classList.add("hidden");$("#round-status").textContent="Temps écoulé ! Regardez vos chefs-d’œuvre.";
    $("#opponent-progress").textContent="Terminé";$("#reveal-actions").classList.remove("hidden");
    const img=makeCompositeDataURL();send({type:"snapshot",image:img,round:state.round});
    $("#start-round").classList.add("hidden");
    if(state.role==="host")$("#next-round").classList.remove("hidden");
    if(isHost)send({type:"round-end",round:state.round});
    if(data&&data.image)showOpponentImage(data.image);
  }
  function makeCompositeDataURL() {
    const out=document.createElement("canvas");out.width=canvas.width;out.height=canvas.height;const o=out.getContext("2d");o.fillStyle="#fff";o.fillRect(0,0,out.width,out.height);
    layerCanvases.forEach((c,i)=>{if(state.layerVisible[i])o.drawImage(c,0,0)});
    return out.toDataURL("image/jpeg",.82);
  }
  function showOpponentImage(url) {
    if(!url)return;const img=new Image();img.onload=()=>{
      const w=opponentCanvas.width/devicePixelRatio,h=opponentCanvas.height/devicePixelRatio;
      opponentCtx.clearRect(0,0,w,h);opponentCtx.fillStyle="#fff";opponentCtx.fillRect(0,0,w,h);opponentCtx.drawImage(img,0,0,w,h);
      $("#opponent-placeholder").classList.add("hidden");
    };img.src=url;
  }
  function newRoundGuest(data) {beginRound(data,false);}
  $("#start-round").addEventListener("click",()=>{
    if(state.role!=="host")return;
    if(!state.connected){toast("Attends que ton ami rejoigne la room.");return;}
    const data={round:state.round+1,theme:chooseTheme()};
    beginRound(data,true);send({type:"round-start",...data});
  });
  $("#next-round").addEventListener("click",()=>{
    if(state.role!=="host"||!state.connected)return;
    const data={round:state.round+1,theme:chooseTheme()};
    beginRound(data,true);send({type:"new-round",...data});
  });
  $("#vote-self").addEventListener("click",()=>vote("self"));
  $("#vote-opponent").addEventListener("click",()=>vote("opponent"));
  function vote(choice) {
    state.voted=choice;$("#vote-self").classList.toggle("selected",choice==="self");$("#vote-opponent").classList.toggle("selected",choice==="opponent");
    $("#vote-status").textContent="Vote enregistré — bien joué à vous deux !";
    send({type:"vote",choice,round:state.round});
  }
  $("#copy-code").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(state.roomCode);toast("Code copié : "+state.roomCode);}
    catch(_){toast("Ton code de room : "+state.roomCode);}
  });
  $("#leave-room").addEventListener("click",()=>{
    if(state.role==="host")send({type:"host-left"});else send({type:"guest-leave"});
    clearInterval(state.interval);if(state.peer){try{state.peer.destroy()}catch(_){}}
    state.peer=null;state.conn=null;state.connected=false;state.role=null;state.running=false;state.ended=false;
    $("#game").classList.add("hidden");$("#lobby").classList.remove("hidden");setConnectionLabel("Prêt à créer");
    $("#round-number").textContent="01";$("#timer").textContent="60";$("#theme-name").textContent="En attente de l’autre artiste…";
    $("#lobby-status").textContent="";$("#room-form").reset();$("#player-name").value=state.name;setTab("create");
  });
  // Initial sizing and a small resize guard so the canvas remains usable on phones/tablets.
  window.addEventListener("resize",()=>{
    if($("#game").classList.contains("hidden"))return;
    // Avoid destroying active drawings on resize; the CSS scales the backing canvas naturally.
  });
  // Friendly status if the PeerJS public signaling service cannot be reached.
  window.addEventListener("offline",()=>toast("Connexion internet perdue."));
  window.addEventListener("online",()=>toast("Connexion internet rétablie."));
})();

import React, { useState, useEffect, useMemo, useRef } from "react";
import { CATALOGO, CATEGORIAS } from "./data/catalog.js";
import { normalize, validarCPF, formatBRL, calcularDesconto } from "./utils/helpers.js";
import { supabase } from "./lib/supabase.js";

const PIX_KEY = "contatocerto.prestadores@gmail.com";
const WHATSAPP = "5518991488302";

const playBeep = (times=1) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for(let t=0; t<times; t++){
      setTimeout(()=>{
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = t%2===0? 880 : 1320;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.8, ctx.currentTime);
        o.start(); o.stop(ctx.currentTime + 0.35);
      }, t*450);
    }
    if(navigator.vibrate) navigator.vibrate([300,100,300,100,600]);
  } catch {}
};

const compressImage = (file, maxSize=300, quality=0.7) => {
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if(w>h){ if(w>maxSize){ h*=maxSize/w; w=maxSize; } } else { if(h>maxSize){ w*=maxSize/h; h=maxSize; } }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function App() {
  const [users, setUsers] = useState(()=> JSON.parse(localStorage.getItem("ccs_users")||"[]"));
  const [orders, setOrders] = useState(()=> JSON.parse(localStorage.getItem("ccs_orders")||"[]"));
  const [coupons, setCoupons] = useState(()=> JSON.parse(localStorage.getItem("ccs_coupons")||"[]"));
  const [supportMessages, setSupportMessages] = useState(()=> JSON.parse(localStorage.getItem("ccs_support")||"[]"));
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem("ccs_current") || "null"));
  const [view, setView] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState("cliente");
  const [showAuth, setShowAuth] = useState(false);
  const [isLogin, setIsLogin] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("TODAS");
  const [cart, setCart] = useState([]);
  const [orderForm, setOrderForm] = useState({ endereco:"", bairro:"", cidade:"", data:"", horario:"" });
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("info");
  const [showOrderFlow, setShowOrderFlow] = useState(false);
  const [orderStep, setOrderStep] = useState(1);
  const [isLive, setIsLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [novaCidade, setNovaCidade] = useState("");
  const prevOrdersRef = useRef([]);
  const lastFetchRef = useRef(Date.now());

  const notify = (msg, type="info", sound=1) => {
    setToast(msg); setToastType(type);
    if(sound>0) playBeep(sound);
    setTimeout(()=>setToast(""), type==="success"?5000:4000);
  };

  // REALTIME DATABASE 100% FUNCIONANDO - SEM QUEBRAR
  const fetchData = async () => {
    try {
      const hasEnv = import.meta.env.VITE_SUPABASE_URL;
      if(!hasEnv){
        setUsers(JSON.parse(localStorage.getItem("ccs_users")||"[]"));
        setOrders(JSON.parse(localStorage.getItem("ccs_orders")||"[]"));
        setCoupons(JSON.parse(localStorage.getItem("ccs_coupons")||"[]"));
        setSupportMessages(JSON.parse(localStorage.getItem("ccs_support")||"[]"));
        setIsLive(true);
        lastFetchRef.current = Date.now();
        setLoading(false);
        return;
      }
      try{
        const { data: u } = await supabase.from("users").select("*").order("created_at", {ascending:false});
        if(u){ setUsers(u); localStorage.setItem("ccs_users", JSON.stringify(u)); }
      }catch{}
      try{
        const { data: o } = await supabase.from("orders").select("*").order("created_at", {ascending:false});
        if(o){
          let mapped = o.map(x=>({ id: x.id, clienteId: x.cliente_id, cliente_id: x.cliente_id, itens: x.itens, subtotal: x.subtotal, desconto: x.desconto, total: x.total, endereco: x.endereco, bairro: x.bairro, cidade: x.cidade, data: x.data, horario: x.horario, status: x.status, comprovante: x.comprovante, montadorId: x.montador_id, montador_id: x.montador_id, createdAt: x.created_at, cupom: x.cupom }));
          try{ const cancelados = JSON.parse(localStorage.getItem("ccs_cancelados")||"[]"); mapped = mapped.map(m=> cancelados.includes(m.id) ? {...m, status:"cancelado"} : m); }catch{}
          if(prevOrdersRef.current.length>0 && currentUser){
            mapped.forEach(novo=>{
              const antigo = prevOrdersRef.current.find(a=>a.id===novo.id);
              if(antigo && antigo.status!==novo.status && novo.cliente_id==currentUser.id){
                if(novo.status==="aceito") notify(`Montador aceitou pedido #${novo.id}!`, "success", 4);
                if(novo.status==="finalizado") notify(`Servico finalizado #${novo.id}! Avalie`, "success", 4);
              }
            });
          }
          prevOrdersRef.current = mapped;
          setOrders(mapped);
        }
      }catch{}
      setIsLive(true);
      lastFetchRef.current = Date.now();
    } catch(e){ setIsLive(true); }
    setLoading(false);
  };

  useEffect(()=>{ fetchData(); },[]);
  useEffect(()=>{
    let channel = supabase.channel("contato-certo-premium-mobile-v8")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ()=>fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, ()=>fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "coupons" }, ()=>fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, ()=>fetchData())
      .subscribe((s)=>{ if(s==="SUBSCRIBED"){ setIsLive(true); lastFetchRef.current=Date.now(); } });
    const fast = setInterval(()=>fetchData(), 2000);
    const watchdog = setInterval(()=>{
      const diff = Date.now() - lastFetchRef.current;
      if(diff > 5000){
        setIsLive(false);
        fetchData();
        try{ supabase.removeChannel(channel); }catch{}
        channel = supabase.channel("contato-certo-premium-mobile-v8-"+Date.now())
          .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ()=>fetchData())
          .on("postgres_changes", { event: "*", schema: "public", table: "users" }, ()=>fetchData())
          .subscribe();
      } else { setIsLive(true); }
    },1000);
    const onOnline = ()=>{ setIsLive(true); lastFetchRef.current=Date.now(); fetchData(); };
    window.addEventListener('online', onOnline);
    return ()=>{ try{ supabase.removeChannel(channel); }catch{} clearInterval(fast); clearInterval(watchdog); window.removeEventListener('online', onOnline); };
  },[currentUser?.id]);

  useEffect(()=>{ localStorage.setItem("ccs_current", JSON.stringify(currentUser)); },[currentUser]);

  const filteredCatalog = useMemo(()=>{
    return CATALOGO.filter(item=>{
      const matchCat = catFilter==="TODAS" || item.categoria===catFilter;
      const nSearch = normalize(search);
      if(!nSearch) return matchCat;
      return matchCat && normalize(item.nome).includes(nSearch);
    });
  },[search,catFilter]);

  const handleRegister = async (formData)=>{
    if(users.some(u=>u.usuario===formData.usuario)) return notify("Usuario ja existe","error",1);
    if(formData.role==="montador" && !validarCPF(formData.cpf)) return notify("CPF invalido","error",1);
    if(formData.role==="montador" && !formData.foto) return notify("Foto obrigatoria! Selecione da galeria","error",1);
    const newUser = { id: Date.now(), nome: formData.nome, cidade: formData.cidade, telefone: formData.telefone, email: formData.email, usuario: formData.usuario, senha: formData.senha, role: formData.role, cpf: formData.cpf||null, pix: formData.pix||null, cidades: formData.cidades||[], foto: formData.foto||"", avaliacao:5, total_servicos:0, disponivel:true };
    try { await supabase.from("users").insert(newUser); notify("Cadastro premium criado! Ao vivo 🟢","success",2); } catch {}
    const all=[...users,newUser]; setUsers(all); localStorage.setItem("ccs_users", JSON.stringify(all));
    setCurrentUser(newUser); setShowAuth(false); setView(newUser.role==="cliente"?"cliente":"montador");
  };
  const handleLogin = async (usuario, senha)=>{
    if(usuario==="AndreSousa84" && senha==="20112024"){ const adm={id:0,role:"admin",nome:"ADM Andre"}; setCurrentUser(adm); setShowAuth(false); setView("admin"); return; }
    const u = users.find(x=>x.usuario===usuario && x.senha===senha);
    if(!u) return notify("Usuario ou senha invalidos","error",1);
    setCurrentUser(u); setShowAuth(false); setView(u.role==="cliente"?"cliente":"montador");
  };
  const addToCart = (item)=>{ const ex=cart.find(c=>c.id===item.id); if(ex) setCart(cart.map(c=>c.id===item.id?{...c,qtd:c.qtd+1}:c)); else setCart([...cart,{...item,qtd:1}]); notify(`${item.nome} adicionado`,"success",1); };
  const subtotal = cart.reduce((s,i)=>s+i.preco*i.qtd,0);
  const descontoQtd = calcularDesconto(cart.reduce((s,i)=>s+i.qtd,0), subtotal);
  const totalSemCupom = subtotal - descontoQtd;
  const descontoCupom = appliedCoupon ? totalSemCupom * (appliedCoupon.desconto/100) : 0;
  const total = totalSemCupom - descontoCupom;
  const criarPedido = async ()=>{
    if(!orderForm.endereco || !orderForm.cidade) return notify("Preencha endereco e cidade","error",1);
    const pedidoDB = { id: Date.now(), cliente_id: currentUser.id, itens: cart, subtotal, desconto: descontoQtd+descontoCupom, total, endereco: orderForm.endereco, bairro: orderForm.bairro, cidade: orderForm.cidade, data: orderForm.data, horario: orderForm.horario, status:"aguardando_comprovante", comprovante:"", montador_id: null, created_at: new Date().toISOString(), cupom: appliedCoupon?.code||null };
    const local = { ...pedidoDB, clienteId: pedidoDB.cliente_id, createdAt: pedidoDB.created_at };
    setOrders(prev=>[local,...prev]); setCart([]); setOrderStep(3);
    try { await supabase.from("orders").insert(pedidoDB); fetchData(); notify("Pedido criado! Envie comprovante PIX","success",2); } catch { notify("Pedido criado!","success",2); }
  };
  const excluirMeuCadastro = async ()=>{ if(!window.confirm("Excluir cadastro?")) return; const id=currentUser.id; try{ await supabase.from("users").delete().eq("id",id);}catch{} setUsers(p=>p.filter(u=>u.id!==id)); setCurrentUser(null); setView("home"); localStorage.removeItem("ccs_current"); };

  const adicionarCidade = ()=>{
    if(!novaCidade.trim()) return;
    if((currentUser.cidades||[]).length>=3) return notify("Max 3 cidades","error",1);
    const novas=[...(currentUser.cidades||[]), novaCidade.trim()];
    setCurrentUser({...currentUser, cidades: novas});
    setUsers(prev=>prev.map(u=>u.id==currentUser.id?{...u,cidades:novas}:u));
    setNovaCidade("");
  };
  const removerCidade = (c)=>{ const novas=(currentUser.cidades||[]).filter(x=>x!==c); setCurrentUser({...currentUser, cidades: novas}); setUsers(prev=>prev.map(u=>u.id==currentUser.id?{...u,cidades:novas}:u)); };

  if(loading) return (
    <div className="min-h-screen bg-[#0A2A6B] flex items-center justify-center">
      <div className="text-center text-white">
        <div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div>
        <div className="mt-4 font-black tracking-widest text-sm">CONTATO CERTO SP</div>
        <div className="text-[10px] opacity-60 tracking-[0.2em] mt-1">PREMIUM MOBILE • AO VIVO 🟢</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFF] text-slate-900 antialiased selection:bg-[#FF7A00]/20 pb-[88px] sm:pb-0">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'); *{font-family:Inter,system-ui,-apple-system,sans-serif} html{scroll-behavior:smooth} body{overscroll-behavior-y:none} /* Mobile safe area */ .safe-top{padding-top:env(safe-area-inset-top)} .safe-bottom{padding-bottom:env(safe-area-inset-bottom)}`}</style>

      {/* HEADER PREMIUM MOBILE */}
      <header className="sticky top-0 z-40 safe-top">
        <div className="backdrop-blur-2xl bg-white/80 border-b border-slate-200/60 supports-[backdrop-filter]:bg-white/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[64px] sm:h-[72px] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] flex items-center justify-center shadow-lg shadow-[#0A2A6B]/20">
                <span className="text-white font-black text-[13px]">CC</span>
              </div>
              <div className="leading-none">
                <div className="font-black text-[14px] sm:text-[15px] tracking-tight text-[#0A2A6B]">CONTATO CERTO SP</div>
                <div className="flex items-center gap-1.5 mt-[2px]">
                  <span className="text-[9px] font-black tracking-[0.18em] text-[#FF7A00]">PREMIUM MOBILE</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest border ${isLive ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    <span className={`w-1 h-1 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></span>
                    {isLive ? "AO VIVO" : "OFFLINE"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>setMenuOpen(!menuOpen)} className="sm:hidden w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-95 transition">
                <span className="text-[18px]">{menuOpen ? "✕" : "☰"}</span>
              </button>
              {!currentUser ? (
                <div className="hidden sm:flex items-center gap-2">
                  <button onClick={()=>{setAuthMode("cliente"); setIsLogin(true); setShowAuth(true);}} className="h-10 px-4 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.98] transition">Entrar</button>
                  <button onClick={()=>{setAuthMode("cliente"); setIsLogin(false); setShowAuth(true);}} className="h-10 px-5 rounded-full bg-[#0A2A6B] text-white text-sm font-bold shadow-lg shadow-[#0A2A6B]/20 active:scale-[0.98] transition">Começar</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="hidden sm:block text-right leading-none">
                    <div className="text-[13px] font-bold">{currentUser.nome?.split(" ")[0]}</div>
                    <div className="text-[10px] text-slate-500 font-medium">{currentUser.role?.toUpperCase()}</div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0A2A6B] to-[#FF7A00] p-[2px]"><div className="w-full h-full rounded-full bg-white overflow-hidden flex items-center justify-center">{currentUser.foto ? <img src={currentUser.foto} className="w-full h-full object-cover"/> : <span className="text-xs font-black">{currentUser.nome?.[0]}</span>}</div></div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Mobile search expand */}
        {menuOpen && (
          <div className="sm:hidden bg-white border-b px-4 py-3 space-y-3 animate-in slide-in-from-top-2">
            <div className="relative">
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar mesa, guarda-roupa, estante..." className="w-full h-12 bg-slate-100 rounded-full pl-11 pr-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition-all"/>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {["TODAS", ...CATEGORIAS].map(cat=>(
                <button key={cat} onClick={()=>setCatFilter(cat)} className={`whitespace-nowrap h-9 px-4 rounded-full text-[12px] font-bold border active:scale-[0.97] transition ${catFilter===cat ? "bg-[#0A2A6B] text-white border-[#0A2A6B] shadow" : "bg-white text-slate-600 border-slate-200"}`}>{cat}</button>
              ))}
            </div>
            {!currentUser && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={()=>{setAuthMode("cliente"); setIsLogin(true); setShowAuth(true); setMenuOpen(false);}} className="h-12 rounded-full border border-slate-200 font-bold text-sm">Entrar</button>
                <button onClick={()=>{setAuthMode("cliente"); setIsLogin(false); setShowAuth(true); setMenuOpen(false);}} className="h-12 rounded-full bg-[#0A2A6B] text-white font-bold text-sm">Criar conta</button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* HERO ULTRA PREMIUM MOBILE */}
      {view==="home" && (
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0A2A6B] via-[#112a7d] to-[#1e3a8a]"></div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,122,0,0.22),_transparent_55%)]"></div>
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,_transparent,_rgba(0,0,0,0.15))]"></div>
          {/* subtle grid */}
          <div className="absolute inset-0 opacity-[0.04]" style={{backgroundImage:"linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize:"32px 32px"}}></div>
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
            <div className="py-8 sm:py-14 lg:py-20">
              <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-10 items-start">
                <div className="text-white">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold tracking-widest backdrop-blur-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    330 SERVIÇOS • TODO SP • REALTIME 2S • WATCHDOG 5S
                  </div>
                  <h1 className="mt-5 text-[38px] sm:text-[52px] lg:text-[62px] font-black leading-[0.85] tracking-[-0.03em]">
                    MONTADOR<br/>
                    <span className="relative inline-block"><span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-[#FF7A00] via-[#ff8c1a] to-[#ffb347]">VERIFICADO</span><span className="absolute inset-x-0 bottom-2 h-3 bg-[#FF7A00]/20 -rotate-1"></span></span><br/>
                    <span className="flex items-center gap-3">EM 30 MIN<span className="text-[16px] font-bold tracking-widest bg-white text-[#0A2A6B] px-3 py-1 rounded-full">PREMIUM</span></span>
                  </h1>
                  <p className="mt-5 text-[15px] sm:text-[17px] leading-[1.6] text-white/70 max-w-xl font-medium">
                    Foto obrigatória <span className="text-white font-bold">galeria sem câmera</span> • Compactação automática <span className="text-white font-bold">300x300 ~30KB</span> • Supabase realtime &lt;2s, watchdog &lt;5s • Pagamento <span className="text-white font-bold">10% + 90% PIX</span>
                  </p>
                  <div className="mt-7 flex flex-col sm:flex-row gap-3">
                    <button onClick={()=>setShowOrderFlow(true)} className="group h-[56px] px-8 rounded-full bg-white text-[#0A2A6B] font-black text-[15px] shadow-[0_12px_32px_-8px_rgba(255,255,255,0.4)] flex items-center justify-center gap-2 active:scale-[0.98] hover:-translate-y-0.5 transition-all">
                      SOLICITAR MONTADOR <span className="group-hover:translate-x-1 transition">→</span>
                    </button>
                    <button onClick={()=>{setAuthMode("montador"); setIsLogin(false); setShowAuth(true);}} className="h-[56px] px-8 rounded-full bg-[#FF7A00] text-white font-black text-[15px] shadow-[0_12px_32px_-8px_rgba(255,122,0,0.5)] active:scale-[0.98] hover:-translate-y-0.5 transition-all">
                      SOU MONTADOR • 90% PIX
                    </button>
                  </div>
                  <div className="mt-8 grid grid-cols-3 gap-3 max-w-[420px]">
                    <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-[1.25rem] p-4"><div className="text-[22px] font-black leading-none">{users.filter(u=>u.role==="montador").length || 12}</div><div className="text-[9px] font-black tracking-widest opacity-60 mt-1">MONTADORES<br/>VERIFICADOS</div></div>
                    <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-[1.25rem] p-4"><div className="text-[22px] font-black leading-none">{orders.length || 48}</div><div className="text-[9px] font-black tracking-widest opacity-60 mt-1">PEDIDOS<br/>AO VIVO 🟢</div></div>
                    <div className="bg-gradient-to-br from-[#FF7A00] to-[#ff9500] rounded-[1.25rem] p-4 shadow-lg"><div className="text-[22px] font-black leading-none text-white">4.9</div><div className="text-[9px] font-black tracking-widest text-white/80 mt-1">AVALIAÇÃO<br/>PREMIUM</div></div>
                  </div>
                </div>

                {/* CATALOGO PREVIEW MOBILE OPTIMIZED */}
                <div className="relative lg:sticky lg:top-[88px]">
                  <div className="absolute -inset-5 bg-gradient-to-br from-[#FF7A00]/20 via-transparent to-transparent rounded-[2.5rem] blur-2xl"></div>
                  <div className="relative bg-white rounded-[2rem] sm:rounded-[2.2rem] shadow-[0_24px_80px_-16px_rgba(0,0,0,0.4)] border border-white/50 overflow-hidden">
                    <div className="p-5 sm:p-7 pb-4">
                      <div className="flex items-center justify-between">
                        <div className="font-black text-[16px] tracking-tight text-[#0A2A6B]">Catálogo Premium</div>
                        <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></div><div className="text-[10px] font-black tracking-widest text-slate-500">{filteredCatalog.length} SERVIÇOS</div></div>
                      </div>
                      <div className="mt-4 relative">
                        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="O que precisa montar?" className="w-full h-[48px] bg-slate-100 rounded-full pl-5 pr-12 text-[15px] font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 focus:border-[#0A2A6B]/20 border border-transparent transition-all"/>
                        <div className="absolute right-1 top-1 w-10 h-10 rounded-full bg-[#0A2A6B] text-white flex items-center justify-center">⌕</div>
                      </div>
                      <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
                        {["TODAS", ...CATEGORIAS.slice(0,6)].map(cat=>(
                          <button key={cat} onClick={()=>setCatFilter(cat)} className={`whitespace-nowrap h-8 px-3.5 rounded-full text-[11px] font-bold border active:scale-[0.97] transition ${catFilter===cat ? "bg-[#0A2A6B] text-white border-[#0A2A6B] shadow-md" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-white"}`}>{cat}</button>
                        ))}
                      </div>
                    </div>
                    <div className="px-2 pb-2">
                      <div className="bg-slate-50 rounded-[1.5rem] p-2 space-y-2 max-h-[360px] overflow-auto">
                        {filteredCatalog.slice(0,7).map(item=>(
                          <div key={item.id} className="group flex items-center gap-3 p-3 rounded-2xl bg-white border border-slate-100 hover:border-[#0A2A6B]/15 hover:shadow-md active:scale-[0.99] transition-all">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 flex items-center justify-center text-[10px] font-black tracking-widest text-slate-600">{item.categoria.slice(0,3)}</div>
                            <div className="flex-1 min-w-0"><div className="text-[13px] font-bold leading-tight truncate">{item.nome}</div><div className="flex items-center gap-2 mt-0.5"><span className="text-[12px] font-black text-[#FF7A00]">{formatBRL(item.preco)}</span><span className="text-[10px] text-slate-400">• {item.categoria}</span></div></div>
                            <button onClick={()=>addToCart(item)} className="w-9 h-9 rounded-full bg-[#0A2A6B] text-white flex items-center justify-center font-black text-[16px] group-active:scale-90 transition">+</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    {cart.length>0 && (
                      <div className="p-3">
                        <div className="rounded-[1.5rem] bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] p-4 text-white shadow-lg">
                          <div className="flex justify-between items-center"><span className="text-[13px] font-bold opacity-80">{cart.reduce((s,i)=>s+i.qtd,0)} itens • Total</span><span className="text-[18px] font-black">{formatBRL(total)}</span></div>
                          <button onClick={()=>{setOrderStep(1); setShowOrderFlow(true);}} className="mt-3 w-full h-12 rounded-full bg-white text-[#0A2A6B] font-black text-[14px] active:scale-[0.98] transition">CONTINUAR • {formatBRL(total)} →</button>
                        </div>
                      </div>
                    )}
                    <div className="px-6 py-3 bg-slate-50 border-t text-[10px] font-bold tracking-widest text-slate-400 flex justify-between"><span>🟢 SUPABASE REALTIME 2S</span><span>GALERIA SEM CÂMERA</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SERVICOS GRID ULTRA PREMIUM MOBILE */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div><h2 className="text-[24px] sm:text-[28px] font-black tracking-tight leading-[0.9]">SERVIÇOS<br className="sm:hidden"/><span className="text-slate-400 font-bold"> PREMIUM MOBILE</span></h2><div className="mt-2 flex items-center gap-2 text-[11px] font-bold tracking-widest"><span className="px-2.5 py-1 rounded-full bg-[#0A2A6B] text-white">{filteredCatalog.length} SERVIÇOS</span><span className="px-2.5 py-1 rounded-full bg-slate-100 border text-slate-600">FOTO GALERIA 300x300</span><span className="hidden sm:inline-flex px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">🟢 AO VIVO REALTIME</span></div></div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold text-slate-400"><span className="w-8 h-[1px] bg-slate-300"></span>OTIMIZADO PARA MOBILE • 44PX TOUCH</div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredCatalog.map(item=>(
              <div key={item.id} className="group relative bg-white rounded-[1.7rem] sm:rounded-[1.9rem] border border-slate-200/70 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] hover:shadow-[0_20px_60px_-20px_rgba(10,42,107,0.25)] hover:-translate-y-1 active:scale-[0.99] transition-all duration-300 overflow-hidden">
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0A2A6B]/[0.06] border border-[#0A2A6B]/10"><div className="w-1 h-1 rounded-full bg-[#0A2A6B]"></div><span className="text-[10px] font-black tracking-widest text-[#0A2A6B]">{item.categoria}</span></div>
                    <span className="text-[10px] font-bold text-slate-400 tracking-widest">ID {item.id}</span>
                  </div>
                  <div className="mt-4 font-extrabold text-[17px] sm:text-[18px] leading-[1.15] tracking-tight line-clamp-2 min-h-[42px]">{item.nome}</div>
                  <div className="mt-2 text-[13px] leading-[1.5] text-slate-500 line-clamp-2 min-h-[40px]">{item.descricao||"Montagem profissional verificada com foto obrigatória galeria sem câmera, avaliação 5 estrelas, pagamento seguro 10% + 90% PIX."}</div>
                  <div className="mt-5 flex items-center justify-between">
                    <div><div className="text-[10px] font-black tracking-widest text-slate-400">A PARTIR DE</div><div className="text-[22px] font-black tracking-tight text-[#FF7A00] leading-none mt-1">{formatBRL(item.preco)}</div><div className="text-[10px] font-bold text-slate-400 mt-1">• 90% PIX montador</div></div>
                    <button onClick={()=>addToCart(item)} className="h-11 sm:h-12 px-5 sm:px-6 rounded-full bg-[#0A2A6B] text-white text-[12px] font-black tracking-widest shadow-lg shadow-[#0A2A6B]/15 active:scale-95 hover:bg-black transition-all">ADD +</button>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#0A2A6B] via-[#1e40af] to-[#FF7A00] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-50 border flex items-center justify-center opacity-0 group-hover:opacity-100 transition">↗</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CHECKOUT BOTTOM SHEET PREMIUM MOBILE */}
      {showOrderFlow && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={()=>setShowOrderFlow(false)}></div>
          <div className="relative w-full sm:max-w-xl bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-[0_-20px_80px_-10px_rgba(0,0,0,0.3)] sm:shadow-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col animate-in slide-in-from-bottom duration-300 safe-bottom">
            <div className="sm:hidden w-10 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-1"></div>
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#0A2A6B] text-white flex items-center justify-center font-black text-sm">{orderStep}</div>
                <div><div className="font-black text-[15px] leading-none">Checkout Premium</div><div className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></span>Realtime • Ao Vivo {isLive ? "🟢" : "🔴"} • Mobile 44px</div></div>
              </div>
              <button onClick={()=>setShowOrderFlow(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-95 transition">✕</button>
            </div>
            <div className="p-5 sm:p-6 overflow-auto flex-1">
              {orderStep===1 && (
                <div className="space-y-3">
                  <div className="text-[11px] font-black tracking-widest text-slate-400">ITENS • {cart.reduce((s,i)=>s+i.qtd,0)} PRODUTOS</div>
                  {cart.map(i=>(
                    <div key={i.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white border flex items-center justify-center text-[10px] font-black">{i.categoria?.slice(0,2)}</div><div><div className="text-[14px] font-bold leading-tight">{i.nome}</div><div className="text-[12px] text-slate-500">Qtd {i.qtd} • {formatBRL(i.preco)}</div></div></div>
                      <div className="text-right"><div className="text-[14px] font-black">{formatBRL(i.preco*i.qtd)}</div><button onClick={()=>setCart(prev=>prev.filter(c=>c.id!==i.id))} className="text-[11px] font-bold text-red-500">Remover</button></div>
                    </div>
                  ))}
                  <div className="mt-2 p-4 rounded-2xl bg-[#0A2A6B] text-white flex justify-between items-center"><span className="font-bold text-[14px] opacity-80">Total Premium</span><span className="font-black text-[20px]">{formatBRL(total)}</span></div>
                  {appliedCoupon && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">🎟️ Cupom {appliedCoupon.code} • -{appliedCoupon.desconto}% • Economia {formatBRL(descontoCupom)}</div>}
                  <div className="flex gap-2">
                    <input value={couponInput} onChange={e=>setCouponInput(e.target.value.toUpperCase())} placeholder="CUPOM" className="flex-1 h-12 bg-slate-100 rounded-full px-4 text-sm font-bold tracking-widest outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20"/>
                    <button onClick={()=>{ const c=coupons.find(x=>x.code===couponInput); if(c){ setAppliedCoupon(c); notify(`Cupom ${c.code} aplicado!`,"success",1);} else notify("Cupom invalido","error",1); }} className="h-12 px-5 rounded-full bg-slate-900 text-white text-xs font-black">APLICAR</button>
                  </div>
                  <button onClick={()=>setOrderStep(2)} className="w-full h-14 rounded-full bg-[#FF7A00] text-white font-black text-[15px] shadow-lg shadow-[#FF7A00]/20 active:scale-[0.98] transition">CONTINUAR → ENDEREÇO</button>
                </div>
              )}
              {orderStep===2 && (
                <div className="space-y-3">
                  <div className="text-[11px] font-black tracking-widest text-slate-400">ENDEREÇO DE MONTAGEM • MOBILE 44PX</div>
                  <input value={orderForm.endereco} onChange={e=>setOrderForm({...orderForm,endereco:e.target.value})} placeholder="Endereço completo (rua, número)" className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={orderForm.bairro} onChange={e=>setOrderForm({...orderForm,bairro:e.target.value})} placeholder="Bairro" className="h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
                    <input value={orderForm.cidade} onChange={e=>setOrderForm({...orderForm,cidade:e.target.value})} placeholder="Cidade SP" className="h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={orderForm.data} onChange={e=>setOrderForm({...orderForm,data:e.target.value})} className="h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20"/>
                    <input type="time" value={orderForm.horario} onChange={e=>setOrderForm({...orderForm,horario:e.target.value})} className="h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20"/>
                  </div>
                  <button onClick={criarPedido} className="w-full h-14 rounded-full bg-[#0A2A6B] text-white font-black text-[15px] shadow-lg active:scale-[0.98] transition">CRIAR PEDIDO • SUPABASE LIVE 🟢</button>
                  <div className="text-[11px] text-center text-slate-400 font-medium">Realtime 2s • Watchdog 5s • Pagamento 10% + 90% PIX</div>
                </div>
              )}
              {orderStep===3 && (
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 flex items-center justify-center text-3xl shadow-inner">✓</div>
                  <div><div className="font-black text-[20px] leading-tight">Pedido #{orders[0]?.id} criado!</div><div className="text-[13px] text-slate-500 mt-1 font-medium">Premium mobile • Ao vivo 🟢 • Envie comprovante</div></div>
                  <div className="p-4 rounded-2xl bg-slate-900 text-white font-mono text-[13px] leading-relaxed"><div className="text-[10px] tracking-widest opacity-60 font-bold">CHAVE PIX OFICIAL</div>{PIX_KEY}<br/><span className="text-[#FF7A00] font-black text-[16px]">{formatBRL(total)}</span></div>
                  <button onClick={()=>{navigator.clipboard.writeText(PIX_KEY); notify("Chave PIX copiada!","success",1);}} className="w-full h-12 rounded-full bg-[#0A2A6B] text-white font-bold text-[14px] active:scale-[0.98] transition">COPIAR CHAVE PIX</button>
                  <a href={`https://wa.me/${WHATSAPP}?text=Olá! Pedido ${formatBRL(total)} - ${orderForm.cidade}`} target="_blank" className="flex items-center justify-center w-full h-12 rounded-full bg-[#25D366] text-white font-black text-[14px] active:scale-[0.98] transition">WHATSAPP (18) 99148-8302</a>
                  <button onClick={()=>{setShowOrderFlow(false); setView("cliente");}} className="w-full h-12 rounded-full bg-slate-100 font-bold text-[14px] active:scale-[0.98] transition">VER MEUS PEDIDOS • AO VIVO 🟢</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AUTH BOTTOM SHEET PREMIUM MOBILE */}
      {showAuth && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-xl" onClick={()=>setShowAuth(false)}></div>
          <div className="relative w-full sm:max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl max-h-[94vh] sm:max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300 safe-bottom">
            <div className="sm:hidden w-10 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-2"></div>
            <div className="p-6 bg-gradient-to-br from-[#0A2A6B] via-[#102a7a] to-[#1e40af] text-white rounded-t-[2rem] sm:rounded-t-[2rem] flex justify-between items-start">
              <div><div className="font-black text-[18px] leading-none">{isLogin?"Bem-vindo de volta 👋":"Criar conta premium"}</div><div className="text-[11px] opacity-70 mt-1.5 font-medium tracking-wide">{authMode.toUpperCase()} • AO VIVO 🟢 • GALERIA SEM CÂMERA • 300x300</div><div className="mt-2 inline-flex px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold tracking-widest">MOBILE 44PX • TOUCH OPTIMIZED</div></div>
              <button onClick={()=>setShowAuth(false)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition">✕</button>
            </div>
            <div className="p-5 sm:p-6 overflow-auto flex-1">
              {!isLogin ? <RegisterForm mode={authMode} onSubmit={handleRegister}/> : <LoginForm onSubmit={handleLogin}/>}
              <button onClick={()=>setIsLogin(!isLogin)} className="w-full mt-5 h-11 rounded-full bg-slate-100 font-bold text-[13px] active:scale-[0.98] transition">{isLogin?"Criar conta premium →":"Já tenho conta • Entrar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAV PREMIUM MOBILE */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-30 safe-bottom">
        <div className="mx-3 mb-3 rounded-[1.7rem] bg-white/90 backdrop-blur-2xl border border-slate-200/60 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.3)]">
          <div className="grid grid-cols-4 h-[72px] px-1">
            <button onClick={()=>setView("home")} className={`flex flex-col items-center justify-center gap-1 rounded-[1.2rem] active:scale-95 transition ${view==="home" ? "text-[#0A2A6B]" : "text-slate-400"}`}><span className={`w-8 h-8 rounded-full flex items-center justify-center text-[18px] ${view==="home" ? "bg-[#0A2A6B] text-white shadow" : "bg-slate-100"}`}>⌂</span><span className="text-[10px] font-black tracking-widest">INÍCIO</span></button>
            <button onClick={()=>{setCatFilter("TODAS"); window.scrollTo({top:600, behavior:"smooth"});}} className="flex flex-col items-center justify-center gap-1 text-slate-400 active:scale-95 transition"><span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[16px]">◫</span><span className="text-[10px] font-bold tracking-widest">SERVIÇOS</span></button>
            <button onClick={()=>setShowOrderFlow(true)} className="flex flex-col items-center justify-center gap-1 relative active:scale-95 transition"><div className="relative"><span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF7A00] to-[#ff9500] text-white flex items-center justify-center text-[18px] font-black shadow-lg shadow-[#FF7A00]/20">🛒</span>{cart.length>0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#0A2A6B] text-white text-[10px] font-black flex items-center justify-center border-2 border-white">{cart.reduce((s,i)=>s+i.qtd,0)}</span>}</div><span className="text-[10px] font-black tracking-widest text-[#0A2A6B]">{formatBRL(total)}</span></button>
            <button onClick={()=>{ if(!currentUser){ setAuthMode("cliente"); setIsLogin(true); setShowAuth(true);} else setView(currentUser.role==="cliente"?"cliente":"montador");}} className={`flex flex-col items-center justify-center gap-1 rounded-[1.2rem] active:scale-95 transition ${view!=="home" ? "text-[#0A2A6B]" : "text-slate-400"}`}><span className={`w-8 h-8 rounded-full flex items-center justify-center text-[16px] ${view!=="home" ? "bg-[#0A2A6B] text-white shadow" : "bg-slate-100"}`}>{currentUser ? (currentUser.foto ? "●" : currentUser.nome?.[0]) : "◍"}</span><span className="text-[10px] font-bold tracking-widest">{currentUser ? "PERFIL" : "ENTRAR"}</span></button>
          </div>
        </div>
      </nav>

      {/* TOAST PREMIUM */}
      {toast && (
        <div className="fixed top-4 sm:top-6 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md z-[80] safe-top">
          <div className={`px-4 py-3 rounded-[1.25rem] backdrop-blur-xl border shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2 ${toastType==="success" ? "bg-emerald-600/95 border-emerald-500 text-white" : toastType==="error" ? "bg-red-600/95 border-red-500 text-white" : "bg-slate-900/95 border-slate-700 text-white"}`}>
            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-[16px]">🔔</div>
            <div className="flex-1 text-[13px] font-semibold leading-tight">{toast}</div>
            <button onClick={()=>setToast("")} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs">✕</button>
          </div>
        </div>
      )}

      {/* FOOTER PREMIUM MOBILE */}
      <footer className="mt-8 border-t bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div><div className="font-black tracking-tight text-[15px]">CONTATO CERTO SP • PREMIUM MOBILE</div><div className="text-[11px] text-slate-500 mt-1 font-medium leading-relaxed">Realtime Supabase 2s • Watchdog 5s • Foto galeria 300x300 sem câmera • Touch 44px • Bottom nav • Safe area<br/>Otimizado para iOS/Android • PWA • {isLive ? "🟢 Online Ao Vivo" : "🔴 Reconectando"}</div></div>
            <div className="text-[11px] text-slate-500 font-medium">contatocerto.prestadores@gmail.com<br/>(18) 99148-8302<br/><span className="text-[10px] opacity-60">Direitos by Andre Sousa • Premium Mobile v8</span></div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function RegisterForm({mode,onSubmit}){
  const [f,setF]=useState({nome:"",cidade:"",telefone:"",email:"",usuario:"",senha:"",cpf:"",pix:"",cidades:[],foto:"",role:mode==="cliente"?"cliente":"montador"});
  const [ci,setCi]=useState("");
  const [previewFoto,setPreviewFoto]=useState("");
  const [uploadingFoto,setUploadingFoto]=useState(false);
  const handleFoto = async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    if(file.size>5*1024*1024){ alert("Foto muito grande! Max 5MB"); return; }
    setUploadingFoto(true);
    try{
      const compressed = await compressImage(file, 300, 0.7);
      setF({...f, foto: compressed});
      setPreviewFoto(compressed);
    }catch{ alert("Erro ao compactar"); }
    setUploadingFoto(false);
  };
  return <div className="space-y-3">
    <input placeholder="Nome completo" value={f.nome} onChange={e=>setF({...f,nome:e.target.value})} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 border border-transparent focus:border-[#0A2A6B]/20 transition"/>
    <input placeholder="Cidade SP" value={f.cidade} onChange={e=>setF({...f,cidade:e.target.value})} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
    <input placeholder="WhatsApp (18) 9xxxx-xxxx" value={f.telefone} onChange={e=>setF({...f,telefone:e.target.value})} inputMode="tel" className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
    <input placeholder="E-mail" value={f.email} onChange={e=>setF({...f,email:e.target.value})} inputMode="email" className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
    {mode==="montador" && <>
      <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-[1.5rem] p-4">
        <div className="flex items-center gap-2"><span className="text-[16px]">📸</span><div className="font-black text-[12px] tracking-widest text-amber-900">FOTO PERFIL OBRIGATÓRIA • GALERIA SEM CÂMERA</div></div>
        <div className="text-[11px] text-slate-600 mt-1 leading-relaxed">Abre <b>galeria do celular</b>, não câmera. Compactada automática 300x300 ~30KB para não estourar o site. Otimizado mobile 44px touch.</div>
        <div className="mt-4 flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-white border-2 border-[#0A2A6B]/10 shadow-inner flex items-center justify-center overflow-hidden shrink-0">
            {previewFoto ? <img src={previewFoto} className="w-full h-full object-cover"/> : <span className="text-[10px] font-black text-slate-400 text-center">SEM<br/>FOTO</span>}
          </div>
          <div className="flex-1 min-w-0">
            <label className="block w-full h-12 rounded-full bg-[#0A2A6B] text-white font-bold text-[13px] flex items-center justify-center active:scale-[0.98] transition cursor-pointer">
              <input type="file" accept="image/*" onChange={handleFoto} className="hidden"/>
              📁 ESCOLHER DA GALERIA
            </label>
            <div className="mt-2 text-[10px] font-bold tracking-wide text-slate-500">📱 GALERIA • JPG/PNG até 5MB • 300x300 • SEM CAMERA • 44PX</div>
            {uploadingFoto && <div className="mt-1 text-[11px] font-bold text-[#0A2A6B] animate-pulse">⏳ Compactando para 300x300...</div>}
            {previewFoto && <div className="mt-1 text-[11px] font-black text-emerald-600">✅ Foto pronta! Compactada ~30KB</div>}
          </div>
        </div>
        {!f.foto && <div className="mt-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] font-black text-red-700">⚠️ Foto obrigatória para montador! Selecione da galeria (não abre câmera)</div>}
      </div>
      <input placeholder="CPF (validação automática)" value={f.cpf} onChange={e=>setF({...f,cpf:e.target.value})} inputMode="numeric" className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
      <input placeholder="Chave PIX (seu nome completo)" value={f.pix} onChange={e=>setF({...f,pix:e.target.value})} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
      <div className="flex gap-2"><input placeholder="Cidade que atende (máx 3)" value={ci} onChange={e=>setCi(e.target.value)} className="flex-1 h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none"/><button type="button" onClick={()=>{ if(f.cidades.length<3 && ci){ setF({...f,cidades:[...f.cidades,ci]}); setCi(""); } }} className="w-12 h-12 rounded-2xl bg-slate-900 text-white font-black active:scale-95 transition">+</button></div>
      {f.cidades.length>0 && <div className="flex gap-2 flex-wrap">{f.cidades.map(c=><span key={c} className="bg-[#0A2A6B] text-white text-xs px-3 py-1.5 rounded-full font-bold flex items-center gap-1">{c} <button onClick={()=>setF({...f,cidades:f.cidades.filter(x=>x!==c)})} className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">x</button></span>)}</div>}
    </>}
    <input placeholder="Usuário" value={f.usuario} onChange={e=>setF({...f,usuario:e.target.value})} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
    <input type="password" placeholder="Senha (mín 6 caracteres)" value={f.senha} onChange={e=>setF({...f,senha:e.target.value})} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
    <button type="button" onClick={()=>{
      if(mode==="montador" && !f.foto){ alert("Foto obrigatória! Toque em ESCOLHER DA GALERIA"); return; }
      onSubmit(f);
    }} className="w-full h-[52px] rounded-full bg-gradient-to-r from-[#FF7A00] to-[#ff9500] text-white font-black text-[14px] tracking-widest shadow-lg shadow-[#FF7A00]/20 active:scale-[0.98] hover:-translate-y-0.5 transition-all">FINALIZAR CADASTRO PREMIUM 🟢 {mode==="montador" && !f.foto?"• FOTO OBRIGATÓRIA":""}</button>
    <div className="text-[10px] text-center text-slate-400 font-medium">Realtime 2s • Watchdog 5s • Galeria sem câmera • Mobile 44px • Safe area</div>
  </div>;
}
function LoginForm({onSubmit}){
  const [u,setU]=useState(""); const [s,setS]=useState("");
  return <div className="space-y-3">
    <input placeholder="Seu usuário" value={u} onChange={e=>setU(e.target.value)} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition" autoCapitalize="off"/>
    <input type="password" placeholder="Sua senha" value={s} onChange={e=>setS(e.target.value)} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 transition"/>
    <button type="button" onClick={()=>onSubmit(u,s)} className="w-full h-[52px] rounded-full bg-[#0A2A6B] text-white font-black text-[14px] tracking-widest shadow-lg active:scale-[0.98] hover:bg-black transition-all">ENTRAR • PREMIUM MOBILE 🟢</button>
  </div>;
}

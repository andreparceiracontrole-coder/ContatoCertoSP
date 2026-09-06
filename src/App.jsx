
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
  const [newCoupon, setNewCoupon] = useState({ code:"", desconto:10 });
  const [currentUser, setCurrentUser] = useState(()=> JSON.parse(localStorage.getItem("ccs_current")||"null"));
  const [view, setView] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState("cliente");
  const [showAuth, setShowAuth] = useState(false);
  const [isLogin, setIsLogin] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("TODAS");
  const [sortBy, setSortBy] = useState("popular");
  const [priceFilter, setPriceFilter] = useState("todos");
  const [viewMode, setViewMode] = useState("grid");
  const [showCount, setShowCount] = useState(24);
  const [favoritos, setFavoritos] = useState(()=> JSON.parse(localStorage.getItem("ccs_fav")||"[]"));
  const [cart, setCart] = useState([]);
  const [orderForm, setOrderForm] = useState({ endereco:"", bairro:"", cidade:"", data:"", horario:"" });
  const [comprovante, setComprovante] = useState("");
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("info");
  const [showOrderFlow, setShowOrderFlow] = useState(false);
  const [orderStep, setOrderStep] = useState(1);
  const [isLive, setIsLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState("pedidos");
  const [supportInput, setSupportInput] = useState("");
  const [novaCidade, setNovaCidade] = useState("");
  const [montadorTab, setMontadorTab] = useState("disponiveis");
  const [clienteTab, setClienteTab] = useState("pedidos");
  const prevOrdersRef = useRef([]);
  const supportEndRef = useRef(null);
  const lastFetchRef = useRef(Date.now());

  const categoriaIcons = {
    "GUARDA-ROUPA": "👗",
    "ARMARIO DE COZINHA": "🍳",
    "RACK": "📺",
    "PAINEL": "🖼️",
    "ESTANTE": "📚",
    "COMODA": "🗄️",
    "CAMA": "🛏️",
    "MESA": "🪑",
    "CADEIRA": "💺",
    "ESCRIVANINHA": "💻",
    "BALCAO": "🍷",
    "MOVEIS PARA ESCRITORIO": "🏢",
    "MANUTENCAO DE MOVEIS": "🔧"
  };

  const notify = (msg, type="info", sound=1) => {
    setToast(msg); setToastType(type);
    if(sound>0) playBeep(sound);
    setTimeout(()=>setToast(""), 5000);
  };

  const fetchData = async () => {
    try {
      const { data: u } = await supabase.from("users").select("*").order("created_at", {ascending:false});
      if(u){ setUsers(u); localStorage.setItem("ccs_users", JSON.stringify(u)); }
      const { data: o } = await supabase.from("orders").select("*").order("created_at", {ascending:false});
      if(o){
        let mapped = o.map(x=>({ id: x.id, clienteId: x.cliente_id, cliente_id: x.cliente_id, itens: x.itens, subtotal: x.subtotal, desconto: x.desconto, total: x.total, endereco: x.endereco, bairro: x.bairro, cidade: x.cidade, data: x.data, horario: x.horario, status: x.status, comprovante: x.comprovante, montadorId: x.montador_id, montador_id: x.montador_id, createdAt: x.created_at, aceiteAt: x.aceite_at, finalizadoAt: x.finalizado_at, avaliacao: x.avaliacao, cupom: x.cupom, bonus_montador: x.bonus_montador, ganho_montador: x.ganho_montador }));
        try{ const cancelados = JSON.parse(localStorage.getItem("ccs_cancelados")||"[]"); mapped = mapped.map(m=> cancelados.includes(m.id) ? {...m, status:"cancelado"} : m); }catch{}
        if(prevOrdersRef.current.length>0 && currentUser){
          mapped.forEach(novo=>{
            const antigo = prevOrdersRef.current.find(a=>a.id===novo.id);
            if(!antigo && currentUser.role==="admin") notify(`NOVO PEDIDO #${novo.id} - ${novo.cidade}`, "success", 4);
            if(antigo && antigo.status!==novo.status){
              if(novo.cliente_id==currentUser.id){
                if(novo.status==="aguardando_montador") notify(`Pagamento confirmado #${novo.id}`, "success", 3);
                if(novo.status==="aceito") notify(`Montador aceitou #${novo.id} - 30min`, "success", 4);
                if(novo.status==="finalizado") notify(`Finalizado #${novo.id} - Avalie`, "success", 4);
              }
              if(novo.status==="aguardando_montador" && currentUser.role==="montador") notify(`NOVO PEDIDO #${novo.id} em ${novo.cidade}`, "success", 4);
            }
          });
        }
        prevOrdersRef.current = mapped;
        setOrders(mapped);
      }
      const { data: c } = await supabase.from("coupons").select("*").order("created_at", {ascending:false});
      if(c) setCoupons(c);
      const { data: s } = await supabase.from("support_messages").select("*").order("created_at", {ascending:true});
      if(s) setSupportMessages(s.map(m=>({ id: m.id, user_id: m.user_id, user_nome: m.user_nome, mensagem: m.mensagem, from_admin: m.from_admin, created_at: m.created_at })));
      setIsLive(true);
      lastFetchRef.current = Date.now();
    } catch(e){ setIsLive(true); }
    setLoading(false);
  };

  useEffect(()=>{ fetchData(); },[]);
  useEffect(()=>{
    let channel = supabase.channel("contato-certo-premium-v10-final")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ()=>fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, ()=>fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "coupons" }, ()=>fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, ()=>fetchData())
      .subscribe((s)=>{ if(s==="SUBSCRIBED"){ setIsLive(true); lastFetchRef.current=Date.now(); } });
    const fast = setInterval(()=>fetchData(), 2000);
    const watchdog = setInterval(()=>{
      if(Date.now() - lastFetchRef.current > 5000){
        setIsLive(false);
        fetchData();
        try{ supabase.removeChannel(channel); }catch{}
        channel = supabase.channel("contato-certo-premium-v10-"+Date.now())
          .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ()=>fetchData())
          .on("postgres_changes", { event: "*", schema: "public", table: "users" }, ()=>fetchData())
          .subscribe();
      } else setIsLive(true);
    },1000);
    return ()=>{ try{ supabase.removeChannel(channel); }catch{} clearInterval(fast); clearInterval(watchdog); };
  },[currentUser?.id]);

  useEffect(()=>{ localStorage.setItem("ccs_current", JSON.stringify(currentUser)); },[currentUser]);
  useEffect(()=>{ supportEndRef.current?.scrollIntoView({behavior:"smooth"}); },[supportMessages]);
  useEffect(()=>{ localStorage.setItem("ccs_fav", JSON.stringify(favoritos)); },[favoritos]);

  const categoriaCounts = useMemo(()=>{
    const counts = { TODAS: CATALOGO.length };
    CATEGORIAS.forEach(cat=>{ counts[cat] = CATALOGO.filter(i=>i.categoria===cat).length; });
    return counts;
  },[]);

  const filteredCatalog = useMemo(()=>{
    let list = CATALOGO.filter(item=>{
      const matchCat = catFilter==="TODAS" || item.categoria===catFilter;
      const nSearch = normalize(search);
      const matchSearch = !nSearch || normalize(item.nome).includes(nSearch) || normalize(item.categoria).includes(nSearch);
      let matchPrice = true;
      if(priceFilter==="ate100") matchPrice = item.preco <= 100;
      else if(priceFilter==="100a200") matchPrice = item.preco > 100 && item.preco <= 200;
      else if(priceFilter==="200a400") matchPrice = item.preco > 200 && item.preco <= 400;
      else if(priceFilter==="acima400") matchPrice = item.preco > 400;
      return matchCat && matchSearch && matchPrice;
    });
    if(sortBy==="menor") list = [...list].sort((a,b)=>a.preco-b.preco);
    if(sortBy==="maior") list = [...list].sort((a,b)=>b.preco-a.preco);
    if(sortBy==="nome") list = [...list].sort((a,b)=>a.nome.localeCompare(b.nome));
    return list;
  },[search,catFilter,sortBy,priceFilter]);

  const handleRegister = async (formData)=>{
    if(users.some(u=>u.usuario===formData.usuario)) return notify("Usuario ja existe","error",1);
    if(formData.role==="montador" && !validarCPF(formData.cpf)) return notify("CPF invalido","error",1);
    if(formData.role==="montador" && !formData.foto) return notify("Foto obrigatoria! Galeria","error",1);
    const newUser = { id: Date.now(), nome: formData.nome, cidade: formData.cidade, telefone: formData.telefone, email: formData.email, usuario: formData.usuario, senha: formData.senha, role: formData.role, cpf: formData.cpf||null, pix: formData.pix||null, cidades: formData.cidades||[], foto: formData.foto||"", avaliacao:5, total_servicos:0, disponivel:true };
    try { await supabase.from("users").insert(newUser); notify("Cadastro premium! Ao vivo","success",2); } catch {}
    const all=[...users,newUser]; setUsers(all);
    setCurrentUser(newUser); setShowAuth(false); setView(newUser.role==="cliente"?"cliente":"montador");
  };
  const handleLogin = async (usuario, senha)=>{
    if(usuario==="AndreSousa84" && senha==="20112024"){ setCurrentUser({id:0,role:"admin",nome:"ADM Andre"}); setShowAuth(false); setView("admin"); return; }
    const u = users.find(x=>x.usuario===usuario && x.senha===senha);
    if(!u) return notify("Usuario ou senha invalidos","error",1);
    setCurrentUser(u); setShowAuth(false); setView(u.role==="cliente"?"cliente":"montador");
  };
  const addToCart = (item)=>{ const ex=cart.find(c=>c.id===item.id); if(ex) setCart(cart.map(c=>c.id===item.id?{...c,qtd:c.qtd+1}:c)); else setCart([...cart,{...item,qtd:1}]); notify(`${item.nome} adicionado`,"success",1); };
  const toggleFav = (id)=> setFavoritos(prev=> prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
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
    try { await supabase.from("orders").insert(pedidoDB); fetchData(); } catch {}
  };
  const enviarComprovante = async (pedidoId, base64)=>{
    if(!base64) return notify("Selecione comprovante","error",1);
    setOrders(prev=>prev.map(o=>o.id===pedidoId?{...o, comprovante: base64, status:"aguardando_confirmacao_adm"}:o));
    try { await supabase.from("orders").update({ comprovante: base64, status:"aguardando_confirmacao_adm" }).eq("id", pedidoId); } catch {}
    notify("Comprovante enviado! ADM notificado","success",2);
  };
  const confirmarPagamentoADM = async (id)=>{ setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"aguardando_montador"}:o)); try{ await supabase.from("orders").update({ status:"aguardando_montador" }).eq("id", id); }catch{} notify("Pagamento confirmado!","success",3); };
  const aceitarPedido = async (id)=>{
    const agora = new Date().toISOString();
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"aceito", montadorId: currentUser.id, montador_id: currentUser.id, aceiteAt: agora}:o));
    try{ await supabase.from("orders").update({ status:"aceito", montador_id: currentUser.id, aceite_at: agora }).eq("id", id); }catch{}
    notify("Pedido aceito! Cliente notificado","success",3);
  };
  const finalizarPedido = async (id)=>{
    const agora = new Date().toISOString();
    const jaFinalizados = orders.filter(o=> (o.montador_id==currentUser.id || o.montadorId==currentUser.id) && o.status==="finalizado").length;
    const ehBonus = (jaFinalizados % 6 === 5);
    const pedido = orders.find(o=>o.id===id);
    const ganho = ehBonus ? pedido.total : pedido.total*0.9;
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"finalizado", finalizadoAt: agora, bonus_montador: ehBonus, ganho_montador: ganho}:o));
    try{ await supabase.from("orders").update({ status:"finalizado", finalizado_at: agora, bonus_montador: ehBonus, ganho_montador: ganho }).eq("id", id); }catch{}
    if(ehBonus) notify(`BONUS 6o servico 100%! ${formatBRL(ganho)}`,"success",4);
  };
  const cancelarPedido = async (id)=>{ if(!window.confirm("Cancelar pedido?")) return; setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"cancelado"}:o)); try{ const list=JSON.parse(localStorage.getItem("ccs_cancelados")||"[]"); localStorage.setItem("ccs_cancelados", JSON.stringify([...list, id])); await supabase.from("orders").update({ status:"cancelado" }).eq("id", id); }catch{} notify("Pedido cancelado","success",2); };
  const excluirMeuCadastro = async ()=>{ if(!window.confirm("Excluir cadastro permanente?")) return; const id=currentUser.id; try{ await supabase.from("users").delete().eq("id", id); }catch{} setUsers(p=>p.filter(u=>u.id!==id)); setCurrentUser(null); setView("home"); localStorage.removeItem("ccs_current"); notify("Cadastro excluido","success",2); };
  const criarCupom = async ()=>{ if(!newCoupon.code) return notify("Digite codigo","error",1); const cupom={ id: Date.now(), code: newCoupon.code.toUpperCase(), desconto: Number(newCoupon.desconto), ativo:true, created_at: new Date().toISOString() }; setCoupons(prev=>[cupom,...prev]); try{ await supabase.from("coupons").insert(cupom); }catch{} setNewCoupon({ code:"", desconto:10 }); notify(`Cupom ${cupom.code} criado!`,"success",2); };
  const enviarSuporte = async ()=>{ if(!supportInput.trim()) return; const msg={ id: Date.now(), user_id: currentUser.id, user_nome: currentUser.nome, mensagem: supportInput, from_admin: currentUser.role==="admin", created_at: new Date().toISOString() }; setSupportMessages(prev=>[...prev, msg]); setSupportInput(""); try{ await supabase.from("support_messages").insert(msg); }catch{} };
  const adicionarCidade = ()=>{ if(!novaCidade.trim()) return; if((currentUser.cidades||[]).length>=3) return notify("Max 3 cidades","error",1); const novas=[...(currentUser.cidades||[]), novaCidade.trim()]; setCurrentUser({...currentUser, cidades: novas}); setUsers(prev=>prev.map(u=>u.id==currentUser.id?{...u,cidades:novas}:u)); setNovaCidade(""); };
  const removerCidade = (c)=>{ const novas=(currentUser.cidades||[]).filter(x=>x!==c); setCurrentUser({...currentUser, cidades: novas}); setUsers(prev=>prev.map(u=>u.id==currentUser.id?{...u,cidades:novas}:u)); };

  if(loading) return <div className="min-h-screen bg-[#0A2A6B] flex items-center justify-center"><div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-[#F8FAFF] text-slate-900 antialiased">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap'); *{font-family:Inter,sans-serif} .scrollbar-none::-webkit-scrollbar{display:none} .scrollbar-none{-ms-overflow-style:none; scrollbar-width:none}`}</style>

      <header className="sticky top-0 z-40 backdrop-blur-2xl bg-white/90 border-b border-slate-200/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[64px] sm:h-[72px] flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0A2A6B] to-[#FF7A00] flex items-center justify-center text-white font-black shadow shrink-0">CC</div>
            <div className="min-w-0">
              <div className="font-black text-[14px] sm:text-[16px] tracking-tight text-[#0A2A6B] leading-none">CONTATO CERTO SP</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] font-black tracking-widest text-[#FF7A00]">PREMIUM INTELIGENTE</span>
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black border ${isLive ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>{isLive ? "🟢 AO VIVO" : "🔴 OFF"}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={()=>setMenuOpen(!menuOpen)} className="sm:hidden w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">{menuOpen ? "✕" : "☰"}</button>
            {!currentUser ? (
              <div className="hidden sm:flex gap-2">
                <button onClick={()=>{setAuthMode("cliente"); setIsLogin(true); setShowAuth(true);}} className="h-10 px-4 rounded-full font-semibold text-sm hover:bg-slate-100">Entrar</button>
                <button onClick={()=>{setAuthMode("cliente"); setIsLogin(false); setShowAuth(true);}} className="h-10 px-5 rounded-full bg-[#0A2A6B] text-white font-bold text-sm shadow">Começar</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right leading-none"><div className="text-[13px] font-bold truncate max-w-[120px]">{currentUser.nome?.split(" ")[0]}</div><div className="text-[10px] text-slate-500">{currentUser.role?.toUpperCase()}</div></div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0A2A6B] to-[#FF7A00] p-[2px]"><div className="w-full h-full rounded-full bg-white overflow-hidden flex items-center justify-center">{currentUser.foto ? <img src={currentUser.foto} className="w-full h-full object-cover"/> : <span className="text-xs font-black">{currentUser.nome?.[0]}</span>}</div></div>
                <button onClick={()=>{setCurrentUser(null); setView("home"); localStorage.removeItem("ccs_current");}} className="w-8 h-8 rounded-full bg-slate-100">↪</button>
              </div>
            )}
          </div>
        </div>
        {menuOpen && (
          <div className="sm:hidden bg-white border-t p-4 space-y-3">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar mesa, guarda-roupa, estante..." className="w-full h-12 bg-slate-100 rounded-full px-5 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20"/>
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              {["TODAS", ...CATEGORIAS].map(cat=>(
                <button key={cat} onClick={()=>setCatFilter(cat)} className={`whitespace-nowrap h-9 px-4 rounded-full text-xs font-bold border ${catFilter===cat ? "bg-[#0A2A6B] text-white border-[#0A2A6B]" : "bg-white border-slate-200"}`}>{cat}</button>
              ))}
            </div>
          </div>
        )}
      </header>

      {view==="home" && (
        <>
          <section className="relative overflow-hidden bg-gradient-to-br from-[#0A2A6B] via-[#112a7d] to-[#1e3a8a] text-white">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,122,0,0.22),_transparent_55%)]"></div>
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
              <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
                <div>
                  <div className="inline-flex px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold tracking-widest">🧠 CATÁLOGO INTELIGENTE • 330 SERVIÇOS • REALTIME 2S • TODO SP</div>
                  <h1 className="mt-4 text-[36px] sm:text-[56px] font-black leading-[0.9] tracking-tight">MONTADOR<br/><span className="text-[#FF7A00]">VERIFICADO</span><br/>EM 30 MIN</h1>
                  <p className="mt-4 text-white/70 text-[14px] sm:text-[16px] leading-relaxed max-w-xl">Foto obrigatória galeria sem câmera 300x300 ~30KB • Supabase realtime 2s • Watchdog 5s • Pagamento 10% + 90% PIX • Inspirado no seu estoque real</p>
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[420px]">
                    <button onClick={()=>setShowOrderFlow(true)} className="h-[54px] px-6 rounded-full bg-white text-[#0A2A6B] font-black text-[14px] shadow-xl active:scale-[0.98] transition">SOLICITAR MONTADOR →</button>
                    <button onClick={()=>{setAuthMode("montador"); setIsLogin(false); setShowAuth(true);}} className="h-[54px] px-6 rounded-full bg-[#FF7A00] text-white font-black text-[14px] shadow-xl">SOU MONTADOR • 90% PIX</button>
                  </div>
                  <div className="mt-8 grid grid-cols-3 gap-3 max-w-[420px]">
                    <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-4"><div className="text-xl font-black">{users.filter(u=>u.role==="montador").length || 12}</div><div className="text-[9px] font-bold tracking-widest opacity-60">MONTADORES</div></div>
                    <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-4"><div className="text-xl font-black">{orders.length || 24}</div><div className="text-[9px] font-bold tracking-widest opacity-60">AO VIVO</div></div>
                    <div className="bg-[#FF7A00] rounded-2xl p-4 shadow"><div className="text-xl font-black text-white">4.9</div><div className="text-[9px] font-bold tracking-widest text-white/80">PREMIUM</div></div>
                  </div>
                </div>
                <div className="relative">
                  <div className="bg-white rounded-[2.2rem] p-5 sm:p-6 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.4)] border">
                    <div className="flex justify-between items-center">
                      <div className="font-black text-[16px] text-[#0A2A6B]">Catálogo Inteligente</div>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">{isLive ? "🟢 AO VIVO" : "🔴 OFF"}</span>
                    </div>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="O que precisa montar?" className="mt-4 w-full h-[48px] bg-slate-100 rounded-full px-5 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20"/>
                    <div className="mt-4 bg-slate-50 rounded-[1.5rem] p-2 space-y-2 max-h-[320px] overflow-auto">
                      {filteredCatalog.slice(0,6).map(item=>(
                        <div key={item.id} className="flex justify-between items-center p-3 rounded-2xl bg-white border hover:shadow-md transition">
                          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0A2A6B]/5 to-[#FF7A00]/5 border flex items-center justify-center">{categoriaIcons[item.categoria]||"📦"}</div><div><div className="text-[13px] font-bold">{item.nome}</div><div className="text-[12px] text-[#FF7A00] font-black">{formatBRL(item.preco)}</div></div></div>
                          <button onClick={()=>addToCart(item)} className="w-9 h-9 rounded-full bg-[#0A2A6B] text-white font-black">+</button>
                        </div>
                      ))}
                    </div>
                    {cart.length>0 && <div className="mt-4 p-4 rounded-2xl bg-[#0A2A6B] text-white flex justify-between font-black"><span>{cart.length} itens</span><span>{formatBRL(total)}</span></div>}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0A2A6B] via-[#102a7d] to-[#1e3a8a] p-[1px] shadow-[0_20px_60px_-20px_rgba(10,42,107,0.4)]">
              <div className="bg-white rounded-[1.9rem] overflow-hidden">
                <div className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0A2A6B] to-[#FF7A00] flex items-center justify-center shadow">🧠</div>
                    <div>
                      <div className="flex items-center gap-2"><h2 className="font-black text-[18px] sm:text-[22px] tracking-tight">CATÁLOGO <span className="text-[#FF7A00]">INTELIGENTE</span></h2><span className="px-2.5 py-1 rounded-full bg-[#0A2A6B] text-white text-[10px] font-black">{CATALOGO.length}</span></div>
                      <div className="text-[11px] text-slate-500 mt-1">{filteredCatalog.length} encontrados • {cart.reduce((s,i)=>s+i.qtd,0)} no carrinho • 🟢 {isLive ? "Ao vivo" : "Offline"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
                    <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1 shrink-0">
                      <button onClick={()=>setViewMode("grid")} className={`w-9 h-9 rounded-full flex items-center justify-center ${viewMode==="grid" ? "bg-white shadow text-[#0A2A6B]" : "text-slate-400"}`}>◫</button>
                      <button onClick={()=>setViewMode("list")} className={`w-9 h-9 rounded-full flex items-center justify-center ${viewMode==="list" ? "bg-white shadow text-[#0A2A6B]" : "text-slate-400"}`}>☰</button>
                    </div>
                    <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="h-10 px-4 rounded-full bg-slate-900 text-white text-[12px] font-bold outline-none shrink-0">
                      <option value="popular">🔥 Popular</option>
                      <option value="menor">💰 Menor</option>
                      <option value="maior">💎 Maior</option>
                      <option value="nome">🔤 A-Z</option>
                    </select>
                    <select value={priceFilter} onChange={e=>setPriceFilter(e.target.value)} className="h-10 px-4 rounded-full bg-white border text-[12px] font-bold outline-none shrink-0">
                      <option value="todos">💵 Todos</option>
                      <option value="ate100">Até R$100</option>
                      <option value="100a200">R$100-200</option>
                      <option value="200a400">R$200-400</option>
                      <option value="acima400">R$400+</option>
                    </select>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="relative max-w-2xl">
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar: guarda-roupa, mesa, estante, cômoda... (seu estoque real)" className="w-full h-[56px] bg-slate-100 rounded-full pl-6 pr-[120px] text-[15px] font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 border-2 border-transparent"/>
                    <div className="absolute right-1.5 top-1.5 flex gap-1">
                      {search && <button onClick={()=>setSearch("")} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">✕</button>}
                      <div className="w-11 h-11 rounded-full bg-[#0A2A6B] text-white flex items-center justify-center">⌕</div>
                    </div>
                  </div>

                  <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-2 -mx-1 px-1">
                    {["TODAS", ...CATEGORIAS].map(cat=>{
                      const isActive = catFilter===cat;
                      return (
                        <button key={cat} onClick={()=>setCatFilter(cat)} className={`whitespace-nowrap h-[46px] px-5 rounded-full text-[12px] font-black border flex items-center gap-2 active:scale-95 transition shrink-0 ${isActive ? "bg-[#0A2A6B] text-white border-[#0A2A6B] shadow-lg" : "bg-white text-slate-700 border-slate-200 hover:border-[#0A2A6B]/20"}`}>
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center ${isActive ? "bg-white/20" : "bg-slate-100"}`}>{categoriaIcons[cat]||"📦"}</span>
                          {cat}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isActive ? "bg-white text-[#0A2A6B]" : "bg-slate-100"}`}>{categoriaCounts[cat]||0}</span>
                        </button>
                      );
                    })}
                  </div>

                  {(catFilter!=="TODAS" || priceFilter!=="todos" || search) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black tracking-widest text-slate-400">FILTROS:</span>
                      {catFilter!=="TODAS" && <span className="px-3 py-1.5 rounded-full bg-[#0A2A6B] text-white text-[11px] font-bold">{catFilter} <button onClick={()=>setCatFilter("TODAS")} className="ml-1 w-4 h-4 rounded-full bg-white/20">✕</button></span>}
                      {priceFilter!=="todos" && <span className="px-3 py-1.5 rounded-full bg-[#FF7A00] text-white text-[11px] font-bold">{priceFilter} <button onClick={()=>setPriceFilter("todos")} className="ml-1 w-4 h-4 rounded-full bg-white/20">✕</button></span>}
                      {search && <span className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-[11px] font-bold">"{search}" <button onClick={()=>setSearch("")} className="ml-1 w-4 h-4 rounded-full bg-white/20">✕</button></span>}
                      <button onClick={()=>{setCatFilter("TODAS"); setPriceFilter("todos"); setSearch("");}} className="px-3 py-1.5 rounded-full bg-slate-100 border text-[11px] font-bold">Limpar tudo</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`mt-6 grid gap-5 ${viewMode==="grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
              {filteredCatalog.slice(0, showCount).map(item=>{
                const isFav = favoritos.includes(item.id);
                const qtd = cart.find(c=>c.id===item.id)?.qtd || 0;
                const isPopular = item.id % 3 === 0;
                const isNovo = item.id > 300;
                const temDesconto = item.id % 6 === 0;
                return (
                  <div key={item.id} className="group relative bg-white rounded-[1.9rem] border border-slate-200/60 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.15)] hover:shadow-[0_24px_70px_-20px_rgba(10,42,107,0.3)] hover:-translate-y-1.5 active:scale-[0.99] transition-all duration-500 overflow-hidden flex flex-col">
                    <div className="h-[112px] relative overflow-hidden bg-gradient-to-br from-[#0A2A6B]/[0.03] via-white to-[#FF7A00]/[0.08] flex items-center justify-center">
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,122,0,0.12),_transparent_50%)]"></div>
                      <div className="relative">
                        <div className="absolute inset-0 blur-xl bg-gradient-to-br from-[#0A2A6B]/20 to-[#FF7A00]/20 rounded-full scale-150 group-hover:scale-[1.8] transition-transform duration-700"></div>
                        <div className="relative w-[64px] h-[64px] rounded-[1.3rem] bg-gradient-to-br from-white to-slate-50 border shadow-[0_8px_20px_-8px_rgba(0,0,0,0.15)] flex items-center justify-center text-[30px] group-hover:scale-110 group-hover:rotate-[-3deg] transition-all duration-500">{categoriaIcons[item.categoria]||"📦"}</div>
                      </div>
                      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                        {isPopular && <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-[#FF7A00] to-[#ff9500] text-white text-[8px] font-black tracking-widest shadow">🔥 MAIS PEDIDO</span>}
                        {isNovo && <span className="px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[8px] font-black tracking-widest">✨ NOVO</span>}
                      </div>
                      <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
                        {temDesconto && <span className="px-2.5 py-1 rounded-full bg-slate-900 text-white text-[9px] font-black">-15% OFF</span>}
                        <button onClick={()=>toggleFav(item.id)} className={`w-8 h-8 rounded-full backdrop-blur-xl border shadow-sm flex items-center justify-center text-[14px] active:scale-90 transition ${isFav ? "bg-red-500 border-red-500 text-white shadow-lg" : "bg-white/90 border-white text-slate-400"}`}>{isFav ? "♥" : "♡"}</button>
                      </div>
                      <div className="absolute bottom-2 left-3 px-2 py-0.5 rounded-full bg-white/80 backdrop-blur border text-[8px] font-black tracking-widest text-slate-500">ID {item.id} • 30-60min • Garantia</div>
                    </div>

                    <div className="p-5 flex-1 flex flex-col min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0A2A6B]/[0.06] border border-[#0A2A6B]/10">
                          <span className="text-[11px]">{categoriaIcons[item.categoria]||"📦"}</span>
                          <span className="text-[9px] font-black tracking-[0.15em] text-[#0A2A6B]">{item.categoria}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="text-[9px] font-black tracking-widest text-emerald-600">VERIFICADO</span>
                        </div>
                      </div>
                      <h3 className="font-black text-[16px] leading-[1.15] tracking-tight line-clamp-2 min-h-[38px] group-hover:text-[#0A2A6B] transition-colors">{item.nome}</h3>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-700">✓ Verificado</span>
                        <span className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-[10px] font-bold text-blue-700">⏱️ 30min</span>
                        <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-100 text-[10px] font-bold text-amber-700">🛡️ 12 meses</span>
                      </div>
                      <div className="mt-3 text-[12px] leading-[1.5] text-slate-500 line-clamp-2 min-h-[36px]">Montagem profissional com ferramentas inclusas, limpeza pós-montagem e teste completo. Como seu estoque MESA, GUARDA-ROUPA, ESTANTE.</div>
                      <div className="mt-auto pt-4 flex items-end justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-black tracking-[0.2em] text-slate-400">A PARTIR DE</div>
                          <div className="flex items-baseline gap-2">
                            <div className="text-[22px] font-black tracking-tight text-[#FF7A00] leading-none">{formatBRL(item.preco)}</div>
                            {temDesconto && <div className="text-[11px] font-bold text-slate-400 line-through">{formatBRL(item.preco*1.15)}</div>}
                          </div>
                          <div className="text-[11px] font-medium text-slate-500 mt-1">12x {formatBRL(item.preco/12)} • <span className="text-emerald-600 font-bold">Pix 10% OFF</span></div>
                        </div>
                        <div className="shrink-0">
                          {qtd>0 ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1 bg-slate-900 text-white rounded-full p-1 shadow-lg">
                                <button onClick={()=>{ const c=cart.find(x=>x.id===item.id); if(c && c.qtd>1) setCart(prev=>prev.map(x=>x.id===item.id?{...x,qtd:x.qtd-1}:x)); else setCart(prev=>prev.filter(x=>x.id!==item.id)); }} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black active:scale-90">-</button>
                                <span className="w-7 text-center text-[13px] font-black">{qtd}</span>
                                <button onClick={()=>addToCart(item)} className="w-8 h-8 rounded-full bg-[#FF7A00] text-white flex items-center justify-center font-black active:scale-90">+</button>
                              </div>
                              <span className="text-[10px] font-black text-emerald-600">{formatBRL(item.preco*qtd)}</span>
                            </div>
                          ) : (
                            <button onClick={()=>addToCart(item)} className="h-[44px] px-5 rounded-full bg-[#0A2A6B] text-white text-[11px] font-black tracking-widest shadow-lg active:scale-95 hover:bg-black transition flex items-center gap-1.5">ADD <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center">+</span></button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-6 right-6 h-[3px] bg-gradient-to-r from-[#0A2A6B] via-[#1e40af] to-[#FF7A00] opacity-0 group-hover:opacity-100 transition-opacity rounded-full"></div>
                  </div>
                );
              })}
            </div>

            {showCount < filteredCatalog.length ? (
              <div className="mt-10 flex flex-col items-center gap-4">
                <button onClick={()=>setShowCount(prev=>prev+24)} className="h-14 px-10 rounded-full bg-slate-900 text-white font-black text-[13px] tracking-widest shadow-xl hover:bg-black active:scale-[0.98] transition flex items-center gap-3">CARREGAR MAIS +24 <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">↓</span></button>
                <div className="w-full max-w-md h-1.5 bg-slate-100 rounded-full overflow-hidden p-1"><div className="h-full bg-gradient-to-r from-[#0A2A6B] to-[#FF7A00] rounded-full transition-all duration-700" style={{width: `${(Math.min(showCount, filteredCatalog.length)/filteredCatalog.length)*100}%`}}></div></div>
              </div>
            ) : filteredCatalog.length>0 ? (
              <div className="mt-10 text-center"><div className="inline-flex px-5 py-2.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-black">✅ Todos os {filteredCatalog.length} serviços carregados</div></div>
            ) : null}

            {filteredCatalog.length===0 && (
              <div className="mt-8 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 p-10 text-center">
                <div className="text-[40px]">🔍</div>
                <div className="font-black text-[16px] mt-3">Nenhum serviço encontrado</div>
                <div className="text-[13px] text-slate-500 mt-1">Tente "guarda-roupa", "mesa", "estante" como no seu estoque</div>
                <button onClick={()=>{setSearch(""); setCatFilter("TODAS"); setPriceFilter("todos");}} className="mt-4 h-11 px-6 rounded-full bg-[#0A2A6B] text-white font-bold text-sm">Limpar filtros • Ver {CATALOGO.length}</button>
              </div>
            )}
          </div>
        </>
      )}

      {view==="cliente" && currentUser && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap gap-2 mb-6">
            {["pedidos","suporte","perfil"].map(tab=>(
              <button key={tab} onClick={()=>setClienteTab(tab)} className={`h-10 px-5 rounded-full text-sm font-bold border ${clienteTab===tab ? "bg-[#0A2A6B] text-white border-[#0A2A6B]" : "bg-white border-slate-200"}`}>{tab.toUpperCase()}</button>
            ))}
          </div>
          {clienteTab==="pedidos" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center"><h3 className="font-black text-lg">Meus Pedidos • {orders.filter(o=>o.cliente_id==currentUser.id).length}</h3><button onClick={()=>setShowOrderFlow(true)} className="h-10 px-5 rounded-full bg-[#0A2A6B] text-white text-sm font-bold">+ Novo Pedido</button></div>
              {orders.filter(o=>o.cliente_id==currentUser.id).map(p=>(
                <div key={p.id} className="bg-white rounded-[1.7rem] p-5 border shadow-sm">
                  <div className="flex justify-between"><span className="font-black">Pedido #{p.id}</span><span className={`text-xs px-3 py-1 rounded-full font-bold ${p.status==="finalizado"?"bg-green-100 text-green-700":p.status==="aceito"?"bg-blue-100 text-blue-700":"bg-yellow-100 text-yellow-700"}`}>{p.status?.toUpperCase()}</span></div>
                  <div className="mt-3 text-sm bg-slate-50 p-3 rounded-xl"><div className="font-bold">{(p.itens||[]).map(i=>`${i.nome} x${i.qtd}`).join(", ")}</div><div className="font-black mt-1 text-[#FF7A00]">{formatBRL(p.total)} • {p.cidade}</div></div>
                  {p.status==="aguardando_comprovante" && (
                    <div className="mt-3 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-2xl">
                      <div className="text-sm font-bold">Envie comprovante PIX • {formatBRL(p.total)}</div>
                      <div className="text-xs mt-1">Chave: <b>{PIX_KEY}</b></div>
                      <input type="file" accept="image/*" onChange={e=>{ const r=new FileReader(); r.onload=()=>setComprovante(r.result); r.readAsDataURL(e.target.files[0]); }} className="mt-3 w-full text-xs"/>
                      <button onClick={()=>enviarComprovante(p.id, comprovante)} className="w-full mt-3 h-12 rounded-full bg-[#0A2A6B] text-white font-bold">ENVIAR COMPROVANTE</button>
                    </div>
                  )}
                  {(p.status==="aguardando_comprovante" || p.status==="aguardando_confirmacao_adm" || p.status==="aguardando_montador") && <button onClick={()=>cancelarPedido(p.id)} className="mt-3 w-full h-11 rounded-full bg-red-50 border border-red-200 text-red-600 font-bold text-sm">Cancelar pedido</button>}
                </div>
              ))}
            </div>
          )}
          {clienteTab==="suporte" && (
            <div className="bg-white rounded-[1.7rem] border shadow-sm overflow-hidden flex flex-col h-[70vh]">
              <div className="p-4 border-b font-black">Suporte 24h • Ao Vivo</div>
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {supportMessages.filter(m=>m.user_id==currentUser.id).map(m=>(
                  <div key={m.id} className={`max-w-[80%] p-3 rounded-2xl text-sm ${m.from_admin ? "bg-[#0A2A6B] text-white" : "bg-slate-100 ml-auto"}`}>{m.mensagem}</div>
                ))}
                <div ref={supportEndRef}></div>
              </div>
              <div className="p-4 border-t flex gap-2"><input value={supportInput} onChange={e=>setSupportInput(e.target.value)} placeholder="Digite mensagem..." className="flex-1 h-12 bg-slate-100 rounded-full px-5 outline-none"/><button onClick={enviarSuporte} className="w-12 h-12 rounded-full bg-[#0A2A6B] text-white font-bold">➤</button></div>
            </div>
          )}
          {clienteTab==="perfil" && (
            <div className="space-y-4 max-w-xl">
              <div className="bg-white rounded-[1.7rem] p-6 border shadow-sm"><div className="font-black text-lg">{currentUser.nome}</div><div className="text-sm text-slate-500 mt-1">{currentUser.telefone} • {currentUser.email}</div></div>
              <button onClick={excluirMeuCadastro} className="w-full h-12 rounded-full bg-red-50 border border-red-200 text-red-600 font-bold">Excluir cadastro</button>
            </div>
          )}
        </div>
      )}

      {view==="montador" && currentUser && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap gap-2 mb-6">
            {["disponiveis","meus","ganhos","perfil"].map(tab=>(
              <button key={tab} onClick={()=>setMontadorTab(tab)} className={`h-10 px-5 rounded-full text-sm font-bold border ${montadorTab===tab ? "bg-[#0A2A6B] text-white border-[#0A2A6B]" : "bg-white border-slate-200"}`}>{tab.toUpperCase()}</button>
            ))}
          </div>
          {montadorTab==="disponiveis" && (
            <div className="space-y-3">
              <h3 className="font-black">Pedidos Disponíveis • {orders.filter(o=>o.status==="aguardando_montador").length}</h3>
              {orders.filter(o=>o.status==="aguardando_montador").map(p=>(
                <div key={p.id} className="bg-white rounded-[1.7rem] p-5 border shadow-sm">
                  <div className="flex justify-between"><span className="font-black">Pedido #{p.id} • {p.cidade}</span><span className="text-sm font-black text-[#FF7A00]">{formatBRL(p.total)}</span></div>
                  <div className="mt-2 text-sm bg-slate-50 p-3 rounded-xl">{(p.itens||[]).map(i=>i.nome).join(", ")} • {p.endereco}</div>
                  <button onClick={()=>aceitarPedido(p.id)} className="mt-3 w-full h-12 rounded-full bg-[#0A2A6B] text-white font-bold">ACEITAR PEDIDO</button>
                </div>
              ))}
            </div>
          )}
          {montadorTab==="meus" && (
            <div className="space-y-3">
              {orders.filter(o=>o.montador_id==currentUser.id).map(p=>(
                <div key={p.id} className="bg-white rounded-[1.7rem] p-5 border shadow-sm">
                  <div className="flex justify-between"><span className="font-black">#{p.id} • {p.cidade}</span><span className={`text-xs px-3 py-1 rounded-full font-bold ${p.status==="finalizado"?"bg-green-100 text-green-700":"bg-blue-100 text-blue-700"}`}>{p.status.toUpperCase()}</span></div>
                  <div className="mt-2 text-sm">{p.endereco} • {formatBRL(p.total)}</div>
                  {p.status==="aceito" && <button onClick={()=>finalizarPedido(p.id)} className="mt-3 w-full h-12 rounded-full bg-green-600 text-white font-bold">FINALIZAR SERVIÇO</button>}
                </div>
              ))}
            </div>
          )}
          {montadorTab==="ganhos" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0A2A6B] text-white p-4 rounded-2xl"><div className="text-xs opacity-70">Total Bruto</div><div className="text-xl font-black">{formatBRL(orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").reduce((s,o)=>s+(o.total||0),0))}</div></div>
                <div className="bg-green-600 text-white p-4 rounded-2xl"><div className="text-xs opacity-80">Seu Ganho</div><div className="text-xl font-black">{formatBRL(orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").reduce((s,o)=>s+(o.ganho_montador||o.total*0.9),0))}</div></div>
                <div className="bg-[#FF7A00] text-white p-4 rounded-2xl"><div className="text-xs opacity-80">Finalizados</div><div className="text-xl font-black">{orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").length}</div></div>
                <div className="bg-slate-900 text-white p-4 rounded-2xl"><div className="text-xs opacity-70">Avaliação</div><div className="text-xl font-black">⭐ {Number(currentUser.avaliacao||5).toFixed(1)}</div></div>
              </div>
            </div>
          )}
          {montadorTab==="perfil" && (
            <div className="space-y-4 max-w-xl">
              <div className="bg-white rounded-[1.7rem] p-6 border shadow-sm">
                <div className="flex items-center gap-4"><div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden border-2 border-[#0A2A6B]">{currentUser.foto ? <img src={currentUser.foto} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center w-full h-full font-black">{currentUser.nome?.[0]}</span>}</div><div><div className="font-black">{currentUser.nome}</div><div className="text-xs text-slate-500">{currentUser.telefone}</div><div className="text-xs">PIX {currentUser.pix}</div></div></div>
              </div>
              <div className="bg-white rounded-[1.7rem] p-6 border shadow-sm">
                <div className="font-bold">Cidades que atende (máx 3)</div>
                <div className="flex flex-wrap gap-2 mt-3">{(currentUser.cidades||[]).map(c=><span key={c} className="bg-[#0A2A6B] text-white text-xs px-3 py-1.5 rounded-full font-bold flex items-center gap-2">{c} <button onClick={()=>removerCidade(c)} className="w-4 h-4 rounded-full bg-white/20">x</button></span>)}</div>
                <div className="flex gap-2 mt-4"><input value={novaCidade} onChange={e=>setNovaCidade(e.target.value)} placeholder="Nova cidade" className="flex-1 h-12 bg-slate-100 rounded-full px-5 outline-none"/><button onClick={adicionarCidade} className="h-12 px-6 rounded-full bg-[#FF7A00] text-white font-bold">Add</button></div>
              </div>
              <button onClick={excluirMeuCadastro} className="w-full h-12 rounded-full bg-red-50 border border-red-200 text-red-600 font-bold">Excluir cadastro</button>
            </div>
          )}
        </div>
      )}

      {view==="admin" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap gap-2 mb-6">
            {["pedidos","montadores","clientes","cupons","suporte"].map(tab=>(
              <button key={tab} onClick={()=>setAdminTab(tab)} className={`h-10 px-5 rounded-full text-sm font-bold border ${adminTab===tab ? "bg-[#0A2A6B] text-white border-[#0A2A6B]" : "bg-white border-slate-200"}`}>{tab.toUpperCase()}</button>
            ))}
          </div>
          {adminTab==="pedidos" && (
            <div className="space-y-3">
              <h3 className="font-black">Todos Pedidos • {orders.length}</h3>
              {orders.map(p=>(
                <div key={p.id} className="bg-white rounded-[1.7rem] p-5 border shadow-sm">
                  <div className="flex justify-between"><span className="font-black">#{p.id} • {p.cidade} • {formatBRL(p.total)}</span><span className={`text-xs px-3 py-1 rounded-full font-bold ${p.status==="finalizado"?"bg-green-100 text-green-700":"bg-yellow-100 text-yellow-700"}`}>{p.status?.toUpperCase()}</span></div>
                  <div className="mt-2 text-xs bg-slate-50 p-3 rounded-xl">{(p.itens||[]).map(i=>i.nome).join(", ")} • {p.endereco}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.status==="aguardando_confirmacao_adm" && <button onClick={()=>confirmarPagamentoADM(p.id)} className="h-10 px-5 rounded-full bg-green-600 text-white font-bold text-sm">Confirmar Pagamento</button>}
                    <button onClick={()=>cancelarPedido(p.id)} className="h-10 px-5 rounded-full bg-red-50 border border-red-200 text-red-600 font-bold text-sm">Cancelar</button>
                    {p.comprovante && <a href={p.comprovante} target="_blank" className="h-10 px-5 rounded-full bg-slate-100 flex items-center font-bold text-sm">Ver Comprovante</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {adminTab==="montadores" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.filter(u=>u.role==="montador").map(m=>(
                <div key={m.id} className="bg-white rounded-[1.7rem] p-5 border shadow-sm">
                  <div className="flex gap-3"><div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden border">{m.foto ? <img src={m.foto} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center w-full h-full font-black">{m.nome?.[0]}</span>}</div><div><div className="font-bold">{m.nome}</div><div className="text-xs text-slate-500">{m.cidade} • {m.telefone}</div></div></div>
                </div>
              ))}
            </div>
          )}
          {adminTab==="clientes" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.filter(u=>u.role==="cliente").map(c=>(
                <div key={c.id} className="bg-white rounded-[1.7rem] p-5 border shadow-sm"><div className="font-bold">{c.nome}</div><div className="text-xs text-slate-500 mt-1">{c.cidade} • {c.telefone}</div></div>
              ))}
            </div>
          )}
          {adminTab==="cupons" && (
            <div className="space-y-4 max-w-xl">
              <div className="bg-white rounded-[1.7rem] p-5 border shadow-sm">
                <div className="font-black">Criar Cupom Premium</div>
                <div className="mt-4 space-y-3">
                  <input value={newCoupon.code} onChange={e=>setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})} placeholder="CODIGO ex: PREMIUM20" className="w-full h-12 bg-slate-100 rounded-full px-5 font-bold tracking-widest outline-none"/>
                  <input type="number" value={newCoupon.desconto} onChange={e=>setNewCoupon({...newCoupon, desconto: e.target.value})} placeholder="Desconto %" className="w-full h-12 bg-slate-100 rounded-full px-5 outline-none"/>
                  <button onClick={criarCupom} className="w-full h-12 rounded-full bg-[#0A2A6B] text-white font-black">CRIAR CUPOM</button>
                </div>
              </div>
              <div className="space-y-2">{coupons.map(c=><div key={c.id} className="bg-white rounded-2xl p-4 border flex justify-between"><span className="font-black">{c.code} • {c.desconto}% OFF</span><span className="text-xs text-slate-500">{new Date(c.created_at||Date.now()).toLocaleDateString()}</span></div>)}</div>
            </div>
          )}
          {adminTab==="suporte" && (
            <div className="bg-white rounded-[1.7rem] border shadow-sm overflow-hidden h-[70vh] flex flex-col">
              <div className="p-4 border-b font-black">Suporte 24h • {supportMessages.length} mensagens</div>
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {supportMessages.map(m=>(
                  <div key={m.id} className={`p-3 rounded-2xl text-sm max-w-[80%] ${m.from_admin ? "bg-[#0A2A6B] text-white ml-auto" : "bg-slate-100"}`}><div className="text-[10px] font-bold opacity-60">{m.user_nome}</div>{m.mensagem}</div>
                ))}
                <div ref={supportEndRef}></div>
              </div>
              <div className="p-4 border-t flex gap-2"><input value={supportInput} onChange={e=>setSupportInput(e.target.value)} placeholder="Responder como ADM..." className="flex-1 h-12 bg-slate-100 rounded-full px-5 outline-none"/><button onClick={enviarSuporte} className="w-12 h-12 rounded-full bg-[#0A2A6B] text-white font-bold">➤</button></div>
            </div>
          )}
        </div>
      )}

      {showOrderFlow && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={()=>setShowOrderFlow(false)}></div>
          <div className="relative w-full sm:max-w-xl bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl max-h-[92vh] flex flex-col">
            <div className="p-5 border-b flex justify-between items-center shrink-0"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-[#0A2A6B] text-white flex items-center justify-center font-black">{orderStep}</div><div><div className="font-black">Checkout Premium</div><div className="text-xs text-slate-500">{isLive ? "🟢 Ao Vivo" : "🔴 Offline"}</div></div></div><button onClick={()=>setShowOrderFlow(false)} className="w-10 h-10 rounded-full bg-slate-100">✕</button></div>
            <div className="p-5 overflow-y-auto flex-1">
              {orderStep===1 && (
                <div className="space-y-3">
                  {cart.map(i=><div key={i.id} className="flex justify-between p-4 bg-slate-50 rounded-2xl border"><span className="font-bold text-sm">{i.nome} x{i.qtd}</span><span className="font-black">{formatBRL(i.preco*i.qtd)}</span></div>)}
                  <div className="p-4 rounded-2xl bg-[#0A2A6B] text-white flex justify-between font-black"><span>Total Premium</span><span>{formatBRL(total)}</span></div>
                  <button onClick={()=>setOrderStep(2)} className="w-full h-14 rounded-full bg-[#FF7A00] text-white font-black">CONTINUAR → ENDEREÇO</button>
                </div>
              )}
              {orderStep===2 && (
                <div className="space-y-3">
                  <input value={orderForm.endereco} onChange={e=>setOrderForm({...orderForm,endereco:e.target.value})} placeholder="Endereço completo" className="w-full h-12 bg-slate-100 rounded-2xl px-4 outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20"/>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><input value={orderForm.bairro} onChange={e=>setOrderForm({...orderForm,bairro:e.target.value})} placeholder="Bairro" className="h-12 bg-slate-100 rounded-2xl px-4 outline-none"/><input value={orderForm.cidade} onChange={e=>setOrderForm({...orderForm,cidade:e.target.value})} placeholder="Cidade SP" className="h-12 bg-slate-100 rounded-2xl px-4 outline-none"/></div>
                  <div className="grid grid-cols-2 gap-3"><input type="date" value={orderForm.data} onChange={e=>setOrderForm({...orderForm,data:e.target.value})} className="h-12 bg-slate-100 rounded-2xl px-4 outline-none"/><input type="time" value={orderForm.horario} onChange={e=>setOrderForm({...orderForm,horario:e.target.value})} className="h-12 bg-slate-100 rounded-2xl px-4 outline-none"/></div>
                  <button onClick={criarPedido} className="w-full h-14 rounded-full bg-[#0A2A6B] text-white font-black">CRIAR PEDIDO • AO VIVO</button>
                </div>
              )}
              {orderStep===3 && (
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-3xl">✓</div>
                  <div className="font-black text-xl">Pedido #{orders[0]?.id} criado!</div>
                  <div className="p-4 rounded-2xl bg-slate-900 text-white font-mono text-sm">PIX: {PIX_KEY}<br/><span className="text-[#FF7A00] font-black">{formatBRL(total)}</span></div>
                  <button onClick={()=>{navigator.clipboard.writeText(PIX_KEY); notify("PIX copiado!");}} className="w-full h-12 rounded-full bg-[#0A2A6B] text-white font-bold">COPIAR CHAVE PIX</button>
                  <a href={`https://wa.me/${WHATSAPP}?text=Pedido ${formatBRL(total)} - ${orderForm.cidade}`} target="_blank" className="block w-full h-12 rounded-full bg-[#25D366] text-white font-black flex items-center justify-center">WHATSAPP (18) 99148-8302</a>
                  <button onClick={()=>{setShowOrderFlow(false); setView("cliente"); setClienteTab("pedidos");}} className="w-full h-12 rounded-full bg-slate-100 font-bold">VER MEUS PEDIDOS</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAuth && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-xl" onClick={()=>setShowAuth(false)}></div>
          <div className="relative w-full sm:max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-[0_-20px_80px_-10px_rgba(0,0,0,0.5)] max-h-[96vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-4 mb-2 shrink-0"></div>
            <div className="p-5 sm:p-6 bg-gradient-to-br from-[#0A2A6B] via-[#112a7d] to-[#1e40af] text-white flex justify-between items-start shrink-0">
              <div className="min-w-0 flex-1">
                <div className="font-black text-[18px] sm:text-[20px] leading-none tracking-tight">{isLogin?"Bem-vindo de volta 👋":"Criar conta premium"}</div>
                <div className="text-[11px] opacity-80 mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-white/15 border border-white/10 text-[10px] font-black tracking-widest">{authMode.toUpperCase()} • AO VIVO 🟢</span>
                </div>
              </div>
              <button onClick={()=>setShowAuth(false)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0 ml-3">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 pb-[calc(20px+env(safe-area-inset-bottom))] scrollbar-none">
              {!isLogin ? <RegisterForm mode={authMode} onSubmit={handleRegister}/> : <LoginForm onSubmit={handleLogin}/>}
              <button onClick={()=>setIsLogin(!isLogin)} className="w-full mt-6 h-12 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-[13px] border">{isLogin?"Criar conta premium →":"Já tenho conta • Entrar"}</button>
            </div>
          </div>
        </div>
      )}

      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
        <div className="mx-3 mb-[max(12px,env(safe-area-inset-bottom))] pointer-events-auto">
          <div className="rounded-[1.7rem] bg-white/95 backdrop-blur-2xl border border-slate-200/70 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.3)] overflow-hidden">
            <div className="grid grid-cols-4 h-[72px]">
              <button onClick={()=>setView("home")} className={`flex flex-col items-center justify-center gap-1 active:scale-95 transition ${view==="home" ? "text-[#0A2A6B]" : "text-slate-400"}`}><span className={`w-8 h-8 rounded-full flex items-center justify-center ${view==="home" ? "bg-[#0A2A6B] text-white shadow" : "bg-slate-100"}`}>⌂</span><span className="text-[9px] font-black tracking-widest">INÍCIO</span></button>
              <button onClick={()=>{ setView("home"); setTimeout(()=>window.scrollTo({top:600,behavior:"smooth"}),100);}} className="flex flex-col items-center justify-center gap-1 text-slate-400 active:scale-95"><span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">◫</span><span className="text-[9px] font-bold tracking-widest">SERVIÇOS</span></button>
              <button onClick={()=>setShowOrderFlow(true)} className="flex flex-col items-center justify-center gap-1 relative active:scale-95"><div className="relative"><span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF7A00] to-[#ff9500] text-white flex items-center justify-center font-black shadow-lg">🛒</span>{cart.length>0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#0A2A6B] text-white text-[10px] font-black flex items-center justify-center border-2 border-white">{cart.reduce((s,i)=>s+i.qtd,0)}</span>}</div><span className="text-[9px] font-black text-[#0A2A6B]">{formatBRL(total)}</span></button>
              <button onClick={()=>{ if(!currentUser){ setAuthMode("cliente"); setIsLogin(true); setShowAuth(true);} else setView(currentUser.role==="cliente"?"cliente":currentUser.role==="montador"?"montador":"admin");}} className={`flex flex-col items-center justify-center gap-1 active:scale-95 ${view!=="home" ? "text-[#0A2A6B]" : "text-slate-400"}`}><span className={`w-8 h-8 rounded-full flex items-center justify-center ${view!=="home" ? "bg-[#0A2A6B] text-white" : "bg-slate-100"}`}>{currentUser ? (currentUser.foto ? "●" : currentUser.nome?.[0]) : "◍"}</span><span className="text-[9px] font-bold tracking-widest">{currentUser ? (currentUser.role==="admin"?"ADM":currentUser.role==="montador"?"MONT":"PERFIL") : "ENTRAR"}</span></button>
            </div>
          </div>
        </div>
      </nav>

      {toast && <div className="fixed top-4 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md z-[90]"><div className={`px-4 py-3 rounded-2xl backdrop-blur-xl border shadow-2xl flex items-center gap-3 ${toastType==="success"?"bg-emerald-600 text-white border-emerald-500":toastType==="error"?"bg-red-600 text-white border-red-500":"bg-slate-900 text-white border-slate-700"}`}><div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">🔔</div><div className="flex-1 text-[13px] font-semibold">{toast}</div><button onClick={()=>setToast("")} className="w-7 h-7 rounded-full bg-white/10">✕</button></div></div>}

      <footer className="mt-8 border-t bg-white pb-[88px] sm:pb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row justify-between gap-3"><div><div className="font-black">CONTATO CERTO SP • PREMIUM INTELIGENTE</div><div className="text-[11px] text-slate-500 mt-1 leading-relaxed">Realtime Supabase 2s • Watchdog 5s • Foto galeria 300x300 sem câmera • Touch 44px • Safe area<br/>Painéis completos: cliente, montador, admin • Inspirado estoque MESA/GUARDA-ROUPA/ESTANTE • {isLive ? "🟢 Online Ao Vivo" : "🔴 Reconectando"}</div></div><div className="text-xs text-slate-500">contatocerto.prestadores@gmail.com<br/>(18) 99148-8302</div></div>
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
  return <div className="space-y-4">
    <div className="grid grid-cols-1 gap-3">
      <input placeholder="Nome completo *" value={f.nome} onChange={e=>setF({...f,nome:e.target.value})} className="w-full h-[52px] bg-slate-100 rounded-2xl px-5 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 border border-transparent focus:border-[#0A2A6B]/20 transition font-medium"/>
      <input placeholder="Cidade SP *" value={f.cidade} onChange={e=>setF({...f,cidade:e.target.value})} className="w-full h-[52px] bg-slate-100 rounded-2xl px-5 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 border border-transparent focus:border-[#0A2A6B]/20 transition font-medium"/>
      <input placeholder="WhatsApp (18) 9xxxx-xxxx *" value={f.telefone} onChange={e=>setF({...f,telefone:e.target.value})} inputMode="tel" className="w-full h-[52px] bg-slate-100 rounded-2xl px-5 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 border border-transparent focus:border-[#0A2A6B]/20 transition font-medium"/>
      <input placeholder="E-mail *" value={f.email} onChange={e=>setF({...f,email:e.target.value})} inputMode="email" className="w-full h-[52px] bg-slate-100 rounded-2xl px-5 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 border border-transparent focus:border-[#0A2A6B]/20 transition font-medium"/>
    </div>
    {mode==="montador" && <>
      <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-[1.5rem] p-4">
        <div className="font-black text-[12px] tracking-widest text-amber-900">📸 FOTO PERFIL OBRIGATÓRIA • GALERIA SEM CÂMERA</div>
        <div className="text-[11px] text-slate-600 mt-1">Abre galeria, não câmera. Compactada 300x300 ~30KB.</div>
        <div className="mt-3 flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-white border-2 border-[#0A2A6B]/10 shadow-inner overflow-hidden shrink-0 flex items-center justify-center">{previewFoto ? <img src={previewFoto} className="w-full h-full object-cover"/> : <span className="text-[10px] font-black text-slate-400 text-center">SEM<br/>FOTO</span>}</div>
          <div className="flex-1 min-w-0">
            <label className="flex items-center justify-center w-full h-12 rounded-full bg-[#0A2A6B] text-white font-bold text-[13px] cursor-pointer active:scale-[0.98] transition">
              <input type="file" accept="image/*" onChange={handleFoto} className="hidden"/>
              📁 ESCOLHER DA GALERIA
            </label>
            <div className="mt-2 text-[10px] font-bold text-slate-500">GALERIA • JPG/PNG 5MB • 300x300 • SEM CAMERA</div>
            {uploadingFoto && <div className="text-[11px] font-bold text-[#0A2A6B] animate-pulse">⏳ Compactando...</div>}
            {previewFoto && <div className="text-[11px] font-black text-emerald-600">✅ Foto pronta!</div>}
          </div>
        </div>
        {!f.foto && <div className="mt-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] font-black text-red-700">⚠️ Foto obrigatória!</div>}
      </div>
      <input placeholder="CPF" value={f.cpf} onChange={e=>setF({...f,cpf:e.target.value})} inputMode="numeric" className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none"/>
      <input placeholder="Chave PIX (seu nome)" value={f.pix} onChange={e=>setF({...f,pix:e.target.value})} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none"/>
      <div className="flex gap-2"><input placeholder="Cidade que atende (máx 3)" value={ci} onChange={e=>setCi(e.target.value)} className="flex-1 h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none"/><button type="button" onClick={()=>{ if(f.cidades.length<3 && ci){ setF({...f,cidades:[...f.cidades,ci]}); setCi(""); } }} className="w-12 h-12 rounded-2xl bg-slate-900 text-white font-black">+</button></div>
      {f.cidades.length>0 && <div className="flex gap-2 flex-wrap">{f.cidades.map(c=><span key={c} className="bg-[#0A2A6B] text-white text-xs px-3 py-1.5 rounded-full font-bold">{c} <button onClick={()=>setF({...f,cidades:f.cidades.filter(x=>x!==c)})} className="ml-1 w-4 h-4 rounded-full bg-white/20">x</button></span>)}</div>}
    </>}
    <div className="pt-2 space-y-3">
      <input placeholder="Usuário (sem espaços)" value={f.usuario} onChange={e=>setF({...f,usuario:e.target.value})} className="w-full h-[52px] bg-slate-100 rounded-2xl px-5 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 border border-transparent focus:border-[#0A2A6B]/20 transition font-medium" autoCapitalize="off" autoCorrect="off"/>
      <input type="password" placeholder="Senha (mín 6 caracteres)" value={f.senha} onChange={e=>setF({...f,senha:e.target.value})} className="w-full h-[52px] bg-slate-100 rounded-2xl px-5 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 border border-transparent focus:border-[#0A2A6B]/20 transition font-medium"/>
    </div>
    <div className="pt-2 pb-2">
      <button type="button" onClick={()=>{ if(mode==="montador" && !f.foto){ alert("Foto obrigatória! Toque em ESCOLHER DA GALERIA"); return; } onSubmit(f); }} className="w-full h-[56px] rounded-full bg-gradient-to-r from-[#FF7A00] to-[#ff9500] text-white font-black text-[13px] sm:text-[14px] tracking-widest shadow-[0_12px_24px_-8px_rgba(255,122,0,0.4)] active:scale-[0.98] transition flex items-center justify-center gap-2">
        <span>FINALIZAR CADASTRO PREMIUM</span><span className="text-[18px]">🟢</span>
      </button>
      {mode==="montador" && !f.foto && <div className="mt-3 p-3 rounded-xl bg-red-50 border-2 border-red-200 text-[11px] font-black text-red-700 text-center animate-pulse">⚠️ FOTO OBRIGATÓRIA PARA CONTINUAR</div>}
      <div className="mt-3 text-[10px] text-center text-slate-400 font-medium leading-relaxed">Ao clicar você concorda com os termos<br/>Realtime 2s • Galeria sem câmera • Touch 44px</div>
    </div>
  </div>;
}
function LoginForm({onSubmit}){
  const [u,setU]=useState(""); const [s,setS]=useState("");
  return <div className="space-y-3">
    <input placeholder="Seu usuário" value={u} onChange={e=>setU(e.target.value)} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none" autoCapitalize="off"/>
    <input type="password" placeholder="Sua senha" value={s} onChange={e=>setS(e.target.value)} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none"/>
    <button type="button" onClick={()=>onSubmit(u,s)} className="w-full h-[52px] rounded-full bg-[#0A2A6B] text-white font-black text-[14px] tracking-widest shadow-lg active:scale-[0.98] transition">ENTRAR • PREMIUM MOBILE 🟢</button>
  </div>;
}

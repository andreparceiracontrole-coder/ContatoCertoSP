
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
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white border border-slate-200 shadow-sm p-1.5 shrink-0 flex items-center justify-center overflow-hidden"><img src="/logo.png" alt="Contato Certo SP" className="w-full h-full object-contain" onError={(e)=>{e.target.style.display="none"; e.target.nextSibling.style.display="flex"}}/><div className="hidden w-full h-full bg-gradient-to-br from-[#0A2A6B] to-[#FF7A00] rounded-xl items-center justify-center text-white font-black text-[14px]">CC</div></div>
            <div className="min-w-0">
              <div className="font-black text-[14px] sm:text-[16px] tracking-tight text-[#0A2A6B] leading-none">CONTATO CERTO SP</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] font-black tracking-widest text-[#FF7A00]">SERVIÇO PREMIUM</span>
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
              <div className="max-w-3xl">
                <div>
                  <div className="inline-flex px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold tracking-widest">✅ SERVIÇO PREMIUM • 330 TIPOS DE MÓVEIS • ATENDEMOS TODO SP</div>
                  <h1 className="mt-4 text-[38px] sm:text-[60px] font-black leading-[0.85] tracking-tight">MONTADOR<br/><span className="text-[#FF7A00]">VERIFICADO</span><br/>EM 30 MIN</h1>
                  <p className="mt-5 text-white/70 text-[15px] sm:text-[17px] leading-relaxed max-w-xl">Montadores verificados perto de você • Chegada rápida em 30 minutos • Pagamento seguro e garantido • Atendimento em todo estado de São Paulo</p>
                  <div className="mt-8 flex flex-col sm:flex-row gap-3 max-w-[440px]">
                    <button onClick={()=>{ const el=document.getElementById('catalogo-premium'); el?.scrollIntoView({behavior:'smooth'}); }} className="h-[56px] px-8 rounded-full bg-white text-[#0A2A6B] font-black text-[14px] shadow-xl active:scale-[0.98] transition flex items-center justify-center gap-2">VER CATÁLOGO PREMIUM <span>↓</span></button>
                    <button onClick={()=>{setAuthMode("montador"); setIsLogin(false); setShowAuth(true);}} className="h-[56px] px-8 rounded-full bg-[#FF7A00] text-white font-black text-[14px] shadow-xl active:scale-[0.98] transition">SOU MONTADOR • 90% PIX</button>
                  </div>
                  <div className="mt-10 grid grid-cols-3 gap-3 max-w-[440px]">
                    <div className="bg-white/10 backdrop-blur border border-white/10 rounded-[1.5rem] p-4"><div className="text-2xl font-black">{users.filter(u=>u.role==="montador").length || 12}</div><div className="text-[10px] font-bold tracking-widest opacity-60 mt-1">MONTADORES VERIFICADOS</div></div>
                    <div className="bg-white/10 backdrop-blur border border-white/10 rounded-[1.5rem] p-4"><div className="text-2xl font-black">{orders.length || 24}</div><div className="text-[10px] font-bold tracking-widest opacity-60 mt-1">PEDIDOS ATIVOS</div></div>
                    <div className="bg-[#FF7A00] rounded-[1.5rem] p-4 shadow-[0_12px_24px_-8px_rgba(255,122,0,0.5)]"><div className="text-2xl font-black text-white">4.9 ⭐</div><div className="text-[10px] font-bold tracking-widest text-white/80 mt-1">BEM AVALIADO</div></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div id="catalogo-premium" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0A2A6B] via-[#102a7d] to-[#1e3a8a] p-[1px] shadow-[0_20px_60px_-20px_rgba(10,42,107,0.4)]">
              <div className="bg-white rounded-[1.9rem] overflow-hidden">
                <div className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0A2A6B] to-[#FF7A00] flex items-center justify-center shadow">🧠</div>
                    <div>
                      <div className="flex items-center gap-2"><h2 className="font-black text-[18px] sm:text-[22px] tracking-tight">CATÁLOGO <span className="text-[#FF7A00]">COMPLETO</span></h2><span className="px-2.5 py-1 rounded-full bg-[#0A2A6B] text-white text-[10px] font-black">{CATALOGO.length}</span></div>
                      <div className="text-[11px] text-slate-500 mt-1">{filteredCatalog.length} serviços encontrados • {cart.reduce((s,i)=>s+i.qtd,0)} no carrinho • 🟢 Montadores online</div>
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
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar: guarda-roupa, mesa, estante, cômoda, cama, rack..." className="w-full h-[56px] bg-slate-100 rounded-full pl-6 pr-[120px] text-[15px] font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 border-2 border-transparent"/>
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
          {/* HEADER CLIENTE PREMIUM */}
          <div className="relative overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-[#0A2A6B] via-[#112a7d] to-[#1e40af] p-[1px] shadow-xl">
            <div className="bg-white rounded-[1.7rem] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white border shadow-sm p-2 flex items-center justify-center"><img src="/logo.png" className="w-full h-full object-contain"/></div>
                <div>
                  <div className="flex items-center gap-2"><span className="font-black text-[20px] tracking-tight">Olá, {currentUser.nome?.split(" ")[0]}! 👋</span><span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black">CLIENTE VERIFICADO</span></div>
                  <div className="text-[12px] text-slate-500 mt-1 font-medium">{currentUser.cidade} • {currentUser.telefone} • {orders.filter(o=>o.cliente_id==currentUser.id).length} pedidos • Montadores verificados perto de você</div>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-none">
                {[
                  {id:"pedidos", label:"MEUS PEDIDOS", icon:"📦", count: orders.filter(o=>o.cliente_id==currentUser.id).length},
                  {id:"suporte", label:"SUPORTE 24H", icon:"💬", count: supportMessages.filter(m=>m.user_id==currentUser.id).length},
                  {id:"perfil", label:"MEU PERFIL", icon:"👤", count:0}
                ].map(tab=>(
                  <button key={tab.id} onClick={()=>setClienteTab(tab.id)} className={`h-12 px-5 rounded-full text-[11px] font-black tracking-widest border flex items-center gap-2 active:scale-95 transition shrink-0 ${clienteTab===tab.id ? "bg-[#0A2A6B] text-white border-[#0A2A6B] shadow-lg shadow-[#0A2A6B]/20" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white"}`}><span>{tab.icon}</span>{tab.label}{tab.count>0 && <span className={`px-2 py-0.5 rounded-full text-[10px] ${clienteTab===tab.id ? "bg-white/20" : "bg-[#0A2A6B] text-white"}`}>{tab.count}</span>}</button>
                ))}
              </div>
            </div>
          </div>

          {clienteTab==="pedidos" && (
            <div className="mt-6 space-y-5">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-[1.5rem] p-5 border shadow-sm"><div className="text-[10px] font-black tracking-widest text-slate-400">TOTAL PEDIDOS</div><div className="text-[28px] font-black mt-1 tracking-tight">{orders.filter(o=>o.cliente_id==currentUser.id).length}</div><div className="text-[11px] text-slate-500 mt-1">Em todo SP • Pagamento seguro</div></div>
                <div className="bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] rounded-[1.5rem] p-5 text-white shadow-lg"><div className="text-[10px] font-black tracking-widest opacity-70">EM ANDAMENTO</div><div className="text-[28px] font-black mt-1">{orders.filter(o=>o.cliente_id==currentUser.id && ["aguardando_comprovante","aguardando_confirmacao_adm","aguardando_montador","aceito"].includes(o.status)).length}</div><div className="text-[11px] opacity-80 mt-1">Chegada em 30 min</div></div>
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-[1.5rem] p-5 text-white shadow-lg"><div className="text-[10px] font-black tracking-widest opacity-80">FINALIZADOS</div><div className="text-[28px] font-black mt-1">{orders.filter(o=>o.cliente_id==currentUser.id && o.status==="finalizado").length}</div><div className="text-[11px] opacity-80 mt-1">⭐ Avalie os montadores</div></div>
              </div>

              <div className="flex justify-between items-center">
                <h3 className="font-black text-[20px] tracking-tight">Meus Pedidos Premium</h3>
                <button onClick={()=>{ const el=document.getElementById('catalogo-premium'); if(el){ setView("home"); setTimeout(()=>el.scrollIntoView({behavior:"smooth"}),100);} else {setView("home");} }} className="h-11 px-6 rounded-full bg-[#FF7A00] text-white text-[12px] font-black tracking-widest shadow-lg">+ NOVO PEDIDO • 330 SERVIÇOS</button>
              </div>

              {orders.filter(o=>o.cliente_id==currentUser.id).length===0 && (
                <div className="bg-white rounded-[2rem] border-2 border-dashed border-slate-200 p-12 text-center shadow-sm">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#0A2A6B]/10 to-[#FF7A00]/10 border flex items-center justify-center text-[36px]">📦</div>
                  <div className="font-black text-[18px] mt-4 tracking-tight">Nenhum pedido ainda</div>
                  <div className="text-[14px] text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">Seu estoque MESA, GUARDA-ROUPA, ESTANTE espera montagem verificada. Montadores perto de você em todo SP.</div>
                  <button onClick={()=>setView("home")} className="mt-6 h-12 px-8 rounded-full bg-[#0A2A6B] text-white font-black text-[13px] tracking-widest shadow-lg">VER CATÁLOGO COMPLETO • 330 SERVIÇOS</button>
                </div>
              )}

              {orders.filter(o=>o.cliente_id==currentUser.id).sort((a,b)=> (b.id||0)-(a.id||0)).map(p=>{
                const statusConfig = {
                  aguardando_comprovante: {label:"AGUARDANDO COMPROVANTE", color:"bg-yellow-50 border-yellow-200 text-yellow-700", icon:"💳", desc:"Envie o comprovante PIX"},
                  aguardando_confirmacao_adm: {label:"AGUARDANDO CONFIRMAÇÃO", color:"bg-purple-50 border-purple-200 text-purple-700", icon:"⏳", desc:"ADM confirmando pagamento"},
                  aguardando_montador: {label:"PROCURANDO MONTADOR", color:"bg-amber-50 border-amber-200 text-amber-700", icon:"🔍", desc:"Montador verificado a caminho"},
                  aceito: {label:"MONTADOR ACEITOU • 30MIN", color:"bg-blue-50 border-blue-200 text-blue-700", icon:"🔧", desc:"Chegada em 30 minutos"},
                  finalizado: {label:"FINALIZADO COM SUCESSO", color:"bg-emerald-50 border-emerald-200 text-emerald-700", icon:"✅", desc:"Serviço concluído"},
                  cancelado: {label:"CANCELADO", color:"bg-red-50 border-red-200 text-red-700", icon:"❌", desc:"Pedido cancelado"}
                };
                const cfg = statusConfig[p.status] || {label: p.status?.toUpperCase(), color:"bg-slate-50 border-slate-200 text-slate-600", icon:"📦", desc:""};
                const montador = users.find(u=>u.id==p.montador_id);
                const cliente = users.find(u=>u.id==p.cliente_id);
                return (
                  <div key={p.id} className="group bg-white rounded-[2rem] p-6 border border-slate-200/70 shadow-[0_8px_32px_-16px_rgba(0,0,0,0.12)] hover:shadow-[0_24px_80px_-20px_rgba(10,42,107,0.25)] hover:-translate-y-1 transition-all duration-500 overflow-hidden">
                    <div className="flex flex-wrap justify-between items-start gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] flex items-center justify-center text-white font-black text-[16px] shadow-lg">#{String(p.id).slice(-4)}</div>
                        <div>
                          <div className="font-black text-[16px] tracking-tight">Pedido #{p.id} • {p.cidade} • {p.bairro}</div>
                          <div className="flex items-center gap-2 mt-1"><span className="text-[11px] text-slate-500 font-medium">{new Date(p.createdAt||p.created_at||Date.now()).toLocaleString("pt-BR")} • {p.data||"Hoje"} {p.horario||"flexível"}</span><span className="w-1 h-1 rounded-full bg-slate-300"></span><span className="text-[11px] font-bold text-[#0A2A6B]">{p.endereco}</span></div>
                        </div>
                      </div>
                      <div className={`px-4 py-2 rounded-full border font-black text-[10px] tracking-widest flex items-center gap-2 ${cfg.color}`}><span className="text-[14px]">{cfg.icon}</span>{cfg.label}</div>
                    </div>

                    <div className="mt-2 text-[11px] font-medium text-slate-500 bg-slate-50 inline-flex px-3 py-1 rounded-full border">{cfg.desc} • {p.itens?.length||0} serviços • Total {formatBRL(p.total)}</div>

                    <div className="mt-5 grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
                      <div className="bg-[#F8FAFF] rounded-[1.5rem] p-5 border">
                        <div className="flex items-center gap-2"><span className="text-[10px] font-black tracking-widest text-slate-400">ITENS CONTRATADOS</span><span className="px-2 py-0.5 rounded-full bg-[#0A2A6B] text-white text-[9px] font-black">{p.itens?.length||0} SERVIÇOS</span></div>
                        <div className="mt-3 space-y-2">{(p.itens||[]).map((i,idx)=><div key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl border shadow-sm"><div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-[#0A2A6B]/10 flex items-center justify-center text-[12px]">{categoriaIcons[i.categoria]||"📦"}</span><span className="font-bold text-[13px] truncate max-w-[180px]">{i.nome}</span></div><div className="flex items-center gap-2"><span className="text-[11px] font-bold bg-slate-100 px-2 py-1 rounded-full">x{i.qtd}</span><span className="font-black text-[13px] text-[#0A2A6B]">{formatBRL(i.preco*i.qtd)}</span></div></div>)}</div>
                        <div className="mt-4 pt-4 border-t-2 border-dashed flex justify-between items-center"><span className="font-black text-[14px]">Total Premium</span><div className="text-right"><div className="font-black text-[20px] text-[#FF7A00] tracking-tight">{formatBRL(p.total)}</div><div className="text-[10px] text-slate-500 font-medium">12x {formatBRL(p.total/12)} • Pix com desconto</div></div></div>
                      </div>
                      <div className="space-y-3">
                        <div className="bg-gradient-to-br from-slate-900 to-[#0A2A6B] rounded-[1.5rem] p-5 text-white shadow-lg">
                          <div className="text-[10px] font-black tracking-widest opacity-70">PAGAMENTO SEGURO</div>
                          <div className="mt-2 font-black text-[16px]">PIX • {formatBRL(p.total)}</div>
                          <div className="mt-2 bg-white/10 rounded-xl p-3 border border-white/10"><div className="text-[9px] font-black tracking-widest opacity-60">CHAVE PIX</div><div className="font-mono text-[11px] font-bold break-all mt-1">{PIX_KEY}</div></div>
                          {p.cupom && <div className="mt-3 px-3 py-1.5 rounded-full bg-[#FF7A00] text-white text-[10px] font-black inline-flex">🎟️ CUPOM {p.cupom} • ECONOMIA {formatBRL(p.desconto||0)}</div>}
                        </div>
                        {montador && (
                          <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-[1.5rem] p-4">
                            <div className="text-[10px] font-black tracking-widest text-emerald-700">MONTADOR VERIFICADO • A CAMINHO 30MIN</div>
                            <div className="mt-3 flex items-center gap-3"><div className="w-12 h-12 rounded-full bg-white border-2 border-emerald-300 overflow-hidden shadow-sm">{montador.foto ? <img src={montador.foto} className="w-full h-full object-cover"/> : <div className="w-full h-full bg-[#0A2A6B] text-white flex items-center justify-center font-black">{montador.nome?.[0]}</div>}</div><div className="flex-1 min-w-0"><div className="font-black text-[14px] text-emerald-900">{montador.nome}</div><div className="text-[11px] text-emerald-700 font-medium">{montador.cidades?.join(" • ")} • ⭐ {montador.avaliacao||5}.0 • {montador.total_servicos||0} serviços</div></div></div>
                            <div className="mt-3 grid grid-cols-2 gap-2"><a href={`https://wa.me/55${montador.telefone?.replace(/\D/g,"")}?text=Olá ${montador.nome}! Meu pedido #${p.id} em ${p.cidade} - ${p.endereco}`} target="_blank" className="h-10 rounded-full bg-[#25D366] text-white font-black text-[11px] flex items-center justify-center gap-1">WHATSAPP</a><a href={`tel:${montador.telefone}`} className="h-10 rounded-full bg-[#0A2A6B] text-white font-black text-[11px] flex items-center justify-center gap-1">LIGAR 📞</a></div>
                          </div>
                        )}
                      </div>
                    </div>

                    {p.status==="aguardando_comprovante" && (
                      <div className="mt-6 p-6 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border-2 border-amber-300 rounded-[1.8rem] shadow-sm">
                        <div className="flex items-start gap-3"><div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-[20px] shadow">💳</div><div><div className="font-black text-[16px] tracking-tight">Envie o comprovante para confirmar seu pedido</div><div className="text-[12px] text-amber-800 mt-1 leading-relaxed">Faça o PIX de <span className="font-black text-[14px]">{formatBRL(p.total)}</span> para a chave abaixo e envie o comprovante. Seu montador será notificado imediatamente.</div></div></div>
                        <div className="mt-5 grid sm:grid-cols-2 gap-4">
                          <div className="bg-white rounded-2xl p-4 border-2 border-amber-200 shadow-sm"><div className="text-[10px] font-black tracking-widest text-slate-400">CHAVE PIX • COPIE E COLE</div><div className="mt-2 font-mono text-[12px] font-black break-all bg-slate-50 p-3 rounded-xl border">{PIX_KEY}</div><button onClick={()=>{navigator.clipboard.writeText(PIX_KEY); notify("Chave PIX copiada! ✅","success",1);}} className="mt-3 w-full h-10 rounded-full bg-[#0A2A6B] text-white font-black text-[11px]">COPIAR CHAVE PIX</button></div>
                          <div className="bg-white rounded-2xl p-4 border-2 border-amber-200 shadow-sm"><div className="text-[10px] font-black tracking-widest text-slate-400">VALOR EXATO</div><div className="mt-2 text-[28px] font-black tracking-tight text-[#FF7A00]">{formatBRL(p.total)}</div><div className="text-[11px] text-slate-500 mt-1">Pagamento 100% seguro • Confirmado pelo ADM</div></div>
                        </div>
                        <div className="mt-5">
                          <div className="text-[11px] font-black tracking-widest">📸 ANEXE O COMPROVANTE • FOTO DA GALERIA</div>
                          <label className="mt-3 flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-amber-300 rounded-2xl bg-white hover:bg-amber-50/50 cursor-pointer transition">
                            <input type="file" accept="image/*" onChange={e=>{ const r=new FileReader(); r.onload=()=>setComprovante(r.result); r.readAsDataURL(e.target.files[0]); }} className="hidden"/>
                            <div className="text-[28px]">📁</div><div className="text-[12px] font-black mt-1">Clique para escolher comprovante</div><div className="text-[10px] text-slate-500 mt-1">JPG, PNG • Galeria • Até 5MB</div>
                          </label>
                          {comprovante && <div className="mt-4 flex items-center gap-4 bg-white p-3 rounded-2xl border-2 border-emerald-200"><img src={comprovante} className="w-16 h-16 rounded-xl object-cover border-2 border-[#0A2A6B] shadow-sm"/><div><div className="font-black text-[13px] text-emerald-700">✅ Comprovante pronto!</div><div className="text-[11px] text-slate-500">Clique em enviar para confirmar</div></div></div>}
                          <button onClick={()=>enviarComprovante(p.id, comprovante)} disabled={!comprovante} className={`w-full mt-4 h-[56px] rounded-full font-black text-[13px] tracking-widest shadow-lg active:scale-[0.98] transition flex items-center justify-center gap-2 ${comprovante ? "bg-gradient-to-r from-[#0A2A6B] to-[#1e40af] text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}>ENVIAR COMPROVANTE • PAGAMENTO SEGURO 🔒</button>
                        </div>
                      </div>
                    )}

                    {p.comprovante && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <a href={p.comprovante} target="_blank" className="h-11 px-5 rounded-full bg-slate-900 text-white font-black text-[11px] flex items-center gap-2">📸 VER COMPROVANTE ENVIADO</a>
                        {p.status==="aguardando_confirmacao_adm" && <span className="h-11 px-5 rounded-full bg-purple-100 border-2 border-purple-200 text-purple-700 font-black text-[10px] tracking-widest flex items-center gap-2">⏳ AGUARDANDO CONFIRMAÇÃO DO ADM • JÁ VAI LIBERAR</span>}
                        {p.status==="aguardando_montador" && <span className="h-11 px-5 rounded-full bg-amber-100 border-2 border-amber-200 text-amber-700 font-black text-[10px] tracking-widest flex items-center gap-2">🔍 PROCURANDO MONTADOR VERIFICADO PERTO • 30MIN</span>}
                      </div>
                    )}

                    {(p.status==="aguardando_comprovante" || p.status==="aguardando_confirmacao_adm" || p.status==="aguardando_montador") && <button onClick={()=>cancelarPedido(p.id)} className="mt-5 w-full h-12 rounded-full bg-red-50 border-2 border-red-200 text-red-600 font-black text-[11px] tracking-widest hover:bg-red-100 transition">❌ CANCELAR PEDIDO • POLÍTICA LGPD</button>}

                    {p.status==="finalizado" && <div className="mt-5 bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black">✓</div><div><div className="font-black text-emerald-800">Serviço finalizado com sucesso! 🎉</div><div className="text-[11px] text-emerald-700 mt-1">Avalie seu montador {montador?.nome||""} • Finalizado em {new Date(p.finalizadoAt||p.finalizado_at||Date.now()).toLocaleString("pt-BR")}</div></div></div>}
                  </div>
                );
              })}
            </div>
          )}

          {clienteTab==="suporte" && (
            <div className="mt-6 bg-white rounded-[2rem] border-2 border-slate-200/60 shadow-[0_16px_48px_-16px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col h-[78vh]">
              <div className="p-6 border-b bg-gradient-to-r from-[#0A2A6B] to-[#1e40af] text-white flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-white p-2 shadow"><img src="/logo.png" className="w-full h-full object-contain"/></div><div><div className="font-black text-[16px] tracking-tight">Suporte Premium 24 horas • Online agora 🟢</div><div className="text-[11px] opacity-80 mt-1">Contato Certo SP • Resposta em até 5 minutos • Montadores verificados • Todo SP</div></div><div className="ml-auto hidden sm:flex px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-[10px] font-black tracking-widest">💬 {supportMessages.filter(m=>m.user_id==currentUser.id).length} mensagens</div></div>
              <div className="flex-1 overflow-auto p-6 space-y-4 bg-[#F8FAFF]">
                {supportMessages.filter(m=>m.user_id==currentUser.id).length===0 && <div className="text-center py-16"><div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#0A2A6B]/10 to-[#FF7A00]/10 border flex items-center justify-center text-[40px]">💬</div><div className="font-black text-[18px] mt-4 tracking-tight">Como podemos ajudar?</div><div className="text-[13px] text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">Tire dúvidas sobre MESA, GUARDA-ROUPA, ESTANTE, RACK, CÔMODA. Suporte rápido e humanizado.</div><div className="mt-6 flex flex-wrap justify-center gap-2">{["📦 Meu pedido", "💰 Pagamento", "🔧 Montador", "📍 Endereço"].map(q=><button key={q} onClick={()=>setSupportInput(q)} className="px-4 py-2 rounded-full bg-white border shadow-sm text-[11px] font-bold hover:border-[#0A2A6B]/20 transition">{q}</button>)}</div></div>}
                {supportMessages.filter(m=>m.user_id==currentUser.id).map(m=>(
                  <div key={m.id} className={`flex gap-3 ${m.from_admin ? "" : "flex-row-reverse"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.from_admin ? "bg-[#0A2A6B] text-white" : "bg-[#FF7A00] text-white"}`}>{m.from_admin ? "CC" : currentUser.nome?.[0]}</div>
                    <div className={`max-w-[78%] p-4 rounded-[1.3rem] text-[13px] leading-relaxed shadow-sm border ${m.from_admin ? "bg-white rounded-tl-none border-slate-200" : "bg-[#0A2A6B] text-white rounded-tr-none border-[#0A2A6B]"}`}>
                      <div className={`text-[9px] font-black tracking-widest mb-1.5 ${m.from_admin ? "text-[#0A2A6B]" : "text-white/70"}`}>{m.from_admin ? "CONTATO CERTO SP • ADM" : "VOCÊ"} • {new Date(m.created_at).toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"})}</div>{m.mensagem}
                    </div>
                  </div>
                ))}
                <div ref={supportEndRef}></div>
              </div>
              <div className="p-5 border-t bg-white flex gap-3"><input value={supportInput} onChange={e=>setSupportInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&enviarSuporte()} placeholder="Digite sua mensagem • Suporte 24h online..." className="flex-1 h-[56px] bg-slate-100 rounded-full px-6 text-[14px] outline-none focus:bg-white focus:ring-2 focus:ring-[#0A2A6B]/20 border-2 border-transparent focus:border-[#0A2A6B]/10 transition"/><button onClick={enviarSuporte} className="w-[56px] h-[56px] rounded-full bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] text-white font-black shadow-lg active:scale-95 transition flex items-center justify-center text-[18px]">➤</button></div>
            </div>
          )}

          {clienteTab==="perfil" && (
            <div className="mt-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-6 max-w-5xl">
              <div className="bg-white rounded-[2rem] p-8 border-2 border-slate-200/60 shadow-sm">
                <div className="flex items-start gap-5"><div className="w-20 h-20 rounded-[1.5rem] bg-gradient-to-br from-[#0A2A6B] to-[#FF7A00] p-[3px] shadow-lg"><div className="w-full h-full rounded-[1.3rem] bg-white flex items-center justify-center font-black text-[28px] text-[#0A2A6B]">{currentUser.nome?.[0]}</div></div><div className="flex-1"><div className="font-black text-[22px] tracking-tight">{currentUser.nome}</div><div className="inline-flex items-center gap-2 mt-2"><span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black">CLIENTE PREMIUM ✅</span><span className="px-3 py-1 rounded-full bg-[#0A2A6B] text-white text-[10px] font-black">ID {currentUser.id}</span></div><div className="mt-4 space-y-2 text-[13px]"><div className="flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">📍</span><span className="font-medium">{currentUser.cidade}</span></div><div className="flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">📱</span><span className="font-medium">{currentUser.telefone}</span></div><div className="flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">✉️</span><span className="font-medium">{currentUser.email}</span></div><div className="flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">👤</span><span className="font-mono font-bold">@{currentUser.usuario}</span></div></div></div></div>
                <div className="mt-8 grid grid-cols-2 gap-4">
                  <div className="bg-[#F8FAFF] p-5 rounded-[1.5rem] border"><div className="text-[10px] font-black tracking-widest text-slate-400">TOTAL PEDIDOS</div><div className="text-[28px] font-black mt-1 tracking-tight">{orders.filter(o=>o.cliente_id==currentUser.id).length}</div><div className="text-[11px] text-slate-500 mt-1">Em todo SP</div></div>
                  <div className="bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] p-5 rounded-[1.5rem] text-white shadow-lg"><div className="text-[10px] font-black tracking-widest opacity-70">TOTAL INVESTIDO</div><div className="text-[28px] font-black mt-1 tracking-tight">{formatBRL(orders.filter(o=>o.cliente_id==currentUser.id&&o.status==="finalizado").reduce((s,o)=>s+(o.total||0),0))}</div><div className="text-[11px] opacity-80 mt-1">Montagens premium</div></div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] rounded-[2rem] p-6 text-white shadow-xl">
                  <div className="font-black text-[16px] tracking-tight">💎 Benefícios Premium</div>
                  <div className="mt-4 space-y-3 text-[12px] leading-relaxed">
                    <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">✓</span><span>Montadores verificados com foto e avaliação</span></div>
                    <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">✓</span><span>Chegada em 30 minutos em todo SP</span></div>
                    <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">✓</span><span>Pagamento seguro com comprovante</span></div>
                    <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">✓</span><span>Suporte 24h humanizado</span></div>
                    <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">✓</span><span>Garantia de 12 meses</span></div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-[2rem] p-6">
                  <div className="font-black text-red-800 flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center font-black">!</div>Zona de perigo • LGPD</div>
                  <div className="text-[12px] text-red-700 mt-3 leading-relaxed">Ao excluir, todos os seus {orders.filter(o=>o.cliente_id==currentUser.id).length} pedidos e {supportMessages.filter(m=>m.user_id==currentUser.id).length} conversas serão apagados permanentemente. Esta ação não pode ser desfeita.</div>
                  <button onClick={excluirMeuCadastro} className="mt-5 w-full h-12 rounded-full bg-red-600 hover:bg-red-700 text-white font-black text-[11px] tracking-widest shadow-lg active:scale-[0.98] transition">EXCLUIR CADASTRO PERMANENTE • LGPD</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {view==="montador" && currentUser && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="relative overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-[#0A2A6B] via-[#112a7d] to-[#1e40af] p-[1px] shadow-xl">
            <div className="bg-white rounded-[1.7rem] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-[1.3rem] bg-gradient-to-br from-[#0A2A6B] to-[#FF7A00] p-[3px] shadow-lg"><div className="w-full h-full rounded-[1.2rem] bg-white overflow-hidden flex items-center justify-center">{currentUser.foto ? <img src={currentUser.foto} className="w-full h-full object-cover"/> : <span className="font-black text-[20px] text-[#0A2A6B]">{currentUser.nome?.[0]}</span>}</div></div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-black text-[20px] tracking-tight">{currentUser.nome}</span><span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black flex items-center gap-1">✅ VERIFICADO • {currentUser.avaliacao||5}.0 ⭐</span><span className="px-2.5 py-1 rounded-full bg-[#0A2A6B] text-white text-[9px] font-black tracking-widest">MONTADOR PREMIUM</span></div>
                  <div className="text-[12px] text-slate-600 mt-1 font-medium flex flex-wrap items-center gap-2"><span>{currentUser.telefone}</span><span className="w-1 h-1 rounded-full bg-slate-300"></span><span className="px-2 py-0.5 rounded-full bg-[#0A2A6B] text-white text-[10px] font-black">PIX {currentUser.pix||"Não informado"}</span><span className="w-1 h-1 rounded-full bg-slate-300"></span><span>{(currentUser.cidades||[]).join(" • ")||"Sem cidades"}</span></div>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-none">
                {[
                  {id:"disponiveis", label:"DISPONÍVEIS", icon:"🔍", count: orders.filter(o=>o.status==="aguardando_montador").length},
                  {id:"meus", label:"MEUS", icon:"🔧", count: orders.filter(o=>o.montador_id==currentUser.id && o.status==="aceito").length},
                  {id:"ganhos", label:"GANHOS", icon:"💰", count:0},
                  {id:"perfil", label:"PERFIL", icon:"👤", count:0}
                ].map(tab=>(
                  <button key={tab.id} onClick={()=>setMontadorTab(tab.id)} className={`h-12 px-5 rounded-full text-[11px] font-black tracking-widest border flex items-center gap-2 active:scale-95 transition shrink-0 ${montadorTab===tab.id ? "bg-[#0A2A6B] text-white border-[#0A2A6B] shadow-lg" : "bg-slate-50 border-slate-200 text-slate-600"}`}><span>{tab.icon}</span>{tab.label}{tab.count>0 && <span className={`px-2 py-0.5 rounded-full text-[10px] ${montadorTab===tab.id ? "bg-white/20" : "bg-red-500 text-white"}`}>{tab.count}</span>}</button>
                ))}
              </div>
            </div>
          </div>

          {montadorTab==="disponiveis" && (
            <div className="mt-6 space-y-5">
              <div className="grid lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-gradient-to-r from-[#0A2A6B] to-[#1e40af] rounded-[1.7rem] p-6 text-white shadow-xl flex flex-col sm:flex-row justify-between gap-4">
                  <div><h3 className="font-black text-[20px] tracking-tight">Pedidos na sua região • {currentUser.cidades?.join(", ")||"Todo SP"}</h3><div className="text-[12px] opacity-80 mt-2 leading-relaxed">Filtrado automaticamente pelas suas 3 cidades • Novos pedidos com som e vibração • Aceite rápido • Cliente notificado em tempo real</div><div className="mt-4 flex flex-wrap gap-2"><span className="px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-[10px] font-black tracking-widest">🔔 SOM + VIBRAÇÃO</span><span className="px-3 py-1.5 rounded-full bg-[#FF7A00] text-white text-[10px] font-black tracking-widest">{orders.filter(o=>o.status==="aguardando_montador").length} DISPONÍVEIS AGORA</span></div></div>
                  <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10 text-center"><div className="text-[10px] font-black tracking-widest opacity-60">GANHO HOJE</div><div className="text-[22px] font-black mt-1">{formatBRL(orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado" && new Date(o.finalizadoAt||o.finalizado_at||Date.now()).toDateString()===new Date().toDateString()).reduce((s,o)=>s+(o.ganho_montador||0),0))}</div></div>
                </div>
                <div className="bg-white rounded-[1.7rem] p-6 border-2 border-slate-200/60 shadow-sm">
                  <div className="text-[10px] font-black tracking-widest text-slate-400">REGRA DE GANHO PREMIUM</div>
                  <div className="mt-3 space-y-3">
                    <div className="flex justify-between items-center bg-[#F8FAFF] p-3 rounded-xl border"><span className="text-[12px] font-bold">Serviço normal</span><span className="font-black text-[#0A2A6B]">90% para você</span></div>
                    <div className="flex justify-between items-center bg-gradient-to-r from-[#FF7A00]/10 to-orange-50 p-3 rounded-xl border-2 border-[#FF7A00]/20"><span className="text-[12px] font-black">A cada 6º serviço</span><span className="font-black text-[#FF7A00]">100% BONUS 🎉</span></div>
                    <div className="text-[10px] text-slate-500 leading-relaxed">Você recebe 90% de cada serviço. A cada 6 serviços finalizados, o 6º é 100% seu como bônus!</div>
                  </div>
                </div>
              </div>

              {orders.filter(o=>o.status==="aguardando_montador" && ((currentUser.cidades||[]).length===0 || (currentUser.cidades||[]).some(c=> (o.cidade||"").toLowerCase().includes(c.toLowerCase()) ))).length===0 && (
                <div className="bg-white rounded-[2rem] border-2 border-dashed border-slate-200 p-12 text-center shadow-sm">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#0A2A6B]/10 to-[#FF7A00]/10 border flex items-center justify-center text-[40px] animate-pulse">🔍</div>
                  <div className="font-black text-[18px] mt-4 tracking-tight">Nenhum pedido na sua região agora</div>
                  <div className="text-[13px] text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">Cadastre até 3 cidades para receber mais pedidos. Deixe o app aberto com som ativado - novos pedidos chegam com alerta.</div>
                  <div className="mt-4 inline-flex px-4 py-2 rounded-full bg-[#0A2A6B] text-white text-[11px] font-black">SUAS CIDADES: {(currentUser.cidades||[]).join(" • ")||"Nenhuma cadastrada"}</div>
                </div>
              )}

              {orders.filter(o=>o.status==="aguardando_montador" && ((currentUser.cidades||[]).length===0 || (currentUser.cidades||[]).some(c=> (o.cidade||"").toLowerCase().includes(c.toLowerCase()) ))).sort((a,b)=>b.id-a.id).map(p=>{
                const cliente = users.find(u=>u.id==p.cliente_id);
                return (
                  <div key={p.id} className="group bg-white rounded-[2rem] p-7 border-2 border-slate-200/60 shadow-[0_8px_32px_-16px_rgba(0,0,0,0.12)] hover:shadow-[0_24px_80px_-20px_rgba(10,42,107,0.25)] hover:border-[#0A2A6B]/20 hover:-translate-y-1 transition-all duration-500">
                    <div className="flex flex-wrap justify-between gap-4">
                      <div className="flex items-center gap-4"><div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF7A00] to-[#ff9500] flex items-center justify-center text-white font-black text-[18px] shadow-lg">#{String(p.id).slice(-4)}</div><div><div className="font-black text-[18px] tracking-tight">{p.cidade} • {p.bairro}</div><div className="text-[12px] text-slate-500 mt-1 font-medium flex items-center gap-2">{p.endereco} • {p.data} {p.horario} • Cliente: {cliente?.nome||"ID "+p.cliente_id} • {cliente?.telefone||""}</div></div></div>
                      <div className="text-right"><div className="text-[26px] font-black tracking-tight text-[#FF7A00] leading-none">{formatBRL(p.total)}</div><div className="mt-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-black">SEU GANHO 90% = {formatBRL(p.total*0.9)}</div><div className="text-[10px] font-bold text-slate-400 mt-1">6º serviço = 100% BONUS 🎉</div></div>
                    </div>
                    <div className="mt-6 bg-[#F8FAFF] rounded-[1.5rem] p-5 border">
                      <div className="flex items-center gap-2"><span className="text-[10px] font-black tracking-widest text-slate-400">O QUE MONTAR</span><span className="px-2 py-0.5 rounded-full bg-[#0A2A6B] text-white text-[9px] font-black">{p.itens?.length} ITENS</span></div>
                      <div className="mt-3 grid sm:grid-cols-2 gap-3">{(p.itens||[]).map((i,idx)=><div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl border shadow-sm"><span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0A2A6B]/10 to-[#FF7A00]/10 border flex items-center justify-center">{categoriaIcons[i.categoria]||"📦"}</span><div className="flex-1 min-w-0"><div className="font-bold text-[13px] truncate">{i.nome}</div><div className="text-[10px] text-slate-500">{i.categoria}</div></div><span className="font-black text-[#0A2A6B] text-[12px]">x{i.qtd}</span></div>)}</div>
                    </div>
                    <div className="mt-6 grid sm:grid-cols-2 gap-3">
                      <button onClick={()=>aceitarPedido(p.id)} className="h-[56px] rounded-full bg-gradient-to-r from-[#0A2A6B] to-[#1e40af] text-white font-black text-[13px] tracking-widest shadow-lg hover:shadow-xl active:scale-[0.98] transition flex items-center justify-center gap-2">🔧 ACEITAR PEDIDO • 30MIN <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">→</span></button>
                      <div className="h-[56px] rounded-full bg-slate-50 border-2 border-slate-200 flex items-center justify-center gap-3 text-[11px] font-bold text-slate-600"><span>👤 Cliente {cliente?.nome?.split(" ")[0]}</span><span className="w-1 h-1 rounded-full bg-slate-300"></span><span>📍 {p.bairro}</span><span className="w-1 h-1 rounded-full bg-slate-300"></span><span>💰 {formatBRL(p.total)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {montadorTab==="meus" && (
            <div className="mt-6 space-y-5">
              <div className="bg-white rounded-[1.7rem] p-6 border shadow-sm flex flex-wrap justify-between items-center gap-4"><div><h3 className="font-black text-[20px] tracking-tight">Meus Pedidos Aceitos</h3><div className="text-[12px] text-slate-500 mt-1">{orders.filter(o=>o.montador_id==currentUser.id).length} pedidos • {orders.filter(o=>o.montador_id==currentUser.id && o.status==="aceito").length} em andamento • {orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").length} finalizados</div></div><div className="px-4 py-2 rounded-full bg-[#0A2A6B] text-white text-[11px] font-black">{formatBRL(orders.filter(o=>o.montador_id==currentUser.id && o.status==="aceito").reduce((s,o)=>s+(o.total||0),0))} em andamento</div></div>
              {orders.filter(o=>o.montador_id==currentUser.id).length===0 && <div className="bg-white rounded-[2rem] border-2 border-dashed p-12 text-center"><div className="text-[48px]">🛠️</div><div className="font-black mt-3">Nenhum pedido aceito ainda</div><div className="text-[12px] text-slate-500 mt-1">Aceite pedidos em Disponíveis para aparecer aqui</div></div>}
              {orders.filter(o=>o.montador_id==currentUser.id).sort((a,b)=>b.id-a.id).map(p=>{
                const cliente = users.find(u=>u.id==p.cliente_id);
                return (
                  <div key={p.id} className="bg-white rounded-[2rem] p-7 border-2 border-slate-200/60 shadow-sm hover:shadow-lg transition-all">
                    <div className="flex flex-wrap justify-between gap-4">
                      <div><div className="font-black text-[18px] tracking-tight">#{p.id} • {p.cidade} • {p.bairro}</div><div className="text-[12px] text-slate-500 mt-1">{p.endereco} • {p.data} {p.horario} • Total {formatBRL(p.total)} • Cliente {cliente?.nome} {cliente?.telefone}</div></div>
                      <span className={`px-4 py-2 rounded-full border font-black text-[10px] tracking-widest h-fit ${p.status==="finalizado"?"bg-emerald-50 border-emerald-200 text-emerald-700":"bg-blue-50 border-blue-200 text-blue-700"}`}>{p.status.toUpperCase()} {p.status==="aceito" ? "• EM ANDAMENTO 🔧" : "• FINALIZADO ✅"}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={`https://wa.me/55${cliente?.telefone?.replace(/\D/g,"")}?text=Olá ${cliente?.nome}! Sou ${currentUser.nome} montador verificado do Contato Certo SP. Já estou a caminho para seu pedido #${p.id} em ${p.cidade} - ${p.endereco}. Chego em 30min! 🔧`} target="_blank" className="h-12 px-6 rounded-full bg-[#25D366] text-white font-black text-[12px] flex items-center gap-2 shadow">💬 WHATSAPP CLIENTE</a>
                      <a href={`tel:${cliente?.telefone}`} className="h-12 px-6 rounded-full bg-slate-900 text-white font-black text-[12px] flex items-center gap-2 shadow">📞 LIGAR CLIENTE</a>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco+" "+p.bairro+" "+p.cidade)}`} target="_blank" className="h-12 px-6 rounded-full bg-white border-2 border-slate-200 font-black text-[11px] flex items-center gap-2">📍 VER NO MAPA</a>
                    </div>
                    <div className="mt-4 bg-slate-50 rounded-2xl p-4 border"><div className="text-[10px] font-black tracking-widest text-slate-400">ITENS • {p.itens?.length} SERVIÇOS • {formatBRL(p.total)}</div><div className="mt-2 text-[13px] font-medium leading-relaxed">{(p.itens||[]).map(i=>i.nome).join(" • ")}</div></div>
                    {p.status==="aceito" && <button onClick={()=>finalizarPedido(p.id)} className="mt-6 w-full h-[56px] rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-black text-[13px] tracking-widest shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition">✅ FINALIZAR SERVIÇO • CLIENTE VAI AVALIAR ⭐ • SEU GANHO {formatBRL((p.total||0)*0.9)}</button>}
                    {p.status==="finalizado" && <div className="mt-6 bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-2xl p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black">✓</div><div><div className="font-black text-emerald-800">Serviço finalizado com sucesso! 🎉</div><div className="text-[12px] text-emerald-700 mt-1">Finalizado em {new Date(p.finalizadoAt||p.finalizado_at||Date.now()).toLocaleString("pt-BR")} • Seu ganho {formatBRL(p.ganho_montador||p.total*0.9)} {p.bonus_montador ? "• 🎉 BONUS 100% DO 6º SERVIÇO!" : "• 90% do total"}</div></div></div></div>}
                  </div>
                );
              })}
            </div>
          )}

          {montadorTab==="ganhos" && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-[#0A2A6B] via-[#112a7d] to-[#1e40af] text-white p-6 rounded-[1.8rem] shadow-xl"><div className="text-[10px] font-black tracking-widest opacity-70">TOTAL BRUTO GERADO</div><div className="text-[26px] font-black mt-2 tracking-tight">{formatBRL(orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").reduce((s,o)=>s+(o.total||0),0))}</div><div className="text-[11px] opacity-70 mt-2">{orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").length} serviços finalizados</div></div>
                <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-600 text-white p-6 rounded-[1.8rem] shadow-xl shadow-emerald-500/20"><div className="text-[10px] font-black tracking-widest opacity-80">SEU GANHO LÍQUIDO • 90% + BONUS</div><div className="text-[26px] font-black mt-2 tracking-tight">{formatBRL(orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").reduce((s,o)=>s+(o.ganho_montador||o.total*0.9),0))}</div><div className="text-[11px] opacity-80 mt-2">PIX direto na sua conta • {orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado" && o.bonus_montador).length} bônus 100%</div></div>
                <div className="bg-gradient-to-br from-[#FF7A00] to-[#ff9500] text-white p-6 rounded-[1.8rem] shadow-xl shadow-orange-500/20"><div className="text-[10px] font-black tracking-widest opacity-80">SERVIÇOS FINALIZADOS</div><div className="text-[26px] font-black mt-2 tracking-tight">{orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").length}</div><div className="text-[11px] opacity-80 mt-2">Próximo bônus 100% em {6 - (orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").length % 6 || 6)} serviços 🎉</div></div>
                <div className="bg-slate-900 text-white p-6 rounded-[1.8rem] shadow-xl"><div className="text-[10px] font-black tracking-widest opacity-60">AVALIAÇÃO PREMIUM</div><div className="text-[26px] font-black mt-2 tracking-tight">⭐ {Number(currentUser.avaliacao||5).toFixed(1)}</div><div className="text-[11px] opacity-60 mt-2">Verificado ✅ • {currentUser.total_servicos||0} avaliações</div></div>
              </div>
              <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
                <div className="bg-white rounded-[1.9rem] p-7 border-2 border-slate-200/60 shadow-sm">
                  <div className="flex justify-between items-center"><div className="font-black text-[18px] tracking-tight">Histórico de ganhos • Detalhado</div><span className="px-3 py-1 rounded-full bg-[#FF7A00] text-white text-[10px] font-black">BONUS A CADA 6º = 100% 🎉</span></div>
                  <div className="mt-6 space-y-3 max-h-[480px] overflow-auto pr-2">
                    {orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").length===0 && <div className="text-center py-12"><div className="text-[40px]">💰</div><div className="font-bold mt-2">Nenhum ganho ainda</div><div className="text-[12px] text-slate-500 mt-1">Finalize serviços para ver seus ganhos aqui</div></div>}
                    {orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").sort((a,b)=>b.id-a.id).map(p=>(
                      <div key={p.id} className={`flex justify-between items-center p-4 rounded-2xl border-2 ${p.bonus_montador ? "bg-gradient-to-r from-[#FF7A00]/10 to-orange-50 border-[#FF7A00]/30" : "bg-slate-50 border-slate-200"}`}>
                        <div><div className="font-black text-[14px]">#{p.id} • {p.cidade} • {p.bairro}</div><div className="text-[11px] text-slate-500 mt-1">{new Date(p.finalizadoAt||p.finalizado_at||Date.now()).toLocaleDateString("pt-BR")} • {new Date(p.finalizadoAt||p.finalizado_at||Date.now()).toLocaleTimeString("pt-BR")} • Total {formatBRL(p.total)}</div></div>
                        <div className="text-right"><div className={`font-black text-[16px] ${p.bonus_montador ? "text-[#FF7A00]" : "text-emerald-600"}`}>{formatBRL(p.ganho_montador||p.total*0.9)} {p.bonus_montador ? "🎉" : ""}</div><div className={`text-[10px] font-black tracking-widest px-2 py-0.5 rounded-full ${p.bonus_montador ? "bg-[#FF7A00] text-white" : "bg-emerald-100 text-emerald-700"}`}>{p.bonus_montador ? "BONUS 100%" : "90% GANHO"}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] rounded-[1.9rem] p-7 text-white shadow-xl">
                  <div className="font-black text-[18px] tracking-tight">💎 Como funciona seu ganho</div>
                  <div className="mt-6 space-y-4">
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10"><div className="flex justify-between items-center"><span className="font-bold text-[13px]">Serviço normal</span><span className="font-black text-[14px] bg-white text-[#0A2A6B] px-3 py-1 rounded-full">90% SEU</span></div><div className="text-[11px] opacity-80 mt-2">Ex: Serviço R$100 → Você ganha R$90 via PIX</div></div>
                    <div className="bg-[#FF7A00] rounded-2xl p-4 shadow-lg"><div className="flex justify-between items-center"><span className="font-black text-[13px]">A cada 6º serviço</span><span className="font-black text-[14px] bg-white text-[#FF7A00] px-3 py-1 rounded-full">100% BONUS 🎉</span></div><div className="text-[11px] opacity-90 mt-2 font-medium">Ex: 6º serviço R$100 → Você ganha R$100 completo!</div></div>
                    <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10"><div className="text-[11px] leading-relaxed opacity-90">💡 <span className="font-black">Dica Premium:</span> Quanto mais serviços você finaliza, mais bônus de 100% você ganha. Mantenha avaliação 5 estrelas para receber mais pedidos!</div></div>
                    <div className="mt-2 text-[10px] font-black tracking-widest opacity-60">PIX: {currentUser.pix||"Cadastre sua chave PIX no perfil"} • Pagamento direto • Sem intermediários</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {montadorTab==="perfil" && (
            <div className="mt-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-6 max-w-6xl">
              <div className="space-y-6">
                <div className="bg-white rounded-[2rem] p-8 border-2 border-slate-200/60 shadow-sm">
                  <div className="flex items-start gap-6"><div className="w-24 h-24 rounded-[1.8rem] bg-gradient-to-br from-[#0A2A6B] to-[#FF7A00] p-[4px] shadow-xl"><div className="w-full h-full rounded-[1.6rem] bg-white overflow-hidden flex items-center justify-center">{currentUser.foto ? <img src={currentUser.foto} className="w-full h-full object-cover"/> : <span className="font-black text-[32px] text-[#0A2A6B]">{currentUser.nome?.[0]}</span>}</div></div><div className="flex-1"><div className="font-black text-[24px] tracking-tight flex items-center gap-3 flex-wrap">{currentUser.nome}<span className="px-3 py-1 rounded-full bg-emerald-50 border-2 border-emerald-200 text-emerald-700 text-[10px] font-black">VERIFICADO ✅ • PREMIUM</span></div><div className="mt-3 grid grid-cols-1 gap-2 text-[13px]"><div className="flex items-center gap-3 bg-[#F8FAFF] p-3 rounded-xl border"><span className="w-8 h-8 rounded-full bg-[#0A2A6B] text-white flex items-center justify-center text-[12px]">📱</span><span className="font-bold">{currentUser.telefone}</span><span className="ml-auto text-[11px] text-slate-500">{currentUser.email}</span></div><div className="flex items-center gap-3 bg-[#F8FAFF] p-3 rounded-xl border"><span className="w-8 h-8 rounded-full bg-[#FF7A00] text-white flex items-center justify-center text-[12px]">💳</span><span className="font-black">PIX: {currentUser.pix||"Não cadastrado"}</span><span className="ml-auto text-[11px] px-2 py-1 rounded-full bg-[#0A2A6B] text-white font-black">RECEBE 90% + BONUS</span></div><div className="flex items-center gap-3 bg-[#F8FAFF] p-3 rounded-xl border"><span className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[12px]">🪪</span><span className="font-mono font-bold">CPF: {currentUser.cpf||"Não informado"}</span><span className="ml-auto text-[11px] px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-black">⭐ {currentUser.avaliacao||5}.0 • {currentUser.total_servicos||0} serviços</span></div></div></div></div>
                <div className="bg-white rounded-[2rem] p-8 border-2 border-slate-200/60 shadow-sm">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] flex items-center justify-center text-white">📍</div><div><div className="font-black text-[16px] tracking-tight">Cidades que você atende • Máx 3 • Filtro inteligente</div><div className="text-[12px] text-slate-500 mt-1">Você só recebe pedidos das cidades cadastradas • Novos pedidos com som e vibração em tempo real</div></div></div>
                  <div className="mt-6 flex flex-wrap gap-3">{(currentUser.cidades||[]).map(c=><span key={c} className="group bg-gradient-to-r from-[#0A2A6B] to-[#1e40af] text-white text-[13px] px-5 py-2.5 rounded-full font-black flex items-center gap-3 shadow-lg shadow-[#0A2A6B]/20">{c}<button onClick={()=>removerCidade(c)} className="w-6 h-6 rounded-full bg-white/20 group-hover:bg-white/30 flex items-center justify-center transition">✕</button></span>)}{(currentUser.cidades||[]).length===0 && <div className="w-full bg-amber-50 border-2 border-dashed border-amber-200 rounded-2xl p-6 text-center"><div className="text-[28px]">📍</div><div className="font-black text-[14px] mt-2">Nenhuma cidade cadastrada</div><div className="text-[12px] text-slate-500 mt-1">Adicione até 3 cidades para começar a receber pedidos verificados</div></div>}</div>
                  <div className="mt-6 flex gap-3"><input value={novaCidade} onChange={e=>setNovaCidade(e.target.value)} onKeyDown={e=>e.key==="Enter"&&adicionarCidade()} placeholder="Nova cidade SP ex: Presidente Prudente, Assis, Ourinhos..." className="flex-1 h-[52px] bg-[#F8FAFF] border-2 border-slate-200 rounded-full px-6 text-[14px] outline-none focus:bg-white focus:border-[#0A2A6B]/30 focus:ring-2 focus:ring-[#0A2A6B]/10 transition font-medium"/><button onClick={adicionarCidade} disabled={(currentUser.cidades||[]).length>=3} className={`h-[52px] px-8 rounded-full font-black text-[12px] tracking-widest shadow-lg active:scale-[0.98] transition ${ (currentUser.cidades||[]).length>=3 ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-[#FF7A00] text-white hover:bg-[#e66e00]"}`}>ADD CIDADE +</button></div>
                  <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500"><span className="w-6 h-6 rounded-full bg-[#0A2A6B]/10 flex items-center justify-center">💡</span><span className="font-medium">Dica Premium: cadastre 3 cidades próximas para receber até 3x mais pedidos • Todo SP • Som e vibração ativados</span></div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-[#0A2A6B] via-[#112a7d] to-[#1e40af] rounded-[2rem] p-7 text-white shadow-xl">
                  <div className="font-black text-[18px] tracking-tight">🚀 Seja Premium • Ganhe mais</div>
                  <div className="mt-5 space-y-3 text-[12px]">
                    <div className="flex gap-3 bg-white/10 backdrop-blur p-3 rounded-xl border border-white/10"><span className="w-7 h-7 rounded-full bg-emerald-400 text-white flex items-center justify-center shrink-0 font-black">✓</span><span className="leading-relaxed">Foto verificada aumenta 3x suas chances de ser aceito</span></div>
                    <div className="flex gap-3 bg-white/10 backdrop-blur p-3 rounded-xl border border-white/10"><span className="w-7 h-7 rounded-full bg-emerald-400 text-white flex items-center justify-center shrink-0 font-black">✓</span><span className="leading-relaxed">Mantenha 3 cidades ativas para mais pedidos</span></div>
                    <div className="flex gap-3 bg-white/10 backdrop-blur p-3 rounded-xl border border-white/10"><span className="w-7 h-7 rounded-full bg-emerald-400 text-white flex items-center justify-center shrink-0 font-black">✓</span><span className="leading-relaxed">Responda rápido • 30min de chegada</span></div>
                    <div className="flex gap-3 bg-white/10 backdrop-blur p-3 rounded-xl border border-white/10"><span className="w-7 h-7 rounded-full bg-[#FF7A00] text-white flex items-center justify-center shrink-0 font-black">🎉</span><span className="leading-relaxed font-bold">A cada 6 serviços, 1 bônus 100% para você!</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-[2rem] p-6 border-2 border-slate-200/60 shadow-sm">
                  <div className="font-black text-[14px]">📊 Seu desempenho</div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="bg-[#F8FAFF] p-4 rounded-2xl border text-center"><div className="text-[10px] font-black tracking-widest text-slate-400">FINALIZADOS</div><div className="text-[22px] font-black mt-1 text-[#0A2A6B]">{orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").length}</div></div>
                    <div className="bg-[#F8FAFF] p-4 rounded-2xl border text-center"><div className="text-[10px] font-black tracking-widest text-slate-400">GANHO TOTAL</div><div className="text-[18px] font-black mt-1 text-emerald-600">{formatBRL(orders.filter(o=>o.montador_id==currentUser.id && o.status==="finalizado").reduce((s,o)=>s+(o.ganho_montador||0),0))}</div></div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-[2rem] p-6">
                  <div className="font-black text-red-800 flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center font-black">!</div>Zona de perigo • LGPD</div>
                  <div className="text-[12px] text-red-700 mt-3 leading-relaxed">Ao excluir, histórico de {orders.filter(o=>o.montador_id==currentUser.id).length} serviços e avaliações serão apagados permanentemente. Esta ação não pode ser desfeita.</div>
                  <button onClick={excluirMeuCadastro} className="mt-5 w-full h-12 rounded-full bg-red-600 hover:bg-red-700 text-white font-black text-[11px] tracking-widest shadow-lg active:scale-[0.98] transition">EXCLUIR CADASTRO PERMANENTE</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {view==="admin" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="relative overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-slate-900 via-[#0A2A6B] to-[#1e40af] p-[1px] shadow-xl">
            <div className="bg-white rounded-[1.7rem] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white border shadow-sm p-2"><img src="/logo.png" className="w-full h-full object-contain"/></div>
                <div><div className="font-black text-[18px] tracking-tight">Painel ADM • Contato Certo SP Premium</div><div className="text-[11px] text-slate-500 font-bold tracking-widest mt-1">330 SERVIÇOS • {orders.length} PEDIDOS • {users.length} USUÁRIOS • PAGAMENTO SEGURO • TODO SP • {isLive ? "🟢 ONLINE AGORA" : "🔴 OFFLINE"}</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  {id:"pedidos", label:"PEDIDOS", icon:"📦", count: orders.length},
                  {id:"montadores", label:"MONTADORES", icon:"🔧", count: users.filter(u=>u.role==="montador").length},
                  {id:"clientes", label:"CLIENTES", icon:"👥", count: users.filter(u=>u.role==="cliente").length},
                  {id:"cupons", label:"CUPONS", icon:"🎟️", count: coupons.length},
                  {id:"suporte", label:"SUPORTE", icon:"💬", count: supportMessages.length}
                ].map(tab=>(
                  <button key={tab.id} onClick={()=>setAdminTab(tab.id)} className={`h-11 px-4 rounded-full text-[10px] font-black tracking-widest border flex items-center gap-2 active:scale-95 transition shrink-0 ${adminTab===tab.id ? "bg-[#0A2A6B] text-white border-[#0A2A6B] shadow-lg" : "bg-slate-50 border-slate-200 text-slate-600"}`}><span>{tab.icon}</span>{tab.label}<span className={`px-2 py-0.5 rounded-full text-[9px] ${adminTab===tab.id ? "bg-white/20" : "bg-[#0A2A6B] text-white"}`}>{tab.count}</span></button>
                ))}
              </div>
            </div>
          </div>

          {adminTab==="pedidos" && (
            <div className="mt-6 space-y-5">
              <div className="grid sm:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] rounded-[1.5rem] p-5 text-white shadow-lg"><div className="text-[10px] font-black tracking-widest opacity-70">TOTAL PEDIDOS</div><div className="text-[24px] font-black mt-1">{orders.length}</div><div className="text-[11px] opacity-70 mt-1">Todo SP • Pagamento seguro</div></div>
                <div className="bg-gradient-to-br from-amber-500 to-[#FF7A00] rounded-[1.5rem] p-5 text-white shadow-lg"><div className="text-[10px] font-black tracking-widest opacity-80">AGUARDANDO CONFIRMAÇÃO</div><div className="text-[24px] font-black mt-1">{orders.filter(o=>o.status==="aguardando_confirmacao_adm").length}</div><div className="text-[11px] opacity-80 mt-1">Confirme PIX</div></div>
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-[1.5rem] p-5 text-white shadow-lg"><div className="text-[10px] font-black tracking-widest opacity-80">EM ANDAMENTO</div><div className="text-[24px] font-black mt-1">{orders.filter(o=>o.status==="aceito").length}</div><div className="text-[11px] opacity-80 mt-1">Montador a caminho</div></div>
                <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-[1.5rem] p-5 text-white shadow-lg"><div className="text-[10px] font-black tracking-widest opacity-80">FINALIZADOS</div><div className="text-[24px] font-black mt-1">{orders.filter(o=>o.status==="finalizado").length}</div><div className="text-[11px] opacity-80 mt-1">✅ Sucesso</div></div>
              </div>

              <div className="bg-white rounded-[1.9rem] border-2 border-slate-200/60 shadow-sm overflow-hidden">
                <div className="p-6 border-b bg-[#F8FAFF] flex justify-between items-center"><h3 className="font-black text-[18px] tracking-tight">Todos Pedidos Premium • Controle Total</h3><div className="flex gap-2"><span className="px-3 py-1.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 text-[10px] font-black">{orders.filter(o=>o.status==="aguardando_confirmacao_adm").length} PARA CONFIRMAR</span><span className="px-3 py-1.5 rounded-full bg-[#0A2A6B] text-white text-[10px] font-black">{formatBRL(orders.reduce((s,o)=>s+(o.total||0),0))} TOTAL</span></div></div>
                <div className="divide-y max-h-[800px] overflow-auto">
                  {orders.sort((a,b)=>b.id-a.id).map(p=>{
                    const cliente = users.find(u=>u.id==p.cliente_id);
                    const montador = users.find(u=>u.id==p.montador_id);
                    const statusColor = p.status==="finalizado"?"bg-emerald-50 border-emerald-200 text-emerald-700":p.status==="aceito"?"bg-blue-50 border-blue-200 text-blue-700":p.status==="aguardando_confirmacao_adm"?"bg-amber-50 border-amber-300 text-amber-800":p.status==="aguardando_montador"?"bg-purple-50 border-purple-200 text-purple-700":"bg-slate-50 border-slate-200 text-slate-600";
                    return (
                      <div key={p.id} className="p-6 hover:bg-[#F8FAFF] transition">
                        <div className="flex flex-wrap justify-between gap-4">
                          <div className="flex gap-4"><div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black">#{String(p.id).slice(-4)}</div><div><div className="font-black text-[15px]">{p.cidade} • {p.bairro} • {p.endereco} • {formatBRL(p.total)}</div><div className="text-[11px] text-slate-500 mt-1">Cliente: {cliente?.nome||p.cliente_id} {cliente?.telefone||""} • {new Date(p.createdAt||p.created_at||Date.now()).toLocaleString("pt-BR")} • {p.itens?.length||0} itens • {p.data} {p.horario}</div><div className="mt-2 text-[11px] bg-white border rounded-xl p-2">{(p.itens||[]).map(i=>i.nome).join(" • ")}</div></div></div>
                          <div className="flex flex-col gap-2 items-end"><span className={`px-3 py-1.5 rounded-full border font-black text-[10px] tracking-widest ${statusColor}`}>{p.status?.toUpperCase()}</span><div className="text-[11px] text-slate-500">Montador: {montador?.nome||"Aguardando"}</div></div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {p.status==="aguardando_confirmacao_adm" && <button onClick={()=>confirmarPagamentoADM(p.id)} className="h-11 px-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] tracking-widest shadow active:scale-95 transition">✅ CONFIRMAR PAGAMENTO • LIBERAR MONTADOR</button>}
                          {p.comprovante && <a href={p.comprovante} target="_blank" className="h-11 px-6 rounded-full bg-[#0A2A6B] text-white font-black text-[11px] flex items-center gap-2">📸 VER COMPROVANTE • PIX {formatBRL(p.total)}</a>}
                          <button onClick={()=>cancelarPedido(p.id)} className="h-11 px-6 rounded-full bg-red-50 border-2 border-red-200 text-red-600 font-black text-[11px] tracking-widest hover:bg-red-100 transition">❌ CANCELAR</button>
                          <a href={`https://wa.me/55${cliente?.telefone?.replace(/\D/g,"")}`} target="_blank" className="h-11 px-6 rounded-full bg-[#25D366] text-white font-black text-[11px] flex items-center gap-2">💬 CLIENTE</a>
                          {montador && <a href={`https://wa.me/55${montador?.telefone?.replace(/\D/g,"")}`} target="_blank" className="h-11 px-6 rounded-full bg-slate-900 text-white font-black text-[11px] flex items-center gap-2">🔧 MONTADOR</a>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {adminTab==="montadores" && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {users.filter(u=>u.role==="montador").map(m=>{
                const finalizados = orders.filter(o=>o.montador_id==m.id && o.status==="finalizado").length;
                const ganho = orders.filter(o=>o.montador_id==m.id && o.status==="finalizado").reduce((s,o)=>s+(o.ganho_montador||0),0);
                return (
                  <div key={m.id} className="group bg-white rounded-[2rem] p-6 border-2 border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                    <div className="flex gap-4"><div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0A2A6B] to-[#FF7A00] p-[3px] shadow"><div className="w-full h-full rounded-[1.3rem] bg-white overflow-hidden flex items-center justify-center">{m.foto ? <img src={m.foto} className="w-full h-full object-cover"/> : <span className="font-black text-xl text-[#0A2A6B]">{m.nome?.[0]}</span>}</div></div><div className="flex-1 min-w-0"><div className="font-black text-[15px] tracking-tight flex items-center gap-2">{m.nome}<span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[8px] font-black">VERIFICADO</span></div><div className="text-[11px] text-slate-500 mt-1">{m.cidade} • {m.telefone}</div><div className="text-[10px] mt-1"><span className="px-2 py-0.5 rounded-full bg-[#0A2A6B] text-white font-black">PIX {m.pix||"Não informado"}</span> <span className="ml-1 font-mono text-[10px]">CPF {m.cpf||""}</span></div></div></div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="bg-[#F8FAFF] p-3 rounded-xl border text-center"><div className="text-[10px] font-black tracking-widest text-slate-400">SERVIÇOS</div><div className="font-black text-[16px] mt-1">{finalizados}</div></div>
                      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-center"><div className="text-[10px] font-black tracking-widest text-emerald-700">GANHO</div><div className="font-black text-[14px] mt-1 text-emerald-700">{formatBRL(ganho)}</div></div>
                      <div className="bg-[#0A2A6B] p-3 rounded-xl text-white text-center"><div className="text-[10px] font-black tracking-widest opacity-70">AVAL</div><div className="font-black text-[14px] mt-1">⭐ {m.avaliacao||5}</div></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">{(m.cidades||[]).map(c=><span key={c} className="px-3 py-1 rounded-full bg-slate-900 text-white text-[10px] font-black">{c}</span>)}</div>
                    <div className="mt-4 flex gap-2"><a href={`https://wa.me/55${m.telefone?.replace(/\D/g,"")}`} target="_blank" className="flex-1 h-10 rounded-full bg-[#25D366] text-white font-black text-[11px] flex items-center justify-center">WHATSAPP</a><button onClick={()=>{ if(window.confirm("Excluir montador "+m.nome+"?")) { setUsers(prev=>prev.filter(u=>u.id!==m.id)); }} } className="h-10 px-4 rounded-full bg-red-50 border border-red-200 text-red-600 font-black text-[10px]">EXCLUIR</button></div>
                  </div>
                );
              })}
            </div>
          )}

          {adminTab==="clientes" && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {users.filter(u=>u.role==="cliente").map(c=>{
                const totalGasto = orders.filter(o=>o.cliente_id==c.id && o.status==="finalizado").reduce((s,o)=>s+(o.total||0),0);
                const qtdPedidos = orders.filter(o=>o.cliente_id==c.id).length;
                return (
                  <div key={c.id} className="bg-white rounded-[2rem] p-6 border-2 border-slate-200/60 shadow-sm hover:shadow-lg transition-all">
                    <div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] flex items-center justify-center text-white font-black">{c.nome?.[0]}</div><div className="flex-1 min-w-0"><div className="font-black text-[15px] truncate">{c.nome}</div><div className="text-[11px] text-slate-500">{c.cidade} • {c.telefone}</div><div className="text-[10px] font-mono text-slate-400">@{c.usuario} • {c.email}</div></div></div>
                    <div className="mt-4 grid grid-cols-2 gap-3"><div className="bg-[#F8FAFF] p-3 rounded-xl border text-center"><div className="text-[10px] font-black tracking-widest text-slate-400">PEDIDOS</div><div className="font-black text-[18px] mt-1">{qtdPedidos}</div></div><div className="bg-[#0A2A6B] p-3 rounded-xl text-white text-center"><div className="text-[10px] font-black tracking-widest opacity-70">GASTO TOTAL</div><div className="font-black text-[14px] mt-1">{formatBRL(totalGasto)}</div></div></div>
                    <div className="mt-4 flex gap-2"><a href={`https://wa.me/55${c.telefone?.replace(/\D/g,"")}`} target="_blank" className="flex-1 h-10 rounded-full bg-[#25D366] text-white font-black text-[11px] flex items-center justify-center">WHATSAPP</a><a href={`tel:${c.telefone}`} className="h-10 px-4 rounded-full bg-slate-900 text-white font-black text-[10px] flex items-center justify-center">LIGAR</a></div>
                  </div>
                );
              })}
            </div>
          )}

          {adminTab==="cupons" && (
            <div className="mt-6 grid lg:grid-cols-[0.9fr_1.1fr] gap-6 max-w-6xl">
              <div className="bg-white rounded-[2rem] p-7 border-2 border-slate-200/60 shadow-sm">
                <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF7A00] to-[#ff9500] flex items-center justify-center text-white font-black">🎟️</div><div><div className="font-black text-[16px] tracking-tight">Criar Cupom Premium</div><div className="text-[11px] text-slate-500 mt-1">Desconto para clientes • Todo SP</div></div></div>
                <div className="mt-6 space-y-4">
                  <div><div className="text-[11px] font-black tracking-widest mb-2">CÓDIGO DO CUPOM</div><input value={newCoupon.code} onChange={e=>setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})} placeholder="EX: PREMIUM20, BEMVINDO10" className="w-full h-[52px] bg-[#F8FAFF] border-2 border-slate-200 rounded-2xl px-5 font-black tracking-widest text-[14px] outline-none focus:bg-white focus:border-[#0A2A6B]/30 focus:ring-2 focus:ring-[#0A2A6B]/10 transition"/></div>
                  <div><div className="text-[11px] font-black tracking-widest mb-2">DESCONTO %</div><input type="number" min="1" max="100" value={newCoupon.desconto} onChange={e=>setNewCoupon({...newCoupon, desconto: e.target.value})} placeholder="10" className="w-full h-[52px] bg-[#F8FAFF] border-2 border-slate-200 rounded-2xl px-5 font-black text-[18px] outline-none focus:bg-white focus:border-[#0A2A6B]/30 transition"/></div>
                  <button onClick={criarCupom} className="w-full h-[56px] rounded-full bg-gradient-to-r from-[#0A2A6B] to-[#1e40af] text-white font-black text-[13px] tracking-widest shadow-lg active:scale-[0.98] transition">🎟️ CRIAR CUPOM PREMIUM • ATIVAR AGORA</button>
                  <div className="text-[10px] text-slate-400 leading-relaxed">Cupom será válido para todos os clientes no checkout. Use para campanhas MESA, GUARDA-ROUPA, ESTANTE.</div>
                </div>
              </div>
              <div className="bg-white rounded-[2rem] p-7 border-2 border-slate-200/60 shadow-sm">
                <div className="font-black text-[16px] tracking-tight flex items-center gap-2">Cupons Ativos <span className="px-3 py-1 rounded-full bg-[#0A2A6B] text-white text-[10px] font-black">{coupons.length}</span></div>
                <div className="mt-5 space-y-3 max-h-[400px] overflow-auto pr-2">
                  {coupons.length===0 && <div className="text-center py-12"><div className="text-[40px]">🎟️</div><div className="font-bold mt-2">Nenhum cupom criado</div><div className="text-[12px] text-slate-500 mt-1">Crie cupons para aumentar vendas</div></div>}
                  {coupons.sort((a,b)=>b.id-a.id).map(c=>(
                    <div key={c.id} className="group flex justify-between items-center p-4 rounded-2xl bg-gradient-to-r from-[#F8FAFF] to-white border-2 border-slate-200/60 hover:border-[#0A2A6B]/20 hover:shadow-md transition-all">
                      <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF7A00] to-[#ff9500] flex items-center justify-center text-white font-black text-[12px]">%</div><div><div className="font-black text-[14px] tracking-widest">{c.code}</div><div className="text-[11px] text-slate-500 font-medium">{c.desconto}% OFF • Criado {new Date(c.created_at||Date.now()).toLocaleDateString("pt-BR")} • {c.ativo ? "✅ Ativo" : "❌ Inativo"}</div></div></div>
                      <div className="text-right"><div className="font-black text-[18px] text-[#FF7A00]">{c.desconto}%</div><div className="text-[10px] font-black tracking-widest text-slate-400">DESCONTO</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {adminTab==="suporte" && (
            <div className="mt-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-6 h-[75vh]">
              <div className="bg-white rounded-[2rem] border-2 border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 border-b bg-gradient-to-r from-[#0A2A6B] to-[#1e40af] text-white flex justify-between items-center"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-2xl bg-white p-2"><img src="/logo.png" className="w-full h-full object-contain"/></div><div><div className="font-black text-[16px] tracking-tight">Suporte Premium 24h • Central ADM</div><div className="text-[11px] opacity-80 mt-1">{supportMessages.length} mensagens • {users.length} usuários • Resposta rápida</div></div></div><span className="px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-[10px] font-black tracking-widest">🟢 ONLINE AGORA</span></div>
                <div className="flex-1 overflow-auto p-6 space-y-4 bg-[#F8FAFF]">
                  {supportMessages.length===0 && <div className="text-center py-16"><div className="text-[48px]">💬</div><div className="font-black mt-3">Nenhuma mensagem</div></div>}
                  {supportMessages.sort((a,b)=> new Date(a.created_at||0) - new Date(b.created_at||0)).map(m=>(
                    <div key={m.id} className={`flex gap-3 ${m.from_admin ? "flex-row-reverse" : ""}`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-black text-[11px] ${m.from_admin ? "bg-[#0A2A6B] text-white" : "bg-white border-2 border-slate-200 text-[#0A2A6B]"}`}>{m.from_admin ? "ADM" : m.user_nome?.[0]||"U"}</div>
                      <div className={`max-w-[78%] p-4 rounded-[1.3rem] text-[13px] leading-relaxed shadow-sm border ${m.from_admin ? "bg-[#0A2A6B] text-white rounded-tr-none border-[#0A2A6B]" : "bg-white rounded-tl-none border-slate-200"}`}>
                        <div className={`text-[9px] font-black tracking-widest mb-1.5 flex items-center gap-2 ${m.from_admin ? "text-white/70" : "text-slate-500"}`}><span>{m.from_admin ? "VOCÊ ADM" : m.user_nome?.toUpperCase()}</span><span className="w-1 h-1 rounded-full bg-current"></span><span>{new Date(m.created_at).toLocaleString("pt-BR")}</span></div>{m.mensagem}
                      </div>
                    </div>
                  ))}
                  <div ref={supportEndRef}></div>
                </div>
                <div className="p-5 border-t bg-white flex gap-3"><input value={supportInput} onChange={e=>setSupportInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&enviarSuporte()} placeholder="Responder como ADM • Suporte premium..." className="flex-1 h-[56px] bg-[#F8FAFF] border-2 border-slate-200 rounded-full px-6 text-[14px] outline-none focus:bg-white focus:border-[#0A2A6B]/30 focus:ring-2 focus:ring-[#0A2A6B]/10 transition"/><button onClick={enviarSuporte} className="w-[56px] h-[56px] rounded-full bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] text-white font-black shadow-lg active:scale-95 transition text-[18px]">➤</button></div>
              </div>
              <div className="bg-white rounded-[2rem] p-7 border-2 border-slate-200/60 shadow-sm overflow-auto">
                <div className="font-black text-[16px] tracking-tight">📊 Resumo rápido</div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="bg-[#F8FAFF] p-4 rounded-2xl border text-center"><div className="text-[10px] font-black tracking-widest text-slate-400">CLIENTES</div><div className="text-[22px] font-black mt-1">{users.filter(u=>u.role==="cliente").length}</div></div>
                  <div className="bg-[#F8FAFF] p-4 rounded-2xl border text-center"><div className="text-[10px] font-black tracking-widest text-slate-400">MONTADORES</div><div className="text-[22px] font-black mt-1">{users.filter(u=>u.role==="montador").length}</div></div>
                  <div className="bg-[#0A2A6B] p-4 rounded-2xl text-white text-center"><div className="text-[10px] font-black tracking-widest opacity-70">PEDIDOS HOJE</div><div className="text-[22px] font-black mt-1">{orders.filter(o=> new Date(o.createdAt||o.created_at||Date.now()).toDateString()===new Date().toDateString()).length}</div></div>
                  <div className="bg-[#FF7A00] p-4 rounded-2xl text-white text-center"><div className="text-[10px] font-black tracking-widest opacity-80">FATURAMENTO</div><div className="text-[18px] font-black mt-1">{formatBRL(orders.filter(o=>o.status==="finalizado").reduce((s,o)=>s+(o.total||0),0)*0.1)}</div></div>
                </div>
                <div className="mt-6"><div className="font-black text-[14px]">Últimos usuários</div><div className="mt-3 space-y-2 max-h-[300px] overflow-auto">{users.slice(0,10).map(u=><div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border"><div className="w-8 h-8 rounded-full bg-[#0A2A6B] text-white flex items-center justify-center font-black text-[11px]">{u.nome?.[0]}</div><div className="flex-1 min-w-0"><div className="font-bold text-[12px] truncate">{u.nome} • {u.role.toUpperCase()}</div><div className="text-[10px] text-slate-500">{u.cidade} • {u.telefone}</div></div></div>)}</div></div>
              </div>
            </div>
          )}
        </div>
      )}



      {showOrderFlow && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={()=>setShowOrderFlow(false)}></div>
          <div className="relative w-full sm:max-w-xl bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl max-h-[92vh] flex flex-col">
            <div className="p-5 border-b flex justify-between items-center shrink-0"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-[#0A2A6B] text-white flex items-center justify-center font-black">{orderStep}</div><div><div className="font-black">Checkout Premium</div><div className="text-xs text-slate-500">{isLive ? "🟢 Online agora" : "🔴 Offline"}</div></div></div><button onClick={()=>setShowOrderFlow(false)} className="w-10 h-10 rounded-full bg-slate-100">✕</button></div>
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
                  <span className="px-2.5 py-1 rounded-full bg-white/15 border border-white/10 text-[10px] font-black tracking-widest">{authMode.toUpperCase()} • ONLINE 🟢</span>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row justify-between gap-3"><div><div className="font-black">CONTATO CERTO SP • PREMIUM INTELIGENTE</div><div className="text-[11px] text-slate-500 mt-1 leading-relaxed">Realtime Supabase 2s • Suporte 24h • Foto do serviço sem câmera • Fácil de usar • <br/>Painéis completos: cliente, montador, admin • Inspirado estoque MESA/GUARDA-ROUPA/ESTANTE • {isLive ? "🟢 Online Ao Vivo" : "🔴 Reconectando"}</div></div><div className="text-xs text-slate-500">contatocerto.prestadores@gmail.com<br/>(18) 99148-8302</div></div>
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
        <div className="text-[11px] text-slate-600 mt-1">Abre galeria, não câmera. Compactada fotos verificadas.</div>
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
        <span>FINALIZAR CADASTRO PREMIUM</span><span className="text-[18px]">✅</span>
      </button>
      {mode==="montador" && !f.foto && <div className="mt-3 p-3 rounded-xl bg-red-50 border-2 border-red-200 text-[11px] font-black text-red-700 text-center animate-pulse">⚠️ FOTO OBRIGATÓRIA PARA CONTINUAR</div>}
      <div className="mt-3 text-[10px] text-center text-slate-400 font-medium leading-relaxed">Ao clicar você concorda com os termos<br/>Atendimento rápido e seguro • Todo SP</div>
    </div>
  </div>;
}
function LoginForm({onSubmit}){
  const [u,setU]=useState(""); const [s,setS]=useState("");
  return <div className="space-y-3">
    <input placeholder="Seu usuário" value={u} onChange={e=>setU(e.target.value)} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none" autoCapitalize="off"/>
    <input type="password" placeholder="Sua senha" value={s} onChange={e=>setS(e.target.value)} className="w-full h-12 bg-slate-100 rounded-2xl px-4 text-[15px] outline-none"/>
    <button type="button" onClick={()=>onSubmit(u,s)} className="w-full h-[52px] rounded-full bg-[#0A2A6B] text-white font-black text-[14px] tracking-widest shadow-lg active:scale-[0.98] transition">ENTRAR NA MINHA CONTA</button>
  </div>;
}

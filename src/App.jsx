
import React, { useState, useEffect, useMemo, useRef } from "react";
import { CATALOGO, CATEGORIAS } from "./data/catalog.js";
import { normalize, validarCPF, formatBRL, calcularDesconto } from "./utils/helpers.js";
import { supabase } from "./lib/supabase.js";

const PIX_KEY = "contatocerto.prestadores@gmail.com";
const WHATSAPP = "5518991488302";

// Som forte para notificacoes
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

const playLongBeep = () => playBeep(4);

export default function App() {
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem("ccs_current") || "null"));
  const [view, setView] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState("cliente");
  const [showAuth, setShowAuth] = useState(false);
  const [isLogin, setIsLogin] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("TODAS");
  const [cart, setCart] = useState([]);
  const [orderForm, setOrderForm] = useState({ endereco:"", bairro:"", cidade:"", data:"", horario:"", foto:"" });
  const [comprovante, setComprovante] = useState("");
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("info");
  const [showOrderFlow, setShowOrderFlow] = useState(false);
  const [orderStep, setOrderStep] = useState(1);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState("pedidos");
  const [avaliacaoForm, setAvaliacaoForm] = useState({ pedidoId:null, nota:5, comentario:"" });
  const prevOrdersRef = useRef([]);

  const notify = (msg, type="info", sound=1) => {
    setToast(msg); setToastType(type);
    if(sound>0) playBeep(sound);
    setTimeout(()=>setToast(""), type==="success"?6000:5000);
  };

  const fetchData = async () => {
    try {
      const hasEnv = import.meta.env.VITE_SUPABASE_URL;
      if(!hasEnv){
        setIsLive(false);
        setUsers(JSON.parse(localStorage.getItem("ccs_users")||"[]"));
        setOrders(JSON.parse(localStorage.getItem("ccs_orders")||"[]"));
        setLoading(false);
        return;
      }
      const { data: u } = await supabase.from("users").select("*").order("created_at", {ascending:false});
      const { data: o } = await supabase.from("orders").select("*").order("created_at", {ascending:false});
      if (u) setUsers(u);
      if (o) {
        const mapped = o.map(x=>({ id: x.id, clienteId: x.cliente_id, cliente_id: x.cliente_id, itens: x.itens, subtotal: x.subtotal, desconto: x.desconto, total: x.total, endereco: x.endereco, bairro: x.bairro, cidade: x.cidade, data: x.data, horario: x.horario, foto: x.foto, status: x.status, comprovante: x.comprovante, montadorId: x.montador_id, montador_id: x.montador_id, createdAt: x.created_at, aceiteAt: x.aceite_at, finalizadoAt: x.finalizado_at, avaliacao: x.avaliacao }));
        // Detectar mudancas para notificacoes sonoras
        handleNotifications(mapped, prevOrdersRef.current);
        prevOrdersRef.current = mapped;
        setOrders(mapped);
        setIsLive(true);
      }
    } catch (e) {
      setIsLive(false);
      setUsers(JSON.parse(localStorage.getItem("ccs_users")||"[]"));
      setOrders(JSON.parse(localStorage.getItem("ccs_orders")||"[]"));
    }
    setLoading(false);
  };

  const handleNotifications = (novos, antigos) => {
    if(!currentUser || antigos.length===0) return;
    const role = currentUser.role;
    novos.forEach(novo=>{
      const antigo = antigos.find(a=>a.id===novo.id);
      if(!antigo) {
        // Novo pedido criado
        if(role==="admin") notify(`🔔 NOVO PEDIDO #${novo.id} - ${novo.cidade} ${formatBRL(novo.total)}`, "success", 4);
        if(role==="montador" && novo.status==="aguardando_montador") notify(`🔔 NOVO PEDIDO LIBERADO #${novo.id} - ${novo.cidade}`, "success", 4);
        return;
      }
      if(antigo.status!==novo.status){
        // Transicoes de status
        if(role==="cliente" && (novo.cliente_id==currentUser.id)){
          if(novo.status==="aguardando_confirmacao_adm") notify(`✅ Comprovante recebido! Pedido #${novo.id} aguardando confirmação`, "success", 2);
          if(novo.status==="aguardando_montador") notify(`✅ Pagamento confirmado! Pedido #${novo.id} liberado para montadores`, "success", 3);
          if(novo.status==="aceito"){
            const mont = users.find(u=>u.id==novo.montador_id);
            notify(`🔧 Montador ${mont?.nome||""} aceitou seu pedido #${novo.id}! Chega em 30min`, "success", 4);
          }
          if(novo.status==="finalizado"){
            const mont = users.find(u=>u.id==novo.montador_id);
            notify(`🎉 Serviço finalizado pelo montador ${mont?.nome||""}! Avalie o serviço`, "success", 4);
          }
        }
        if(role==="montador"){
          if(novo.status==="aguardando_montador" && antigo.status!=="aguardando_montador") notify(`🔔 NOVO PEDIDO #${novo.id} em ${novo.cidade} - ${formatBRL(novo.total)}`, "success", 4);
        }
        if(role==="admin"){
          if(novo.status==="aguardando_confirmacao_adm") notify(`💰 COMPROVANTE RECEBIDO #${novo.id} - ${novo.cidade}`, "success", 4);
          if(novo.status==="aceito"){
            const mont = users.find(u=>u.id==novo.montador_id);
            notify(`🔧 Pedido #${novo.id} ACEITO por ${mont?.nome||"montador"}`, "info", 2);
          }
          if(novo.status==="finalizado") notify(`✅ Pedido #${novo.id} FINALIZADO`, "info", 2);
        }
      }
    });
  };

  useEffect(()=>{ fetchData(); },[]);
  useEffect(()=>{
    let channel;
    try{
      channel = supabase.channel("contato-certo-v4-notif")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ()=>fetchData())
        .on("postgres_changes", { event: "*", schema: "public", table: "users" }, ()=>fetchData())
        .subscribe((s)=>{ if(s==="SUBSCRIBED") setIsLive(true); });
    }catch{}
    const interval = setInterval(()=>fetchData(), 3000);
    return ()=>{ if(channel) supabase.removeChannel(channel); clearInterval(interval); };
  },[currentUser, users]);

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
    if(users.some(u=>u.usuario===formData.usuario)) return notify("Usuário já existe", "error", 1);
    if(formData.role==="montador" && !validarCPF(formData.cpf)) return notify("CPF inválido", "error",1);
    const newUser = { id: Date.now(), nome: formData.nome, cidade: formData.cidade, telefone: formData.telefone, email: formData.email, usuario: formData.usuario, senha: formData.senha, role: formData.role, cpf: formData.cpf||null, pix: formData.pix||null, cidades: formData.cidades||[], avaliacao:5, total_servicos:0, disponivel:true };
    try { await supabase.from("users").insert(newUser); notify("Cadastro realizado!", "success",2); } 
    catch { const all=[...users,newUser]; localStorage.setItem("ccs_users", JSON.stringify(all)); setUsers(all); }
    setCurrentUser({...newUser}); setShowAuth(false); setView(newUser.role==="cliente"?"cliente":"montador");
  };

  const handleLogin = async (usuario, senha)=>{
    if(usuario==="AndreSousa84" && senha==="20112024"){
      const adm = { id:0, role:"admin", nome:"ADM Andre Sousa", usuario:"AndreSousa84" };
      setCurrentUser(adm); setShowAuth(false); setView("admin"); return;
    }
    const u = users.find(x=>x.usuario===usuario && x.senha===senha);
    if(!u) return notify("Usuário ou senha inválidos","error",1);
    setCurrentUser(u); setShowAuth(false); setView(u.role==="cliente"?"cliente":"montador");
  };

  const addToCart = (item)=>{
    const exist = cart.find(c=>c.id===item.id);
    if(exist) setCart(cart.map(c=>c.id===item.id?{...c,qtd:c.qtd+1}:c));
    else setCart([...cart,{...item,qtd:1}]);
    notify(`${item.nome} adicionado`, "info",1);
  };

  const subtotal = cart.reduce((s,i)=>s+i.preco*i.qtd,0);
  const desconto = calcularDesconto(cart.reduce((s,i)=>s+i.qtd,0), subtotal);
  const total = subtotal - desconto;

const criarPedido = async ()=>{
    if(!orderForm.endereco || !orderForm.cidade) return notify("Preencha endereço e cidade","error",1);
    const pedidoDB = { id: Date.now(), cliente_id: currentUser.id, itens: cart, subtotal, desconto, total, endereco: orderForm.endereco, bairro: orderForm.bairro, cidade: orderForm.cidade, data: orderForm.data, horario: orderForm.horario, foto: "", status:"aguardando_comprovante", comprovante:"", montador_id: null, created_at: new Date().toISOString() };
    const pedidoLocal = { ...pedidoDB, clienteId: pedidoDB.cliente_id, cliente_id: pedidoDB.cliente_id, montadorId:null, montador_id:null, createdAt: pedidoDB.created_at };
    // Atualizacao otimista - aparece na hora
    setOrders(prev => [pedidoLocal, ...prev]);
    setCart([]); setOrderStep(3);
    try { 
      const { error } = await supabase.from("orders").insert(pedidoDB);
      if(error) throw error;
      notify("Pedido criado! Envie o comprovante","success",2);
      fetchData();
    } catch (e) {
      console.error("Erro criar pedido Supabase, mantendo local", e);
      const all=[pedidoLocal, ...orders];
      localStorage.setItem("ccs_orders", JSON.stringify(all));
      notify("Pedido criado local! Verifique Vercel env","info",2);
    }
  };

  const enviarComprovante = async (pedidoId, base64)=>{
    if(!base64) return notify("Selecione o comprovante","error",1);
    setOrders(prev=>prev.map(o=>o.id===pedidoId?{...o, comprovante: base64, status:"aguardando_confirmacao_adm"}:o));
    try { 
      const { error } = await supabase.from("orders").update({ comprovante: base64, status:"aguardando_confirmacao_adm" }).eq("id", pedidoId);
      if(error) throw error;
    } catch (e){ console.error("Erro comprovante", e); }
    notify("Comprovante enviado! Aguarde confirmação do ADM","success",2);
  };

  const confirmarPagamentoADM = async (id)=>{
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"aguardando_montador"}:o));
    try { 
      const { error } = await supabase.from("orders").update({ status:"aguardando_montador" }).eq("id", id);
      if(error) throw error;
    } catch (e){ console.error("Erro confirmar", e); }
    notify("Pagamento confirmado! Liberado para montadores com som","success",3);
  };

  const aceitarPedido = async (id)=>{
    const agora = new Date().toISOString();
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"aceito", montadorId: currentUser.id, montador_id: currentUser.id, aceiteAt: agora, aceite_at: agora}:o));
    try { 
      const { error } = await supabase.from("orders").update({ status:"aceito", montador_id: currentUser.id, aceite_at: agora }).eq("id", id);
      if(error) throw error;
    } catch (e){ console.error("Erro aceitar", e); }
    notify("Pedido aceito! Cliente foi notificado com som - 30min para chegar","success",3);
  };

  const finalizarPedido = async (id)=>{
    const agora = new Date().toISOString();
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"finalizado", finalizadoAt: agora, finalizado_at: agora}:o));
    try { 
      const { error } = await supabase.from("orders").update({ status:"finalizado", finalizado_at: agora }).eq("id", id);
      if(error) throw error;
    } catch (e){ console.error("Erro finalizar", e); }
    notify("Serviço finalizado! Cliente vai avaliar","success",2);
  };

  const enviarAvaliacao = async (pedidoId)=>{
    if(!avaliacaoForm.nota) return notify("Escolha a nota","error",1);
    const av = { nota: avaliacaoForm.nota, comentario: avaliacaoForm.comentario, data: new Date().toISOString(), cliente: currentUser.nome };
    setOrders(prev=>prev.map(o=>o.id===pedidoId?{...o, avaliacao: av}:o));
    try { 
      const { error } = await supabase.from("orders").update({ avaliacao: av }).eq("id", pedidoId);
      if(error) throw error;
    } catch (e){ console.error("Erro avaliacao", e); }
    const pedido = orders.find(o=>o.id===pedidoId);
    const montId = pedido?.montador_id || pedido?.montadorId;
    const todosDoMontador = orders.filter(o=> (o.montador_id==montId || o.montadorId==montId) && o.avaliacao?.nota);
    const notas = [...todosDoMontador.map(o=>o.avaliacao.nota), av.nota];
    const media = notas.length? notas.reduce((s,n)=>s+n,0)/notas.length : av.nota;
    try { await supabase.from("users").update({ avaliacao: media, total_servicos: notas.length }).eq("id", montId); } catch {}
    setAvaliacaoForm({ pedidoId:null, nota:5, comentario:"" });
    notify(`Obrigado! Você avaliou com ${av.nota} estrelas`,"success",2);
  };

  if(loading) return <div className="min-h-screen flex items-center justify-center bg-[#0A2A6B] text-white font-bold">Carregando...</div>;

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-gray-800">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={()=>setView("home")}>
          <img src="/logo.png" className="w-10 h-10 rounded-xl object-cover" alt="logo" />
          <span className="font-extrabold text-[#0A2A6B] text-xl">CONTATO CERTO SP</span>
          {isLive ? <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full animate-pulse">● Ao Vivo</span> : <span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full">● Offline</span>}
        </div>
        <div className="flex items-center gap-2">
          {currentUser ? <button type="button" onClick={()=>{ setCurrentUser(null); setView("home"); }} className="text-sm bg-gray-100 px-4 py-2 rounded-full">Sair</button> : <button type="button" onClick={()=>{ setShowAuth(true); setIsLogin(true); }} className="bg-[#0A2A6B] text-white px-4 py-2 rounded-xl">Entrar</button>}
          <button type="button" onClick={()=>setMenuOpen(!menuOpen)} className="w-10 h-10 bg-[#0A2A6B] text-white rounded-xl">☰</button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={()=>setMenuOpen(false)}>
          <div className="absolute right-0 top-0 w-80 h-full bg-white p-6 shadow-2xl rounded-l-3xl" onClick={e=>e.stopPropagation()}>
            <button type="button" onClick={()=>setMenuOpen(false)} className="mb-6 text-2xl">✕</button>
            <nav className="flex flex-col gap-3">
              <button type="button" onClick={()=>{ setMenuOpen(false); if(currentUser){ setView(currentUser.role==="cliente"?"cliente":currentUser.role==="montador"?"montador":"admin"); } else { setShowAuth(true); setIsLogin(true); } }} className="text-left p-3 rounded-xl bg-[#0A2A6B] text-white font-bold">👤 Meu Perfil</button>
              {["Como Funciona","Quem Somos","Suporte 24h","Montadores em Destaque"].map(item=><button key={item} onClick={()=>{ setMenuOpen(false); document.getElementById(item.toLowerCase().replace(/\s/g,"-"))?.scrollIntoView({behavior:"smooth"}); }} className="text-left p-3 rounded-xl hover:bg-gray-50">{item}</button>)}
              <hr className="my-2"/>
              {!currentUser && <>
                <button type="button" onClick={()=>{ setAuthMode("cliente"); setIsLogin(false); setShowAuth(true); setMenuOpen(false); }} className="bg-[#0A2A6B] text-white rounded-2xl py-4 font-bold">Cadastrar Cliente</button>
                <button type="button" onClick={()=>{ setAuthMode("montador"); setIsLogin(false); setShowAuth(true); setMenuOpen(false); }} className="bg-[#FF7A00] text-white rounded-2xl py-4 font-bold">Cadastrar Montador</button>
              </>}
            </nav>
          </div>
        </div>
      )}

      {view==="home" && (
        <>
          <section className="relative overflow-hidden">
            <img src="/banner.jpg" className="absolute inset-0 w-full h-full object-cover" alt="banner" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0A2A6B]/95 via-[#0A2A6B]/80 to-[#0A2A6B]/40"></div>
            <div className="relative px-6 py-16 md:py-24 max-w-6xl mx-auto">
              <h1 className="font-extrabold text-white text-4xl md:text-6xl">Montadores de Móveis Profissionais em Todo SP</h1>
              <p className="text-white/80 mt-4 text-lg max-w-2xl">330 serviços oficiais com atualização em tempo real - PIX {PIX_KEY}</p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 max-w-md">
                <button type="button" onClick={()=>{ setAuthMode("cliente"); setIsLogin(false); setShowAuth(true); }} className="bg-white text-[#0A2A6B] rounded-2xl py-5 font-bold flex-1">SOU CLIENTE</button>
                <button type="button" onClick={()=>{ setAuthMode("montador"); setIsLogin(false); setShowAuth(true); }} className="bg-[#FF7A00] text-white rounded-2xl py-5 font-bold flex-1">SOU MONTADOR</button>
              </div>
            </div>
          </section>
          <section id="como-funciona" className="px-4 py-12 max-w-6xl mx-auto">
            <h2 className="font-bold text-3xl text-[#0A2A6B]">Como Funciona</h2>
            <div className="mt-6 grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl p-5 shadow"><b>Cliente:</b> Cadastro → Busca → Endereço → PIX → Comprovante (🔔 ADM) → Pagamento confirmado (🔔) → Montador aceita (🔔🔔) → Finaliza → Avalie 1-5 ⭐</div>
              <div className="bg-white rounded-3xl p-5 shadow border-l-4 border-l-[#FF7A00]"><b>Montador:</b> Cadastro → 3 cidades → Fique online → Receba pedido com SOM 🔔🔔🔔 → Aceite em 30min → Finalize → Cliente avalia</div>
            </div>
          </section>
          <section id="montadores-em-destaque" className="px-4 py-12 max-w-6xl mx-auto">
            <h2 className="font-bold text-2xl">Montadores em Destaque</h2>
            <div className="mt-6 grid sm:grid-cols-3 gap-4">
              {users.filter(u=>u.role==="montador").map(m=><div key={m.id} className="bg-white rounded-3xl p-4 shadow"><div className="font-bold">{m.nome} ⭐ {Number(m.avaliacao||5).toFixed(1)}</div><div className="text-xs">{(m.cidades||[]).join(", ")} - {m.total_servicos||0} serviços</div></div>)}
            </div>
          </section>
        </>
      )}

      {view==="cliente" && currentUser?.role==="cliente" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h2 className="font-bold text-2xl">Olá, {currentUser.nome} {isLive?"🟢 Ao Vivo":"🔴"} 🔔 Som ativado</h2>
          <button type="button" onClick={()=>{ setShowOrderFlow(true); setOrderStep(1); }} className="bg-[#FF7A00] text-white w-full text-xl py-6 rounded-2xl font-bold mt-4">+ NOVO PEDIDO - 330 serviços</button>
          <h3 className="font-bold mt-6">Meus Pedidos ({orders.filter(o=>o.cliente_id==currentUser.id || o.clienteId==currentUser.id).length})</h3>
          <div className="mt-3 space-y-3">
            {orders.filter(o=>o.cliente_id==currentUser.id || o.clienteId==currentUser.id).map(p=>{
              const montador = users.find(u=>u.id==p.montador_id || u.id==p.montadorId);
              return (
              <div key={p.id} className="bg-white rounded-3xl p-4 shadow">
                <div className="flex justify-between"><span className="font-bold">#{p.id}</span><span className={`text-xs px-2 py-1 rounded-full ${p.status==="finalizado"?"bg-green-100 text-green-700":p.status==="aceito"?"bg-blue-100 text-blue-700":"bg-yellow-100 text-yellow-700"}`}>{p.status}</span></div>
                <div className="text-sm mt-1">{(p.itens||[]).map(i=>`${i.nome} x${i.qtd}`).join(", ")}</div>
                <div className="font-bold text-[#FF7A00]">{formatBRL(p.total)} - {p.cidade}</div>
                <div className="text-xs text-gray-500">{p.endereco} - {p.bairro}</div>
                {p.status==="aguardando_comprovante" && (
                  <div className="mt-3 p-3 bg-yellow-50 rounded-xl">
                    <div className="text-sm font-bold">📤 Envie o comprovante PIX</div>
                    <div className="text-xs">PIX: {PIX_KEY}</div>
                    <input type="file" accept="image/*" onChange={e=>{ const r=new FileReader(); r.onload=()=>setComprovante(r.result); r.readAsDataURL(e.target.files[0]); }} className="text-xs mt-2 w-full"/>
                    <button type="button" onClick={()=>enviarComprovante(p.id, comprovante)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl text-sm mt-2">ENVIAR COMPROVANTE 🔔 ADM será notificado</button>
                  </div>
                )}
                {p.status==="aguardando_confirmacao_adm" && <div className="mt-2 text-sm bg-blue-50 p-3 rounded-xl">✅ Comprovante recebido! 🔔 ADM vai confirmar e você ouvirá o som</div>}
                {p.status==="aguardando_montador" && <div className="mt-2 text-sm bg-green-50 p-3 rounded-xl">✅ Pagamento confirmado! 🔔 Aguardando montador aceitar com som</div>}
                {(p.status==="aceito") && montador && (
                  <div className="mt-3 p-4 bg-blue-50 border-2 border-blue-300 rounded-2xl animate-pulse">
                    <div className="text-xs font-bold text-[#0A2A6B]">🔔🔧 MONTADOR ACEITOU - A CAMINHO!</div>
                    <div className="font-bold text-lg">{montador.nome} ⭐ {Number(montador.avaliacao||5).toFixed(1)}</div>
                    <div className="text-sm">📱 {montador.telefone}</div>
                    <div className="text-xs text-gray-600">{(montador.cidades||[]).join(", ")} | {montador.total_servicos||0} serviços</div>
                    <div className="text-xs mt-2 font-bold text-green-700">Chega em até 30min - Aceito {p.aceiteAt? new Date(p.aceiteAt).toLocaleString("pt-BR") : p.aceite_at? new Date(p.aceite_at).toLocaleString("pt-BR"):""}</div>
                    <div className="flex gap-2 mt-3">
                      <a href={`https://wa.me/55${(montador.telefone||"").replace(/\D/g,"")}?text=Olá ${montador.nome}, sobre meu pedido #${p.id}`} target="_blank" className="flex-1 bg-green-600 text-white text-center py-3 rounded-xl font-bold">💬 WhatsApp</a>
                      <a href={`tel:${montador.telefone}`} className="flex-1 bg-[#0A2A6B] text-white text-center py-3 rounded-xl font-bold">📞 Ligar</a>
                    </div>
                  </div>
                )}
                {p.status==="finalizado" && (
                  <div className="mt-3">
                    {montador && <div className="p-3 bg-green-50 border border-green-200 rounded-2xl"><div className="text-sm font-bold">🎉 Serviço finalizado por {montador.nome}!</div><div className="text-xs">Finalizado em {p.finalizadoAt? new Date(p.finalizadoAt).toLocaleString("pt-BR") : p.finalizado_at? new Date(p.finalizado_at).toLocaleString("pt-BR"):""}</div></div>}
                    {!p.avaliacao ? (
                      <div className="mt-3 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-2xl">
                        <div className="font-bold">⭐ Avalie o montador {montador?.nome}</div>
                        <div className="flex gap-1 mt-2">
                          {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setAvaliacaoForm({ ...avaliacaoForm, pedidoId:p.id, nota:n })} className={`text-3xl ${avaliacaoForm.pedidoId===p.id && avaliacaoForm.nota>=n ? "text-yellow-500":"text-gray-300"}`}>★</button>)}
                        </div>
                        <textarea value={avaliacaoForm.pedidoId===p.id?avaliacaoForm.comentario:""} onChange={e=>setAvaliacaoForm({ ...avaliacaoForm, pedidoId:p.id, comentario:e.target.value })} placeholder="Como foi o serviço? (opcional)" className="w-full mt-3 p-3 border rounded-xl text-sm" rows="3"></textarea>
                        <button type="button" onClick={()=>enviarAvaliacao(p.id)} className="bg-[#FF7A00] text-white w-full py-3 rounded-xl mt-3 font-bold">Enviar Avaliação {avaliacaoForm.nota} ⭐</button>
                      </div>
                    ) : (
                      <div className="mt-3 p-3 bg-white border rounded-2xl"><div className="text-sm">✅ Você avaliou: {p.avaliacao.nota} ⭐ - "{p.avaliacao.comentario}"</div></div>
                    )}
                  </div>
                )}
              </div>
            )})}
          </div>
        </div>
      )}


      {view==="montador" && currentUser?.role==="montador" && (
        <MontadorPanel 
          currentUser={currentUser} setCurrentUser={setCurrentUser} users={users} orders={orders} isLive={isLive}
          aceitarPedido={aceitarPedido} finalizarPedido={finalizarPedido} formatBRL={formatBRL} notify={notify} setUsers={setUsers}
        />
      )}


      {view==="admin" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h2 className="font-bold text-2xl">Administração - {orders.length} pedidos {isLive?"🟢 Ao Vivo":"🔴"} 🔊 Som em tudo</h2>
          <div className="flex gap-2 mt-4 overflow-auto pb-2">
            <button type="button" onClick={()=>setAdminTab("pedidos")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="pedidos"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Todos ({orders.length})</button>
            <button type="button" onClick={()=>setAdminTab("comprovantes")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="comprovantes"?"bg-yellow-500 text-white animate-pulse":"bg-white"}`}>Comprovantes ({orders.filter(o=>o.status==="aguardando_confirmacao_adm").length}) 🔔</button>
            <button type="button" onClick={()=>setAdminTab("liberados")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="liberados"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Liberados ({orders.filter(o=>o.status==="aguardando_montador").length})</button>
            <button type="button" onClick={()=>setAdminTab("aceitos")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="aceitos"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Aceitos ({orders.filter(o=>o.status==="aceito").length}) 🔔</button>
            <button type="button" onClick={()=>setAdminTab("finalizados")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="finalizados"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Finalizados ({orders.filter(o=>o.status==="finalizado").length}) 🔔</button>
            <button type="button" onClick={()=>setAdminTab("financeiro")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="financeiro"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Financeiro</button>
          </div>

          {adminTab==="pedidos" && (
            <div className="mt-4 space-y-3">
              {orders.map(p=>{
                const montador = users.find(u=>u.id==p.montador_id || u.id==p.montadorId);
                const cliente = users.find(u=>u.id==p.cliente_id);
                return (
                <div key={p.id} className="bg-white p-4 rounded-3xl shadow">
                  <div className="flex justify-between"><div className="font-bold">Pedido #{p.id} - {formatBRL(p.total)} - {p.status}</div><div className="text-xs">{p.cidade}</div></div>
                  <div className="text-xs">Cliente: {cliente?.nome||p.cliente_id} {cliente?.telefone||""}</div>
                  <div className="text-xs">{p.endereco} - {p.bairro}</div>
                  {montador && <div className="mt-2 p-2 bg-blue-50 rounded-xl text-xs">🔧 {montador.nome} - {montador.telefone} - Aceito {p.aceiteAt||p.aceite_at? new Date(p.aceiteAt||p.aceite_at).toLocaleString("pt-BR"):""}</div>}
                  {p.avaliacao && <div className="mt-2 p-2 bg-yellow-50 rounded-xl text-xs">⭐ {p.avaliacao.nota} estrelas: "{p.avaliacao.comentario}" por {p.avaliacao.cliente}</div>}
                  {p.comprovante && <img src={p.comprovante} className="w-full max-w-xs h-32 object-cover rounded-xl mt-2 border"/>}
                  {p.status==="aguardando_confirmacao_adm" && <button type="button" onClick={()=>confirmarPagamentoADM(p.id)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl mt-3 font-bold">✅ CONFIRMAR PAGAMENTO 🔔</button>}
                </div>
              )})}
            </div>
          )}

          {adminTab==="comprovantes" && (
            <div className="mt-4 space-y-3">
              {orders.filter(o=>o.status==="aguardando_confirmacao_adm").map(p=>(
                <div key={p.id} className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-3xl shadow animate-pulse">
                  <div className="font-bold text-lg">🔔💰 COMPROVANTE NOVO #{p.id} - {formatBRL(p.total)}</div>
                  <img src={p.comprovante} className="w-full max-w-md h-64 object-contain bg-white rounded-xl mt-3 border"/>
                  <button type="button" onClick={()=>confirmarPagamentoADM(p.id)} className="bg-green-600 text-white w-full py-4 rounded-xl mt-4 font-bold text-lg">CONFIRMAR E LIBERAR COM SOM 🔔</button>
                </div>
              ))}
              {orders.filter(o=>o.status==="aguardando_confirmacao_adm").length===0 && <div className="bg-white p-10 rounded-3xl text-center">Nenhum comprovante pendente</div>}
            </div>
          )}

          {adminTab==="aceitos" && (
            <div className="mt-4 space-y-3">
              {orders.filter(o=>o.status==="aceito").map(p=>{
                const montador = users.find(u=>u.id==p.montador_id);
                const cliente = users.find(u=>u.id==p.cliente_id);
                return <div key={p.id} className="bg-blue-50 border p-4 rounded-3xl"><b>#{p.id} ACEITO</b> por {montador?.nome} - Cliente {cliente?.nome} - {p.cidade} - {formatBRL(p.total)}</div>
              })}
            </div>
          )}

          {adminTab==="finalizados" && (
            <div className="mt-4 space-y-3">
              {orders.filter(o=>o.status==="finalizado").map(p=>{
                const montador = users.find(u=>u.id==p.montador_id);
                return <div key={p.id} className="bg-green-50 border p-4 rounded-3xl"><b>#{p.id} FINALIZADO</b> por {montador?.nome} - {p.avaliacao? `⭐ ${p.avaliacao.nota} - "${p.avaliacao.comentario}"` : "Sem avaliação ainda"} - {formatBRL(p.total)}</div>
              })}
            </div>
          )}

          {adminTab==="liberados" && (
            <div className="mt-4">
              {orders.filter(o=>o.status==="aguardando_montador").map(p=><div key={p.id} className="bg-white p-4 rounded-3xl shadow mt-3"><b>#{p.id}</b> {p.cidade} {formatBRL(p.total)} - Aguardando montador</div>)}
            </div>
          )}

          {adminTab==="financeiro" && (
            <div className="mt-4 bg-white p-6 rounded-3xl shadow">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0A2A6B] text-white p-4 rounded-2xl"><div className="text-xs">Total Bruto</div><div className="text-xl font-bold">{formatBRL(orders.filter(o=>o.status==="finalizado").reduce((s,p)=>s+p.total,0))}</div></div>
                <div className="bg-[#FF7A00] text-white p-4 rounded-2xl"><div className="text-xs">Comissão 10%</div><div className="text-xl font-bold">{formatBRL(orders.filter(o=>o.status==="finalizado").reduce((s,p)=>s+p.total,0)*0.1)}</div></div>
              </div>
              <div className="mt-4">
                <h4 className="font-bold">Avaliações Recentes</h4>
                {orders.filter(o=>o.avaliacao).slice(0,10).map(o=><div key={o.id} className="text-xs mt-2 p-2 bg-gray-50 rounded-xl">#{o.id} ⭐{o.avaliacao.nota} - {o.avaliacao.comentario}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {showOrderFlow && (
        <div className="fixed inset-0 z-50 bg-white overflow-auto">
          <div className="sticky top-0 bg-white border-b p-4 flex justify-between"><h2 className="font-bold">{orderStep===1?"Buscar 330 serviços":orderStep===2?"Seus dados":"PIX"}</h2><button type="button" onClick={()=>setShowOrderFlow(false)}>✕</button></div>
          <div className="p-4 max-w-4xl mx-auto">
            {orderStep===1 && (
              <>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="guarda roupa, cama, rack..." className="w-full p-4 rounded-2xl border text-lg"/>
                <div className="mt-2 flex gap-2 overflow-auto">
                  <button type="button" onClick={()=>setCatFilter("TODAS")} className={`px-3 py-1 rounded-full text-xs ${catFilter==="TODAS"?"bg-[#0A2A6B] text-white":"bg-gray-100"}`}>TODAS ({CATALOGO.length})</button>
                  {CATEGORIAS.map(c=><button key={c} onClick={()=>setCatFilter(c)} className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${catFilter===c?"bg-[#0A2A6B] text-white":"bg-gray-100"}`}>{c}</button>)}
                </div>
                <div className="grid sm:grid-cols-2 gap-3 mt-4">
                  {filteredCatalog.slice(0,80).map(item=>(
                    <div key={item.id} className="bg-white border rounded-2xl p-3 flex justify-between items-center">
                      <div><div className="text-xs bg-[#0A2A6B] text-white px-2 py-1 rounded-full inline-block">{item.categoria}</div><div className="text-sm font-medium">{item.nome}</div><div className="font-bold text-[#FF7A00]">{formatBRL(item.preco)}</div></div>
                      <button type="button" onClick={()=>addToCart(item)} className="bg-[#FF7A00] text-white px-3 py-2 rounded-xl text-sm">ADD</button>
                    </div>
                  ))}
                </div>
                {cart.length>0 && <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4"><div className="max-w-4xl mx-auto"><div className="text-sm">Total {formatBRL(total)} - {cart.length} itens</div><button type="button" onClick={()=>setOrderStep(2)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl mt-2">Continuar</button></div></div>}
              </>
            )}
            {orderStep===2 && (
              <div className="space-y-3">
                <input value={orderForm.endereco} onChange={e=>setOrderForm({...orderForm,endereco:e.target.value})} placeholder="Endereço completo" className="w-full p-4 border rounded-2xl"/>
                <input value={orderForm.bairro} onChange={e=>setOrderForm({...orderForm,bairro:e.target.value})} placeholder="Bairro" className="w-full p-4 border rounded-2xl"/>
                <input value={orderForm.cidade} onChange={e=>setOrderForm({...orderForm,cidade:e.target.value})} placeholder="Cidade em SP" className="w-full p-4 border rounded-2xl"/>
                <input type="date" value={orderForm.data} onChange={e=>setOrderForm({...orderForm,data:e.target.value})} className="w-full p-4 border rounded-2xl"/>
                <input type="time" value={orderForm.horario} onChange={e=>setOrderForm({...orderForm,horario:e.target.value})} className="w-full p-4 border rounded-2xl"/>
                <button type="button" onClick={criarPedido} className="bg-[#FF7A00] text-white w-full py-5 rounded-2xl font-bold">Confirmar Pedido</button>
              </div>
            )}
            {orderStep===3 && (
              <div className="text-center space-y-4">
                <div className="bg-[#0A2A6B] text-white p-4 rounded-2xl"><div className="text-sm">PIX - Copie a chave</div><div className="font-mono font-bold">{PIX_KEY}</div><div className="text-lg font-bold mt-2">Total {formatBRL(total)}</div></div>
                <button type="button" onClick={()=>{ navigator.clipboard.writeText(PIX_KEY); notify("Chave copiada!","info",1); }} className="bg-[#0A2A6B] text-white w-full py-4 rounded-2xl">COPIAR CHAVE PIX</button>
                <a href={`https://wa.me/${WHATSAPP}?text=Pedido ${formatBRL(total)}`} target="_blank" className="block bg-[#FF7A00] text-white py-4 rounded-2xl">WhatsApp (18) 99148-8302</a>
                <button type="button" onClick={()=>{ setShowOrderFlow(false); setView("cliente"); }} className="bg-gray-100 w-full py-4 rounded-2xl">Ir para Meus Pedidos</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showAuth && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 max-h-[90vh] overflow-auto">
            <div className="flex justify-between mb-4"><h3 className="font-bold">{isLogin?"Entrar":"Cadastrar"} {authMode}</h3><button type="button" onClick={()=>setShowAuth(false)}>✕</button></div>
            {!isLogin ? <RegisterForm mode={authMode} onSubmit={handleRegister}/> : <LoginForm onSubmit={handleLogin}/>}
            <button type="button" onClick={()=>setIsLogin(!isLogin)} className="text-xs underline w-full text-center mt-3">{isLogin?"Criar conta":"Já tenho conta"}</button>
          </div>
        </div>
      )}

      {toast && <div className={`fixed bottom-20 left-4 right-4 p-4 rounded-2xl z-[60] shadow-2xl font-bold text-center animate-bounce ${toastType==="success"?"bg-green-600 text-white":toastType==="error"?"bg-red-600 text-white":"bg-[#0A2A6B] text-white"}`}>🔔 {toast}</div>}
      <button type="button" onClick={()=>notify("Para instalar: toque em Compartilhar e depois em Adicionar à Tela Inicial","info",1)} className="fixed bottom-4 right-4 bg-[#0A2A6B] text-white px-5 py-3 rounded-full shadow-2xl text-sm font-bold">BAIXAR APLICATIVO</button>
      <footer className="bg-[#0A2A6B] text-white text-center py-6 mt-10"><div>2026 - Contato Certo SP - AO VIVO {isLive?"🟢":"🔴"} 🔊</div><div className="text-xs">contatocerto.prestadores@gmail.com - (18) 99148-8302</div></footer>
    </div>
  );
}


function MontadorPanel({ currentUser, setCurrentUser, users, orders, isLive, aceitarPedido, finalizarPedido, formatBRL, notify, setUsers }){
  const [tab, setTab] = React.useState("disponiveis");
  const [novaCidade, setNovaCidade] = React.useState("");
  const [timerNow, setTimerNow] = React.useState(Date.now());
  React.useEffect(()=>{ const id=setInterval(()=>setTimerNow(Date.now()),1000); return ()=>clearInterval(id); },[]);

  const toggleDisponivel = async ()=>{
    const novo = !currentUser.disponivel;
    const updated = { ...currentUser, disponivel: novo };
    setCurrentUser(updated);
    try { const { error } = await supabase.from("users").update({ disponivel: novo }).eq("id", currentUser.id); if(error) throw error; } catch(e){ console.error(e); }
    setUsers(prev=>prev.map(u=>u.id==currentUser.id? {...u, disponivel:novo}:u));
    notify(novo? "✅ Você está ONLINE - receberá pedidos com SOM":"⛔ Você está OFFLINE", novo?"success":"info", novo?3:1);
  };

  const removerCidade = async (cid)=>{
    const novas = (currentUser.cidades||[]).filter(c=>c!==cid);
    const updated = { ...currentUser, cidades: novas };
    setCurrentUser(updated);
    try { await supabase.from("users").update({ cidades: novas }).eq("id", currentUser.id); } catch {}
    setUsers(prev=>prev.map(u=>u.id==currentUser.id? {...u, cidades:novas}:u));
  };

  const adicionarCidade = async ()=>{
    if(!novaCidade) return;
    if((currentUser.cidades||[]).length>=3) return notify("Máximo 3 cidades","error",1);
    const novas = [...(currentUser.cidades||[]), novaCidade];
    const updated = { ...currentUser, cidades: novas };
    setCurrentUser(updated);
    setNovaCidade("");
    try { await supabase.from("users").update({ cidades: novas }).eq("id", currentUser.id); } catch {}
    setUsers(prev=>prev.map(u=>u.id==currentUser.id? {...u, cidades:novas}:u));
  };

  const meusAceitos = orders.filter(o=> (o.montador_id==currentUser.id || o.montadorId==currentUser.id) && o.status==="aceito");
  const meusFinalizados = orders.filter(o=> (o.montador_id==currentUser.id || o.montadorId==currentUser.id) && o.status==="finalizado");
  const disponiveis = orders.filter(o=>{
    if(o.status!=="aguardando_montador") return false;
    if(!currentUser.cidades?.length) return true;
    return currentUser.cidades.map(c=>c.toLowerCase()).includes((o.cidade||"").toLowerCase()) || true;
  });

  const totalGanho = meusFinalizados.reduce((s,p)=>s + (p.total*0.9), 0);
  const totalBruto = meusFinalizados.reduce((s,p)=>s + p.total, 0);

  const tempoRestante = (aceiteAt)=>{
    if(!aceiteAt) return "30:00";
    const aceite = new Date(aceiteAt).getTime();
    const limite = aceite + 30*60*1000;
    const diff = limite - timerNow;
    if(diff<=0) return "ATRASADO!";
    const m = Math.floor(diff/60000);
    const s = Math.floor((diff%60000)/1000);
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h2 className="font-bold text-2xl">Painel Montador - {currentUser.nome} {isLive?"🟢":"🔴"}</h2>
      <div className="mt-3 bg-white p-4 rounded-3xl shadow flex justify-between items-center">
        <div>
          <div className="font-bold">Status: {currentUser.disponivel? "🟢 ONLINE - Recebendo pedidos":"🔴 OFFLINE"}</div>
          <div className="text-xs text-gray-600">⭐ {Number(currentUser.avaliacao||5).toFixed(1)} | {currentUser.total_servicos||0} serviços | CPF validado</div>
          <div className="text-xs">PIX: {currentUser.pix} | Cidades: {(currentUser.cidades||[]).join(", ")||"Todas SP"}</div>
        </div>
        <button type="button" onClick={toggleDisponivel} className={`px-6 py-3 rounded-2xl font-bold text-white ${currentUser.disponivel?"bg-red-500":"bg-green-600"}`}>{currentUser.disponivel?"Ficar Offline":"Ficar Online 🔊"}</button>
      </div>

      <div className="flex gap-2 mt-4 overflow-auto pb-2">
        <button type="button" onClick={()=>setTab("disponiveis")} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab==="disponiveis"?"bg-[#0A2A6B] text-white":"bg-white"}`}>🔔 Disponíveis ({disponiveis.length})</button>
        <button type="button" onClick={()=>setTab("aceitos")} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab==="aceitos"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Meus Aceitos ({meusAceitos.length}) ⏰</button>
        <button type="button" onClick={()=>setTab("finalizados")} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab==="finalizados"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Finalizados ({meusFinalizados.length})</button>
        <button type="button" onClick={()=>setTab("financeiro")} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab==="financeiro"?"bg-[#0A2A6B] text-white":"bg-white"}`}>💰 Financeiro</button>
        <button type="button" onClick={()=>setTab("perfil")} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab==="perfil"?"bg-[#0A2A6B] text-white":"bg-white"}`}>👤 Perfil</button>
      </div>

      {tab==="disponiveis" && (
        <div className="mt-4 space-y-3">
          <div className="text-xs bg-green-100 p-3 rounded-xl">🔊 SOM ALTO ativado - Você será notificado com beep + vibração quando chegar pedido novo nas cidades: {(currentUser.cidades||[]).join(", ")||"Todas SP"}. Mantenha ONLINE.</div>
          {disponiveis.map(p=>{
            const cliente = users.find(u=>u.id==p.cliente_id || u.id==p.clienteId);
            return (
              <div key={p.id} className="bg-white rounded-3xl p-4 shadow border-l-4 border-l-[#FF7A00] animate-pulse">
                <div className="flex justify-between"><span className="font-bold text-lg">🔔 NOVO #{p.id} - {p.cidade}</span><span className="font-bold text-[#FF7A00] text-lg">{formatBRL(p.total)} (90% seu = {formatBRL(p.total*0.9)})</span></div>
                <div className="mt-2 bg-gray-50 p-3 rounded-xl">
                  <div className="font-bold text-sm">👤 Cliente: {cliente?.nome||`ID ${p.cliente_id}`}</div>
                  <div className="text-xs">📱 {cliente?.telefone||"Telefone no cadastro"} | {cliente?.email||""}</div>
                  <div className="text-sm mt-1 font-bold">📍 {p.endereco} - {p.bairro} - {p.cidade}</div>
                  <div className="text-xs">📅 {p.data} às {p.horario}</div>
                </div>
                <div className="mt-2">
                  <div className="text-xs font-bold">Serviços ({(p.itens||[]).length} itens):</div>
                  <div className="text-xs">{(p.itens||[]).map(i=>`${i.nome} x${i.qtd}`).join(", ")}</div>
                </div>
                {p.foto && <img src={p.foto} className="w-full h-32 object-cover rounded-xl mt-2"/>}
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={()=>aceitarPedido(p.id)} className="flex-1 bg-[#0A2A6B] text-white py-4 rounded-xl font-bold text-lg">🔔 ACEITAR - 30MIN ⏰</button>
                  <a href={`https://wa.me/55${(cliente?.telefone||"").replace(/\D/g,"")}`} target="_blank" className="bg-green-600 text-white px-4 py-4 rounded-xl font-bold text-xs">WhatsApp Cliente</a>
                </div>
              </div>
            )
          })}
          {disponiveis.length===0 && <div className="text-center py-10 text-gray-400 bg-white rounded-3xl">Nenhum pedido liberado agora. Deixe ONLINE com som ligado! 🔊🟢<br/>Quando ADM confirmar pagamento, toca beep aqui.</div>}
        </div>
      )}

      {tab==="aceitos" && (
        <div className="mt-4 space-y-3">
          {meusAceitos.map(p=>{
            const cliente = users.find(u=>u.id==p.cliente_id || u.id==p.clienteId);
            const rest = tempoRestante(p.aceiteAt || p.aceite_at);
            const atrasado = rest==="ATRASADO!";
            return (
              <div key={p.id} className={`bg-white p-4 rounded-3xl shadow border-l-4 ${atrasado?"border-l-red-600 bg-red-50":"border-l-blue-500"}`}>
                <div className="flex justify-between items-center">
                  <span className="font-bold">#{p.id} - {p.cidade} - {formatBRL(p.total)}</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${atrasado?"bg-red-600 text-white":"bg-blue-600 text-white"}`}>⏰ {rest}</span>
                </div>
                <div className="mt-2 bg-gray-50 p-3 rounded-xl">
                  <div className="font-bold">👤 {cliente?.nome} - 📱 {cliente?.telefone}</div>
                  <div className="text-sm">📍 {p.endereco} - {p.bairro}</div>
                  <div className="text-xs">📅 {p.data} {p.horario} | Aceito {p.aceiteAt? new Date(p.aceiteAt).toLocaleString("pt-BR") : new Date(p.aceite_at).toLocaleString("pt-BR")}</div>
                </div>
                <div className="flex gap-2 mt-3">
                  <a href={`https://wa.me/55${(cliente?.telefone||"").replace(/\D/g,"")}?text=Olá ${cliente?.nome}, sou ${currentUser.nome} do Contato Certo SP, estou a caminho do pedido #${p.id}`} target="_blank" className="flex-1 bg-green-600 text-white text-center py-3 rounded-xl font-bold">💬 WhatsApp Cliente</a>
                  <a href={`tel:${cliente?.telefone}`} className="flex-1 bg-[#0A2A6B] text-white text-center py-3 rounded-xl font-bold">📞 Ligar</a>
                </div>
                <button type="button" onClick={()=>finalizarPedido(p.id)} className="w-full bg-[#FF7A00] text-white py-4 rounded-xl mt-3 font-bold text-lg">✅ FINALIZAR SERVIÇO - Cliente vai avaliar ⭐</button>
              </div>
            )
          })}
          {meusAceitos.length===0 && <div className="bg-white p-10 rounded-3xl text-center text-gray-400">Nenhum serviço aceito. Aceite pedidos na aba Disponíveis.</div>}
        </div>
      )}

      {tab==="finalizados" && (
        <div className="mt-4 space-y-3">
          {meusFinalizados.map(p=>{
            const cliente = users.find(u=>u.id==p.cliente_id);
            return (
              <div key={p.id} className="bg-white p-4 rounded-3xl shadow">
                <div className="flex justify-between"><b>#{p.id} FINALIZADO ✅</b><span>{formatBRL(p.total)} | Seu: {formatBRL(p.total*0.9)}</span></div>
                <div className="text-xs">{p.cidade} - {cliente?.nome} - {p.finalizadoAt? new Date(p.finalizadoAt).toLocaleString("pt-BR"): new Date(p.finalizado_at).toLocaleString("pt-BR")}</div>
                {p.avaliacao ? <div className="mt-2 bg-yellow-50 p-2 rounded-xl text-xs">⭐ Cliente avaliou: {p.avaliacao.nota} estrelas<br/>"{p.avaliacao.comentario}" - {p.avaliacao.cliente}</div> : <div className="text-xs text-gray-400 mt-2">Aguardando avaliação do cliente</div>}
              </div>
            )
          })}
          {meusFinalizados.length===0 && <div className="bg-white p-10 rounded-3xl text-center text-gray-400">Nenhum serviço finalizado ainda</div>}
        </div>
      )}

      {tab==="financeiro" && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0A2A6B] text-white p-4 rounded-2xl"><div className="text-xs">Total Bruto</div><div className="text-xl font-bold">{formatBRL(totalBruto)}</div></div>
            <div className="bg-green-600 text-white p-4 rounded-2xl"><div className="text-xs">Seu Ganho 90%</div><div className="text-xl font-bold">{formatBRL(totalGanho)}</div></div>
            <div className="bg-[#FF7A00] text-white p-4 rounded-2xl"><div className="text-xs">Serviços Finalizados</div><div className="text-xl font-bold">{meusFinalizados.length}</div></div>
            <div className="bg-gray-800 text-white p-4 rounded-2xl"><div className="text-xs">Avaliação Média</div><div className="text-xl font-bold">⭐ {Number(currentUser.avaliacao||5).toFixed(1)}</div></div>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow">
            <div className="font-bold">Como funciona o pagamento:</div>
            <div className="text-xs mt-2">Cliente paga 100% para ADM (contatocerto.prestadores@gmail.com). ADM confirma. Você aceita e finaliza. Você recebe 90% via PIX {currentUser.pix} em até 24h. 10% fica com a plataforma.</div>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow">
            <div className="font-bold">Histórico de ganhos</div>
            {meusFinalizados.map(p=><div key={p.id} className="flex justify-between text-xs py-2 border-b">#{p.id} - {p.cidade} - {formatBRL(p.total*0.9)} - {p.data}</div>)}
          </div>
        </div>
      )}

      {tab==="perfil" && (
        <div className="mt-4 space-y-4">
          <div className="bg-white p-4 rounded-3xl shadow">
            <div className="font-bold">👤 {currentUser.nome}</div>
            <div className="text-xs">📱 {currentUser.telefone} | ✉️ {currentUser.email}</div>
            <div className="text-xs">CPF: {currentUser.cpf} (validado) | PIX: {currentUser.pix}</div>
            <div className="text-xs">⭐ {Number(currentUser.avaliacao||5).toFixed(1)} | {currentUser.total_servicos||0} serviços</div>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow">
            <div className="font-bold">📍 Cidades que atende (máx 3)</div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(currentUser.cidades||[]).map(c=><span key={c} className="bg-[#0A2A6B] text-white text-xs px-3 py-1 rounded-full flex items-center gap-2">{c} <button type="button" onClick={()=>removerCidade(c)} className="bg-white/20 rounded-full w-4 h-4">x</button></span>)}
            </div>
            <div className="flex gap-2 mt-3">
              <input value={novaCidade} onChange={e=>setNovaCidade(e.target.value)} placeholder="Nova cidade" className="flex-1 border rounded-xl p-3 text-sm"/>
              <button type="button" onClick={adicionarCidade} className="bg-[#FF7A00] text-white px-6 py-3 rounded-xl font-bold">Adicionar</button>
            </div>
            <div className="text-xs text-gray-500 mt-2">Você só recebe pedidos dessas cidades. Se deixar vazio, recebe de todo SP.</div>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow">
            <div className="font-bold">⭐ Avaliações recebidas</div>
            {orders.filter(o=> (o.montador_id==currentUser.id) && o.avaliacao).map(o=><div key={o.id} className="text-xs mt-2 p-2 bg-yellow-50 rounded-xl">#{o.id} ⭐{o.avaliacao.nota} - "{o.avaliacao.comentario}" - Cliente: {o.avaliacao.cliente}</div>)}
            {orders.filter(o=> o.montador_id==currentUser.id && o.avaliacao).length===0 && <div className="text-xs text-gray-400 mt-2">Nenhuma avaliação ainda. Finalize serviços para receber.</div>}
          </div>
        </div>
      )}
    </div>
  );
}


function RegisterForm({mode,onSubmit}){
  const [f,setF]=useState({nome:"",cidade:"",telefone:"",email:"",usuario:"",senha:"",cpf:"",pix:"",cidades:[],role:mode==="cliente"?"cliente":"montador"});
  const [ci,setCi]=useState("");
  return <div className="space-y-2">
    <input placeholder="Nome completo" value={f.nome} onChange={e=>setF({...f,nome:e.target.value})} className="w-full border rounded-xl p-3"/>
    <input placeholder="Cidade" value={f.cidade} onChange={e=>setF({...f,cidade:e.target.value})} className="w-full border rounded-xl p-3"/>
    <input placeholder="WhatsApp (18)" value={f.telefone} onChange={e=>setF({...f,telefone:e.target.value})} className="w-full border rounded-xl p-3"/>
    <input placeholder="E-mail" value={f.email} onChange={e=>setF({...f,email:e.target.value})} className="w-full border rounded-xl p-3"/>
    {mode==="montador" && <>
      <input placeholder="CPF" value={f.cpf} onChange={e=>setF({...f,cpf:e.target.value})} className="w-full border rounded-xl p-3"/>
      <input placeholder="Chave PIX para receber" value={f.pix} onChange={e=>setF({...f,pix:e.target.value})} className="w-full border rounded-xl p-3"/>
      <div className="flex gap-2"><input placeholder="Cidade que atende (até 3)" value={ci} onChange={e=>setCi(e.target.value)} className="flex-1 border rounded-xl p-3"/><button type="button" onClick={()=>{ if(f.cidades.length<3 && ci){ setF({...f,cidades:[...f.cidades,ci]}); setCi(""); } }} className="bg-gray-100 px-4 rounded-xl">+</button></div>
      <div className="flex gap-1 flex-wrap">{f.cidades.map(c=><span key={c} className="bg-[#0A2A6B] text-white text-xs px-2 py-1 rounded-full">{c}</span>)}</div>
    </>}
    <input placeholder="Usuário" value={f.usuario} onChange={e=>setF({...f,usuario:e.target.value})} className="w-full border rounded-xl p-3"/>
    <input type="password" placeholder="Senha" value={f.senha} onChange={e=>setF({...f,senha:e.target.value})} className="w-full border rounded-xl p-3"/>
    <button type="button" onClick={()=>onSubmit(f)} className="bg-[#FF7A00] text-white w-full py-4 rounded-2xl font-bold">Finalizar Cadastro</button>
  </div>;
}
function LoginForm({onSubmit}){
  const [u,setU]=useState(""); const [s,setS]=useState("");
  return <div className="space-y-3">
    <input placeholder="Seu usuário" value={u} onChange={e=>setU(e.target.value)} className="w-full border rounded-xl p-3"/>
    <input type="password" placeholder="Sua senha" value={s} onChange={e=>setS(e.target.value)} className="w-full border rounded-xl p-3"/>
    <button type="button" onClick={()=>onSubmit(u,s)} className="bg-[#0A2A6B] text-white w-full py-4 rounded-2xl font-bold">Entrar</button>
  </div>;
}

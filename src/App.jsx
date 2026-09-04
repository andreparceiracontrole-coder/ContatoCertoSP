
import React, { useState, useEffect, useMemo } from "react";
import { CATALOGO, CATEGORIAS } from "./data/catalog.js";
import { normalize, validarCPF, formatBRL, calcularDesconto, playBeep } from "./utils/helpers.js";
import { supabase } from "./lib/supabase.js";

const PIX_KEY = "contatocerto.prestadores@gmail.com";
const WHATSAPP = "5518991488302";

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
  const [showOrderFlow, setShowOrderFlow] = useState(false);
  const [orderStep, setOrderStep] = useState(1);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState("pedidos");

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
        setOrders(o.map(x=>({ id: x.id, clienteId: x.cliente_id, cliente_id: x.cliente_id, itens: x.itens, subtotal: x.subtotal, desconto: x.desconto, total: x.total, endereco: x.endereco, bairro: x.bairro, cidade: x.cidade, data: x.data, horario: x.horario, foto: x.foto, status: x.status, comprovante: x.comprovante, montadorId: x.montador_id, montador_id: x.montador_id, createdAt: x.created_at, aceiteAt: x.aceite_at, finalizadoAt: x.finalizado_at, avaliacao: x.avaliacao })));
        setIsLive(true);
      }
    } catch (e) {
      setIsLive(false);
      setUsers(JSON.parse(localStorage.getItem("ccs_users")||"[]"));
      setOrders(JSON.parse(localStorage.getItem("ccs_orders")||"[]"));
    }
    setLoading(false);
  };

  useEffect(()=>{ fetchData(); },[]);

  useEffect(()=>{
    let channel;
    try{
      channel = supabase.channel("contato-certo-v3")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ()=>{ fetchData(); playBeep(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "users" }, ()=>fetchData())
        .subscribe((s)=>{ if(s==="SUBSCRIBED") setIsLive(true); });
    }catch{}
    const interval = setInterval(()=>fetchData(), 3000);
    return ()=>{ if(channel) supabase.removeChannel(channel); clearInterval(interval); };
  },[]);

  useEffect(()=>{ localStorage.setItem("ccs_current", JSON.stringify(currentUser)); },[currentUser]);

  const notify = (msg)=>{ setToast(msg); playBeep(); setTimeout(()=>setToast(""),4000); };

  const filteredCatalog = useMemo(()=>{
    return CATALOGO.filter(item=>{
      const matchCat = catFilter==="TODAS" || item.categoria===catFilter;
      const nSearch = normalize(search);
      if(!nSearch) return matchCat;
      return matchCat && normalize(item.nome).includes(nSearch);
    });
  },[search,catFilter]);

  const handleRegister = async (formData)=>{
    if(users.some(u=>u.usuario===formData.usuario)) return notify("Usuário já existe");
    if(formData.role==="montador" && !validarCPF(formData.cpf)) return notify("CPF inválido");
    const newUser = { id: Date.now(), nome: formData.nome, cidade: formData.cidade, telefone: formData.telefone, email: formData.email, usuario: formData.usuario, senha: formData.senha, role: formData.role, cpf: formData.cpf||null, pix: formData.pix||null, cidades: formData.cidades||[], foto: "", avaliacao:5, total_servicos:0, disponivel:false };
    try {
      await supabase.from("users").insert(newUser);
      setCurrentUser({...newUser});
      notify("Cadastro realizado com sucesso!");
    } catch {
      const all = [...users, newUser];
      localStorage.setItem("ccs_users", JSON.stringify(all));
      setUsers(all);
      setCurrentUser(newUser);
    }
    setShowAuth(false);
    setView(newUser.role==="cliente"?"cliente":"montador");
  };

  const handleLogin = async (usuario, senha)=>{
    if(usuario==="AndreSousa84" && senha==="20112024"){
      const adm = { id:0, role:"admin", nome:"ADM Andre Sousa", usuario:"AndreSousa84" };
      setCurrentUser(adm);
      setShowAuth(false);
      setView("admin");
      return;
    }
    const u = users.find(x=>x.usuario===usuario && x.senha===senha);
    if(!u) return notify("Usuário ou senha inválidos");
    setCurrentUser(u);
    setShowAuth(false);
    setView(u.role==="cliente"?"cliente":"montador");
  };

  const addToCart = (item)=>{
    const exist = cart.find(c=>c.id===item.id);
    if(exist) setCart(cart.map(c=>c.id===item.id?{...c,qtd:c.qtd+1}:c));
    else setCart([...cart,{...item,qtd:1}]);
    notify(`${item.nome} adicionado`);
  };

  const subtotal = cart.reduce((s,i)=>s+i.preco*i.qtd,0);
  const desconto = calcularDesconto(cart.reduce((s,i)=>s+i.qtd,0), subtotal);
  const total = subtotal - desconto;

  const criarPedido = async ()=>{
    if(!orderForm.endereco || !orderForm.cidade) return notify("Preencha endereço e cidade");
    const pedidoDB = { id: Date.now(), cliente_id: currentUser.id, itens: cart, subtotal, desconto, total, endereco: orderForm.endereco, bairro: orderForm.bairro, cidade: orderForm.cidade, data: orderForm.data, horario: orderForm.horario, foto: "", status:"aguardando_comprovante", comprovante:"", montador_id: null, created_at: new Date().toISOString() };
    try { await supabase.from("orders").insert(pedidoDB); notify("Pedido criado! Envie o comprovante"); } 
    catch {
      const local = { id: pedidoDB.id, clienteId: pedidoDB.cliente_id, cliente_id: pedidoDB.cliente_id, itens: cart, subtotal, desconto, total, ...orderForm, status:"aguardando_comprovante", comprovante:"", montadorId:null, montador_id:null, createdAt: pedidoDB.created_at };
      const all = [...orders, local];
      localStorage.setItem("ccs_orders", JSON.stringify(all));
      setOrders(all);
    }
    setCart([]); setOrderStep(3);
  };

  const enviarComprovante = async (pedidoId, base64)=>{
    if(!base64) return notify("Selecione o comprovante");
    try { await supabase.from("orders").update({ comprovante: base64, status:"aguardando_confirmacao_adm" }).eq("id", pedidoId); }
    catch {}
    setOrders(orders.map(o=>o.id===pedidoId?{...o, comprovante: base64, status:"aguardando_confirmacao_adm"}:o));
    notify("Comprovante enviado! Aguarde confirmação");
  };

  const confirmarPagamentoADM = async (id)=>{
    try { await supabase.from("orders").update({ status:"aguardando_montador" }).eq("id", id); } catch {}
    setOrders(orders.map(o=>o.id===id?{...o,status:"aguardando_montador"}:o));
    notify("Pagamento confirmado! Liberado para montadores");
  };

  const aceitarPedido = async (id)=>{
    try { await supabase.from("orders").update({ status:"aceito", montador_id: currentUser.id, aceite_at: new Date().toISOString() }).eq("id", id); } catch {}
    setOrders(orders.map(o=>o.id===id?{...o,status:"aceito", montadorId: currentUser.id, montador_id: currentUser.id}:o));
    notify("Pedido aceito! 30 minutos para chegar");
  };

  const finalizarPedido = async (id)=>{
    try { await supabase.from("orders").update({ status:"finalizado", finalizado_at: new Date().toISOString() }).eq("id", id); } catch {}
    setOrders(orders.map(o=>o.id===id?{...o,status:"finalizado"}:o));
    notify("Serviço finalizado!");
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
          {currentUser ? <button onClick={()=>{ setCurrentUser(null); setView("home"); }} className="text-sm bg-gray-100 px-4 py-2 rounded-full">Sair</button> : <button onClick={()=>{ setShowAuth(true); setIsLogin(true); }} className="bg-[#0A2A6B] text-white px-4 py-2 rounded-xl">Entrar</button>}
          <button onClick={()=>setMenuOpen(!menuOpen)} className="w-10 h-10 bg-[#0A2A6B] text-white rounded-xl">☰</button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={()=>setMenuOpen(false)}>
          <div className="absolute right-0 top-0 w-80 h-full bg-white p-6 shadow-2xl rounded-l-3xl" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setMenuOpen(false)} className="mb-6 text-2xl">✕</button>
            <nav className="flex flex-col gap-3">
              <button onClick={()=>{ setMenuOpen(false); if(currentUser){ setView(currentUser.role==="cliente"?"cliente":currentUser.role==="montador"?"montador":"admin"); } else { setShowAuth(true); setIsLogin(true); } }} className="text-left p-3 rounded-xl bg-[#0A2A6B] text-white font-bold">👤 Meu Perfil</button>
              {["Como Funciona","Quem Somos","Suporte 24h","Montadores em Destaque"].map(item=><button key={item} onClick={()=>{ setMenuOpen(false); document.getElementById(item.toLowerCase().replace(/\s/g,"-"))?.scrollIntoView({behavior:"smooth"}); }} className="text-left p-3 rounded-xl hover:bg-gray-50">{item}</button>)}
              <hr className="my-2"/>
              {!currentUser && <>
                <button onClick={()=>{ setAuthMode("cliente"); setIsLogin(false); setShowAuth(true); setMenuOpen(false); }} className="bg-[#0A2A6B] text-white rounded-2xl py-4 font-bold">Cadastrar Cliente</button>
                <button onClick={()=>{ setAuthMode("montador"); setIsLogin(false); setShowAuth(true); setMenuOpen(false); }} className="bg-[#FF7A00] text-white rounded-2xl py-4 font-bold">Cadastrar Montador</button>
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
                <button onClick={()=>{ setAuthMode("cliente"); setIsLogin(false); setShowAuth(true); }} className="bg-white text-[#0A2A6B] rounded-2xl py-5 font-bold flex-1">SOU CLIENTE</button>
                <button onClick={()=>{ setAuthMode("montador"); setIsLogin(false); setShowAuth(true); }} className="bg-[#FF7A00] text-white rounded-2xl py-5 font-bold flex-1">SOU MONTADOR</button>
              </div>
            </div>
          </section>
          <section id="como-funciona" className="px-4 py-12 max-w-6xl mx-auto">
            <h2 className="font-bold text-3xl text-[#0A2A6B]">Como Funciona</h2>
            <div className="mt-6 grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl p-5 shadow"><b>Cliente:</b> Cadastro → Busca fácil → Endereço → PIX → Comprovante → ADM confirma → Libera para montadores → 30min → Avaliação</div>
              <div className="bg-white rounded-3xl p-5 shadow border-l-4 border-l-[#FF7A00]"><b>Montador:</b> Cadastro com CPF → Escolha 3 cidades → Fique disponível → Receba pedidos na hora → Aceite em 30min → Finalize</div>
            </div>
          </section>
          <section id="montadores-em-destaque" className="px-4 py-12 max-w-6xl mx-auto">
            <h2 className="font-bold text-2xl">Montadores em Destaque</h2>
            <div className="mt-6 grid sm:grid-cols-3 gap-4">
              {users.filter(u=>u.role==="montador").map(m=><div key={m.id} className="bg-white rounded-3xl p-4 shadow"><div className="font-bold">{m.nome}</div><div className="text-xs">{(m.cidades||[]).join(", ")}</div><div className="text-xs text-green-600">{m.disponivel?"● Disponível":"○ Offline"}</div></div>)}
              {users.filter(u=>u.role==="montador").length===0 && <div className="col-span-3 text-center py-10 text-gray-400">Nenhum montador ainda. Seja o primeiro!</div>}
            </div>
          </section>
        </>
      )}

      {view==="cliente" && currentUser?.role==="cliente" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h2 className="font-bold text-2xl">Olá, {currentUser.nome} {isLive?"🟢":"🔴"}</h2>
          <button onClick={()=>{ setShowOrderFlow(true); setOrderStep(1); }} className="bg-[#FF7A00] text-white w-full text-xl py-6 rounded-2xl font-bold mt-4">+ NOVO PEDIDO - 330 serviços</button>
          <h3 className="font-bold mt-6">Meus Pedidos ({orders.filter(o=>o.cliente_id==currentUser.id || o.clienteId==currentUser.id).length})</h3>
          <div className="mt-3 space-y-3">
            {orders.filter(o=>o.cliente_id==currentUser.id || o.clienteId==currentUser.id).map(p=>(
              <div key={p.id} className="bg-white rounded-3xl p-4 shadow">
                <div className="flex justify-between"><span className="font-bold">#{p.id}</span><span className={`text-xs px-2 py-1 rounded-full ${p.status==="finalizado"?"bg-green-100 text-green-700":p.status==="aceito"?"bg-blue-100 text-blue-700":"bg-yellow-100 text-yellow-700"}`}>{p.status}</span></div>
                <div className="text-sm mt-1">{(p.itens||[]).map(i=>`${i.nome} x${i.qtd}`).join(", ")}</div>
                <div className="font-bold text-[#FF7A00]">{formatBRL(p.total)} - {p.cidade}</div>
                <div className="text-xs text-gray-500">{p.endereco} - {p.bairro}</div>
                {p.status==="aguardando_comprovante" && (
                  <div className="mt-3 p-3 bg-yellow-50 rounded-xl">
                    <div className="text-sm font-bold">Envie o comprovante PIX para liberar</div>
                    <div className="text-xs">PIX: {PIX_KEY}</div>
                    <input type="file" accept="image/*" onChange={e=>{ const r=new FileReader(); r.onload=()=>setComprovante(r.result); r.readAsDataURL(e.target.files[0]); }} className="text-xs mt-2 w-full"/>
                    <button onClick={()=>enviarComprovante(p.id, comprovante)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl text-sm mt-2">ENVIAR COMPROVANTE</button>
                  </div>
                )}
                {p.status==="aguardando_confirmacao_adm" && <div className="mt-2 text-sm bg-blue-50 p-2 rounded-xl">✅ Comprovante enviado! Aguarde confirmação do administrador.</div>}
                {p.status==="aguardando_montador" && <div className="mt-2 text-sm bg-green-50 p-2 rounded-xl">✅ Pagamento confirmado! Aguardando montador aceitar (30min)</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {view==="montador" && currentUser?.role==="montador" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h2 className="font-bold text-2xl">Painel Montador - {currentUser.nome} {isLive?"🟢":"🔴"}</h2>
          <div className="mt-4 bg-white p-4 rounded-3xl">
            <div className="font-bold">Cidades: {(currentUser.cidades||[]).join(", ")}</div>
            <div className="text-xs text-gray-500">Você recebe pedidos dessas cidades</div>
          </div>
          <h3 className="font-bold mt-6">🔔 Pedidos Liberados ({orders.filter(o=>o.status==="aguardando_montador").length}) - Atualiza a cada 3s</h3>
          <div className="mt-3 space-y-3">
            {(() => { const lista = orders.filter(o=>o.status==="aguardando_montador"); return lista; })().map(p=>(
              <div key={p.id} className="bg-white rounded-3xl p-4 shadow border-l-4 border-l-[#FF7A00]">
                <div className="flex justify-between"><span className="font-bold">#{p.id} - {p.cidade}</span><span className="font-bold text-[#FF7A00]">{formatBRL(p.total)}</span></div>
                <div className="text-sm">{p.endereco} - {p.bairro}</div>
                <div className="text-xs">{(p.itens||[]).map(i=>i.nome).join(", ")}</div>
                <div className="text-xs text-gray-500">Cliente ID {p.cliente_id}</div>
                <button onClick={()=>aceitarPedido(p.id)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl mt-3 font-bold">ACEITAR - TENHO 30MIN</button>
              </div>
            ))}
            {orders.filter(o=>o.status==="aguardando_montador").length===0 && <div className="text-center py-10 text-gray-400 bg-white rounded-3xl">Nenhum pedido liberado no momento. Deixe a página aberta, toca beep quando chegar!</div>}
          </div>
          <h3 className="font-bold mt-6">Meus Serviços Aceitos</h3>
          <div className="mt-3 space-y-3">
            {orders.filter(o=>o.montador_id==currentUser.id || o.montadorId==currentUser.id).map(p=>(
              <div key={p.id} className="bg-white p-4 rounded-3xl shadow">
                <div className="flex justify-between"><span>#{p.id} {p.cidade}</span><span className="text-xs bg-blue-100 px-2 py-1 rounded-full">{p.status}</span></div>
                <div className="text-sm">{p.endereco}</div>
                {p.status!=="finalizado" && <button onClick={()=>finalizarPedido(p.id)} className="bg-[#FF7A00] text-white w-full py-3 rounded-xl mt-2">FINALIZAR SERVIÇO</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {view==="admin" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h2 className="font-bold text-2xl">Administração - {orders.length} pedidos {isLive?"🟢 Ao Vivo":"🔴 Offline"}</h2>
          <div className="flex gap-2 mt-4 overflow-auto">
            <button onClick={()=>setAdminTab("pedidos")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="pedidos"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Pedidos ({orders.length})</button>
            <button onClick={()=>setAdminTab("comprovantes")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="comprovantes"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Comprovantes ({orders.filter(o=>o.status==="aguardando_confirmacao_adm").length}) 🔥</button>
            <button onClick={()=>setAdminTab("liberados")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="liberados"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Liberados ({orders.filter(o=>o.status==="aguardando_montador").length})</button>
            <button onClick={()=>setAdminTab("aceitos")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="aceitos"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Aceitos ({orders.filter(o=>o.status==="aceito").length})</button>
            <button onClick={()=>setAdminTab("finalizados")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="finalizados"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Finalizados ({orders.filter(o=>o.status==="finalizado").length})</button>
            <button onClick={()=>setAdminTab("financeiro")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="financeiro"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Financeiro</button>
            <button onClick={()=>setAdminTab("usuarios")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="usuarios"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Usuários ({users.length})</button>
          </div>

          {adminTab==="pedidos" && (
            <div className="mt-4 space-y-3">
              {orders.length===0 && <div className="bg-white p-10 rounded-3xl text-center text-gray-400">Nenhum pedido ainda. Quando cliente criar, aparece aqui ao vivo.</div>}
              {orders.map(p=>{
                const montador = users.find(u=>u.id==p.montador_id || u.id==p.montadorId);
                const cliente = users.find(u=>u.id==p.cliente_id || u.id==p.clienteId);
                return (
                <div key={p.id} className="bg-white p-4 rounded-3xl shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-bold">Pedido #{p.id} - {formatBRL(p.total)}</div>
                      <div className="text-xs">Cliente: {cliente?.nome || `ID ${p.cliente_id}`} - {cliente?.telefone || ""} - {p.cidade}</div>
                      <div className="text-xs">{p.endereco} {p.bairro} - {p.data} {p.horario}</div>
                      <div className="text-xs mt-1">{(p.itens||[]).map(i=>i.nome).join(", ")}</div>
                      <div className={`inline-block text-xs px-2 py-1 rounded-full mt-2 ${p.status==="aguardando_comprovante"?"bg-gray-200":p.status==="aguardando_confirmacao_adm"?"bg-yellow-200":p.status==="aguardando_montador"?"bg-green-200":p.status==="aceito"?"bg-blue-200":p.status==="finalizado"?"bg-green-600 text-white":"bg-gray-100"}`}>{p.status}</div>
                      {montador && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-2xl">
                          <div className="text-xs font-bold text-[#0A2A6B]">🔧 MONTADOR QUE ACEITOU:</div>
                          <div className="font-bold">{montador.nome}</div>
                          <div className="text-xs">📱 {montador.telefone} | ✉️ {montador.email}</div>
                          <div className="text-xs">📍 Atende: {(montador.cidades||[]).join(", ")} | CPF: {montador.cpf}</div>
                          <div className="text-xs">💰 PIX: {montador.pix}</div>
                          <div className="text-xs mt-1 text-green-700">Aceito em: {p.aceiteAt ? new Date(p.aceiteAt).toLocaleString("pt-BR") : p.aceite_at ? new Date(p.aceite_at).toLocaleString("pt-BR") : "-"}</div>
                          <a href={`https://wa.me/55${(montador.telefone||"").replace(/\D/g,"")}?text=Olá ${montador.nome}, sobre o pedido #${p.id}`} target="_blank" className="inline-block mt-2 bg-green-600 text-white text-xs px-3 py-2 rounded-full">WhatsApp Montador</a>
                        </div>
                      )}
                      {!montador && (p.status==="aceito" || p.status==="finalizado") && <div className="mt-2 text-xs text-orange-600">Montador ID {p.montador_id || p.montadorId} - carregando...</div>}
                    </div>
                    <div className="text-right text-xs text-gray-500">{p.data}<br/>{p.horario}</div>
                  </div>
                  {p.comprovante && <img src={p.comprovante} className="w-full max-w-xs h-40 object-cover rounded-xl mt-3 border" alt="comprovante"/>}
                  {p.status==="aguardando_confirmacao_adm" && <button onClick={()=>confirmarPagamentoADM(p.id)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl mt-3 font-bold">✅ CONFIRMAR PAGAMENTO - LIBERAR PARA MONTADORES (REGRA CRÍTICA)</button>}
                  {p.status==="aguardando_comprovante" && <div className="mt-2 text-xs bg-yellow-50 p-2 rounded-xl">Aguardando cliente enviar comprovante PIX {PIX_KEY}</div>}
                </div>
              )})}
              
            </div>
          )}

          {adminTab==="comprovantes" && (
            <div className="mt-4 space-y-3">
              {orders.filter(o=>o.status==="aguardando_confirmacao_adm").length===0 && <div className="bg-white p-10 rounded-3xl text-center">Nenhum comprovante para conferir. Quando cliente enviar, aparece aqui.</div>}
              {orders.filter(o=>o.status==="aguardando_confirmacao_adm").map(p=>(
                <div key={p.id} className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-3xl shadow">
                  <div className="font-bold text-lg">🔥 NOVO COMPROVANTE - Pedido #{p.id} - {formatBRL(p.total)}</div>
                  <div className="text-sm">{p.cidade} - {p.endereco}</div>
                  <img src={p.comprovante} className="w-full max-w-md h-64 object-contain bg-white rounded-xl mt-3 border" alt="comprovante"/>
                  <button onClick={()=>confirmarPagamentoADM(p.id)} className="bg-green-600 text-white w-full py-4 rounded-xl mt-4 font-bold text-lg">CONFIRMAR E LIBERAR AGORA</button>
                </div>
              ))}
            </div>
          )}

          {adminTab==="liberados" && (
            <div className="mt-4">
              {orders.filter(o=>o.status==="aguardando_montador").map(p=>{ const cli = users.find(u=>u.id==p.cliente_id); return (<div key={p.id} className="bg-white p-4 rounded-3xl shadow mt-3"><b>#{p.id}</b> {p.cidade} {formatBRL(p.total)} - {cli?.nome||""} - Aguardando montador aceitar</div> ) })}
            </div>
          )}

          {adminTab==="aceitos" && (
            <div className="mt-4 space-y-3">
              {orders.filter(o=>o.status==="aceito").map(p=>{
                const montador = users.find(u=>u.id==p.montador_id || u.id==p.montadorId);
                const cliente = users.find(u=>u.id==p.cliente_id);
                return (
                  <div key={p.id} className="bg-blue-50 border border-blue-300 p-4 rounded-3xl">
                    <div className="font-bold">Pedido #{p.id} - ACEITO por {montador?.nome || `ID ${p.montador_id}`}</div>
                    <div className="text-xs">Cliente: {cliente?.nome} - {p.cidade} - {formatBRL(p.total)}</div>
                    {montador && <div className="mt-2 text-xs">🔧 {montador.nome} - {montador.telefone} - {montador.cidades?.join(", ")} - PIX {montador.pix}</div>}
                    <div className="text-xs">Aceito: {p.aceiteAt ? new Date(p.aceiteAt).toLocaleString("pt-BR") : p.aceite_at ? new Date(p.aceite_at).toLocaleString("pt-BR") : ""}</div>
                  </div>
                )
              })}
              {orders.filter(o=>o.status==="aceito").length===0 && <div className="bg-white p-10 rounded-3xl text-center text-gray-400">Nenhum pedido aceito ainda</div>}
            </div>
          )}

          {adminTab==="finalizados" && (
            <div className="mt-4 space-y-3">
              {orders.filter(o=>o.status==="finalizado").map(p=>{
                const montador = users.find(u=>u.id==p.montador_id || u.id==p.montadorId);
                return (
                  <div key={p.id} className="bg-green-50 border border-green-300 p-4 rounded-3xl">
                    <div className="font-bold">Pedido #{p.id} - FINALIZADO ✅</div>
                    <div className="text-xs">{p.cidade} - {formatBRL(p.total)} - Montador: {montador?.nome || p.montador_id}</div>
                    <div className="text-xs">Finalizado: {p.finalizadoAt ? new Date(p.finalizadoAt).toLocaleString("pt-BR") : p.finalizado_at ? new Date(p.finalizado_at).toLocaleString("pt-BR") : ""}</div>
                  </div>
                )
              })}
            </div>
          )}

          {adminTab==="financeiro" && (
            <div className="mt-4 bg-white p-6 rounded-3xl shadow">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0A2A6B] text-white p-4 rounded-2xl"><div className="text-xs">Total Bruto</div><div className="text-xl font-bold">{formatBRL(orders.filter(o=>o.status==="finalizado").reduce((s,p)=>s+p.total,0))}</div></div>
                <div className="bg-[#FF7A00] text-white p-4 rounded-2xl"><div className="text-xs">Sua Comissão 10%</div><div className="text-xl font-bold">{formatBRL(orders.filter(o=>o.status==="finalizado").reduce((s,p)=>s+p.total,0)*0.1)}</div></div>
                <div className="bg-green-600 text-white p-4 rounded-2xl"><div className="text-xs">Pedidos Finalizados</div><div className="text-xl font-bold">{orders.filter(o=>o.status==="finalizado").length}</div></div>
                <div className="bg-gray-800 text-white p-4 rounded-2xl"><div className="text-xs">Aguardando Pagamento</div><div className="text-xl font-bold">{orders.filter(o=>o.status==="aguardando_confirmacao_adm").length}</div></div>
              </div>
            </div>
          )}

          {adminTab==="usuarios" && (
            <div className="mt-4 grid gap-3">
              {users.map(u=>(
                <div key={u.id} className="bg-white p-4 rounded-3xl shadow flex justify-between"><div><div className="font-bold">{u.nome} ({u.role})</div><div className="text-xs">{u.cidade} - {u.telefone} - {(u.cidades||[]).join(", ")}</div></div><div className="text-xs">{u.usuario}</div></div>
              ))}
            </div>
          )}
        </div>
      )}

      {showOrderFlow && (
        <div className="fixed inset-0 z-50 bg-white overflow-auto">
          <div className="sticky top-0 bg-white border-b p-4 flex justify-between"><h2 className="font-bold">{orderStep===1?"Buscar 330 serviços":orderStep===2?"Seus dados":"PIX para pagar"}</h2><button onClick={()=>setShowOrderFlow(false)}>✕</button></div>
          <div className="p-4 max-w-4xl mx-auto">
            {orderStep===1 && (
              <>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="guarda roupa, cama, rack..." className="w-full p-4 rounded-2xl border text-lg"/>
                <div className="mt-2 flex gap-2 overflow-auto">
                  <button onClick={()=>setCatFilter("TODAS")} className={`px-3 py-1 rounded-full text-xs ${catFilter==="TODAS"?"bg-[#0A2A6B] text-white":"bg-gray-100"}`}>TODAS ({CATALOGO.length})</button>
                  {CATEGORIAS.map(c=><button key={c} onClick={()=>setCatFilter(c)} className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${catFilter===c?"bg-[#0A2A6B] text-white":"bg-gray-100"}`}>{c}</button>)}
                </div>
                <div className="grid sm:grid-cols-2 gap-3 mt-4">
                  {filteredCatalog.slice(0,80).map(item=>(
                    <div key={item.id} className="bg-white border rounded-2xl p-3 flex justify-between items-center">
                      <div><div className="text-xs bg-[#0A2A6B] text-white px-2 py-1 rounded-full inline-block">{item.categoria}</div><div className="text-sm font-medium">{item.nome}</div><div className="font-bold text-[#FF7A00]">{formatBRL(item.preco)}</div></div>
                      <button onClick={()=>addToCart(item)} className="bg-[#FF7A00] text-white px-3 py-2 rounded-xl text-sm">ADD</button>
                    </div>
                  ))}
                </div>
                {cart.length>0 && <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4"><div className="max-w-4xl mx-auto"><div className="text-sm">Total {formatBRL(total)} - {cart.length} itens | Desconto {formatBRL(desconto)}</div><button onClick={()=>setOrderStep(2)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl mt-2">Continuar</button></div></div>}
              </>
            )}
            {orderStep===2 && (
              <div className="space-y-3">
                <input value={orderForm.endereco} onChange={e=>setOrderForm({...orderForm,endereco:e.target.value})} placeholder="Endereço completo" className="w-full p-4 border rounded-2xl"/>
                <input value={orderForm.bairro} onChange={e=>setOrderForm({...orderForm,bairro:e.target.value})} placeholder="Bairro" className="w-full p-4 border rounded-2xl"/>
                <input value={orderForm.cidade} onChange={e=>setOrderForm({...orderForm,cidade:e.target.value})} placeholder="Cidade em SP" className="w-full p-4 border rounded-2xl"/>
                <input type="date" value={orderForm.data} onChange={e=>setOrderForm({...orderForm,data:e.target.value})} className="w-full p-4 border rounded-2xl"/>
                <input type="time" value={orderForm.horario} onChange={e=>setOrderForm({...orderForm,horario:e.target.value})} className="w-full p-4 border rounded-2xl"/>
                <button onClick={criarPedido} className="bg-[#FF7A00] text-white w-full py-5 rounded-2xl font-bold">Confirmar Pedido</button>
              </div>
            )}
            {orderStep===3 && (
              <div className="text-center space-y-4">
                <div className="bg-[#0A2A6B] text-white p-4 rounded-2xl"><div className="text-sm">PIX - Copie a chave</div><div className="font-mono font-bold">{PIX_KEY}</div><div className="text-lg font-bold mt-2">Total {formatBRL(total)}</div></div>
                <button onClick={()=>{ navigator.clipboard.writeText(PIX_KEY); notify("Chave copiada!"); }} className="bg-[#0A2A6B] text-white w-full py-4 rounded-2xl">COPIAR CHAVE PIX</button>
                <a href={`https://wa.me/${WHATSAPP}?text=Pedido ${formatBRL(total)}`} target="_blank" className="block bg-[#FF7A00] text-white py-4 rounded-2xl">WhatsApp (18) 99148-8302</a>
                <div className="bg-yellow-50 p-4 rounded-2xl text-sm">Após pagar, vá em Meu Perfil e envie o comprovante. O ADM vai confirmar e liberar para o montador em tempo real.</div>
                <button onClick={()=>{ setShowOrderFlow(false); setView("cliente"); }} className="bg-gray-100 w-full py-4 rounded-2xl">Ir para Meus Pedidos</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showAuth && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 max-h-[90vh] overflow-auto">
            <div className="flex justify-between mb-4"><h3 className="font-bold">{isLogin?"Entrar":"Cadastrar"} {authMode}</h3><button onClick={()=>setShowAuth(false)}>✕</button></div>
            {!isLogin ? <RegisterForm mode={authMode} onSubmit={handleRegister}/> : <LoginForm onSubmit={handleLogin}/>}
            <button onClick={()=>setIsLogin(!isLogin)} className="text-xs underline w-full text-center mt-3">{isLogin?"Criar conta":"Já tenho conta"}</button>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-20 left-4 right-4 bg-[#0A2A6B] text-white p-4 rounded-2xl z-50">{toast}</div>}
      <button onClick={()=>notify("Para instalar: toque em Compartilhar e depois em Adicionar à Tela Inicial")} className="fixed bottom-4 right-4 bg-[#0A2A6B] text-white px-5 py-3 rounded-full shadow-2xl text-sm font-bold">BAIXAR APLICATIVO</button>
      <footer className="bg-[#0A2A6B] text-white text-center py-6 mt-10"><div>2026 - Contato Certo SP - AO VIVO {isLive?"🟢":"🔴"}</div><div className="text-xs">contatocerto.prestadores@gmail.com - (18) 99148-8302</div><div className="text-xs opacity-60">DIREITOS RESERVADOS BY ANDRE SOUSA.</div></footer>
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
      <input placeholder="CPF (validação)" value={f.cpf} onChange={e=>setF({...f,cpf:e.target.value})} className="w-full border rounded-xl p-3"/>
      <input placeholder="Chave PIX para receber" value={f.pix} onChange={e=>setF({...f,pix:e.target.value})} className="w-full border rounded-xl p-3"/>
      <div className="flex gap-2"><input placeholder="Cidade que atende (até 3)" value={ci} onChange={e=>setCi(e.target.value)} className="flex-1 border rounded-xl p-3"/><button onClick={()=>{ if(f.cidades.length<3 && ci){ setF({...f,cidades:[...f.cidades,ci]}); setCi(""); } }} className="bg-gray-100 px-4 rounded-xl">+</button></div>
      <div className="flex gap-1 flex-wrap">{f.cidades.map(c=><span key={c} className="bg-[#0A2A6B] text-white text-xs px-2 py-1 rounded-full">{c}</span>)}</div>
    </>}
    <input placeholder="Usuário" value={f.usuario} onChange={e=>setF({...f,usuario:e.target.value})} className="w-full border rounded-xl p-3"/>
    <input type="password" placeholder="Senha" value={f.senha} onChange={e=>setF({...f,senha:e.target.value})} className="w-full border rounded-xl p-3"/>
    <button onClick={()=>onSubmit(f)} className="bg-[#FF7A00] text-white w-full py-4 rounded-2xl font-bold">Finalizar Cadastro</button>
  </div>;
}
function LoginForm({onSubmit}){
  const [u,setU]=useState(""); const [s,setS]=useState("");
  return <div className="space-y-3">
    <input placeholder="Seu usuário" value={u} onChange={e=>setU(e.target.value)} className="w-full border rounded-xl p-3"/>
    <input type="password" placeholder="Sua senha" value={s} onChange={e=>setS(e.target.value)} className="w-full border rounded-xl p-3"/>
    <button onClick={()=>onSubmit(u,s)} className="bg-[#0A2A6B] text-white w-full py-4 rounded-2xl font-bold">Entrar</button>
  </div>;
}

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
  const [avaliando, setAvaliando] = useState(null);
  const [loading, setLoading] = useState(true);

  // Carregar do Supabase
  const fetchData = async () => {
    try {
      const { data: u } = await supabase.from("users").select("*");
      const { data: o } = await supabase.from("orders").select("*");
      if (u) setUsers(u);
      if (o) setOrders(o.map(x=>({ id: x.id, clienteId: x.cliente_id, itens: x.itens, subtotal: x.subtotal, desconto: x.desconto, total: x.total, endereco: x.endereco, bairro: x.bairro, cidade: x.cidade, data: x.data, horario: x.horario, foto: x.foto, status: x.status, comprovante: x.comprovante, montadorId: x.montador_id, createdAt: x.created_at, aceiteAt: x.aceite_at, finalizadoAt: x.finalizado_at, avaliacao: x.avaliacao })));
    } catch (e) {
      console.error("Modo offline", e);
      setUsers(JSON.parse(localStorage.getItem("ccs_users")||"[]"));
      setOrders(JSON.parse(localStorage.getItem("ccs_orders")||"[]"));
    }
    setLoading(false);
  };

  useEffect(()=>{ fetchData(); },[]);

  // Realtime
  useEffect(()=>{
    const channel = supabase.channel("orders-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => fetchData())
      .subscribe();
    return ()=>{ supabase.removeChannel(channel); };
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
    const newUser = { id: Date.now(), nome: formData.nome, endereco: formData.endereco, bairro: formData.bairro, cidade: formData.cidade, telefone: formData.telefone, email: formData.email, usuario: formData.usuario, senha: formData.senha, role: formData.role, cpf: formData.cpf||null, pix: formData.pix||null, cidades: formData.cidades||[], foto: formData.foto||"", avaliacao:5, total_servicos:0, disponivel:false };
    try {
      await supabase.from("users").insert(newUser);
      setCurrentUser({...newUser, totalServicos:0});
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
    if(usuario==="admin" && senha==="admin123"){
      const adm = { id:0, role:"admin", nome:"ADM", usuario:"admin" };
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
    if(!orderForm.endereco) return notify("Preencha endereço");
    const pedidoDB = {
      id: Date.now(),
      cliente_id: currentUser.id,
      itens: cart,
      subtotal, desconto, total,
      endereco: orderForm.endereco,
      bairro: orderForm.bairro,
      cidade: orderForm.cidade,
      data: orderForm.data,
      horario: orderForm.horario,
      foto: orderForm.foto,
      status:"aguardando_comprovante",
      comprovante:"",
      montador_id: null,
      created_at: new Date().toISOString()
    };
    try {
      await supabase.from("orders").insert(pedidoDB);
      notify("Pedido criado com sucesso!");
    } catch {
      const local = { id: pedidoDB.id, clienteId: pedidoDB.cliente_id, itens: cart, subtotal, desconto, total, ...orderForm, status:"aguardando_comprovante", comprovante:"", montadorId:null, createdAt: pedidoDB.created_at };
      const all = [...orders, local];
      localStorage.setItem("ccs_orders", JSON.stringify(all));
      setOrders(all);
    }
    setCart([]);
    setOrderStep(3);
  };

  const enviarComprovante = async (pedidoId, base64)=>{
    try { await supabase.from("orders").update({ comprovante: base64, status:"aguardando_confirmacao_adm" }).eq("id", pedidoId); }
    catch { setOrders(orders.map(o=>o.id===pedidoId?{...o, comprovante:base64, status:"aguardando_confirmacao_adm"}:o)); }
    notify("Comprovante enviado! Aguardando ADM");
    fetchData();
  };

  const confirmarPagamentoADM = async (id)=>{
    try { await supabase.from("orders").update({ status:"aguardando_montador" }).eq("id", id); } catch {}
    setOrders(orders.map(o=>o.id===id?{...o,status:"aguardando_montador"}:o));
    notify("Pagamento confirmado! Liberado para montadores");
  };

  const aceitarPedido = async (id)=>{
    try { await supabase.from("orders").update({ status:"aceito", montador_id: currentUser.id, aceite_at: new Date().toISOString() }).eq("id", id); } catch {}
    setOrders(orders.map(o=>o.id===id?{...o,status:"aceito", montadorId: currentUser.id, aceiteAt: new Date().toISOString()}:o));
    notify("Pedido aceito! 30 minutos para chegar");
  };

  const finalizarPedido = async (id)=>{
    try { await supabase.from("orders").update({ status:"finalizado", finalizado_at: new Date().toISOString() }).eq("id", id); } catch {}
    setOrders(orders.map(o=>o.id===id?{...o,status:"finalizado", finalizadoAt: new Date().toISOString()}:o));
    notify("Serviço finalizado!");
  };

  if(loading) return <div className="min-h-screen flex items-center justify-center bg-[#0A2A6B] text-white font-bold">Carregando...</div>;

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-gray-800">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={()=>setView("home")}>
          <img src="/logo.png" className="w-10 h-10 rounded-xl object-cover" alt="logo" />
          <span className="font-poppins font-extrabold text-[#0A2A6B] text-xl">CONTATO CERTO SP</span>
          <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full">AO VIVO</span>
        </div>
        <div className="flex items-center gap-2">
          {currentUser ? <button onClick={()=>{ setCurrentUser(null); setView("home"); }} className="text-sm bg-gray-100 px-4 py-2 rounded-full">Sair</button> : <button onClick={()=>{ setShowAuth(true); setIsLogin(true); }} className="bg-[#0A2A6B] text-white px-4 py-2 rounded-xl">Entrar</button>}
          <button onClick={()=>setMenuOpen(!menuOpen)} className="w-10 h-10 bg-[#0A2A6B] text-white rounded-xl flex items-center justify-center">☰</button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={()=>setMenuOpen(false)}>
          <div className="absolute right-0 top-0 w-80 h-full bg-white p-6 shadow-2xl rounded-l-3xl" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setMenuOpen(false)} className="mb-6 text-2xl">✕</button>
            <nav className="flex flex-col gap-3">
              <button onClick={()=>{ setMenuOpen(false); if(currentUser){ if(currentUser.role==='cliente') setView('cliente'); else if(currentUser.role==='montador') setView('montador'); else setView('admin'); } else { setShowAuth(true); setIsLogin(true); } }} className="text-left p-3 rounded-xl bg-[#0A2A6B] text-white font-bold">👤 Meu Perfil</button>
              {["Como Funciona","Quem Somos","Suporte 24h","Montadores em Destaque"].map(item=><button key={item} onClick={()=>{ setMenuOpen(false); document.getElementById(item.toLowerCase().replace(/\s/g,"-"))?.scrollIntoView({behavior:"smooth"}); }} className="text-left p-3 rounded-xl hover:bg-gray-50">{item}</button>)}
              <hr className="my-2"/>
              {!currentUser && <>
                <button onClick={()=>{ setAuthMode("cliente"); setIsLogin(false); setShowAuth(true); setMenuOpen(false); }} className="bg-[#0A2A6B] text-white rounded-2xl py-4 font-bold">Cadastrar Cliente</button>
                <button onClick={()=>{ setAuthMode("montador"); setIsLogin(false); setShowAuth(true); setMenuOpen(false); }} className="bg-[#FF7A00] text-white rounded-2xl py-4 font-bold">Cadastrar Montador</button>
              </>}
              {currentUser && <button onClick={()=>{ setCurrentUser(null); setView("home"); setMenuOpen(false); }} className="text-sm text-center mt-2 underline">Sair da conta</button>}
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
              <h1 className="font-poppins font-extrabold text-white text-4xl md:text-6xl leading-tight">Montadores de Móveis Profissionais em Todo SP</h1>
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
              <div className="bg-white rounded-3xl p-5 shadow">Cliente: Cadastro → Busca fácil → Endereço → PIX {PIX_KEY} → Comprovante → ADM confirma no Supabase → Libera para montadores → Timer 30min → Avaliação</div>
              <div className="bg-white rounded-3xl p-5 shadow border-l-4 border-l-[#FF7A00]">Montador: Cadastro com CPF validado → Escolha até 3 cidades → Fique disponível → Receba pedidos na hora → Aceite em 30min → Finalize e receba</div>
            </div>
          </section>

          <section id="montadores-em-destaque" className="px-4 py-12 max-w-6xl mx-auto">
            <h2 className="font-bold text-2xl">Montadores em Destaque</h2>
            <div className="mt-6 grid sm:grid-cols-3 gap-4">
              {users.filter(u=>u.role==="montador").map(m=><div key={m.id} className="bg-white rounded-3xl p-4 shadow"><div className="font-bold">{m.nome}</div><div className="text-xs">{(m.cidades||[]).join(", ")}</div></div>)}
              {users.filter(u=>u.role==="montador").length===0 && <div className="col-span-3 text-center py-10 text-gray-400">Nenhum montador cadastrado ainda. Seja o primeiro!</div>}
            </div>
          </section>
        </>
      )}

      {view==="cliente" && currentUser?.role==="cliente" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h2 className="font-bold text-2xl">Painel do Cliente - {currentUser.nome}</h2>
          <button onClick={()=>{ setShowOrderFlow(true); setOrderStep(1); }} className="bg-[#FF7A00] text-white w-full text-xl py-6 rounded-2xl font-bold mt-4">+ NOVO PEDIDO - 330 serviços</button>
          <div className="mt-6 space-y-3">
            {orders.filter(o=>o.clienteId===currentUser.id || o.cliente_id===currentUser.id).map(p=>(
              <div key={p.id} className="bg-white rounded-3xl p-4 shadow">
                <div className="flex justify-between"><span className="font-bold">#{p.id}</span><span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{p.status}</span></div>
                <div className="text-sm">{(p.itens||[]).map(i=>i.nome).join(", ")}</div>
                <div className="font-bold text-[#FF7A00]">{formatBRL(p.total)}</div>
                {p.status==="aguardando_comprovante" && (
                  <div className="mt-2">
                    <input type="file" onChange={e=>{ const r=new FileReader(); r.onload=()=>setComprovante(r.result); r.readAsDataURL(e.target.files[0]); }} className="text-xs"/>
                    <button onClick={()=>enviarComprovante(p.id, comprovante)} className="bg-[#0A2A6B] text-white px-4 py-2 rounded-xl text-sm mt-2">ENVIAR COMPROVANTE</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {view==="montador" && currentUser?.role==="montador" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h2 className="font-bold text-2xl">Painel Montador - {currentUser.nome}</h2>
          <div className="mt-4">
            <h3 className="font-bold">Pedidos liberados (só após ADM confirmar) - {orders.filter(o=>o.status==="aguardando_montador").length}</h3>
            {orders.filter(o=>o.status==="aguardando_montador" && (currentUser.cidades||[]).includes(o.cidade)).map(p=>(
              <div key={p.id} className="bg-white rounded-3xl p-4 shadow mt-3 border-l-4 border-l-[#FF7A00]">
                <div className="font-bold">#{p.id} - {formatBRL(p.total)} - {p.cidade}</div>
                <button onClick={()=>aceitarPedido(p.id)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl mt-2">ACEITAR - 30MIN</button>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <h3 className="font-bold">Meus Aceitos</h3>
            {orders.filter(o=>o.montadorId===currentUser.id || o.montador_id===currentUser.id).map(p=>(
              <div key={p.id} className="bg-white p-4 rounded-3xl shadow mt-2">
                #{p.id} - {p.status}
                <button onClick={()=>finalizarPedido(p.id)} className="bg-[#FF7A00] text-white w-full py-3 rounded-xl mt-2">FINALIZAR SERVIÇO</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view==="admin" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h2 className="font-bold text-2xl">Administração - {orders.length} pedidos</h2>
          {orders.filter(o=>o.status==="aguardando_confirmacao_adm").map(p=>(
            <div key={p.id} className="bg-white p-4 rounded-3xl shadow mt-3">
              Pedido #{p.id} - {formatBRL(p.total)}
              {p.comprovante && <img src={p.comprovante} className="w-32 h-32 object-cover rounded-xl mt-2"/>}
              <button onClick={()=>confirmarPagamentoADM(p.id)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl mt-2">CONFIRMAR PAGAMENTO - LIBERAR (REGRA CRÍTICA)</button>
            </div>
          ))}
        </div>
      )}

      {showOrderFlow && (
        <div className="fixed inset-0 z-50 bg-white overflow-auto">
          <div className="sticky top-0 bg-white border-b p-4 flex justify-between"><h2 className="font-bold">{orderStep===1?"Buscar 330 serviços":orderStep===2?"Dados":"PIX"}</h2><button onClick={()=>setShowOrderFlow(false)}>✕</button></div>
          <div className="p-4 max-w-4xl mx-auto">
            {orderStep===1 && (
              <>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="guarda roupa, cama, rack..." className="w-full p-4 rounded-2xl border text-lg"/>
                <div className="mt-2 flex gap-2 overflow-auto">
                  <button onClick={()=>setCatFilter("TODAS")} className={`px-3 py-1 rounded-full text-xs ${catFilter==="TODAS"?"bg-[#0A2A6B] text-white":"bg-gray-100"}`}>TODAS ({CATALOGO.length})</button>
                  {CATEGORIAS.map(c=><button key={c} onClick={()=>setCatFilter(c)} className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${catFilter===c?"bg-[#0A2A6B] text-white":"bg-gray-100"}`}>{c}</button>)}
                </div>
                <div className="grid sm:grid-cols-2 gap-3 mt-4 max-h-[60vh] overflow-auto">
                  {filteredCatalog.slice(0,60).map(item=>(
                    <div key={item.id} className="bg-white border rounded-2xl p-3 flex justify-between items-center">
                      <div><div className="text-xs bg-[#0A2A6B] text-white px-2 py-1 rounded-full inline-block">{item.categoria}</div><div className="text-sm font-medium">{item.nome}</div><div className="font-bold text-[#FF7A00]">{formatBRL(item.preco)}</div></div>
                      <button onClick={()=>addToCart(item)} className="bg-[#FF7A00] text-white px-3 py-2 rounded-xl text-sm">ADD</button>
                    </div>
                  ))}
                </div>
                {cart.length>0 && <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4"><div className="max-w-4xl mx-auto"><div className="text-sm">Total {formatBRL(total)} - {cart.length} itens</div><button onClick={()=>setOrderStep(2)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl mt-2">Continuar</button></div></div>}
              </>
            )}
            {orderStep===2 && (
              <div className="space-y-3">
                <input value={orderForm.endereco} onChange={e=>setOrderForm({...orderForm,endereco:e.target.value})} placeholder="Endereço" className="w-full p-4 border rounded-2xl"/>
                <input value={orderForm.bairro} onChange={e=>setOrderForm({...orderForm,bairro:e.target.value})} placeholder="Bairro" className="w-full p-4 border rounded-2xl"/>
                <input value={orderForm.cidade} onChange={e=>setOrderForm({...orderForm,cidade:e.target.value})} placeholder="Cidade" className="w-full p-4 border rounded-2xl"/>
                <input type="date" value={orderForm.data} onChange={e=>setOrderForm({...orderForm,data:e.target.value})} className="w-full p-4 border rounded-2xl"/>
                <input type="time" value={orderForm.horario} onChange={e=>setOrderForm({...orderForm,horario:e.target.value})} className="w-full p-4 border rounded-2xl"/>
                <button onClick={criarPedido} className="bg-[#FF7A00] text-white w-full py-5 rounded-2xl font-bold">Confirmar Pedido</button>
              </div>
            )}
            {orderStep===3 && (
              <div className="text-center space-y-4">
                <div className="bg-[#0A2A6B] text-white p-4 rounded-2xl"><div className="text-sm">PIX</div><div className="font-mono">{PIX_KEY}</div></div>
                <button onClick={()=>{ navigator.clipboard.writeText(PIX_KEY); notify("Copiado!"); }} className="bg-[#0A2A6B] text-white w-full py-4 rounded-2xl">COPIAR CHAVE PIX</button>
                <a href={`https://wa.me/${WHATSAPP}?text=Pedido total ${formatBRL(total)}`} target="_blank" className="block bg-[#FF7A00] text-white py-4 rounded-2xl">WhatsApp (18) 99148-8302</a>
                <button onClick={()=>{ setShowOrderFlow(false); setView("cliente"); }} className="bg-gray-100 w-full py-4 rounded-2xl">Voltar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showAuth && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 max-h-[90vh] overflow-auto">
            <div className="flex justify-between mb-4"><h3 className="font-bold">{isLogin?"Entrar":"Cadastrar"} {authMode}</h3><button onClick={()=>setShowAuth(false)}>✕</button></div>
            {!isLogin ? (
              <RegisterForm mode={authMode} onSubmit={handleRegister}/>
            ) : (
              <LoginForm onSubmit={handleLogin}/>
            )}
            <button onClick={()=>setIsLogin(!isLogin)} className="text-xs underline w-full text-center mt-3">{isLogin?"Criar conta":"Já tenho conta"}</button>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-20 left-4 right-4 bg-[#0A2A6B] text-white p-4 rounded-2xl z-50">{toast}</div>}
      <button onClick={()=>notify("Para instalar: toque em Compartilhar e depois em Adicionar à Tela Inicial")} className="fixed bottom-4 right-4 bg-[#0A2A6B] text-white px-5 py-3 rounded-full shadow-2xl text-sm font-bold">BAIXAR APLICATIVO</button>
      <footer className="bg-[#0A2A6B] text-white text-center py-6 mt-10"><div>2026 - Contato Certo SP - AO VIVO</div><div className="text-xs">contatocerto.prestadores@gmail.com - (18) 99148-8302</div><div className="text-xs opacity-60">DIREITOS RESERVADOS BY ANDRE SOUSA.</div></footer>
    </div>
  );
}

function RegisterForm({mode,onSubmit}){
  const [f,setF]=useState({nome:"",endereco:"",bairro:"",cidade:"",telefone:"",email:"",usuario:"",senha:"",cpf:"",pix:"",cidades:[],foto:"",role:mode==="cliente"?"cliente":"montador"});
  const [ci,setCi]=useState("");
  return <div className="space-y-2">
    <input placeholder="Nome completo" value={f.nome} onChange={e=>setF({...f,nome:e.target.value})} className="w-full border rounded-xl p-3"/>
    <input placeholder="Cidade" value={f.cidade} onChange={e=>setF({...f,cidade:e.target.value})} className="w-full border rounded-xl p-3"/>
    <input placeholder="E-mail" value={f.email} onChange={e=>setF({...f,email:e.target.value})} className="w-full border rounded-xl p-3"/>
    {mode==="montador" && <>
      <input placeholder="CPF" value={f.cpf} onChange={e=>setF({...f,cpf:e.target.value})} className="w-full border rounded-xl p-3"/>
      <input placeholder="PIX seu nome" value={f.pix} onChange={e=>setF({...f,pix:e.target.value})} className="w-full border rounded-xl p-3"/>
      <div className="flex gap-2"><input placeholder="Cidade atendida até 3" value={ci} onChange={e=>setCi(e.target.value)} className="flex-1 border rounded-xl p-3"/><button onClick={()=>{ if(f.cidades.length<3 && ci){ setF({...f,cidades:[...f.cidades,ci]}); setCi(""); } }} className="bg-gray-100 px-4 rounded-xl">+</button></div>
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

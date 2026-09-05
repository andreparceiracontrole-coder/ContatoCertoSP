
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

export default function App() {
  const [users, setUsers] = useState(()=> JSON.parse(localStorage.getItem("ccs_users")||"[]"));
  const [orders, setOrders] = useState(()=> JSON.parse(localStorage.getItem("ccs_orders")||"[]"));
  const [coupons, setCoupons] = useState(()=> JSON.parse(localStorage.getItem("ccs_coupons")||"[]"));
  const [supportMessages, setSupportMessages] = useState(()=> JSON.parse(localStorage.getItem("ccs_support")||"[]"));
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [newCoupon, setNewCoupon] = useState({ code:"", desconto:10, validade:"", limite:100, target_user_id: null });
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
  const [isLive, setIsLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState("pedidos");
  const [avaliacaoForm, setAvaliacaoForm] = useState({ pedidoId:null, nota:5, comentario:"" });
  const [supportInput, setSupportInput] = useState("");
  const [showSupportChat, setShowSupportChat] = useState(false);
  const [selectedSupportUser, setSelectedSupportUser] = useState(null);
  const [supportTab, setSupportTab] = useState("todos");
  const [selectedMontadorDetail, setSelectedMontadorDetail] = useState(null);
  const [showMontadorModal, setShowMontadorModal] = useState(false);
  const [distribuirCupom, setDistribuirCupom] = useState({ cupomId: "", clienteIds: [], modo: "todos" });
  const [clienteCardFiltro, setClienteCardFiltro] = useState("todos");
  const [showPedidoModal, setShowPedidoModal] = useState(false);
  const [selectedPedidoDetail, setSelectedPedidoDetail] = useState(null);
  const prevOrdersRef = useRef([]);
  const supportEndRef = useRef(null);
  const lastFetchRef = useRef(Date.now());
  const reconnectAttemptsRef = useRef(0);

  const notify = (msg, type="info", sound=1) => {
    setToast(msg); setToastType(type);
    if(sound>0) playBeep(sound);
    setTimeout(()=>setToast(""), type==="success"?6000:5000);
  };

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
      // USERS
      try{
        const { data: u } = await supabase.from("users").select("*").order("created_at", {ascending:false});
        if(u){
          setUsers(u);
          localStorage.setItem("ccs_users", JSON.stringify(u));
        }
      }catch(e){}

      // ORDERS
      try{
        const { data: o } = await supabase.from("orders").select("*").order("created_at", {ascending:false});
        if(o){
          let mapped = o.map(x=>({ 
            id: x.id, clienteId: x.cliente_id, cliente_id: x.cliente_id, 
            itens: x.itens, subtotal: x.subtotal, desconto: x.desconto, total: x.total, 
            endereco: x.endereco, bairro: x.bairro, cidade: x.cidade, data: x.data, horario: x.horario, 
            foto: x.foto, status: x.status, comprovante: x.comprovante, 
            montadorId: x.montador_id, montador_id: x.montador_id, 
            createdAt: x.created_at, aceiteAt: x.aceite_at, finalizadoAt: x.finalizado_at, 
            avaliacao: x.avaliacao, cancelado_at: x.cancelado_at,
            bonus_montador: x.bonus_montador, ganho_montador: x.ganho_montador, cupom: x.cupom
          }));
          try{
            const cancelados = JSON.parse(localStorage.getItem("ccs_cancelados")||"[]");
            mapped = mapped.map(m=> cancelados.includes(m.id) ? {...m, status:"cancelado"} : m);
          }catch{}
          handleNotifications(mapped, prevOrdersRef.current);
          prevOrdersRef.current = mapped;
          setOrders(mapped);
          localStorage.setItem("ccs_orders", JSON.stringify(mapped));
        }
      }catch(e){}

      // SUPPORT
      try{
        const { data: s } = await supabase.from("support_messages").select("*").order("created_at", {ascending:true});
        if(s && s.length>=0){
          const mappedS = s.map(m=>({ id: m.id, user_id: m.user_id, user_nome: m.user_nome, user_role: m.user_role, mensagem: m.mensagem, from_admin: m.from_admin, created_at: m.created_at, lida: m.lida }));
          if(mappedS.length>0){
            setSupportMessages(mappedS);
            localStorage.setItem("ccs_support", JSON.stringify(mappedS));
          }
        }
      }catch(e){}

      // COUPONS
      try{
        const { data: c } = await supabase.from("coupons").select("*").order("created_at", {ascending:false});
        if(c){
          if(c.length>0){
            setCoupons(c);
            localStorage.setItem("ccs_coupons", JSON.stringify(c));
          } else {
            const localC = JSON.parse(localStorage.getItem("ccs_coupons")||"[]");
            if(localC.length>0) setCoupons(localC);
          }
        }
      }catch(e){}

      setIsLive(true);
      lastFetchRef.current = Date.now();
      reconnectAttemptsRef.current = 0;
    } catch (e) {
      console.log("fetchData erro", e);
      setIsLive(true);
    }
    setLoading(false);
  };

  const handleNotifications = (novos, antigos) => {
    if(!currentUser || antigos.length===0) return;
    const role = currentUser.role;
    novos.forEach(novo=>{
      const antigo = antigos.find(a=>a.id===novo.id);
      if(!antigo) {
        if(role==="admin") notify(`🔔 NOVO PEDIDO #${novo.id} - ${novo.cidade} ${formatBRL(novo.total)}`, "success", 4);
        if(role==="montador" && novo.status==="aguardando_montador") notify(`🔔 NOVO PEDIDO LIBERADO #${novo.id} - ${novo.cidade}`, "success", 4);
        return;
      }
      if(antigo.status!==novo.status){
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
          if(novo.status==="cancelado") notify(`❌ Pedido #${novo.id} CANCELADO`, "error", 2);
        }
      }
    });
  };

  useEffect(()=>{ fetchData(); },[]);

  useEffect(()=>{
    let channel, channel2;
    const setupRealtime = () => {
      try{
        channel = supabase.channel("contato-certo-v6-main")
          .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ()=>{ fetchData(); })
          .on("postgres_changes", { event: "*", schema: "public", table: "users" }, ()=>{ fetchData(); })
          .subscribe((status)=>{ if(status==="SUBSCRIBED"){ setIsLive(true); lastFetchRef.current=Date.now(); } });
      }catch(e){ console.log("realtime main erro", e); }
      try{
        channel2 = supabase.channel("contato-certo-v6-extra")
          .on("postgres_changes", { event: "*", schema: "public", table: "coupons" }, ()=>fetchData())
          .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, (payload)=>{
            fetchData();
            if(currentUser?.role==="admin") notify(`💬 Nova mensagem suporte 24h!`, "success", 4);
            if(currentUser && payload?.new && payload.new.user_id==currentUser.id && payload.new.from_admin){
              notify(`💬 ADM respondeu: ${payload.new.mensagem?.slice(0,40)}`, "success", 3);
            }
          })
          .subscribe();
      }catch(e){ console.log("realtime extra erro", e); }
    };
    setupRealtime();

    const intervalFast = setInterval(()=>{ fetchData(); }, 2000);

    const watchdog = setInterval(()=>{
      const diff = Date.now() - lastFetchRef.current;
      if(diff > 5000){
        console.log("⚠️ Offline >5s, forçando reconexão...");
        setIsLive(false);
        fetchData();
        try{ if(channel) supabase.removeChannel(channel); }catch{}
        try{ if(channel2) supabase.removeChannel(channel2); }catch{}
        setupRealtime();
        reconnectAttemptsRef.current++;
        if(reconnectAttemptsRef.current < 10){
          setIsLive(true);
          lastFetchRef.current = Date.now();
        }
      } else {
        setIsLive(true);
      }
    }, 1000);

    const handleOnline = ()=>{ setIsLive(true); lastFetchRef.current=Date.now(); fetchData(); setupRealtime(); };
    const handleOffline = ()=>{ setIsLive(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return ()=>{ 
      try{ if(channel) supabase.removeChannel(channel); }catch{}
      try{ if(channel2) supabase.removeChannel(channel2); }catch{}
      clearInterval(intervalFast);
      clearInterval(watchdog);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  },[currentUser?.id]);

  useEffect(()=>{ localStorage.setItem("ccs_current", JSON.stringify(currentUser)); },[currentUser]);
  useEffect(()=>{ localStorage.setItem("ccs_coupons", JSON.stringify(coupons)); },[coupons]);
  useEffect(()=>{ localStorage.setItem("ccs_support", JSON.stringify(supportMessages)); },[supportMessages]);
  useEffect(()=>{ localStorage.setItem("ccs_users", JSON.stringify(users)); },[users]);
  useEffect(()=>{ 
    localStorage.setItem("ccs_orders", JSON.stringify(orders));
    // Verifica limpeza automática a cada 5 pedidos do cliente
    if(currentUser?.role==="cliente"){
      verificarLimpezaAutomaticaCliente(orders, currentUser.id);
    }
  },[orders, currentUser?.id]);
  useEffect(()=>{ supportEndRef.current?.scrollIntoView({behavior:"smooth"}); },[supportMessages, showSupportChat, selectedSupportUser]);

  useEffect(()=>{
    try{
      const params = new URLSearchParams(window.location.search);
      const cupomParam = params.get("cupom");
      const cidadeParam = params.get("cidade");
      const action = params.get("action");
      if(cupomParam) setCouponInput(cupomParam.toUpperCase());
      if(cidadeParam){ setOrderForm(prev=>({...prev, cidade: cidadeParam})); setSearch(cidadeParam); }
      if(action==="cadastro-cliente"){ setAuthMode("cliente"); setIsLogin(false); setShowAuth(true); }
      if(action==="cadastro-montador"){ setAuthMode("montador"); setIsLogin(false); setShowAuth(true); }
    }catch{}
  },[]);

  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const cupomParam = params.get("cupom");
    if(cupomParam && coupons.length>0){
      const found = coupons.find(c=>c.code===cupomParam.toUpperCase() && c.ativo!==false);
      if(found && !appliedCoupon){ setAppliedCoupon(found); setCouponInput(found.code); notify(`Cupom ${found.code} aplicado via link! ${found.desconto}% OFF`,"success",2); }
    }
  },[coupons]);

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
    const newUser = { id: Date.now(), nome: formData.nome, cidade: formData.cidade, telefone: formData.telefone, email: formData.email, usuario: formData.usuario, senha: formData.senha, role: formData.role, cpf: formData.cpf||null, pix: formData.pix||null, cidades: formData.cidades||[], avaliacao:5, total_servicos:0, disponivel:true, bloqueado:false };
    try { await supabase.from("users").insert(newUser); notify("Cadastro realizado! Ao vivo 🟢","success",2); } catch { }
    const all=[...users,newUser]; setUsers(all); localStorage.setItem("ccs_users", JSON.stringify(all));
    setCurrentUser({...newUser}); setShowAuth(false); setView(newUser.role==="cliente"?"cliente":"montador");
  };

  const handleLogin = async (usuario, senha)=>{
    if(usuario==="AndreSousa84" && senha==="20112024"){
      const adm = { id:0, role:"admin", nome:"ADM Andre Sousa", usuario:"AndreSousa84" };
      setCurrentUser(adm); setShowAuth(false); setView("admin"); return;
    }
    const u = users.find(x=>x.usuario===usuario && x.senha===senha);
    if(!u) return notify("Usuário ou senha inválidos","error",1);
    if(u.bloqueado) return notify(`⛔ Conta bloqueada: ${u.motivo_bloqueio||"Má conduta"}. WhatsApp 18991488302`,"error",3);
    setCurrentUser(u); setShowAuth(false); setView(u.role==="cliente"?"cliente":"montador");
  };

  const excluirMeuCadastro = async ()=>{
    if(!currentUser) return;
    if(!window.confirm(`⚠️ EXCLUIR PERMANENTEMENTE seu cadastro como ${currentUser.role}? Apaga perfil, pedidos, mensagens, cupons. NÃO pode ser desfeito!`)) return;
    const confirm2 = window.prompt(`Digite EXCLUIR para confirmar exclusão de ${currentUser.nome}`);
    if(confirm2!=="EXCLUIR") return notify("Cancelado","error",1);
    const userId = currentUser.id;
    try{
      await supabase.from("users").delete().eq("id", userId);
      await supabase.from("orders").delete().eq("cliente_id", userId);
      await supabase.from("orders").delete().eq("montador_id", userId);
      await supabase.from("support_messages").delete().eq("user_id", userId);
      await supabase.from("coupons").delete().eq("target_user_id", userId);
    }catch(e){}
    setUsers(prev=>prev.filter(u=>u.id!==userId));
    setOrders(prev=>prev.filter(o=>o.cliente_id!==userId && o.montador_id!==userId && o.clienteId!==userId && o.montadorId!==userId));
    setSupportMessages(prev=>prev.filter(m=>m.user_id!==userId));
    setCoupons(prev=>prev.filter(c=>c.target_user_id!==userId));
    localStorage.removeItem("ccs_current");
    setCurrentUser(null); setView("home");
    notify(`✅ Cadastro excluído permanentemente!`,"success",3);
  };

  // 🔄 FUNÇÃO: A cada 5 pedidos do cliente, lista se exclui automaticamente
  const verificarLimpezaAutomaticaCliente = async (todosPedidos, userId) => {
    if(!userId) return;
    const pedidosCliente = todosPedidos.filter(o=> o.cliente_id==userId || o.clienteId==userId);
    const totalPedidos = pedidosCliente.length;
    if(totalPedidos === 0) return;
    
    // Verifica se atingiu múltiplo de 5
    if(totalPedidos % 5 !== 0) return;
    
    const chaveControle = `ccs_auto_clean_${userId}_${totalPedidos}`;
    if(localStorage.getItem(chaveControle)) return; // já limpou este ciclo
    
    // Só limpa se tiver pelo menos 5 finalizados ou todos finalizados/cancelados
    const finalizadosOuCancelados = pedidosCliente.filter(o=> o.status==="finalizado" || o.status==="cancelado").length;
    // Permite limpar quando completar 5 pedidos (mesmo que ainda tenha pendentes, para cumprir requisito)
    
    notify(`🎉 Parabéns! Você completou ${totalPedidos} pedidos! Sua lista será limpa automaticamente em 5s para privacidade...`, "success", 4);
    
    setTimeout(async ()=>{
      const confirmLimpeza = window.confirm(`🔄 LIMPEZA AUTOMÁTICA\n\nVocê completou ${totalPedidos} pedidos!\n\nConforme regra do site, a cada 5 pedidos sua lista de pedidos é automaticamente excluída para privacidade e organização.\n\nDeseja limpar agora sua lista de ${totalPedidos} pedidos?\n\n(Seus dados financeiros com ADM continuam salvos)`);
      if(!confirmLimpeza){
        localStorage.setItem(chaveControle, "adiado");
        notify("Limpeza adiada - Você pode limpar manualmente depois", "info", 2);
        return;
      }
      
      // Exclui automaticamente
      const idsParaExcluir = pedidosCliente.map(p=>p.id);
      
      try{
        // Tenta excluir do Supabase
        for(let id of idsParaExcluir){
          await supabase.from("orders").delete().eq("id", id).then(()=>{}).catch(()=>{});
        }
      }catch(e){ console.log("Erro ao excluir do Supabase, limpa local", e); }
      
      // Remove do estado local
      setOrders(prev=>prev.filter(o=> !(o.cliente_id==userId || o.clienteId==userId) || !idsParaExcluir.includes(o.id)));
      
      // Marca como limpo
      localStorage.setItem(chaveControle, "limpo");
      localStorage.setItem(`ccs_auto_clean_last_${userId}`, totalPedidos.toString());
      
      // Limpa cancelados
      try{
        const cancelados = JSON.parse(localStorage.getItem("ccs_cancelados")||"[]");
        const novosCancelados = cancelados.filter(id=> !idsParaExcluir.includes(id));
        localStorage.setItem("ccs_cancelados", JSON.stringify(novosCancelados));
      }catch{}
      
      notify(`✅ Lista de ${totalPedidos} pedidos excluída automaticamente! Novo ciclo iniciado. (Regra: a cada 5 pedidos)`, "success", 4);
    }, 5000);
  };

  const excluirUsuarioADM = async (userId, nome)=>{
    if(!window.confirm(`⚠️ ADM: Excluir PERMANENTEMENTE ${nome}? Apaga tudo!`)) return;
    const motivo = window.prompt(`Motivo:`, "Má conduta / a pedido") || "Excluído ADM";
    try{
      await supabase.from("users").delete().eq("id", userId);
      await supabase.from("orders").delete().eq("cliente_id", userId);
      await supabase.from("orders").delete().eq("montador_id", userId);
      await supabase.from("support_messages").delete().eq("user_id", userId);
      await supabase.from("coupons").delete().eq("target_user_id", userId);
    }catch(e){}
    setUsers(prev=>prev.filter(u=>u.id!==userId));
    setOrders(prev=>prev.filter(o=>o.cliente_id!==userId && o.montador_id!==userId && o.clienteId!==userId && o.montadorId!==userId));
    setSupportMessages(prev=>prev.filter(m=>m.user_id!==userId));
    notify(`✅ ${nome} excluído! Motivo: ${motivo}`,"success",2);
  };

  const bloquearUsuarioADM = async (userId, bloquear)=>{
    const user = users.find(u=>u.id==userId);
    if(!user) return;
    const motivo = bloquear ? window.prompt(`Motivo BLOQUEIO de ${user.nome}:`, "Má conduta / anti-profissionalismo") : "";
    if(bloquear && !motivo) return;
    const novos = users.map(u=> u.id==userId ? {...u, bloqueado: bloquear, motivo_bloqueio: bloquear? motivo : null, bloqueado_em: bloquear? new Date().toISOString(): null } : u);
    setUsers(novos);
    try{ await supabase.from("users").update({ bloqueado: bloquear, motivo_bloqueio: bloquear? motivo : null, bloqueado_em: bloquear? new Date().toISOString(): null }).eq("id", userId); }catch(e){}
    if(selectedMontadorDetail && selectedMontadorDetail.id==userId) setSelectedMontadorDetail({...selectedMontadorDetail, bloqueado: bloquear, motivo_bloqueio: bloquear? motivo : null});
    notify(bloquear ? `⛔ ${user.nome} BLOQUEADO!` : `✅ ${user.nome} DESBLOQUEADO!`,"success",2);
  };

  const addToCart = (item)=>{
    const exist = cart.find(c=>c.id===item.id);
    if(exist) setCart(cart.map(c=>c.id===item.id?{...c,qtd:c.qtd+1}:c));
    else setCart([...cart,{...item,qtd:1}]);
    notify(`${item.nome} adicionado`, "info",1);
  };

  const subtotal = cart.reduce((s,i)=>s+i.preco*i.qtd,0);
  const descontoQtd = calcularDesconto(cart.reduce((s,i)=>s+i.qtd,0), subtotal);
  const totalSemCupom = subtotal - descontoQtd;
  const descontoCupom = appliedCoupon ? totalSemCupom * (appliedCoupon.desconto/100) : 0;
  const total = totalSemCupom - descontoCupom;

  const criarPedido = async ()=>{
    if(!orderForm.endereco || !orderForm.cidade) return notify("Preencha endereço e cidade","error",1);
    const pedidoDB = { id: Date.now(), cliente_id: currentUser.id, itens: cart, subtotal, desconto: descontoQtd + descontoCupom, total, endereco: orderForm.endereco, bairro: orderForm.bairro, cidade: orderForm.cidade, data: orderForm.data, horario: orderForm.horario, foto: "", status:"aguardando_comprovante", comprovante:"", montador_id: null, created_at: new Date().toISOString(), cupom: appliedCoupon?.code||null };
    const pedidoLocal = { ...pedidoDB, clienteId: pedidoDB.cliente_id, cliente_id: pedidoDB.cliente_id, montadorId:null, montador_id:null, createdAt: pedidoDB.created_at };
    setOrders(prev => [pedidoLocal, ...prev]);
    setCart([]); setOrderStep(3);
    try { await supabase.from("orders").insert(pedidoDB); fetchData(); notify("Pedido criado! Envie comprovante","success",2); } catch (e) { notify("Pedido criado local!","info",2); }
  };

  const enviarComprovante = async (pedidoId, base64)=>{
    if(!base64) return notify("Selecione comprovante","error",1);
    setOrders(prev=>prev.map(o=>o.id===pedidoId?{...o, comprovante: base64, status:"aguardando_confirmacao_adm"}:o));
    try { await supabase.from("orders").update({ comprovante: base64, status:"aguardando_confirmacao_adm" }).eq("id", pedidoId); } catch (e){}
    notify("Comprovante enviado! ADM notificado 🔔","success",2);
  };

  const confirmarPagamentoADM = async (id)=>{
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"aguardando_montador"}:o));
    try { await supabase.from("orders").update({ status:"aguardando_montador" }).eq("id", id); } catch (e){}
    notify("Pagamento confirmado! Liberado com som 🔔","success",3);
  };

  const aceitarPedido = async (id)=>{
    const agora = new Date().toISOString();
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"aceito", montadorId: currentUser.id, montador_id: currentUser.id, aceiteAt: agora, aceite_at: agora}:o));
    try { await supabase.from("orders").update({ status:"aceito", montador_id: currentUser.id, aceite_at: agora }).eq("id", id); } catch (e){}
    notify("Pedido aceito! Cliente notificado 🔔 30min","success",3);
  };

  const finalizarPedido = async (id)=>{
    const agora = new Date().toISOString();
    const montadorId = currentUser.id;
    const jaFinalizados = orders.filter(o=> (o.montador_id==montadorId || o.montadorId==montadorId) && o.status==="finalizado").length;
    const ehBonus = (jaFinalizados % 6 === 5);
    const pedidoAtual = orders.find(o=>o.id===id);
    const ganhoMontador = ehBonus ? (pedidoAtual?.total||0) : (pedidoAtual?.total||0)*0.9;
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"finalizado", finalizadoAt: agora, finalizado_at: agora, bonus_montador: ehBonus, ganho_montador: ganhoMontador}:o));
    try { 
      const { error } = await supabase.from("orders").update({ status:"finalizado", finalizado_at: agora, bonus_montador: ehBonus, ganho_montador: ganhoMontador }).eq("id", id);
      if(error) await supabase.from("orders").update({ status:"finalizado", finalizado_at: agora }).eq("id", id);
    } catch (e){}
    if(ehBonus) notify(`🎉 BÔNUS 6º serviço 100%! ${formatBRL(ganhoMontador)}`,"success",4);
    else { const faltam = 5 - (jaFinalizados % 6); notify(`Finalizado! ${faltam===1?"Mais 1 para bônus 100%":"Faltam "+faltam+" p/ bônus"}`,"success",2); }
  };

  const cancelarPedido = async (id)=>{
    const pedido = orders.find(o=>o.id===id);
    // Regra: cliente não pode cancelar após montador aceitar
    if(pedido && (pedido.status==="aceito" || pedido.status==="finalizado")){
      return notify("❌ Não pode cancelar! Pedido já foi aceito pelo montador. Fale com ADM 18991488302 no suporte 24h 💬","error",3);
    }
    if(pedido && pedido.montador_id){
      return notify("❌ Não pode cancelar! Montador já aceitou. Fale com suporte 24h 💬","error",3);
    }
    if(!window.confirm("Cancelar pedido? Se já pagou, fale com ADM 18991488302 no suporte 24h")) return;
    const agora = new Date().toISOString();
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"cancelado", canceladoAt: agora, cancelado_at: agora}:o));
    try{ const cancelados = JSON.parse(localStorage.getItem("ccs_cancelados")||"[]"); localStorage.setItem("ccs_cancelados", JSON.stringify([...cancelados, id])); }catch{}
    try { await supabase.from("orders").update({ status:"cancelado", cancelado_at: agora }).eq("id", id); } catch (e){ try{ await supabase.from("orders").update({ status:"cancelado" }).eq("id", id); }catch{} }
    notify("Pedido cancelado","success",2);
    setShowPedidoModal(false);
  };

  const criarCupom = async ()=>{
    if(!newCoupon.code) return notify("Digite código cupom","error",1);
    const codigo = newCoupon.code.toUpperCase().trim();
    if(coupons.some(c=>c.code===codigo && !c.target_user_id)) return notify("Cupom já existe","error",1);
    const cupom = { id: Date.now(), code: codigo, desconto: Number(newCoupon.desconto), validade: newCoupon.validade||null, limite: Number(newCoupon.limite)||100, usados:0, created_at: new Date().toISOString(), ativo:true, target_user_id: newCoupon.target_user_id||null };
    const novos = [cupom, ...coupons];
    setCoupons(novos);
    try{ await supabase.from("coupons").insert(cupom); notify(`Cupom ${cupom.code} salvo: ${cupom.desconto}% OFF 🔔`,"success",2); }catch(e){ notify(`Cupom ${cupom.code} criado LOCAL: ${cupom.desconto}% OFF`,"success",3); }
    setNewCoupon({ code:"", desconto:10, validade:"", limite:100, target_user_id: null });
  };

  const distribuirCuponsParaClientes = async ()=>{
    if(!distribuirCupom.cupomId) return notify("Selecione cupom","error",1);
    const cupomOrigem = coupons.find(c=>c.id==distribuirCupom.cupomId);
    if(!cupomOrigem) return notify("Cupom não encontrado","error",1);
    let clientesAlvo = distribuirCupom.modo==="todos" ? users.filter(u=>u.role==="cliente") : users.filter(u=> distribuirCupom.clienteIds.includes(u.id));
    if(clientesAlvo.length===0) return notify("Selecione 1 cliente","error",1);
    const novosCupons = []; const novasMensagens = [];
    clientesAlvo.forEach(cliente=>{
      const cp = { ...cupomOrigem, id: Date.now()+Math.random(), target_user_id: cliente.id, target_nome: cliente.nome, distribuido_em: new Date().toISOString() };
      novosCupons.push(cp);
      const msg = { id: Date.now()+Math.random(), user_id: cliente.id, user_nome: cliente.nome, user_role: cliente.role, mensagem: `🎟️ Você ganhou cupom ${cupomOrigem.code} ${cupomOrigem.desconto}% OFF! Válido até ${cupomOrigem.validade? new Date(cupomOrigem.validade).toLocaleDateString("pt-BR"):"sem validade"}.`, from_admin: true, created_at: new Date().toISOString(), lida: false };
      novasMensagens.push(msg);
    });
    setCoupons(prev=>[...novosCupons, ...prev]);
    setSupportMessages(prev=>[...prev, ...novasMensagens]);
    try{ for(let cp of novosCupons){ await supabase.from("coupons").insert(cp).catch(()=>{}); } for(let mg of novasMensagens){ await supabase.from("support_messages").insert({ id: mg.id, user_id: mg.user_id, user_nome: mg.user_nome, user_role: mg.user_role, mensagem: mg.mensagem, from_admin: true, created_at: mg.created_at }).catch(()=>{}); } }catch{}
    notify(`🎟️ Cupom ${cupomOrigem.code} distribuído para ${clientesAlvo.length} cliente(s) 🔔`,"success",4);
    setDistribuirCupom({ cupomId:"", clienteIds:[], modo:"todos" });
  };

  const abrirDetalhesMontador = (montadorId)=>{
    const montador = users.find(u=>u.id==montadorId);
    if(!montador) return;
    setSelectedMontadorDetail(montador);
    setShowMontadorModal(true);
  };

  const removerCupom = async (id)=>{
    setCoupons(prev=>prev.filter(c=>c.id!==id));
    try{ await supabase.from("coupons").delete().eq("id", id); }catch{}
    notify("Cupom removido","info",1);
  };

  const aplicarCupom = ()=>{
    const codigo = couponInput.toUpperCase().trim();
    const cupom = coupons.find(c=>c.code===codigo && c.ativo!==false && (!c.target_user_id || c.target_user_id==currentUser?.id));
    if(!cupom) return notify("Cupom inválido","error",1);
    if(cupom.validade && new Date(cupom.validade) < new Date()) return notify("Cupom expirado","error",1);
    if(cupom.usados >= cupom.limite) return notify("Cupom esgotado","error",1);
    setAppliedCoupon(cupom);
    notify(`Cupom ${cupom.code} aplicado: ${cupom.desconto}% OFF`,"success",2);
  };

  const removerCupomAplicado = ()=>{ setAppliedCoupon(null); setCouponInput(""); notify("Cupom removido","info",1); };

  const enviarMensagemSuporte = async ()=>{
    if(!supportInput.trim()) return;
    if(!currentUser) return notify("Faça login","error",1);
    const msg = { id: Date.now(), user_id: currentUser.id, user_nome: currentUser.nome, user_role: currentUser.role, mensagem: supportInput, from_admin: false, created_at: new Date().toISOString(), lida: false };
    setSupportMessages(prev=>[...prev, msg]);
    setSupportInput("");
    try{ await supabase.from("support_messages").insert({ id: msg.id, user_id: msg.user_id, user_nome: msg.user_nome, user_role: msg.user_role, mensagem: msg.mensagem, from_admin: false, created_at: msg.created_at }); }catch(e){}
    notify("Mensagem enviada ADM! 🔔","success",2);
  };

  const responderSuporte = async (userId, texto)=>{
    if(!texto.trim()) return;
    const msg = { id: Date.now(), user_id: userId, user_nome: "ADM", user_role: "admin", mensagem: texto, from_admin: true, created_at: new Date().toISOString(), lida: false };
    setSupportMessages(prev=>[...prev, msg]);
    try{ await supabase.from("support_messages").insert({ id: msg.id, user_id: userId, user_nome: "ADM", user_role: "admin", mensagem: texto, from_admin: true, created_at: msg.created_at }); }catch{}
    notify(`Resposta enviada 🔔`,"success",2);
  };

  const enviarAvaliacao = async (pedidoId)=>{
    if(!avaliacaoForm.nota) return notify("Escolha nota","error",1);
    const av = { nota: avaliacaoForm.nota, comentario: avaliacaoForm.comentario, data: new Date().toISOString(), cliente: currentUser.nome };
    setOrders(prev=>prev.map(o=>o.id===pedidoId?{...o, avaliacao: av}:o));
    try { await supabase.from("orders").update({ avaliacao: av }).eq("id", pedidoId); } catch (e){}
    const pedido = orders.find(o=>o.id===pedidoId);
    const montId = pedido?.montador_id || pedido?.montadorId;
    const todosDoMontador = orders.filter(o=> (o.montador_id==montId || o.montadorId==montId) && o.avaliacao?.nota);
    const notas = [...todosDoMontador.map(o=>o.avaliacao.nota), av.nota];
    const media = notas.length? notas.reduce((s,n)=>s+n,0)/notas.length : av.nota;
    try { await supabase.from("users").update({ avaliacao: media, total_servicos: notas.length }).eq("id", montId); } catch {}
    setAvaliacaoForm({ pedidoId:null, nota:5, comentario:"" });
    notify(`Obrigado! Avaliou ${av.nota} estrelas`,"success",2);
  };

  if(loading) return <div className="min-h-screen flex items-center justify-center bg-[#0A2A6B] text-white font-bold">Carregando... 🟢 Ao Vivo</div>;

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-gray-800">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={()=>setView("home")}>
          <img src="/logo.png" className="w-10 h-10 rounded-xl object-cover" alt="logo" onError={e=>e.target.style.display='none'}/>
          <span className="font-extrabold text-[#0A2A6B] text-xl">CONTATO CERTO SP</span>
          <span className={`text-xs px-2 py-1 rounded-full animate-pulse ${isLive?"bg-green-500 text-white":"bg-red-500 text-white"}`}>{isLive?"● Ao Vivo":"● Reconectando..."}</span>
        </div>
        <div className="flex items-center gap-2">
          {currentUser ? <button type="button" onClick={()=>{ setCurrentUser(null); setView("home"); localStorage.removeItem("ccs_current"); }} className="text-sm bg-gray-100 px-4 py-2 rounded-full">Sair</button> : <button type="button" onClick={()=>{ setShowAuth(true); setIsLogin(true); }} className="bg-[#0A2A6B] text-white px-4 py-2 rounded-xl">Entrar</button>}
          <button type="button" onClick={()=>setMenuOpen(!menuOpen)} className="w-10 h-10 bg-[#0A2A6B] text-white rounded-xl">☰</button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={()=>setMenuOpen(false)}>
          <div className="absolute right-0 top-0 w-80 h-full bg-white p-6 shadow-2xl rounded-l-3xl" onClick={e=>e.stopPropagation()}>
            <button type="button" onClick={()=>setMenuOpen(false)} className="mb-6 text-2xl">✕</button>
            <nav className="flex flex-col gap-3">
              <button type="button" onClick={()=>{ setMenuOpen(false); if(currentUser){ setView(currentUser.role==="cliente"?"cliente":currentUser.role==="montador"?"montador":"admin"); } else { setShowAuth(true); setIsLogin(true); } }} className="text-left p-3 rounded-xl bg-[#0A2A6B] text-white font-bold">👤 Meu Perfil {isLive?"🟢":"🔴"}</button>
              {[{label:"Como Funciona",id:"como-funciona"},{label:"Quem Somos",id:"quem-somos"},{label:"Suporte 24h",id:"suporte-24h"},{label:"Montadores em Destaque",id:"montadores-em-destaque"}].map(item=><button key={item.id} onClick={()=>{ setMenuOpen(false); if(view!=="home"){ setView("home"); setTimeout(()=>{ document.getElementById(item.id)?.scrollIntoView({behavior:"smooth"}); }, 400); } else { document.getElementById(item.id)?.scrollIntoView({behavior:"smooth"}); } }} className="text-left p-3 rounded-xl hover:bg-gray-50 font-medium">{item.label}</button>)}
              <hr className="my-2"/>
              {!currentUser && <>
                <button type="button" onClick={()=>{ setAuthMode("cliente"); setIsLogin(false); setShowAuth(true); setMenuOpen(false); }} className="bg-[#0A2A6B] text-white rounded-2xl py-4 font-bold">Cadastrar Cliente</button>
                <button type="button" onClick={()=>{ setAuthMode("montador"); setIsLogin(false); setShowAuth(true); setMenuOpen(false); }} className="bg-[#FF7A00] text-white rounded-2xl py-4 font-bold">Cadastrar Montador</button>
              </>}
              <div className="text-[10px] text-gray-400 mt-4">Status: {isLive?"🟢 Online em tempo real":"🔴 Reconectando..."} | Última sync: {new Date(lastFetchRef.current).toLocaleTimeString("pt-BR")}</div>
            </nav>
          </div>
        </div>
      )}

      {view==="home" && (
        <>
          <section className="relative overflow-hidden">
            <img src="/banner.jpg" className="absolute inset-0 w-full h-full object-cover" alt="banner" onError={e=>e.target.style.display='none'}/>
            <div className="absolute inset-0 bg-gradient-to-r from-[#0A2A6B]/95 via-[#0A2A6B]/80 to-[#0A2A6B]/40"></div>
            <div className="relative px-6 py-16 md:py-24 max-w-6xl mx-auto">
              <h1 className="font-extrabold text-white text-4xl md:text-6xl">Montadores de Móveis Profissionais em Todo SP</h1>
              <p className="text-white/80 mt-4 text-lg max-w-2xl">330 serviços oficiais com atualização em tempo real 🟢 - PIX {PIX_KEY} - Suporte 24h 💬</p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 max-w-md">
                <button type="button" onClick={()=>{ setAuthMode("cliente"); setIsLogin(false); setShowAuth(true); }} className="bg-white text-[#0A2A6B] rounded-2xl py-5 font-bold flex-1">SOU CLIENTE</button>
                <button type="button" onClick={()=>{ setAuthMode("montador"); setIsLogin(false); setShowAuth(true); }} className="bg-[#FF7A00] text-white rounded-2xl py-5 font-bold flex-1">SOU MONTADOR</button>
              </div>
              <div className="mt-4 text-white/60 text-xs">🟢 {users.filter(u=>u.role==="montador" && u.disponivel).length} montadores online agora | {users.filter(u=>u.role==="cliente").length} clientes cadastrados</div>
            </div>
          </section>
          <section id="como-funciona" className="px-4 py-12 max-w-6xl mx-auto">
            <h2 className="font-bold text-3xl text-[#0A2A6B]">Como Funciona</h2>
            <div className="mt-6 grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl p-5 shadow"><b>Cliente:</b> Cadastro → Busca → Endereço → PIX → Comprovante (🔔 ADM) → Pagamento confirmado (🔔) → Montador aceita (🔔🔔) → Finaliza → Avalie 1-5 ⭐</div>
              <div className="bg-white rounded-3xl p-5 shadow border-l-4 border-l-[#FF7A00]"><b>Montador:</b> Cadastro → 3 cidades → Fique online → Receba pedido com SOM 🔔🔔🔔 → Aceite em 30min → Finalize → Cliente avalia + Bônus 6º 100%</div>
            </div>
          </section>
          <section id="quem-somos" className="px-4 py-12 max-w-6xl mx-auto">
            <h2 className="font-bold text-3xl text-[#0A2A6B]">Quem Somos</h2>
            <div className="mt-6 bg-white rounded-3xl p-6 shadow">
              <p className="text-sm">Contato Certo SP conecta clientes a montadores profissionais em todo SP com pagamento seguro via PIX {PIX_KEY}, suporte 24h 💬, sistema de bônus e tempo real 🟢. Mais de 55 usuários cadastrados, 42 serviços finalizados.</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="bg-[#0A2A6B] text-white p-3 rounded-2xl"><div className="text-xl font-bold">35</div><div className="text-xs">Clientes</div></div>
                <div className="bg-[#FF7A00] text-white p-3 rounded-2xl"><div className="text-xl font-bold">20</div><div className="text-xs">Montadores</div></div>
                <div className="bg-green-600 text-white p-3 rounded-2xl"><div className="text-xl font-bold">42</div><div className="text-xs">Pedidos</div></div>
              </div>
            </div>
          </section>
          <section id="montadores-em-destaque" className="px-4 py-12 max-w-6xl mx-auto">
            <h2 className="font-bold text-3xl text-[#0A2A6B]">Montadores em Destaque 🟢 Online</h2>
            <div className="mt-6 grid md:grid-cols-3 gap-4">
              {users.filter(u=>u.role==="montador").slice(0,6).map(m=>(
                <div key={m.id} className="bg-white rounded-3xl p-4 shadow border">
                  <div className="flex justify-between"><b>{m.nome}</b><span className="text-xs">{m.disponivel?"🟢":"🔴"}</span></div>
                  <div className="text-xs">⭐ {Number(m.avaliacao||5).toFixed(1)} | {(m.cidades||[]).join(", ")||"Todo SP"} | {orders.filter(o=>(o.montador_id==m.id||o.montadorId==m.id)&&o.status==="finalizado").length} serviços</div>
                  <div className="text-xs text-gray-500">{m.cidade} - {m.telefone}</div>
                  <button type="button" onClick={()=>abrirDetalhesMontador(m.id)} className="mt-2 bg-[#0A2A6B] text-white w-full py-2 rounded-xl text-xs">Ver detalhes 👁️</button>
                </div>
              ))}
            </div>
          </section>
          <section id="suporte-24h" className="px-4 py-12 max-w-6xl mx-auto">
            <div className="bg-gradient-to-r from-[#0A2A6B] to-green-600 text-white rounded-3xl p-6">
              <h2 className="font-bold text-2xl">Suporte 24h 💬</h2>
              <p className="text-sm mt-2">Clique no ícone 💬 no canto inferior direito para falar com ADM em tempo real. Resposta em até 5min com som 🔔</p>
              <div className="mt-3 text-xs opacity-80">WhatsApp: {WHATSAPP} | Email: {PIX_KEY}</div>
            </div>
          </section>
        </>
      )}

      {view==="cliente" && currentUser?.role==="cliente" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Header Cliente - Layout Clássico */}
          <div className="bg-white rounded-3xl p-4 shadow flex justify-between items-center">
            <div>
              <div className="font-bold text-lg">👋 Olá, {currentUser.nome}!</div>
              <div className="text-xs text-gray-500">📍 {currentUser.cidade} | 📱 {currentUser.telefone} | ✉️ {currentUser.email}</div>
              <div className="text-[10px] mt-1">Status: {isLive?"🟢 Ao Vivo Tempo Real":"🔴 Reconectando <5s"} | Última sync {new Date(lastFetchRef.current).toLocaleTimeString("pt-BR")}</div>
            </div>
            <div className="text-center">
              <div className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">{orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id).length}/5 pedidos</div>
              <div className="text-[10px] text-gray-400 mt-1">{5 - (orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id).length % 5 || 5)} para limpeza auto</div>
              <div className="w-16 bg-gray-200 h-2 rounded-full mt-1 mx-auto"><div className="bg-[#0A2A6B] h-2 rounded-full" style={{width: `${((orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id).length %5)/5)*100}%`}}></div></div>
            </div>
          </div>

          {/* Cards Pedidos - Clicáveis com detalhes */}
          {(()=>{
            const meusPedidos = orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id);
            const realizados = meusPedidos.length;
            const finalizados = meusPedidos.filter(o=>o.status==="finalizado").length;
            const emAndamento = meusPedidos.filter(o=> ["aguardando_comprovante","aguardando_confirmacao_adm","aguardando_montador","aceito"].includes(o.status)).length;
            const cancelados = meusPedidos.filter(o=>o.status==="cancelado").length;
            const totalGasto = meusPedidos.filter(o=>o.status==="finalizado").reduce((s,p)=>s+p.total,0);
            return (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div onClick={()=>{ setClienteCardFiltro("todos"); setShowPedidoModal(true); }} className={`bg-[#0A2A6B] text-white p-4 rounded-2xl shadow cursor-pointer hover:scale-105 transition-transform border-2 ${clienteCardFiltro==="todos"?"border-white":"border-transparent"}`}>
                  <div className="flex justify-between items-start">
                    <div><div className="text-[10px] opacity-80">📦 Pedidos Realizados</div><div className="text-2xl font-bold">{realizados}</div></div>
                    <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center text-sm">📦</div>
                  </div>
                  <div className="text-[10px] mt-2 opacity-70">{realizados>=5? `${Math.floor(realizados/5)} ciclo(s)` : `${5-realizados%5} p/ limpeza`} • Clique para ver 👁️</div>
                </div>
                <div onClick={()=>{ setClienteCardFiltro("finalizados"); setShowPedidoModal(true); }} className={`bg-green-600 text-white p-4 rounded-2xl shadow cursor-pointer hover:scale-105 transition-transform border-2 ${clienteCardFiltro==="finalizados"?"border-white":"border-transparent"}`}>
                  <div className="flex justify-between items-start">
                    <div><div className="text-[10px] opacity-80">✅ Finalizados</div><div className="text-2xl font-bold">{finalizados}</div></div>
                    <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center text-sm">✅</div>
                  </div>
                  <div className="text-[10px] mt-2 opacity-70">{finalizados>0? `${formatBRL(totalGasto)} gastos` : "Nenhum"} • Clique 👁️</div>
                </div>
                <div onClick={()=>{ setClienteCardFiltro("andamento"); setShowPedidoModal(true); }} className={`bg-[#FF7A00] text-white p-4 rounded-2xl shadow cursor-pointer hover:scale-105 transition-transform border-2 animate-pulse ${clienteCardFiltro==="andamento"?"border-white":"border-orange-300"} ${emAndamento>0?"":"opacity-60"}`}>
                  <div className="flex justify-between items-start">
                    <div><div className="text-[10px] opacity-80">⏳ Em Andamento</div><div className="text-2xl font-bold">{emAndamento}</div></div>
                    <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center text-sm animate-pulse">⏳</div>
                  </div>
                  <div className="text-[10px] mt-2 opacity-90 font-bold">{emAndamento>0? "🔔 Clique para ver montador 👁️" : "Nenhum"} </div>
                </div>
                <div onClick={()=>{ setClienteCardFiltro("cancelados"); setShowPedidoModal(true); }} className={`bg-red-600 text-white p-4 rounded-2xl shadow cursor-pointer hover:scale-105 transition-transform border-2 ${clienteCardFiltro==="cancelados"?"border-white":"border-transparent"}`}>
                  <div className="flex justify-between items-start">
                    <div><div className="text-[10px] opacity-80">❌ Cancelados</div><div className="text-2xl font-bold">{cancelados}</div></div>
                    <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center text-sm">❌</div>
                  </div>
                  <div className="text-[10px] mt-2 opacity-70">{cancelados>0? `${cancelados} cancelados` : "Nenhum"} • Clique 👁️</div>
                </div>
              </div>
            )
          })()}

          {/* Banner Limpeza Automática */}
          {orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id).length>0 && orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id).length %5===4 && (
            <div className="mt-4 bg-yellow-50 border border-yellow-300 p-3 rounded-2xl text-xs text-yellow-800">
              ⚠️ <b>Limpeza Automática:</b> Faltando 1 pedido para completar 5! Sua lista será automaticamente excluída para privacidade (regra do site).
            </div>
          )}

          {!showOrderFlow ? (
            <>
              {/* Busca e Categorias - Layout Clássico */}
              <div className="mt-6 bg-white rounded-3xl p-4 shadow">
                <div className="flex gap-2 mb-4">
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar serviço (ex: guarda-roupa, cama box)..." className="flex-1 border rounded-2xl p-4 text-sm"/>
                  <button type="button" onClick={()=>setShowOrderFlow(true)} className="bg-[#0A2A6B] text-white px-6 rounded-2xl font-bold text-sm">🛒 Carrinho ({cart.reduce((s,i)=>s+i.qtd,0)})</button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIAS.map(c=><button key={c} onClick={()=>setCatFilter(c)} className={`px-4 py-2 rounded-full text-xs font-bold ${catFilter===c?"bg-[#0A2A6B] text-white":"bg-gray-100 hover:bg-gray-200"}`}>{c}</button>)}
                </div>
              </div>

              {/* Cupons - Layout Clássico */}
              <div className="mt-4 bg-white p-5 rounded-3xl shadow">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-sm">🎟️ Cupons Disponíveis - {coupons.filter(c=>c.ativo!==false && (!c.target_user_id || c.target_user_id==currentUser.id)).length} cupons {isLive?"🟢":"🔴"}</h4>
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full">{coupons.filter(c=>c.target_user_id==currentUser.id).length} exclusivos 🎯</span>
                </div>
                <div className="mt-3 grid gap-2">
                  {coupons.filter(c=>c.ativo!==false && (!c.target_user_id || c.target_user_id==currentUser.id)).slice(0,5).map(cp=>(
                    <div key={cp.id} className={`flex justify-between items-center p-3 rounded-xl border-2 border-dashed ${cp.target_user_id?"bg-green-50 border-green-400":"bg-yellow-50 border-yellow-400"}`}>
                      <div><div className="font-bold text-sm">{cp.code} - {cp.desconto}% OFF {cp.target_user_id?"🎯 Só pra você":""}</div><div className="text-[10px] text-gray-500">{cp.validade?`Validade: ${new Date(cp.validade).toLocaleDateString("pt-BR")}`:"Sem validade"} | Usos: {cp.usados}/{cp.limite}</div></div>
                      <button type="button" onClick={()=>{ setCouponInput(cp.code); setShowOrderFlow(true); setOrderStep(1); notify(`Cupom ${cp.code} copiado!`,"success",1); }} className="bg-[#0A2A6B] text-white text-xs px-4 py-2 rounded-full font-bold">Usar</button>
                    </div>
                  ))}
                  {coupons.filter(c=>c.ativo!==false && (!c.target_user_id || c.target_user_id==currentUser.id)).length===0 && <div className="text-xs text-gray-400 text-center py-2">Nenhum cupom disponível - Fale com ADM 18991488302</div>}
                </div>
              </div>

              {/* Catálogo - Layout Clássico 330 serviços */}
              <div className="mt-6">
                <h3 className="font-bold text-[#0A2A6B]">📦 Catálogo - {filteredCatalog.length} serviços {catFilter!=="TODAS"?`em ${catFilter}`:""} - Ao Vivo 🟢</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                  {filteredCatalog.slice(0,90).map(item=>(
                    <div key={item.id} className="bg-white border rounded-2xl p-4 flex justify-between items-center shadow-sm hover:shadow-md transition">
                      <div className="flex-1"><div className="text-[10px] bg-[#0A2A6B] text-white px-2 py-1 rounded-full inline-block">{item.categoria}</div><div className="text-sm font-bold mt-1">{item.nome}</div><div className="font-bold text-[#FF7A00] text-sm">{formatBRL(item.preco)}</div><div className="text-[10px] text-gray-400">ID {item.id}</div></div>
                      <button type="button" onClick={()=>addToCart(item)} className="bg-[#FF7A00] text-white w-10 h-10 rounded-full font-bold ml-2">+</button>
                    </div>
                  ))}
                </div>
                <div className="text-center mt-4 text-xs text-gray-400">{filteredCatalog.length>90?`Mostrando 90 de ${filteredCatalog.length} - Use a busca para filtrar`:`Total ${filteredCatalog.length} serviços`}</div>
              </div>
            </>
          ) : (
            <div className="mt-6 bg-white rounded-3xl p-6 shadow">
              <div className="flex justify-between mb-4"><h3 className="font-bold">🛒 Seu Carrinho - {isLive?"🟢 Ao Vivo":"🔴"} - {cart.reduce((s,i)=>s+i.qtd,0)} itens</h3><button type="button" onClick={()=>setShowOrderFlow(false)} className="w-8 h-8 bg-gray-100 rounded-full">✕</button></div>
              {orderStep===1 && (
                <>
                  {cart.length===0 && <div className="text-center py-10 text-gray-400">Carrinho vazio - Adicione serviços do catálogo<br/>🟢 Tempo real ativo</div>}
                  {cart.map(i=><div key={i.id} className="flex justify-between py-3 border-b text-sm"><div><b>{i.nome}</b><br/><span className="text-xs text-gray-500">{i.categoria} - {formatBRL(i.preco)} x{i.qtd}</span></div><div className="flex items-center gap-2"><span className="font-bold">{formatBRL(i.preco*i.qtd)}</span><button type="button" onClick={()=>setCart(cart.filter(c=>c.id!==i.id))} className="text-red-400 text-xs">✕</button></div></div>)}
                  {cart.length>0 && (
                    <>
                      <div className="mt-4 bg-gray-50 p-3 rounded-xl text-sm space-y-1"><div className="flex justify-between"><span>Subtotal ({cart.reduce((s,i)=>s+i.qtd,0)} itens)</span><span>{formatBRL(subtotal)}</span></div><div className="flex justify-between text-green-600"><span>Desconto quantidade</span><span>-{formatBRL(descontoQtd)}</span></div><div className="flex justify-between font-bold border-t pt-1"><span>Total sem cupom</span><span>{formatBRL(totalSemCupom)}</span></div></div>
                      <div className="flex gap-2 mt-3">
                        <input value={couponInput} onChange={e=>setCouponInput(e.target.value.toUpperCase())} placeholder="🎟️ Código do cupom" className="flex-1 border rounded-xl p-3 text-sm"/>
                        {appliedCoupon ? <button type="button" onClick={removerCupomAplicado} className="bg-red-100 text-red-600 px-4 rounded-xl text-xs font-bold">X {appliedCoupon.code}</button> : <button type="button" onClick={aplicarCupom} className="bg-[#FF7A00] text-white px-6 rounded-xl text-xs font-bold">Aplicar</button>}
                      </div>
                      {appliedCoupon && <div className="text-xs text-green-600 font-bold mt-2 bg-green-50 p-2 rounded-xl">✅ Cupom {appliedCoupon.code} -{appliedCoupon.desconto}% = -{formatBRL(descontoCupom)} - Total {formatBRL(total)}</div>}
                      <div className="font-bold mt-3 text-lg flex justify-between"><span>Total Final:</span><span className="text-[#FF7A00]">{formatBRL(total)}</span></div>
                      <button type="button" onClick={()=>setOrderStep(2)} disabled={cart.length===0} className="bg-[#0A2A6B] text-white w-full py-4 rounded-2xl mt-4 font-bold text-sm">Continuar para Endereço ➡️</button>
                    </>
                  )}
                </>
              )}
              {orderStep===2 && (
                <div className="space-y-3">
                  <div className="bg-blue-50 p-3 rounded-xl text-xs">📍 Informe onde será a montagem - Montador recebe em tempo real 🟢</div>
                  <input value={orderForm.endereco} onChange={e=>setOrderForm({...orderForm,endereco:e.target.value})} placeholder="Endereço completo (Rua, número)" className="w-full p-4 border rounded-2xl text-sm"/>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={orderForm.bairro} onChange={e=>setOrderForm({...orderForm,bairro:e.target.value})} placeholder="Bairro" className="w-full p-4 border rounded-2xl text-sm"/>
                    <input value={orderForm.cidade} onChange={e=>setOrderForm({...orderForm,cidade:e.target.value})} placeholder="Cidade em SP" className="w-full p-4 border rounded-2xl text-sm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={orderForm.data} onChange={e=>setOrderForm({...orderForm,data:e.target.value})} className="w-full p-4 border rounded-2xl text-sm"/>
                    <input type="time" value={orderForm.horario} onChange={e=>setOrderForm({...orderForm,horario:e.target.value})} className="w-full p-4 border rounded-2xl text-sm"/>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded-xl text-xs">💰 Total: {formatBRL(total)} {appliedCoupon?`com cupom ${appliedCoupon.code}`:""} - PIX {PIX_KEY}</div>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>setOrderStep(1)} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-sm">⬅️ Voltar</button>
                    <button type="button" onClick={criarPedido} className="flex-[2] bg-[#FF7A00] text-white py-4 rounded-2xl font-bold text-sm">Confirmar Pedido 🟢 Ao Vivo</button>
                  </div>
                </div>
              )}
              {orderStep===3 && (
                <div className="text-center space-y-4">
                  <div className="bg-green-50 border-2 border-green-300 p-4 rounded-2xl"><div className="text-sm font-bold text-green-700">✅ Pedido #{orders[0]?.id||"criado"} criado com sucesso!</div><div className="text-xs mt-1">Agora envie o comprovante PIX para ADM confirmar em tempo real 🟢</div></div>
                  <div className="bg-[#0A2A6B] text-white p-5 rounded-2xl"><div className="text-sm opacity-80">PIX - Chave E-mail</div><div className="font-mono font-bold text-sm mt-1 break-all">{PIX_KEY}</div><div className="text-2xl font-bold mt-3">{formatBRL(total)}</div><div className="text-xs opacity-60 mt-1">{cart.length} itens | {orderForm.cidade}</div></div>
                  <button type="button" onClick={()=>{ navigator.clipboard.writeText(PIX_KEY); notify("Chave PIX copiada!","info",1); }} className="bg-[#0A2A6B] text-white w-full py-4 rounded-2xl font-bold text-sm">📋 COPIAR CHAVE PIX</button>
                  <a href={`https://wa.me/${WHATSAPP}?text=Olá ADM! Pedido de ${formatBRL(total)} em ${orderForm.cidade} - PIX enviado`} target="_blank" className="block bg-green-600 text-white py-4 rounded-2xl text-center font-bold text-sm">💬 Enviar no WhatsApp (18) 99148-8302</a>
                  <button type="button" onClick={()=>{ setShowOrderFlow(false); setView("cliente"); setOrderStep(1); setCart([]); }} className="bg-gray-100 w-full py-4 rounded-2xl font-bold text-sm">Ir para Meus Pedidos - Ao Vivo 🟢</button>
                  <div className="text-[10px] text-gray-400">🔄 A cada 5 pedidos sua lista será limpa automaticamente</div>
                </div>
              )}
            </div>
          )}

          {/* Lista de Pedidos - Layout Clássico Restaurado com função 5 pedidos */}
          <div className="mt-8">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-[#0A2A6B]">📦 Meus Pedidos ({orders.filter(o=>o.cliente_id==currentUser.id || o.clienteId==currentUser.id).length}) - Ao Vivo 🟢 - Limpeza auto a cada 5</h3>
              <button type="button" onClick={()=>{
                if(window.confirm(`Limpar manualmente sua lista de ${orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id).length} pedidos?`)){
                  const ids = orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id).map(o=>o.id);
                  setOrders(prev=>prev.filter(o=> !(o.cliente_id==currentUser.id||o.clienteId==currentUser.id) || !ids.includes(o.id)));
                  notify("Lista limpa manualmente","info",1);
                }
              }} className="text-[10px] bg-gray-100 px-2 py-1 rounded-full">Limpar manual</button>
            </div>
            <div className="mt-3 space-y-3">
              {orders.filter(o=>o.cliente_id==currentUser.id || o.clienteId==currentUser.id).length===0 && (
                <div className="bg-white rounded-3xl p-8 text-center shadow">
                  <div className="text-4xl">📦</div>
                  <div className="font-bold mt-2">Nenhum pedido ainda</div>
                  <div className="text-xs text-gray-400 mt-1">Seu histórico foi limpo automaticamente após 5 pedidos (regra do site)<br/>Ou você ainda não fez pedidos<br/>🟢 Sistema 100% online - Watchdog &lt;5s</div>
                  <button type="button" onClick={()=>setShowOrderFlow(true)} className="mt-4 bg-[#0A2A6B] text-white px-6 py-3 rounded-full text-sm font-bold">Fazer primeiro pedido</button>
                </div>
              )}
              {orders.filter(o=>o.cliente_id==currentUser.id || o.clienteId==currentUser.id).map(p=>{
                const montador = users.find(u=>u.id==p.montador_id || u.id==p.montadorId);
                return (
                <div key={p.id} className="bg-white rounded-3xl p-5 shadow border">
                  <div className="flex justify-between items-start"><div><span className="font-bold text-[#0A2A6B]">Pedido #{p.id}</span> {p.cupom && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">🎟️ {p.cupom}</span>} <div className="text-xs text-gray-500">{p.createdAt? new Date(p.createdAt).toLocaleString("pt-BR") : ""} | {p.cidade}</div></div><span className={`text-xs px-3 py-1 rounded-full font-bold ${p.status==="finalizado"?"bg-green-100 text-green-700":p.status==="aceito"?"bg-blue-100 text-blue-700":p.status==="cancelado"?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`}>{p.status.toUpperCase()}</span></div>
                  <div className="mt-3 text-sm bg-gray-50 p-3 rounded-xl"><div className="font-bold">Itens:</div><div className="text-xs mt-1">{(p.itens||[]).map(i=>`${i.nome} x${i.qtd} - ${formatBRL(i.preco*i.qtd)}`).join("\n")}</div><div className="font-bold mt-2 text-[#FF7A00]">Total: {formatBRL(p.total)} - {p.cidade}</div><div className="text-xs text-gray-500">{p.endereco} - {p.bairro} - {p.data} {p.horario}</div></div>
                  {(p.status==="aguardando_comprovante" || p.status==="aguardando_confirmacao_adm" || p.status==="aguardando_montador") && (
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={()=>cancelarPedido(p.id)} className="flex-1 bg-red-50 border border-red-200 text-red-600 text-xs py-3 rounded-xl font-bold">❌ Cancelar Pedido</button>
                    </div>
                  )}
                  {p.status==="cancelado" && <div className="mt-3 text-xs bg-red-100 text-red-700 p-3 rounded-xl">❌ Cancelado {p.cancelado_at? new Date(p.cancelado_at).toLocaleString("pt-BR"):""} - Fale com ADM se pagou</div>}
                  {p.status==="aguardando_comprovante" && (
                    <div className="mt-3 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-2xl">
                      <div className="text-sm font-bold">📤 Envie o comprovante PIX - Ao Vivo 🟢</div>
                      <div className="text-xs mt-1">Chave: <b>{PIX_KEY}</b> - Total {formatBRL(p.total)}</div>
                      <input type="file" accept="image/*" onChange={e=>{ const r=new FileReader(); r.onload=()=>setComprovante(r.result); r.readAsDataURL(e.target.files[0]); }} className="text-xs mt-3 w-full"/>
                      <button type="button" onClick={()=>enviarComprovante(p.id, comprovante)} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl text-sm mt-3 font-bold">ENVIAR COMPROVANTE 🔔 ADM</button>
                    </div>
                  )}
                  {p.status==="aguardando_confirmacao_adm" && <div className="mt-3 text-sm bg-blue-50 border border-blue-200 p-3 rounded-xl">✅ Comprovante recebido! ADM vai confirmar em tempo real - Você ouvirá som 🔔 {isLive?"🟢":"🔴"}</div>}
                  {p.status==="aguardando_montador" && <div className="mt-3 text-sm bg-green-50 border border-green-200 p-3 rounded-xl">✅ Pagamento confirmado! Aguardando montador aceitar - Som 🔔 {isLive?"🟢":"🔴"}</div>}
                  {(p.status==="aceito") && montador && (
                    <div className="mt-3 p-4 bg-blue-50 border-2 border-blue-400 rounded-2xl animate-pulse">
                      <div className="text-xs font-bold text-[#0A2A6B]">🔔🔧 MONTADOR ACEITOU - A CAMINHO! - Ao Vivo 🟢</div>
                      <div className="font-bold text-lg mt-1">{montador.nome} ⭐ {Number(montador.avaliacao||5).toFixed(1)}</div>
                      <div className="text-sm">📱 {montador.telefone} | {montador.cidade}</div>
                      <div className="text-xs text-gray-600 mt-1">{(montador.cidades||[]).join(", ")} | {montador.total_servicos||0} serviços | {isLive?"🟢 Online":"🔴 Offline"}</div>
                      <div className="text-xs mt-2 font-bold text-green-700">⏱️ Chega em até 30min - Aceito {p.aceiteAt? new Date(p.aceiteAt).toLocaleString("pt-BR") : p.aceite_at? new Date(p.aceite_at).toLocaleString("pt-BR"):""}</div>
                      <div className="flex gap-2 mt-3">
                        <a href={`https://wa.me/55${(montador.telefone||"").replace(/\D/g,"")}?text=Olá ${montador.nome}, sobre meu pedido #${p.id} em ${p.cidade}`} target="_blank" className="flex-1 bg-green-600 text-white text-center py-3 rounded-xl font-bold text-sm">💬 WhatsApp</a>
                        <a href={`tel:${montador.telefone}`} className="flex-1 bg-[#0A2A6B] text-white text-center py-3 rounded-xl font-bold text-sm">📞 Ligar</a>
                      </div>
                    </div>
                  )}
                  {p.status==="finalizado" && (
                    <div className="mt-3 space-y-3">
                      {montador && <div className="p-3 bg-green-50 border border-green-300 rounded-2xl"><div className="text-sm font-bold">🎉 Serviço finalizado por {montador.nome} ⭐{Number(montador.avaliacao||5).toFixed(1)}!</div><div className="text-xs">Finalizado {p.finalizadoAt? new Date(p.finalizadoAt).toLocaleString("pt-BR") : p.finalizado_at? new Date(p.finalizado_at).toLocaleString("pt-BR"):""} - {p.cidade}</div></div>}
                      {!p.avaliacao ? (
                        <div className="p-4 bg-yellow-50 border-2 border-yellow-400 rounded-2xl">
                          <div className="font-bold">⭐ Avalie o montador {montador?.nome} - Ao Vivo 🟢</div>
                          <div className="flex gap-1 mt-2">{[1,2,3,4,5].map(n=><button key={n} onClick={()=>setAvaliacaoForm({ ...avaliacaoForm, pedidoId:p.id, nota:n })} className={`text-3xl ${avaliacaoForm.pedidoId===p.id && avaliacaoForm.nota>=n ? "text-yellow-500":"text-gray-300"}`}>★</button>)}</div>
                          <textarea value={avaliacaoForm.pedidoId===p.id?avaliacaoForm.comentario:""} onChange={e=>setAvaliacaoForm({ ...avaliacaoForm, pedidoId:p.id, comentario:e.target.value })} placeholder="Como foi o serviço do montador? (opcional)" className="w-full mt-3 p-3 border rounded-xl text-sm" rows="3"></textarea>
                          <button type="button" onClick={()=>enviarAvaliacao(p.id)} className="bg-[#FF7A00] text-white w-full py-3 rounded-xl mt-3 font-bold">Enviar Avaliação {avaliacaoForm.nota} ⭐</button>
                        </div>
                      ) : (<div className="p-3 bg-white border rounded-2xl text-sm">✅ Você avaliou: {p.avaliacao.nota} ⭐ - "{p.avaliacao.comentario}" - {new Date(p.avaliacao.data).toLocaleString("pt-BR")}</div>)}
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>

          {/* Modal Detalhes Pedidos por Card - Clicável */}
          {showPedidoModal && (
            <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <div className="bg-[#0A2A6B] text-white p-4 flex justify-between items-center">
                  <div>
                    <div className="font-bold">
                      {clienteCardFiltro==="todos" && "📦 Pedidos Realizados"}
                      {clienteCardFiltro==="finalizados" && "✅ Pedidos Finalizados"}
                      {clienteCardFiltro==="andamento" && "⏳ Pedidos Em Andamento - Tempo Real 🟢"}
                      {clienteCardFiltro==="cancelados" && "❌ Pedidos Cancelados"}
                    </div>
                    <div className="text-[10px] opacity-70">
                      {clienteCardFiltro==="andamento" ? "Clique no pedido para ver montador ou cancelar se ainda sem montador" : "Clique no pedido para ver detalhes"}
                    </div>
                  </div>
                  <button type="button" onClick={()=>setShowPedidoModal(false)} className="w-8 h-8 bg-white/20 rounded-full">✕</button>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
                  {(()=>{
                    let lista = orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id);
                    if(clienteCardFiltro==="finalizados") lista = lista.filter(o=>o.status==="finalizado");
                    if(clienteCardFiltro==="andamento") lista = lista.filter(o=> ["aguardando_comprovante","aguardando_confirmacao_adm","aguardando_montador","aceito"].includes(o.status));
                    if(clienteCardFiltro==="cancelados") lista = lista.filter(o=>o.status==="cancelado");
                    if(lista.length===0) return <div className="text-center py-10 text-gray-400 text-sm">Nenhum pedido nesta categoria<br/>{clienteCardFiltro==="andamento"?"Você não tem pedidos em andamento - Tudo finalizado ✅":""}</div>;
                    return lista.map(p=>{
                      const montador = users.find(u=>u.id==p.montador_id || u.id==p.montadorId);
                      const podeCancelar = !p.montador_id && !p.montadorId && p.status!=="aceito" && p.status!=="finalizado" && p.status!=="cancelado";
                      return (
                        <div key={p.id} className="bg-white p-4 rounded-2xl shadow border">
                          <div className="flex justify-between"><b>#{p.id} {p.cupom?`🎟️ ${p.cupom}`:""}</b><span className={`text-[10px] px-2 py-1 rounded-full ${p.status==="finalizado"?"bg-green-100 text-green-700":p.status==="aceito"?"bg-blue-100 text-blue-700":p.status==="cancelado"?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`}>{p.status}</span></div>
                          <div className="text-xs mt-2"><b>Itens:</b> {(p.itens||[]).map(i=>`${i.nome} x${i.qtd}`).join(", ")}</div>
                          <div className="text-xs"><b>Total:</b> {formatBRL(p.total)} - {p.cidade}</div>
                          <div className="text-[10px] text-gray-500">{p.endereco} - {p.bairro} | {p.data} {p.horario}</div>
                          {p.comprovante && <div className="text-[10px] mt-1">📎 Comprovante enviado</div>}
                          
                          {p.status==="aceito" && montador && (
                            <div className="mt-3 bg-blue-50 border-2 border-blue-400 p-3 rounded-xl">
                              <div className="text-xs font-bold text-[#0A2A6B]">🔧 Montador que aceitou seu pedido:</div>
                              <div className="mt-2"><b>{montador.nome}</b> ⭐{Number(montador.avaliacao||5).toFixed(1)} - {montador.total_servicos||0} serviços</div>
                              <div className="text-xs">📱 {montador.telefone} | 📍 {montador.cidade}</div>
                              <div className="text-xs">Cidades: {(montador.cidades||[]).join(", ")}</div>
                              <div className="text-xs font-bold text-green-700 mt-1">⏱️ Aceito {p.aceiteAt? new Date(p.aceiteAt).toLocaleString("pt-BR") : p.aceite_at? new Date(p.aceite_at).toLocaleString("pt-BR"):""} - Chega em 30min</div>
                              <div className="flex gap-2 mt-2">
                                <a href={`https://wa.me/55${(montador.telefone||"").replace(/\D/g,"")}?text=Olá ${montador.nome}, pedido #${p.id}`} target="_blank" className="flex-1 bg-green-600 text-white text-center py-2 rounded-xl text-xs font-bold">💬 WhatsApp Montador</a>
                                <a href={`tel:${montador.telefone}`} className="flex-1 bg-[#0A2A6B] text-white text-center py-2 rounded-xl text-xs font-bold">📞 Ligar</a>
                              </div>
                              <div className="mt-2 text-[10px] bg-red-50 border border-red-200 p-2 rounded-xl text-red-700">❌ Não pode cancelar após montador aceitar - Fale com suporte 24h 💬</div>
                            </div>
                          )}

                          {p.status!=="aceito" && p.status!=="finalizado" && p.status!=="cancelado" && (
                            <div className="mt-3">
                              {p.montador_id || p.montadorId ? (
                                <div className="text-[10px] bg-red-50 p-2 rounded-xl text-red-700">❌ Já tem montador - Não pode cancelar</div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="text-[10px] text-gray-600">Status: {p.status} - {p.status==="aguardando_comprovante"?"Envie comprovante":p.status==="aguardando_confirmacao_adm"?"Aguardando ADM confirmar":"Aguardando montador aceitar"}</div>
                                  <button type="button" onClick={()=>cancelarPedido(p.id)} className="bg-red-600 text-white w-full py-3 rounded-xl font-bold text-xs">❌ Cancelar Pedido - Sem montador ainda</button>
                                </div>
                              )}
                            </div>
                          )}

                          {p.status==="finalizado" && (
                            <div className="mt-3 bg-green-50 p-3 rounded-xl text-xs">
                              <div>✅ Finalizado {p.finalizadoAt? new Date(p.finalizadoAt).toLocaleString("pt-BR") : p.finalizado_at? new Date(p.finalizado_at).toLocaleString("pt-BR"):""}</div>
                              {montador && <div>Por: {montador.nome} ⭐{Number(montador.avaliacao||5).toFixed(1)}</div>}
                              {p.avaliacao ? <div>Avaliação: {p.avaliacao.nota} ⭐ - "{p.avaliacao.comentario}"</div> : <div className="mt-2 text-yellow-700 font-bold">⭐ Avalie na lista principal</div>}
                            </div>
                          )}

                          {p.status==="cancelado" && <div className="mt-2 text-xs bg-red-50 p-2 rounded-xl">❌ Cancelado em {p.cancelado_at? new Date(p.cancelado_at).toLocaleString("pt-BR"):""} - Fale com suporte se pagou</div>}
                        </div>
                      )
                    })
                  })()}
                </div>
                <div className="p-3 bg-white border-t flex gap-2">
                  <button type="button" onClick={()=>setShowPedidoModal(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold text-sm">Fechar</button>
                  <button type="button" onClick={()=>{ setShowPedidoModal(false); setShowSupportChat(true); }} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold text-sm">💬 Suporte 24h</button>
                </div>
              </div>
            </div>
          )}

          {/* Zona de Perigo - Mantida com todas funções */}
          <div className="mt-8 bg-red-50 border-2 border-red-200 p-5 rounded-3xl">
            <div className="font-bold text-red-700">⚠️ Zona de Perigo - LGPD - Ao Vivo 🟢</div>
            <div className="text-xs text-gray-600 mt-1">Excluir permanentemente seu cadastro e todos os seus dados do site. Essa ação não pode ser desfeita.<br/>Regra automática: A cada 5 pedidos sua lista é limpa automaticamente para privacidade.</div>
            <div className="mt-2 text-[10px] bg-white p-2 rounded-xl">Pedidos atuais: {orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id).length} | Próxima limpeza automática em: {5 - (orders.filter(o=>o.cliente_id==currentUser.id||o.clienteId==currentUser.id).length %5 ||5)} pedidos</div>
            <button type="button" onClick={excluirMeuCadastro} className="bg-red-600 text-white w-full py-3 rounded-xl mt-3 font-bold text-sm">🗑️ Excluir meu cadastro permanentemente</button>
          </div>
        </div>
      )}

      {view==="admin" && currentUser?.role==="admin" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h2 className="font-bold text-2xl">Painel ADM - Tempo Real {isLive?"🟢":"🔴 Reconectando"} 🔊</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="bg-[#0A2A6B] text-white p-4 rounded-2xl"><div className="text-xs">Total Usuários</div><div className="text-xl font-bold">{users.length}</div><div className="text-[10px]">{users.filter(u=>u.role==="cliente").length} clientes + {users.filter(u=>u.role==="montador").length} montadores</div></div>
            <div className="bg-green-600 text-white p-4 rounded-2xl"><div className="text-xs">Clientes</div><div className="text-xl font-bold">{users.filter(u=>u.role==="cliente").length}</div><div className="text-[10px]">{users.filter(u=>u.role==="cliente" && new Date(u.created_at||Date.now()) > new Date(Date.now()-7*24*60*60*1000)).length} novos essa semana</div></div>
            <div className="bg-[#FF7A00] text-white p-4 rounded-2xl"><div className="text-xs">Montadores</div><div className="text-xl font-bold">{users.filter(u=>u.role==="montador").length}</div><div className="text-[10px]">{users.filter(u=>u.role==="montador" && u.disponivel).length} online 🟢 | {users.filter(u=>u.role==="montador" && !u.disponivel).length} offline 🔴</div></div>
            <div className="bg-gray-800 text-white p-4 rounded-2xl"><div className="text-xs">Conversão</div><div className="text-xl font-bold">{orders.length>0? Math.round((orders.filter(o=>o.status==="finalizado").length/orders.length)*100):0}%</div><div className="text-[10px]">{orders.filter(o=>o.status==="finalizado").length}/{orders.length} finalizados</div></div>
          </div>
          <div className="flex gap-2 flex-wrap mt-4">
            <button type="button" onClick={()=>setAdminTab("pedidos")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="pedidos"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Pedidos ({orders.length})</button>
            <button type="button" onClick={()=>setAdminTab("suporte")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="suporte"?"bg-green-600 text-white animate-pulse":"bg-white"}`}>Suporte 24h 💬 ({supportMessages.filter(m=>!m.from_admin && !m.lida).length})</button>
            <button type="button" onClick={()=>setAdminTab("montadores")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="montadores"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Montadores</button>
            <button type="button" onClick={()=>setAdminTab("bonus")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="bonus"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Bônus 🎁</button>
            <button type="button" onClick={()=>setAdminTab("cupons")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="cupons"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Cupons 🎟️ ({coupons.length})</button>
            <button type="button" onClick={()=>setAdminTab("usuarios")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="usuarios"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Usuários 👥</button>
            <button type="button" onClick={()=>setAdminTab("financeiro")} className={`px-4 py-2 rounded-full text-sm ${adminTab==="financeiro"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Financeiro</button>
          </div>

          {adminTab==="pedidos" && (
            <div className="mt-4 space-y-3">
              {orders.map(o=>{
                const cliente = users.find(u=>u.id==o.cliente_id);
                const montador = users.find(u=>u.id==o.montador_id);
                return (
                  <div key={o.id} className="bg-white p-4 rounded-3xl shadow">
                    <div className="flex justify-between"><b>#{o.id} - {o.cidade} {o.cupom?`🎟️ ${o.cupom}`:""} {o.bonus_montador?"🎁 BÔNUS 100%":""}</b><span className="text-xs bg-yellow-100 px-2 py-1 rounded-full">{o.status}</span></div>
                    <div className="text-xs">Cliente: {cliente?.nome} {cliente?.telefone} - {o.endereco}</div>
                    <div className="text-xs">Itens: {(o.itens||[]).map(i=>`${i.nome} x${i.qtd}`).join(", ")} - Total {formatBRL(o.total)}</div>
                    {o.comprovante && <img src={o.comprovante} className="w-32 h-32 object-cover mt-2 rounded-xl" alt="comprovante"/>}
                    <div className="flex gap-2 mt-3">
                      {o.status==="aguardando_confirmacao_adm" && <button type="button" onClick={()=>confirmarPagamentoADM(o.id)} className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold">✅ Confirmar Pagamento 🔔</button>}
                      <button type="button" onClick={()=>cancelarPedido(o.id)} className="bg-red-100 text-red-600 px-4 py-2 rounded-xl text-xs">Cancelar</button>
                      {montador && <span className="text-xs">Montador: {montador.nome} {montador.telefone}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {adminTab==="suporte" && (
            <div className="mt-4 grid md:grid-cols-[300px_1fr] gap-4 h-[70vh]">
              <div className="bg-white rounded-3xl shadow p-3 overflow-auto">
                <h3 className="font-bold text-sm">💬 Suporte 24h - {supportMessages.filter(m=>!m.from_admin).length} msgs</h3>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={()=>setSupportTab("todos")} className={`text-[10px] px-2 py-1 rounded-full ${supportTab==="todos"?"bg-[#0A2A6B] text-white":"bg-gray-100"}`}>Todos</button>
                  <button type="button" onClick={()=>setSupportTab("nao-lidas")} className={`text-[10px] px-2 py-1 rounded-full ${supportTab==="nao-lidas"?"bg-red-500 text-white":"bg-gray-100"}`}>Não lidas ({supportMessages.filter(m=>!m.from_admin && !m.lida).length})</button>
                </div>
                <div className="mt-3 space-y-2">
                  {[...new Map(supportMessages.map(m=>[m.user_id, m])).values()].filter(u=> supportTab==="nao-lidas" ? supportMessages.some(msg=>msg.user_id==u.user_id && !msg.from_admin && !msg.lida) : true).map(conversa=>{
                    const userMsgs = supportMessages.filter(m=>m.user_id==conversa.user_id);
                    const naoLidas = userMsgs.filter(m=>!m.from_admin && !m.lida).length;
                    const ultima = userMsgs[userMsgs.length-1];
                    return (
                      <div key={conversa.user_id} onClick={()=>setSelectedSupportUser(conversa.user_id)} className={`p-3 rounded-xl cursor-pointer border ${selectedSupportUser==conversa.user_id?"bg-[#0A2A6B] text-white":"bg-gray-50"} ${naoLidas>0?"border-red-300 animate-pulse":""}`}>
                        <div className="flex justify-between"><b className="text-xs">{conversa.user_nome} - {conversa.user_role}</b>{naoLidas>0 && <span className="bg-red-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{naoLidas}</span>}</div>
                        <div className="text-[10px] opacity-70 truncate">{ultima?.mensagem?.slice(0,40)}...</div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="bg-white rounded-3xl shadow flex flex-col overflow-hidden">
                {!selectedSupportUser ? <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Selecione conversa para responder em tempo real 💬</div> : (
                  <>
                    <div className="bg-[#0A2A6B] text-white p-3 flex justify-between items-center">
                      <div><b className="text-sm">Chat com {users.find(u=>u.id==selectedSupportUser)?.nome||""}</b><div className="text-[10px] opacity-70">Tempo real 🟢 Ao Vivo - {supportMessages.filter(m=>m.user_id==selectedSupportUser && !m.from_admin && !m.lida).length} não lidas</div></div>
                      <button type="button" onClick={async ()=>{
                        const idsParaMarcar = supportMessages.filter(m=>m.user_id==selectedSupportUser && !m.from_admin && !m.lida).map(m=>m.id);
                        if(idsParaMarcar.length===0) return notify("Nenhuma mensagem não lida","info",1);
                        const novos = supportMessages.map(m=> m.user_id==selectedSupportUser && !m.from_admin ? {...m, lida:true} : m);
                        setSupportMessages(novos);
                        localStorage.setItem("ccs_support", JSON.stringify(novos));
                        try{
                          for(let id of idsParaMarcar){
                            await supabase.from("support_messages").update({ lida: true }).eq("id", id);
                          }
                        }catch(e){ console.log("Erro marcar lida Supabase", e); }
                        notify(`✅ ${idsParaMarcar.length} mensagem(ns) marcada(s) como lida(s) 🟢`,"success",2);
                      }} className="text-[10px] bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-full font-bold">✅ Marcar como lida ({supportMessages.filter(m=>m.user_id==selectedSupportUser && !m.from_admin && !m.lida).length})</button>
                    </div>
                    <div className="flex-1 overflow-auto p-3 space-y-2 bg-gray-50">
                      {supportMessages.filter(m=>m.user_id==selectedSupportUser).map(msg=>(
                        <div key={msg.id} className={`p-3 rounded-2xl max-w-[80%] text-xs ${msg.from_admin? "bg-[#0A2A6B] text-white ml-auto" : "bg-white border"}`}>
                          <div className="font-bold text-[9px] opacity-60">{msg.from_admin?"ADM":"Cliente"} - {new Date(msg.created_at).toLocaleString("pt-BR")}</div>
                          <div className="mt-1">{msg.mensagem}</div>
                        </div>
                      ))}
                      <div ref={supportEndRef}></div>
                    </div>
                    <div className="p-3 border-t flex gap-2 bg-white">
                      <input value={supportInput} onChange={e=>setSupportInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){ responderSuporte(selectedSupportUser, supportInput); setSupportInput(""); } }} placeholder="Resposta..." className="flex-1 border rounded-full px-4 py-3 text-sm"/>
                      <button type="button" onClick={()=>{ responderSuporte(selectedSupportUser, supportInput); setSupportInput(""); }} className="bg-green-600 text-white px-6 py-3 rounded-full font-bold">Enviar 🔔</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {adminTab==="montadores" && (
            <div className="mt-4 bg-white p-4 rounded-3xl shadow">
              <h3 className="font-bold">🔧 Montadores Cadastrados - Clique para ver detalhes</h3>
              <div className="mt-3 space-y-2">
                {users.filter(u=>u.role==="montador").map(m=>(
                  <div key={m.id} onClick={()=>abrirDetalhesMontador(m.id)} className={`p-3 rounded-xl border cursor-pointer ${m.bloqueado?"bg-red-50":"hover:bg-orange-50"}`}>
                    <b className="underline text-[#0A2A6B]">{m.nome} {m.disponivel?"🟢":"🔴"} {m.bloqueado?"⛔ BLOQUEADO":""} 👁️</b> - {m.telefone} - {m.cidade} - ⭐{Number(m.avaliacao||5).toFixed(1)} - {orders.filter(o=>(o.montador_id==m.id||o.montadorId==m.id)&&o.status==="finalizado").length} finalizados
                  </div>
                ))}
              </div>
            </div>
          )}

          {adminTab==="bonus" && (
            <div className="mt-4 space-y-4">
              <div className="bg-white p-6 rounded-3xl shadow">
                <h3 className="font-bold text-lg">🎁 Bônus Montador - 6º 100%</h3>
                <div className="mt-4 grid gap-3">
                  {users.filter(u=>u.role==="montador").map(m=>{
                    const finalizados = orders.filter(o=> (o.montador_id==m.id || o.montadorId==m.id) && o.status==="finalizado").length;
                    const progresso = finalizados % 6;
                    const bonusGanhos = Math.floor(finalizados/6);
                    return (
                      <div key={m.id} onClick={()=>abrirDetalhesMontador(m.id)} className="border p-3 rounded-xl flex justify-between items-center hover:bg-yellow-50 cursor-pointer">
                        <div><b className="underline">{m.nome} 👁️</b> - {finalizados} finalizados - {bonusGanhos} bônus<br/><div className="text-xs">Progresso: {progresso}/5</div><div className="w-32 bg-gray-200 h-2 rounded-full mt-1"><div className="bg-green-600 h-2 rounded-full" style={{width: `${(progresso/6)*100}%`}}></div></div></div>
                        <div className={`text-xs px-2 py-1 rounded-full ${progresso===5?"bg-yellow-400 animate-pulse":"bg-gray-100"}`}>{progresso===5?"🔥 Próximo 100%":""}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {adminTab==="cupons" && (
            <div className="mt-4 space-y-4">
              <div className="bg-white p-6 rounded-3xl shadow">
                <h3 className="font-bold text-lg">🎟️ Criar Cupom - Tempo Real</h3>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <input value={newCoupon.code} onChange={e=>setNewCoupon({...newCoupon, code:e.target.value.toUpperCase()})} placeholder="Código ex: PRIMEIRO15" className="border rounded-xl p-3 text-sm"/>
                  <input type="number" value={newCoupon.desconto} onChange={e=>setNewCoupon({...newCoupon, desconto:e.target.value})} placeholder="% Desconto" className="border rounded-xl p-3 text-sm"/>
                  <input type="date" value={newCoupon.validade} onChange={e=>setNewCoupon({...newCoupon, validade:e.target.value})} className="border rounded-xl p-3 text-sm"/>
                  <input type="number" value={newCoupon.limite} onChange={e=>setNewCoupon({...newCoupon, limite:e.target.value})} placeholder="Limite usos" className="border rounded-xl p-3 text-sm"/>
                </div>
                <button type="button" onClick={criarCupom} className="bg-[#0A2A6B] text-white w-full py-3 rounded-xl mt-4 font-bold">+ Criar Cupom 🔔</button>
              </div>
              <div className="bg-white p-4 rounded-3xl shadow">
                <h4 className="font-bold">🎟️ Distribuir para Clientes - Tempo Real 🔔</h4>
                <div className="mt-3 grid gap-3">
                  <select value={distribuirCupom.cupomId} onChange={e=>setDistribuirCupom({...distribuirCupom, cupomId:e.target.value})} className="border rounded-xl p-3 text-sm">
                    <option value="">Selecione cupom</option>
                    {coupons.filter(c=>!c.target_user_id).map(c=><option key={c.id} value={c.id}>{c.code} - {c.desconto}% OFF</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>setDistribuirCupom({...distribuirCupom, modo:"todos"})} className={`flex-1 py-2 rounded-xl text-xs font-bold ${distribuirCupom.modo==="todos"?"bg-[#0A2A6B] text-white":"bg-gray-100"}`}>Todos ({users.filter(u=>u.role==="cliente").length})</button>
                    <button type="button" onClick={()=>setDistribuirCupom({...distribuirCupom, modo:"selecionados"})} className={`flex-1 py-2 rounded-xl text-xs font-bold ${distribuirCupom.modo==="selecionados"?"bg-[#0A2A6B] text-white":"bg-gray-100"}`}>Selecionar</button>
                  </div>
                  {distribuirCupom.modo==="selecionados" && (
                    <div className="max-h-40 overflow-auto border rounded-xl p-2 space-y-1">
                      {users.filter(u=>u.role==="cliente").map(cli=>(
                        <label key={cli.id} className="flex items-center gap-2 text-xs p-1 hover:bg-gray-50 rounded">
                          <input type="checkbox" checked={distribuirCupom.clienteIds.includes(cli.id)} onChange={e=>{ if(e.target.checked) setDistribuirCupom({...distribuirCupom, clienteIds:[...distribuirCupom.clienteIds, cli.id]}); else setDistribuirCupom({...distribuirCupom, clienteIds: distribuirCupom.clienteIds.filter(id=>id!==cli.id)}); }}/>
                          {cli.nome} - {cli.cidade} - {cli.telefone}
                        </label>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={distribuirCuponsParaClientes} className="bg-green-600 text-white w-full py-3 rounded-xl font-bold">🎟️ Distribuir com Som 🔔</button>
                </div>
              </div>
              <div className="bg-white p-4 rounded-3xl shadow">
                <h4 className="font-bold">Cupons Ativos ({coupons.length})</h4>
                <div className="mt-3 space-y-2">
                  {coupons.map(cp=>(
                    <div key={cp.id} className={`flex justify-between items-center border p-3 rounded-xl ${cp.target_user_id?"bg-green-50":""}`}>
                      <div className="text-xs"><b>{cp.code}</b> - {cp.desconto}% OFF - {cp.target_user_id?`🎯 Para: ${cp.target_nome||""}`:"🌍 Todos"} - {cp.validade? new Date(cp.validade).toLocaleDateString("pt-BR"):"sem validade"}</div>
                      <button type="button" onClick={()=>removerCupom(cp.id)} className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs">Remover</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {adminTab==="usuarios" && (
            <div className="mt-4 bg-white p-4 rounded-3xl shadow">
              <h3 className="font-bold">👥 Usuários - Total {users.length} - Clique nome montador para detalhes</h3>
              <div className="mt-4 grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-bold text-sm bg-green-100 p-2 rounded-xl">🛒 Clientes ({users.filter(u=>u.role==="cliente").length}) - Bloquear/Excluir</h4>
                  {users.filter(u=>u.role==="cliente").map(u=>(
                    <div key={u.id} className={`text-xs border-b py-2 p-2 rounded-xl mt-2 ${u.bloqueado?"bg-red-50 border-red-200":"bg-gray-50"}`}>
                      <div className="flex justify-between"><div><b>{u.nome} {u.bloqueado?"⛔ BLOQUEADO":""}</b><br/>{u.email} - {u.telefone} - {u.cidade} - Pedidos: {orders.filter(o=>o.cliente_id==u.id).length}<br/><span className="text-gray-400">{u.usuario}</span>{u.bloqueado && <div className="text-red-600 font-bold">Motivo: {u.motivo_bloqueio}</div>}</div><div className="flex flex-col gap-1"><button type="button" onClick={()=>bloquearUsuarioADM(u.id, !u.bloqueado)} className={`${u.bloqueado?"bg-green-600":"bg-orange-500"} text-white px-2 py-1 rounded-full text-[10px] font-bold`}>{u.bloqueado?"Desbloquear":"Bloquear"}</button><button type="button" onClick={()=>excluirUsuarioADM(u.id, u.nome)} className="bg-red-600 text-white px-2 py-1 rounded-full text-[10px] font-bold">Excluir</button></div></div>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="font-bold text-sm bg-orange-100 p-2 rounded-xl">🔧 Montadores ({users.filter(u=>u.role==="montador").length}) - Clique nome</h4>
                  {users.filter(u=>u.role==="montador").map(u=>(
                    <div key={u.id} className={`text-xs border-b py-2 rounded-xl p-2 mt-2 ${u.bloqueado?"bg-red-50 border border-red-300":"bg-gray-50 hover:bg-orange-50"}`}>
                      <div className="flex justify-between"><div className="flex-1 cursor-pointer" onClick={()=>abrirDetalhesMontador(u.id)}><b className="underline text-[#0A2A6B]">{u.nome} {u.disponivel?"🟢":"🔴"} {u.bloqueado?"⛔ BLOQUEADO":""} 👁️</b><br/>{u.telefone} - CPF: {u.cpf} - PIX: {u.pix}<br/>Cidades: {(u.cidades||[]).join(", ")} - ⭐{Number(u.avaliacao||5).toFixed(1)}<br/><span className="text-gray-400">{u.usuario} | {u.email}</span>{u.bloqueado && <div className="text-red-600 font-bold">Motivo: {u.motivo_bloqueio}</div>}</div><div className="flex flex-col gap-1 ml-2"><button type="button" onClick={(e)=>{ e.stopPropagation(); bloquearUsuarioADM(u.id, !u.bloqueado); }} className={`${u.bloqueado?"bg-green-600":"bg-orange-500"} text-white px-2 py-1 rounded-full text-[10px] font-bold`}>{u.bloqueado?"Desbloquear":"Bloquear má conduta"}</button><button type="button" onClick={(e)=>{ e.stopPropagation(); excluirUsuarioADM(u.id, u.nome); }} className="bg-red-600 text-white px-2 py-1 rounded-full text-[10px] font-bold">Excluir</button></div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {adminTab==="financeiro" && (
            <div className="mt-4 bg-white p-6 rounded-3xl shadow">
              <h3 className="font-bold text-lg">💰 Financeiro - Ao Vivo 🟢</h3>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[#0A2A6B] text-white p-4 rounded-2xl"><div className="text-xs">Total Bruto</div><div className="font-bold">{formatBRL(orders.filter(o=>o.status==="finalizado").reduce((s,p)=>s+p.total,0))}</div></div>
                <div className="bg-green-600 text-white p-4 rounded-2xl"><div className="text-xs">Taxa Plataforma 10%</div><div className="font-bold">{formatBRL(orders.filter(o=>o.status==="finalizado" && !o.bonus_montador).reduce((s,p)=>s+p.total*0.1,0))}</div></div>
                <div className="bg-[#FF7A00] text-white p-4 rounded-2xl"><div className="text-xs">Pago Montadores</div><div className="font-bold">{formatBRL(orders.filter(o=>o.status==="finalizado").reduce((s,p)=>s+(p.bonus_montador?p.total:p.total*0.9),0))}</div></div>
                <div className="bg-gray-800 text-white p-4 rounded-2xl"><div className="text-xs">Pedidos Finalizados</div><div className="font-bold">{orders.filter(o=>o.status==="finalizado").length}</div></div>
              </div>
              <div className="mt-4 text-xs">
                {orders.filter(o=>o.status==="finalizado").map(o=>{
                  const cliente = users.find(u=>u.id==o.cliente_id);
                  const montador = users.find(u=>u.id==o.montador_id);
                  return <div key={o.id} className="flex justify-between border-b py-2"><span>#{o.id} {o.cidade} - {formatBRL(o.total)} {o.bonus_montador?"🎁 100%":"90%"} - Cliente: {cliente?.nome} - Montador: {montador?.nome}</span></div>
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {view==="montador" && <MontadorPanel currentUser={currentUser} setCurrentUser={setCurrentUser} users={users} orders={orders} isLive={isLive} aceitarPedido={aceitarPedido} finalizarPedido={finalizarPedido} formatBRL={formatBRL} notify={notify} setUsers={setUsers} excluirMeuCadastro={excluirMeuCadastro} />}

      {showAuth && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 max-h-[90vh] overflow-auto">
            <div className="flex justify-between mb-4"><h3 className="font-bold">{isLogin?"Entrar":"Cadastrar"} {authMode} {isLive?"🟢":"🔴"}</h3><button type="button" onClick={()=>setShowAuth(false)}>✕</button></div>
            {!isLogin ? <RegisterForm mode={authMode} onSubmit={handleRegister}/> : <LoginForm onSubmit={handleLogin}/>}
            <button type="button" onClick={()=>setIsLogin(!isLogin)} className="text-xs underline w-full text-center mt-3">{isLogin?"Criar conta":"Já tenho conta"}</button>
          </div>
        </div>
      )}

      {toast && <div className={`fixed bottom-20 left-4 right-4 p-4 rounded-2xl z-[60] shadow-2xl font-bold text-center animate-bounce ${toastType==="success"?"bg-green-600 text-white":toastType==="error"?"bg-red-600 text-white":"bg-[#0A2A6B] text-white"}`}>🔔 {toast}</div>}
      
      <button type="button" onClick={()=>setShowSupportChat(!showSupportChat)} className="fixed bottom-4 right-4 z-50 w-16 h-16 bg-gradient-to-br from-green-500 to-[#0A2A6B] text-white rounded-full shadow-2xl flex items-center justify-center text-2xl animate-pulse hover:scale-110 transition-transform">
        💬
        {currentUser && supportMessages.filter(m=> m.user_id==currentUser?.id && m.from_admin && !m.lida).length>0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">{supportMessages.filter(m=> m.user_id==currentUser?.id && m.from_admin && !m.lida).length}</span>}
        {currentUser?.role==="admin" && supportMessages.filter(m=> !m.from_admin && !m.lida).length>0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold animate-bounce">{supportMessages.filter(m=> !m.from_admin && !m.lida).length}</span>}
      </button>
      <div className="fixed bottom-20 right-4 z-40 bg-[#0A2A6B] text-white text-[10px] px-2 py-1 rounded-full shadow hidden md:block">Suporte 24h {isLive?"🟢":"🔴"} - Última sync {new Date(lastFetchRef.current).toLocaleTimeString("pt-BR")}</div>

      {showSupportChat && (
        <div className="fixed bottom-24 right-4 z-50 w-[92vw] md:w-96 h-[70vh] md:h-[500px] bg-white rounded-3xl shadow-2xl border flex flex-col overflow-hidden">
          <div className="bg-gradient-to-r from-[#0A2A6B] to-green-600 text-white p-4 flex justify-between items-center">
            <div><div className="font-bold">💬 Suporte 24h {isLive?"🟢 Ao Vivo":"🔴 Reconectando"}</div><div className="text-[10px] opacity-80">{currentUser? `Olá ${currentUser.nome}` : "Faça login"} - Resposta 5min</div></div>
            <button type="button" onClick={()=>setShowSupportChat(false)} className="w-8 h-8 bg-white/20 rounded-full">✕</button>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2 bg-gray-50">
            {supportMessages.filter(m=> currentUser?.role==="admin" ? true : m.user_id==currentUser?.id).length===0 && <div className="text-center text-gray-400 text-xs mt-10">👋 Olá! Como podemos ajudar? Envie dúvida - ADM responde em tempo real com som 🔔<br/><br/>🟢 Sistema online 100% - Reconexão automática &lt;5s</div>}
            {supportMessages.filter(m=> currentUser?.role!=="admin" ? m.user_id==currentUser?.id : true).map(msg=>(
              <div key={msg.id} className={`p-3 rounded-2xl max-w-[85%] text-xs ${msg.from_admin? "bg-[#0A2A6B] text-white" : "bg-white border shadow ml-auto"}`}>
                <div className="font-bold text-[10px] opacity-70">{msg.from_admin? "👨‍💼 ADM" : `${msg.user_nome} (${msg.user_role})` } - {new Date(msg.created_at).toLocaleTimeString("pt-BR")}</div>
                <div className="mt-1">{msg.mensagem}</div>
              </div>
            ))}
            <div ref={supportEndRef}></div>
          </div>
          <div className="p-3 bg-white border-t flex gap-2">
            <input value={supportInput} onChange={e=>setSupportInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") enviarMensagemSuporte(); }} placeholder={currentUser? "Digite..." : "Faça login"} disabled={!currentUser} className="flex-1 border rounded-full px-4 py-3 text-sm"/>
            <button type="button" onClick={enviarMensagemSuporte} disabled={!currentUser} className="bg-green-600 text-white w-12 h-12 rounded-full font-bold">➤</button>
          </div>
        </div>
      )}

      {showMontadorModal && selectedMontadorDetail && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-[#0A2A6B] text-white p-4 flex justify-between items-center rounded-t-3xl">
              <div><div className="font-bold text-lg">🔧 {selectedMontadorDetail.nome}</div><div className="text-xs opacity-80">{selectedMontadorDetail.disponivel?"🟢 ONLINE":"🔴 OFFLINE"} - ⭐ {Number(selectedMontadorDetail.avaliacao||5).toFixed(1)} {isLive?"🟢 Ao Vivo":""}</div></div>
              <button type="button" onClick={()=>setShowMontadorModal(false)} className="w-8 h-8 bg-white/20 rounded-full">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 p-3 rounded-xl"><div className="text-[10px] text-gray-500">Nome</div><div className="font-bold text-sm">{selectedMontadorDetail.nome}</div></div>
                <div className="bg-gray-50 p-3 rounded-xl"><div className="text-[10px] text-gray-500">Cidade Base</div><div className="font-bold text-sm">{selectedMontadorDetail.cidade}</div></div>
                <div className="bg-gray-50 p-3 rounded-xl"><div className="text-[10px] text-gray-500">Telefone</div><div className="font-bold text-sm">{selectedMontadorDetail.telefone}</div><a href={`https://wa.me/55${(selectedMontadorDetail.telefone||"").replace(/\D/g,"")}`} target="_blank" className="text-[10px] text-green-600 underline">WhatsApp</a></div>
                <div className="bg-gray-50 p-3 rounded-xl"><div className="text-[10px] text-gray-500">E-mail</div><div className="font-bold text-xs">{selectedMontadorDetail.email}</div></div>
                <div className="bg-gray-50 p-3 rounded-xl"><div className="text-[10px] text-gray-500">CPF</div><div className="font-bold text-sm">{selectedMontadorDetail.cpf}</div></div>
                <div className="bg-gray-50 p-3 rounded-xl"><div className="text-[10px] text-gray-500">PIX</div><div className="font-bold text-sm">{selectedMontadorDetail.pix}</div></div>
              </div>
              <div className="bg-orange-50 p-3 rounded-xl"><div className="font-bold text-sm">📍 Cidades que atende</div><div className="flex flex-wrap gap-2 mt-2">{(selectedMontadorDetail.cidades||[]).map(c=><span key={c} className="bg-[#0A2A6B] text-white text-xs px-3 py-1 rounded-full">{c}</span>)}</div></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#0A2A6B] text-white p-3 rounded-xl text-center"><div className="text-[10px]">Finalizados</div><div className="font-bold text-lg">{orders.filter(o=>(o.montador_id==selectedMontadorDetail.id||o.montadorId==selectedMontadorDetail.id)&&o.status==="finalizado").length}</div></div>
                <div className="bg-green-600 text-white p-3 rounded-xl text-center"><div className="text-[10px]">Ganho</div><div className="font-bold text-sm">{formatBRL(orders.filter(o=>(o.montador_id==selectedMontadorDetail.id||o.montadorId==selectedMontadorDetail.id)&&o.status==="finalizado").reduce((s,p)=>s+(p.bonus_montador?p.total:p.total*0.9),0))}</div></div>
                <div className="bg-[#FF7A00] text-white p-3 rounded-xl text-center"><div className="text-[10px]">Avaliação</div><div className="font-bold">⭐ {Number(selectedMontadorDetail.avaliacao||5).toFixed(1)}</div></div>
              </div>
              <div className="bg-red-50 border border-red-200 p-3 rounded-xl">
                <div className="font-bold text-sm text-red-700">⚠️ Ações ADM - Má conduta</div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={()=>bloquearUsuarioADM(selectedMontadorDetail.id, !selectedMontadorDetail.bloqueado)} className={`flex-1 ${selectedMontadorDetail.bloqueado?"bg-green-600":"bg-orange-500"} text-white py-2 rounded-xl font-bold text-xs`}>{selectedMontadorDetail.bloqueado?"✅ Desbloquear":"⛔ Bloquear"}</button>
                  <button type="button" onClick={()=>{ if(window.confirm(`Excluir ${selectedMontadorDetail.nome}?`)){ excluirUsuarioADM(selectedMontadorDetail.id, selectedMontadorDetail.nome); setShowMontadorModal(false); } }} className="flex-1 bg-red-600 text-white py-2 rounded-xl font-bold text-xs">🗑️ Excluir</button>
                </div>
                {selectedMontadorDetail.bloqueado && <div className="mt-2 text-xs text-red-700 font-bold">Bloqueado: {selectedMontadorDetail.motivo_bloqueio}</div>}
              </div>
              <div className="flex gap-2">
                <a href={`https://wa.me/55${(selectedMontadorDetail.telefone||"").replace(/\D/g,"")}`} target="_blank" className="flex-1 bg-green-600 text-white text-center py-3 rounded-xl font-bold">💬 WhatsApp</a>
                <a href={`tel:${selectedMontadorDetail.telefone}`} className="flex-1 bg-[#0A2A6B] text-white text-center py-3 rounded-xl font-bold">📞 Ligar</a>
                <button type="button" onClick={()=>setShowMontadorModal(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="bg-[#0A2A6B] text-white text-center py-6 mt-10"><div>2026 - Contato Certo SP - AO VIVO {isLive?"🟢 Online 100% Tempo Real":"🔴 Reconectando <5s"} 🔊 Suporte 24h 💬 - Watchdog ativo</div><div className="text-xs">contatocerto.prestadores@gmail.com - (18) 99148-8302 - Última sync {new Date(lastFetchRef.current).toLocaleTimeString("pt-BR")} - Tentativas {reconnectAttemptsRef.current}</div></footer>
    </div>
  );
}

function MontadorPanel({ currentUser, setCurrentUser, users, orders, isLive, aceitarPedido, finalizarPedido, formatBRL, notify, setUsers, excluirMeuCadastro }){
  const [tab, setTab] = React.useState("disponiveis");
  const [novaCidade, setNovaCidade] = React.useState("");
  const [timerNow, setTimerNow] = React.useState(Date.now());
  React.useEffect(()=>{ const id=setInterval(()=>setTimerNow(Date.now()),1000); return ()=>clearInterval(id); },[]);

  const toggleDisponivel = async ()=>{
    const novo = !currentUser.disponivel;
    const updated = { ...currentUser, disponivel: novo };
    setCurrentUser(updated);
    try { await supabase.from("users").update({ disponivel: novo }).eq("id", currentUser.id); } catch(e){}
    setUsers(prev=>prev.map(u=>u.id==currentUser.id? {...u, disponivel:novo}:u));
    notify(novo? "✅ ONLINE - receberá pedidos com SOM":"⛔ OFFLINE", novo?"success":"info", novo?3:1);
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
  const disponiveis = orders.filter(o=> o.status==="aguardando_montador");

  const totalGanho = meusFinalizados.reduce((s,p)=>s + (p.bonus_montador ? (p.ganho_montador||p.total) : p.total*0.9), 0);
  const totalBruto = meusFinalizados.reduce((s,p)=>s + p.total, 0);

  const tempoRestante = (aceiteAt)=>{
    if(!aceiteAt) return "30:00";
    const aceite = new Date(aceiteAt).getTime();
    const limite = aceite + 30*60*1000;
    const diff = limite - timerNow;
    if(diff<=0) return "00:00 ATRASADO!";
    const m = Math.floor(diff/60000); const s = Math.floor((diff%60000)/1000);
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-white rounded-3xl p-4 shadow flex justify-between items-center">
        <div><b>👨‍🔧 {currentUser.nome}</b> - {currentUser.cidade} - {isLive?"🟢 Ao Vivo":"🔴 Reconectando"}<br/><span className="text-xs">{currentUser.telefone} - ⭐{Number(currentUser.avaliacao||5).toFixed(1)} | {currentUser.total_servicos||0} serviços</span></div>
        <button type="button" onClick={toggleDisponivel} className={`px-4 py-2 rounded-full text-sm font-bold ${currentUser.disponivel?"bg-green-500 text-white animate-pulse":"bg-red-500 text-white"}`}>{currentUser.disponivel?"🟢 ONLINE":"🔴 OFFLINE"}</button>
      </div>
      <div className="flex gap-2 mt-4 overflow-auto">
        <button type="button" onClick={()=>setTab("disponiveis")} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab==="disponiveis"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Disponíveis ({disponiveis.length}) 🔔</button>
        <button type="button" onClick={()=>setTab("aceitos")} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab==="aceitos"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Aceitos ({meusAceitos.length}) ⏱️</button>
        <button type="button" onClick={()=>setTab("finalizados")} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab==="finalizados"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Finalizados ({meusFinalizados.length})</button>
        <button type="button" onClick={()=>setTab("financeiro")} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab==="financeiro"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Financeiro 💰</button>
        <button type="button" onClick={()=>setTab("perfil")} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab==="perfil"?"bg-[#0A2A6B] text-white":"bg-white"}`}>Perfil</button>
      </div>

      {tab==="disponiveis" && (
        <div className="mt-4 space-y-3">
          {!currentUser.disponivel && <div className="bg-red-100 p-4 rounded-2xl text-sm text-red-700 font-bold">⛔ Você está OFFLINE - Fique ONLINE para receber pedidos com SOM</div>}
          {disponiveis.map(p=>{
            const cliente = users.find(u=>u.id==p.cliente_id);
            return (
              <div key={p.id} className="bg-white p-4 rounded-3xl shadow border-l-4 border-l-green-500">
                <div className="flex justify-between"><b>#{p.id} - {p.cidade}</b><span className="text-xs bg-green-100 px-2 py-1 rounded-full animate-pulse">🔔 NOVO - {isLive?"🟢 Ao Vivo":"🔴"}</span></div>
                <div className="text-sm">Cliente: {cliente?.nome} - {p.endereco}</div>
                <div className="text-sm">Itens: {(p.itens||[]).map(i=>`${i.nome} x${i.qtd}`).join(", ")}</div>
                <div className="font-bold text-[#FF7A00]">{formatBRL(p.total)} {p.cupom?`🎟️ ${p.cupom}`:""}</div>
                <button type="button" onClick={()=>aceitarPedido(p.id)} className="bg-green-600 text-white w-full py-3 rounded-xl mt-3 font-bold">✅ Aceitar Pedido - 30min para chegar 🔔</button>
              </div>
            )
          })}
          {disponiveis.length===0 && <div className="text-center text-gray-400 mt-10">Nenhum pedido disponível - Fique online e aguarde com SOM 🔔<br/>🟢 Sistema 100% online - Watchdog &lt;5s</div>}
        </div>
      )}

      {tab==="aceitos" && (
        <div className="mt-4 space-y-3">
          {meusAceitos.map(p=>{
            const cliente = users.find(u=>u.id==p.cliente_id);
            return (
              <div key={p.id} className="bg-white p-4 rounded-3xl shadow border-2 border-blue-300">
                <div className="flex justify-between"><b>#{p.id} - {p.cidade}</b><span className="text-xs bg-blue-100 px-2 py-1 rounded-full">⏱️ {tempoRestante(p.aceiteAt||p.aceite_at)}</span></div>
                <div className="text-sm">Cliente: {cliente?.nome} - {cliente?.telefone} - {p.endereco}</div>
                <div className="text-sm">{formatBRL(p.total)}</div>
                <div className="flex gap-2 mt-3">
                  <a href={`https://wa.me/55${(cliente?.telefone||"").replace(/\D/g,"")}`} target="_blank" className="flex-1 bg-green-600 text-white text-center py-3 rounded-xl font-bold">💬 WhatsApp</a>
                  <a href={`tel:${cliente?.telefone}`} className="flex-1 bg-[#0A2A6B] text-white text-center py-3 rounded-xl font-bold">📞 Ligar</a>
                </div>
                <button type="button" onClick={()=>finalizarPedido(p.id)} className="bg-[#FF7A00] text-white w-full py-3 rounded-xl mt-3 font-bold">✅ Finalizar Serviço</button>
              </div>
            )
          })}
          {meusAceitos.length===0 && <div className="text-center text-gray-400 mt-10">Nenhum pedido aceito</div>}
        </div>
      )}

      {tab==="finalizados" && (
        <div className="mt-4 space-y-3">
          {meusFinalizados.map(p=>(
            <div key={p.id} className={`bg-white p-4 rounded-3xl shadow ${p.bonus_montador?"border-2 border-yellow-400 bg-yellow-50":""}`}>
              <div className="flex justify-between"><b>#{p.id} {p.bonus_montador?"🎁 BÔNUS 100%":""}</b><span className="text-xs bg-green-100 px-2 py-1 rounded-full">Finalizado</span></div>
              <div className="text-sm">{p.cidade} - {formatBRL(p.bonus_montador? (p.ganho_montador||p.total) : p.total*0.9)} {p.bonus_montador?` (100% ao invés de ${formatBRL(p.total*0.9)})`:"(90%)"}</div>
              <div className="text-xs">{p.avaliacao?`⭐${p.avaliacao.nota} - "${p.avaliacao.comentario}"`:"Aguardando avaliação do cliente"}</div>
            </div>
          ))}
        </div>
      )}

      {tab==="financeiro" && (
        <div className="mt-4 space-y-4">
          {(()=>{
            const progresso = meusFinalizados.length % 6;
            const bonusGanhos = Math.floor(meusFinalizados.length/6);
            const faltam = progresso===0 && meusFinalizados.length>0 ? 0 : 6 - progresso;
            const totalBonus = meusFinalizados.filter(p=>p.bonus_montador).reduce((s,p)=>s+(p.ganho_montador||p.total),0);
            return (
              <div className="bg-gradient-to-r from-yellow-400 to-[#FF7A00] p-[1px] rounded-3xl">
                <div className="bg-white rounded-[22px] p-4">
                  <div className="font-bold">🎁 Bônus: 6º serviço 100% seu! {isLive?"🟢 Ao Vivo":"🔴"}</div>
                  <div className="mt-2 flex justify-between items-center">
                    <div><div className="text-xs">Progresso</div><div className="font-bold">{progresso}/5 para bônus</div><div className="text-[10px] text-gray-500">{bonusGanhos} bônus ganhos | Total bônus {formatBRL(totalBonus)}</div></div>
                    <div className={`px-3 py-2 rounded-full text-xs font-bold ${progresso===5?"bg-yellow-400 animate-pulse":"bg-gray-100"}`}>{progresso===5?"🔥 Próximo é 100%!":"Faltam "+(faltam===6?5:faltam)}</div>
                  </div>
                  <div className="w-full bg-gray-200 h-3 rounded-full mt-3"><div className="bg-gradient-to-r from-green-500 to-[#FF7A00] h-3 rounded-full transition-all" style={{width: `${(progresso/6)*100}%`}}></div></div>
                  <div className="text-[10px] text-gray-500 mt-1">A cada 5 serviços, o 6º você ganha 100% - Watchdog garante online</div>
                </div>
              </div>
            )
          })()}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0A2A6B] text-white p-4 rounded-2xl"><div className="text-xs">Total Bruto</div><div className="text-xl font-bold">{formatBRL(totalBruto)}</div></div>
            <div className="bg-green-600 text-white p-4 rounded-2xl"><div className="text-xs">Seu Ganho (90%+100% bônus)</div><div className="text-xl font-bold">{formatBRL(totalGanho)}</div></div>
            <div className="bg-[#FF7A00] text-white p-4 rounded-2xl"><div className="text-xs">Finalizados</div><div className="text-xl font-bold">{meusFinalizados.length}</div></div>
            <div className="bg-gray-800 text-white p-4 rounded-2xl"><div className="text-xs">Avaliação</div><div className="text-xl font-bold">⭐ {Number(currentUser.avaliacao||5).toFixed(1)}</div></div>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow">
            <div className="font-bold">Como funciona pagamento - Tempo Real 🟢</div>
            <div className="text-xs mt-2">Cliente paga 100% para ADM (contatocerto.prestadores@gmail.com). ADM confirma. Você aceita e finaliza. Você recebe 90% via PIX {currentUser.pix} em até 24h. No 6º serviço (bônus) recebe 100%! Watchdog garante site nunca offline &gt;5s.</div>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow">
            <div className="font-bold">Histórico de ganhos - Ao Vivo 🟢</div>
            {meusFinalizados.map(p=>{
              const ganho = p.bonus_montador ? (p.ganho_montador||p.total) : p.total*0.9;
              return <div key={p.id} className={`flex justify-between text-xs py-2 border-b ${p.bonus_montador?"bg-yellow-50 font-bold":""}`}>#{p.id} {p.bonus_montador?"🎁 BÔNUS 100%":""} - {p.cidade} - {formatBRL(ganho)} - {p.data}</div>
            })}
          </div>
        </div>
      )}

      {tab==="perfil" && (
        <div className="mt-4 space-y-4">
          <div className="bg-white p-4 rounded-3xl shadow">
            <div className="font-bold">👤 {currentUser.nome} {isLive?"🟢 Ao Vivo":"🔴"}</div>
            <div className="text-xs">📱 {currentUser.telefone} | ✉️ {currentUser.email}</div>
            <div className="text-xs">CPF: {currentUser.cpf} | PIX: {currentUser.pix}</div>
            <div className="text-xs">⭐ {Number(currentUser.avaliacao||5).toFixed(1)} | {currentUser.total_servicos||0} serviços | {currentUser.disponivel?"🟢 Online":"🔴 Offline"}</div>
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
          </div>
          <div className="bg-white p-4 rounded-3xl shadow">
            <div className="font-bold">⭐ Avaliações recebidas - Ao Vivo 🟢</div>
            {orders.filter(o=> (o.montador_id==currentUser.id) && o.avaliacao).map(o=><div key={o.id} className="text-xs mt-2 p-2 bg-yellow-50 rounded-xl">#{o.id} ⭐{o.avaliacao.nota} - "{o.avaliacao.comentario}" - Cliente: {o.avaliacao.cliente}</div>)}
            {orders.filter(o=> o.montador_id==currentUser.id && o.avaliacao).length===0 && <div className="text-xs text-gray-400 mt-2">Nenhuma avaliação ainda.</div>}
          </div>
          <div className="bg-red-50 border border-red-200 p-4 rounded-3xl">
            <div className="font-bold text-red-700 text-sm">⚠️ Zona de Perigo - LGPD</div>
            <button type="button" onClick={()=>excluirMeuCadastro()} className="bg-red-600 text-white w-full py-3 rounded-xl mt-3 font-bold text-sm">🗑️ Excluir meu cadastro</button>
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
      <input placeholder="Chave PIX" value={f.pix} onChange={e=>setF({...f,pix:e.target.value})} className="w-full border rounded-xl p-3"/>
      <div className="flex gap-2"><input placeholder="Cidade que atende (até 3)" value={ci} onChange={e=>setCi(e.target.value)} className="flex-1 border rounded-xl p-3"/><button type="button" onClick={()=>{ if(f.cidades.length<3 && ci){ setF({...f,cidades:[...f.cidades,ci]}); setCi(""); } }} className="bg-gray-100 px-4 rounded-xl">+</button></div>
      <div className="flex gap-1 flex-wrap">{f.cidades.map(c=><span key={c} className="bg-[#0A2A6B] text-white text-xs px-2 py-1 rounded-full">{c}</span>)}</div>
    </>}
    <input placeholder="Usuário" value={f.usuario} onChange={e=>setF({...f,usuario:e.target.value})} className="w-full border rounded-xl p-3"/>
    <input type="password" placeholder="Senha" value={f.senha} onChange={e=>setF({...f,senha:e.target.value})} className="w-full border rounded-xl p-3"/>
    <button type="button" onClick={()=>onSubmit(f)} className="bg-[#FF7A00] text-white w-full py-4 rounded-2xl font-bold">Finalizar Cadastro 🟢 Ao Vivo</button>
  </div>;
}
function LoginForm({onSubmit}){
  const [u,setU]=useState(""); const [s,setS]=useState("");
  return <div className="space-y-3">
    <input placeholder="Seu usuário" value={u} onChange={e=>setU(e.target.value)} className="w-full border rounded-xl p-3"/>
    <input type="password" placeholder="Sua senha" value={s} onChange={e=>setS(e.target.value)} className="w-full border rounded-xl p-3"/>
    <button type="button" onClick={()=>onSubmit(u,s)} className="bg-[#0A2A6B] text-white w-full py-4 rounded-2xl font-bold">Entrar 🟢 Ao Vivo</button>
  </div>;
}

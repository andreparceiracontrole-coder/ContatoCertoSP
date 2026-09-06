
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
  const [supportInput, setSupportInput] = useState("");
  const [showSupportChat, setShowSupportChat] = useState(false);
  const [selectedSupportUser, setSelectedSupportUser] = useState(null);
  const [novaCidade, setNovaCidade] = useState("");
  const prevOrdersRef = useRef([]);
  const supportEndRef = useRef(null);
  const lastFetchRef = useRef(Date.now());

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
        let mapped = o.map(x=>({ id: x.id, clienteId: x.cliente_id, cliente_id: x.cliente_id, itens: x.itens, subtotal: x.subtotal, desconto: x.desconto, total: x.total, endereco: x.endereco, bairro: x.bairro, cidade: x.cidade, data: x.data, horario: x.horario, status: x.status, comprovante: x.comprovante, montadorId: x.montador_id, montador_id: x.montador_id, createdAt: x.created_at }));
        setOrders(mapped);
      }
    } catch(e){ setIsLive(true); }
    setLoading(false);
    lastFetchRef.current = Date.now();
  };

  useEffect(()=>{ fetchData(); },[]);
  useEffect(()=>{
    let channel = supabase.channel("realtime-premium-v7")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ()=>fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, ()=>fetchData())
      .subscribe((s)=>{ if(s==="SUBSCRIBED"){ setIsLive(true); lastFetchRef.current=Date.now(); } });
    const fast = setInterval(()=>fetchData(), 2000);
    const watchdog = setInterval(()=>{
      if(Date.now() - lastFetchRef.current > 5000){ setIsLive(false); fetchData(); } else { setIsLive(true); }
    },1000);
    return ()=>{ supabase.removeChannel(channel); clearInterval(fast); clearInterval(watchdog); };
  },[]);

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
    const newUser = { id: Date.now(), nome: formData.nome, cidade: formData.cidade, telefone: formData.telefone, email: formData.email, usuario: formData.usuario, senha: formData.senha, role: formData.role, cpf: formData.cpf||null, pix: formData.pix||null, cidades: formData.cidades||[], foto: formData.foto||"", avaliacao:5, total_servicos:0, disponivel:true };
    try { await supabase.from("users").insert(newUser); } catch {}
    const all=[...users,newUser]; setUsers(all);
    setCurrentUser(newUser); setShowAuth(false); setView(newUser.role==="cliente"?"cliente":"montador");
  };
  const handleLogin = async (usuario, senha)=>{
    if(usuario==="AndreSousa84" && senha==="20112024"){ setCurrentUser({id:0,role:"admin",nome:"ADM"}); setShowAuth(false); setView("admin"); return; }
    const u = users.find(x=>x.usuario===usuario && x.senha===senha);
    if(!u) return notify("Usuario ou senha invalidos","error",1);
    setCurrentUser(u); setShowAuth(false); setView(u.role==="cliente"?"cliente":"montador");
  };
  const addToCart = (item)=>{ const exist = cart.find(c=>c.id===item.id); if(exist) setCart(cart.map(c=>c.id===item.id?{...c,qtd:c.qtd+1}:c)); else setCart([...cart,{...item,qtd:1}]); notify(item.nome+" adicionado","info",1); };
  const subtotal = cart.reduce((s,i)=>s+i.preco*i.qtd,0);
  const descontoQtd = calcularDesconto(cart.reduce((s,i)=>s+i.qtd,0), subtotal);
  const totalSemCupom = subtotal - descontoQtd;
  const descontoCupom = appliedCoupon ? totalSemCupom * (appliedCoupon.desconto/100) : 0;
  const total = totalSemCupom - descontoCupom;
  const criarPedido = async ()=>{
    if(!orderForm.endereco || !orderForm.cidade) return notify("Preencha endereco e cidade","error",1);
    const pedidoDB = { id: Date.now(), cliente_id: currentUser.id, itens: cart, subtotal, desconto: descontoQtd+descontoCupom, total, endereco: orderForm.endereco, bairro: orderForm.bairro, cidade: orderForm.cidade, data: orderForm.data, horario: orderForm.horario, status:"aguardando_comprovante", comprovante:"", montador_id: null, created_at: new Date().toISOString() };
    const local = { ...pedidoDB, clienteId: pedidoDB.cliente_id, createdAt: pedidoDB.created_at };
    setOrders(prev=>[local,...prev]); setCart([]); setOrderStep(3);
    try { await supabase.from("orders").insert(pedidoDB); } catch {}
  };

  if(loading) return <div className="min-h-screen bg-[#0A2A6B] flex items-center justify-center"><div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-[#F8FAFF]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap'); body{font-family:Inter,sans-serif}`}</style>
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] flex items-center justify-center text-white font-black">CC</div><div><div className="font-black leading-none text-[#0A2A6B]">CONTATO CERTO SP</div><div className="text-[10px] font-bold tracking-widest text-[#FF7A00]">PREMIUM • {isLive ? "AO VIVO 🟢" : "OFFLINE 🔴"}</div></div></div>
          <div className="flex items-center gap-2">
            {!currentUser ? (<><button onClick={()=>{setAuthMode("cliente"); setIsLogin(true); setShowAuth(true);}} className="px-4 py-2 rounded-full text-sm font-semibold">Entrar</button><button onClick={()=>{setAuthMode("cliente"); setIsLogin(false); setShowAuth(true);}} className="px-6 py-2.5 rounded-full bg-[#0A2A6B] text-white font-bold text-sm shadow-lg">Começar</button></>) : (<button onClick={()=>{setCurrentUser(null); setView("home"); localStorage.removeItem("ccs_current");}} className="w-9 h-9 rounded-full bg-slate-100">↪</button>)}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-[#0A2A6B] via-[#102a7a] to-[#1e3a8a] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,122,0,0.18),_transparent_60%)]"></div>
        <div className="relative max-w-7xl mx-auto px-6 py-16 lg:py-24 grid lg:grid-cols-2 gap-10">
          <div>
            <div className="inline-flex px-3 py-1 rounded-full bg-white/10 border border-white/10 text-[11px] font-bold tracking-widest">🟢 330 SERVICOS • TODO SP • REALTIME 2S • WATCHDOG 5S</div>
            <h1 className="mt-6 text-[42px] sm:text-[56px] font-black leading-[0.9] tracking-tight">MONTADOR<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF7A00] to-[#ffb347]">VERIFICADO</span><br/>EM 30 MIN</h1>
            <p className="mt-5 text-white/70 max-w-xl leading-relaxed">Layout premium sem quebrar realtime. Supabase ao vivo, foto obrigatoria galeria (sem camera) 300x300 ~30KB, pagamento 10% + 90% PIX, som e vibracao.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={()=>setShowOrderFlow(true)} className="px-8 py-4 rounded-full bg-white text-[#0A2A6B] font-black shadow-xl hover:-translate-y-0.5 transition">SOLICITAR MONTADOR →</button>
              <button onClick={()=>{setAuthMode("montador"); setIsLogin(false); setShowAuth(true);}} className="px-8 py-4 rounded-full bg-[#FF7A00] text-white font-black shadow-xl shadow-[#FF7A00]/20">SOU MONTADOR • 90% PIX</button>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-4"><div className="text-2xl font-black">{users.filter(u=>u.role==="montador").length}</div><div className="text-[10px] tracking-widest opacity-60 font-bold">MONTADORES</div></div>
              <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-4"><div className="text-2xl font-black">{orders.length}</div><div className="text-[10px] tracking-widest opacity-60 font-bold">AO VIVO</div></div>
              <div className="bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-4"><div className="text-2xl font-black">4.9</div><div className="text-[10px] tracking-widest opacity-60 font-bold">AVALIACAO</div></div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-to-br from-[#FF7A00]/20 to-transparent rounded-[2.5rem] blur-2xl"></div>
            <div className="relative bg-white rounded-[2rem] p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] border">
              <div className="flex justify-between items-center"><div className="font-black text-[#0A2A6B]">Catalogo Premium • {filteredCatalog.length}</div><div className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">{isLive ? "🟢 AO VIVO" : "🔴 OFF"}</div></div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar mesa, guarda-roupa, estante..." className="mt-4 w-full bg-slate-100 rounded-full px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#0A2A6B]/20"/>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                {["TODAS", ...CATEGORIAS.slice(0,6)].map(cat=>(
                  <button key={cat} onClick={()=>setCatFilter(cat)} className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${catFilter===cat ? "bg-[#0A2A6B] text-white border-[#0A2A6B]" : "bg-white text-slate-500 border-slate-200"}`}>{cat}</button>
                ))}
              </div>
              <div className="mt-4 space-y-2 max-h-[340px] overflow-auto pr-1">
                {filteredCatalog.slice(0,8).map(item=>(
                  <div key={item.id} className="group flex items-center justify-between p-3 rounded-2xl border border-slate-100 hover:border-[#0A2A6B]/20 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-bold">{item.categoria.slice(0,3)}</div><div><div className="text-sm font-bold leading-tight">{item.nome}</div><div className="text-xs text-slate-500">{formatBRL(item.preco)}</div></div></div>
                    <button onClick={()=>addToCart(item)} className="w-8 h-8 rounded-full bg-[#FF7A00] text-white font-black group-hover:scale-110 transition">+</button>
                  </div>
                ))}
              </div>
              {cart.length>0 && (
                <div className="mt-4 p-4 rounded-2xl bg-[#0A2A6B] text-white"><div className="flex justify-between text-sm font-bold"><span>{cart.length} itens</span><span>{formatBRL(total)}</span></div><button onClick={()=>{setOrderStep(1); setShowOrderFlow(true);}} className="mt-3 w-full py-3 rounded-full bg-white text-[#0A2A6B] font-black text-sm">CONTINUAR • {formatBRL(total)}</button></div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between"><h2 className="text-[22px] font-black tracking-tight">SERVICOS PREMIUM • {filteredCatalog.length} • GALERIA SEM CAMERA</h2><div className="hidden sm:flex text-[11px] font-bold tracking-widest text-slate-400">REALTIME 2S • WATCHDOG 5S • 300x300</div></div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCatalog.map(item=>(
            <div key={item.id} className="group bg-white rounded-[1.8rem] border border-slate-200/70 shadow-sm hover:shadow-[0_20px_60px_-20px_rgba(10,42,107,0.3)] hover:-translate-y-1 transition-all duration-300 overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between"><span className="px-3 py-1 rounded-full bg-[#0A2A6B]/5 border border-[#0A2A6B]/10 text-[10px] font-black tracking-widest text-[#0A2A6B]">{item.categoria}</span><span className="text-[11px] font-bold text-slate-400">ID {item.id}</span></div>
                <div className="mt-4 font-extrabold text-[16px] leading-tight">{item.nome}</div>
                <div className="mt-2 text-[13px] text-slate-500 leading-relaxed line-clamp-2">{item.descricao||"Montagem profissional verificada com foto obrigatoria galeria, avaliacao 5 estrelas, pagamento seguro 10% + 90% PIX."}</div>
                <div className="mt-5 flex items-center justify-between"><div><div className="text-[11px] font-bold tracking-widest text-slate-400">A PARTIR DE</div><div className="text-[22px] font-black text-[#FF7A00]">{formatBRL(item.preco)}</div></div><button onClick={()=>addToCart(item)} className="px-6 py-2.5 rounded-full bg-[#0A2A6B] text-white text-xs font-black tracking-widest hover:bg-black transition">ADD +</button></div>
              </div>
              <div className="h-1 bg-gradient-to-r from-[#0A2A6B] to-[#FF7A00] opacity-0 group-hover:opacity-100 transition"></div>
            </div>
          ))}
        </div>
      </div>

      {showOrderFlow && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="w-full sm:max-w-xl bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b flex justify-between items-center"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-[#0A2A6B] text-white flex items-center justify-center font-black">{orderStep}</div><div><div className="font-black">Checkout Premium</div><div className="text-xs text-slate-500">Realtime {isLive ? "🟢 Ao Vivo" : "🔴 Offline"} • Galeria fix</div></div></div><button onClick={()=>setShowOrderFlow(false)} className="w-9 h-9 rounded-full bg-slate-100">✕</button></div>
            <div className="p-6 overflow-auto flex-1">
              {orderStep===1 && (<div className="space-y-3">{cart.map(i=><div key={i.id} className="flex justify-between p-3 bg-slate-100 rounded-xl"><span className="text-sm font-bold">{i.nome} x{i.qtd}</span><span className="font-black">{formatBRL(i.preco*i.qtd)}</span></div>)}<div className="p-4 rounded-2xl bg-[#0A2A6B] text-white flex justify-between font-black"><span>Total</span><span>{formatBRL(total)}</span></div><button onClick={()=>setOrderStep(2)} className="w-full py-4 rounded-full bg-[#FF7A00] text-white font-black">CONTINUAR → ENDERECO</button></div>)}
              {orderStep===2 && (<div className="space-y-3"><input value={orderForm.endereco} onChange={e=>setOrderForm({...orderForm,endereco:e.target.value})} placeholder="Endereco completo" className="w-full p-4 bg-slate-100 rounded-2xl outline-none"/><div className="grid grid-cols-2 gap-3"><input value={orderForm.bairro} onChange={e=>setOrderForm({...orderForm,bairro:e.target.value})} placeholder="Bairro" className="p-4 bg-slate-100 rounded-2xl outline-none"/><input value={orderForm.cidade} onChange={e=>setOrderForm({...orderForm,cidade:e.target.value})} placeholder="Cidade SP" className="p-4 bg-slate-100 rounded-2xl outline-none"/></div><div className="grid grid-cols-2 gap-3"><input type="date" value={orderForm.data} onChange={e=>setOrderForm({...orderForm,data:e.target.value})} className="p-4 bg-slate-100 rounded-2xl outline-none"/><input type="time" value={orderForm.horario} onChange={e=>setOrderForm({...orderForm,horario:e.target.value})} className="p-4 bg-slate-100 rounded-2xl outline-none"/></div><button onClick={criarPedido} className="w-full py-4 rounded-full bg-[#0A2A6B] text-white font-black">CRIAR PEDIDO • SUPABASE LIVE 🟢</button></div>)}
              {orderStep===3 && (<div className="text-center space-y-4"><div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-3xl">✓</div><div className="font-black text-xl">Pedido criado!</div><div className="p-4 rounded-2xl bg-slate-900 text-white font-mono text-sm">PIX: {PIX_KEY}<br/>Total: {formatBRL(total)}</div><button onClick={()=>{navigator.clipboard.writeText(PIX_KEY); notify("PIX copiado!");}} className="w-full py-4 rounded-full bg-[#0A2A6B] text-white font-black">COPIAR CHAVE PIX</button><a href={`https://wa.me/${WHATSAPP}?text=Pedido ${formatBRL(total)}`} target="_blank" className="block w-full py-4 rounded-full bg-[#FF7A00] text-white font-black text-center">WHATSAPP (18) 99148-8302</a></div>)}
            </div>
          </div>
        </div>
      )}

      {showAuth && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl max-h-[90vh] overflow-auto">
            <div className="p-6 bg-gradient-to-br from-[#0A2A6B] to-[#1e40af] text-white flex justify-between"><div><div className="font-black text-lg">{isLogin?"Bem-vindo de volta":"Criar conta premium"}</div><div className="text-xs opacity-70">{authMode.toUpperCase()} • AO VIVO 🟢 • GALERIA SEM CAMERA</div></div><button onClick={()=>setShowAuth(false)} className="w-8 h-8 rounded-full bg-white/10">✕</button></div>
            <div className="p-6">{!isLogin ? <RegisterForm mode={authMode} onSubmit={handleRegister}/> : <LoginForm onSubmit={handleLogin}/>} <button onClick={()=>setIsLogin(!isLogin)} className="w-full mt-4 text-xs font-bold text-slate-500">{isLogin?"Criar conta":"Ja tenho conta"}</button></div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl text-sm font-bold">{toast}</div>}

      <footer className="mt-16 border-t bg-white">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row justify-between gap-3">
          <div><div className="font-black">CONTATO CERTO SP • PREMIUM</div><div className="text-xs text-slate-500">Realtime 2s • Watchdog 5s • Foto galeria 300x300 sem camera • {isLive ? "🟢 Online" : "🔴 Offline"}</div></div>
          <div className="text-xs text-slate-500">contatocerto.prestadores@gmail.com • (18) 99148-8302</div>
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
    if(file.size>5*1024*1024){ alert("Foto muito grande!"); return; }
    setUploadingFoto(true);
    try{
      const compressed = await compressImage(file, 300, 0.7);
      setF({...f, foto: compressed});
      setPreviewFoto(compressed);
    }catch{}
    setUploadingFoto(false);
  };
  return <div className="space-y-3">
    <input placeholder="Nome completo" value={f.nome} onChange={e=>setF({...f,nome:e.target.value})} className="w-full bg-slate-100 rounded-xl p-3 outline-none"/>
    <input placeholder="Cidade SP" value={f.cidade} onChange={e=>setF({...f,cidade:e.target.value})} className="w-full bg-slate-100 rounded-xl p-3 outline-none"/>
    <input placeholder="WhatsApp (18)" value={f.telefone} onChange={e=>setF({...f,telefone:e.target.value})} className="w-full bg-slate-100 rounded-xl p-3 outline-none"/>
    <input placeholder="E-mail" value={f.email} onChange={e=>setF({...f,email:e.target.value})} className="w-full bg-slate-100 rounded-xl p-3 outline-none"/>
    {mode==="montador" && <>
      <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-2xl">
        <div className="font-black text-xs tracking-widest text-amber-800">📸 FOTO PERFIL OBRIGATORIA • GALERIA SEM CAMERA</div>
        <div className="flex gap-3 mt-3">
          <div className="w-16 h-16 bg-white rounded-full overflow-hidden border flex items-center justify-center">{previewFoto ? <img src={previewFoto} className="w-full h-full object-cover"/> : <span className="text-[10px]">Sem foto</span>}</div>
          <div className="flex-1"><input type="file" accept="image/*" onChange={handleFoto} className="w-full text-xs p-2 bg-white border-2 border-dashed rounded-xl"/><div className="text-[10px] mt-1">GALERIA • JPG/PNG 5MB • 300x300 • SEM CAMERA</div>{uploadingFoto && <div className="text-xs">Compactando...</div>}{previewFoto && <div className="text-xs text-green-600">Foto pronta!</div>}</div>
        </div>
        {!f.foto && <div className="mt-2 text-[11px] font-bold text-red-600">⚠️ Foto obrigatoria!</div>}
      </div>
      <input placeholder="CPF" value={f.cpf} onChange={e=>setF({...f,cpf:e.target.value})} className="w-full bg-slate-100 rounded-xl p-3"/>
      <input placeholder="Chave PIX" value={f.pix} onChange={e=>setF({...f,pix:e.target.value})} className="w-full bg-slate-100 rounded-xl p-3"/>
      <div className="flex gap-2"><input placeholder="Cidade que atende" value={ci} onChange={e=>setCi(e.target.value)} className="flex-1 bg-slate-100 rounded-xl p-3"/><button type="button" onClick={()=>{ if(f.cidades.length<3 && ci){ setF({...f,cidades:[...f.cidades,ci]}); setCi(""); } }} className="px-4 bg-slate-900 text-white rounded-xl">+</button></div>
      <div className="flex gap-1 flex-wrap">{f.cidades.map(c=><span key={c} className="bg-[#0A2A6B] text-white text-xs px-2 py-1 rounded-full">{c}</span>)}</div>
    </>}
    <input placeholder="Usuario" value={f.usuario} onChange={e=>setF({...f,usuario:e.target.value})} className="w-full bg-slate-100 rounded-xl p-3"/>
    <input type="password" placeholder="Senha" value={f.senha} onChange={e=>setF({...f,senha:e.target.value})} className="w-full bg-slate-100 rounded-xl p-3"/>
    <button type="button" onClick={()=>{ if(mode==="montador" && !f.foto){ alert("Foto obrigatoria!"); return; } onSubmit(f); }} className="w-full py-4 rounded-full bg-[#FF7A00] text-white font-black">FINALIZAR PREMIUM {mode==="montador" && !f.foto?"(FOTO OBRIG)":""}</button>
  </div>;
}
function LoginForm({onSubmit}){
  const [u,setU]=useState(""); const [s,setS]=useState("");
  return <div className="space-y-3">
    <input placeholder="Usuario" value={u} onChange={e=>setU(e.target.value)} className="w-full bg-slate-100 rounded-xl p-3"/>
    <input type="password" placeholder="Senha" value={s} onChange={e=>setS(e.target.value)} className="w-full bg-slate-100 rounded-xl p-3"/>
    <button type="button" onClick={()=>onSubmit(u,s)} className="w-full py-4 rounded-full bg-[#0A2A6B] text-white font-black">ENTRAR PREMIUM</button>
  </div>;
}

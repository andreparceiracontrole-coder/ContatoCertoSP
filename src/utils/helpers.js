export const normalize = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?\"'()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const validarCPF = (cpf) => {
  cpf = cpf.replace(/[^\d]+/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i)) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(9))) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf.charAt(i)) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(cpf.charAt(10));
};

export const formatBRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const calcularDesconto = (qtd, subtotal) => {
  if (qtd >= 3) return subtotal * 0.1;
  if (qtd === 2) return subtotal * 0.05;
  return 0;
};

export const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    setTimeout(() => o.stop(), 300);
  } catch {}
};

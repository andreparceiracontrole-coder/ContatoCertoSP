-- CONTATO CERTO SP - SCHEMA SUPABASE COMPLETO
-- Execute este SQL no SQL Editor do Supabase

-- 1. TABELA USUÁRIOS
CREATE TABLE IF NOT EXISTS public.users (
  id BIGINT PRIMARY KEY,
  nome TEXT NOT NULL,
  endereco TEXT,
  bairro TEXT,
  cidade TEXT,
  telefone TEXT,
  email TEXT UNIQUE,
  usuario TEXT UNIQUE NOT NULL,
  senha TEXT NOT NULL,
  role TEXT CHECK (role IN ('cliente','montador','admin')) NOT NULL,
  cpf TEXT,
  pix TEXT,
  cidades TEXT[],
  foto TEXT,
  avaliacao NUMERIC DEFAULT 5,
  total_servicos INT DEFAULT 0,
  disponivel BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABELA PEDIDOS
CREATE TABLE IF NOT EXISTS public.orders (
  id BIGINT PRIMARY KEY,
  cliente_id BIGINT REFERENCES public.users(id),
  itens JSONB NOT NULL,
  subtotal NUMERIC NOT NULL,
  desconto NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  endereco TEXT NOT NULL,
  bairro TEXT NOT NULL,
  cidade TEXT NOT NULL,
  data DATE NOT NULL,
  horario TEXT NOT NULL,
  foto TEXT,
  status TEXT CHECK (status IN (
    'aguardando_comprovante',
    'aguardando_confirmacao_adm',
    'aguardando_montador',
    'aceito',
    'em_andamento',
    'finalizado',
    'recusado'
  )) DEFAULT 'aguardando_comprovante',
  comprovante TEXT,
  montador_id BIGINT REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  aceite_at TIMESTAMPTZ,
  finalizado_at TIMESTAMPTZ,
  avaliacao JSONB
);

-- 3. TABELA AVALIAÇÕES (opcional, mas útil)
CREATE TABLE IF NOT EXISTS public.reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id BIGINT REFERENCES public.orders(id),
  cliente_id BIGINT REFERENCES public.users(id),
  montador_id BIGINT REFERENCES public.users(id),
  nota INT CHECK (nota BETWEEN 1 AND 5),
  comentario TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. POLÍTICAS RLS - LIBERAR TUDO PARA ANON (MVP)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all" ON public.users;
CREATE POLICY "allow all" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow all" ON public.orders;
CREATE POLICY "allow all" ON public.orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow all" ON public.reviews;
CREATE POLICY "allow all" ON public.reviews FOR ALL USING (true) WITH CHECK (true);

-- 5. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;

-- 6. STORAGE BUCKETS (crie via Dashboard ou SQL)
-- No Dashboard: Storage > Create bucket: fotos (public), comprovantes (public)

-- 7. INSERIR ADMIN
INSERT INTO public.users (id, nome, usuario, senha, role, email)
VALUES (0, 'ADM Contato Certo', 'admin', 'admin123', 'admin', 'contatocerto.prestadores@gmail.com')
ON CONFLICT (id) DO NOTHING;

-- 8. CATÁLOGO - VIEW (opcional, preços fixos no frontend)
-- Os 330 serviços ficam no frontend para garantir busca inteligente e performance
-- Mas pode criar tabela se quiser gerenciar preços pelo ADM:
CREATE TABLE IF NOT EXISTS public.catalogo (
  id INT PRIMARY KEY,
  categoria TEXT NOT NULL,
  nome TEXT NOT NULL,
  preco NUMERIC NOT NULL,
  ativo BOOLEAN DEFAULT true
);
-- Para popular, use o arquivo catalogo.sql separado ou mantenha no frontend como exigido no prompt

-- FIM

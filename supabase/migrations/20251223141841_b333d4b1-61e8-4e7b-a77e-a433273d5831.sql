-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create enum for request status
CREATE TYPE public.status_solicitacao AS ENUM ('enviada', 'aprovada', 'entregue', 'rejeitada', 'baixada', 'pendente_ajuste');

-- Create enum for AI status
CREATE TYPE public.ai_status AS ENUM ('pendente', 'ok', 'falhou');

-- Create enum for confidence level
CREATE TYPE public.nivel_confianca AS ENUM ('alta', 'media', 'baixa');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);

-- Security definer function to check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create empresas table
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fantasia TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  unidade TEXT,
  status BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create fundos table (saldo por empresa)
CREATE TABLE public.fundos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL UNIQUE,
  saldo_atual DECIMAL(12, 2) NOT NULL DEFAULT 0,
  saldo_minimo_alerta DECIMAL(12, 2) DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create solicitacoes table
CREATE TABLE public.solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE RESTRICT NOT NULL,
  solicitante_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  valor_solicitado DECIMAL(12, 2) NOT NULL,
  justificativa TEXT NOT NULL,
  categoria TEXT,
  status status_solicitacao NOT NULL DEFAULT 'enviada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Approval/delivery fields (filled by admin)
  admin_aprovador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  data_aprovacao TIMESTAMPTZ,
  valor_entregue DECIMAL(12, 2),
  forma_entrega TEXT,
  observacoes_admin TEXT,
  motivo_rejeicao TEXT,
  
  -- Baixa fields (filled by user)
  data_baixa TIMESTAMPTZ,
  valor_gasto_real DECIMAL(12, 2),
  descricao_compra TEXT,
  upload_nota_fiscal_url TEXT,
  troco_real DECIMAL(12, 2),
  
  -- AI fields
  data_emissao_nota DATE,
  numero_nota TEXT,
  nome_emitente TEXT,
  cnpj_emitente TEXT,
  ai_valor_extraido DECIMAL(12, 2),
  ai_confianca nivel_confianca,
  ai_evidencia TEXT,
  ai_status ai_status DEFAULT 'pendente',
  ai_processed_at TIMESTAMPTZ,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create notificacoes table
CREATE TABLE public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  lida BOOLEAN NOT NULL DEFAULT false,
  tipo TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fundos_updated_at BEFORE UPDATE ON public.fundos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_solicitacoes_updated_at BEFORE UPDATE ON public.solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'nome', 'Usuário'), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view own role"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Empresas policies (admins only for write, all authenticated for read)
CREATE POLICY "Authenticated users can view active empresas"
ON public.empresas FOR SELECT
TO authenticated
USING (status = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage empresas"
ON public.empresas FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Fundos policies
CREATE POLICY "Authenticated users can view fundos"
ON public.fundos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage fundos"
ON public.fundos FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Solicitacoes policies
CREATE POLICY "Users can view own solicitacoes"
ON public.solicitacoes FOR SELECT
TO authenticated
USING (solicitante_user_id = auth.uid());

CREATE POLICY "Users can create solicitacoes"
ON public.solicitacoes FOR INSERT
TO authenticated
WITH CHECK (solicitante_user_id = auth.uid());

CREATE POLICY "Users can update own solicitacoes when allowed"
ON public.solicitacoes FOR UPDATE
TO authenticated
USING (solicitante_user_id = auth.uid() AND status IN ('entregue', 'pendente_ajuste'));

CREATE POLICY "Admins can view all solicitacoes"
ON public.solicitacoes FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all solicitacoes"
ON public.solicitacoes FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Notificacoes policies
CREATE POLICY "Users can view own notifications"
ON public.notificacoes FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
ON public.notificacoes FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
ON public.notificacoes FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create storage bucket for notas fiscais
INSERT INTO storage.buckets (id, name, public) VALUES ('notas-fiscais', 'notas-fiscais', false);

-- Storage policies
CREATE POLICY "Authenticated users can upload notas"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'notas-fiscais' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own notas"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'notas-fiscais' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Admins can view all notas"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'notas-fiscais' AND public.has_role(auth.uid(), 'admin'));
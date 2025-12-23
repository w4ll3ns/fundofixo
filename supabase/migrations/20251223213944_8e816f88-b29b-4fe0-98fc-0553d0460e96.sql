-- Criar tabela de acessos consultivos por empresa
CREATE TABLE public.usuario_empresa_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  UNIQUE(user_id, empresa_id)
);

-- Habilitar RLS
ALTER TABLE public.usuario_empresa_acesso ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem gerenciar acessos
CREATE POLICY "Admins can manage acessos consultivos"
ON public.usuario_empresa_acesso FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Usuários podem ver seus próprios acessos
CREATE POLICY "Users can view own acessos"
ON public.usuario_empresa_acesso FOR SELECT
USING (user_id = auth.uid());

-- Adicionar política para usuários consultivos verem solicitações das empresas permitidas
CREATE POLICY "Consultivo users can view allowed empresas solicitacoes"
ON public.solicitacoes FOR SELECT
USING (
  empresa_id IN (
    SELECT empresa_id FROM public.usuario_empresa_acesso
    WHERE user_id = auth.uid()
  )
);

-- Adicionar política para usuários consultivos verem profiles (necessário para relatórios)
CREATE POLICY "Consultivo users can view profiles for reports"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.usuario_empresa_acesso
    WHERE user_id = auth.uid()
  )
);
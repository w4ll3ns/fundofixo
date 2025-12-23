-- Tabela para domínios de email permitidos para cadastro
CREATE TABLE public.dominios_email_permitidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Habilitar RLS
ALTER TABLE public.dominios_email_permitidos ENABLE ROW LEVEL SECURITY;

-- Policy: Admins podem gerenciar domínios
CREATE POLICY "Admins can manage dominios" 
ON public.dominios_email_permitidos
FOR ALL 
USING (has_role(auth.uid(), 'admin'));

-- Policy: Qualquer usuário autenticado pode visualizar domínios ativos (para validação no signup)
CREATE POLICY "Anyone can view active dominios for signup validation" 
ON public.dominios_email_permitidos
FOR SELECT 
USING (ativo = true);

-- Índice para busca por domínio
CREATE INDEX idx_dominios_email_dominio ON public.dominios_email_permitidos(dominio);
CREATE INDEX idx_dominios_email_ativo ON public.dominios_email_permitidos(ativo);
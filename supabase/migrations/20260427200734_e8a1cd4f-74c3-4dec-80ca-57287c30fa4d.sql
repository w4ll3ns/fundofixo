CREATE TABLE public.ai_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'lovable' CHECK (provider IN ('lovable', 'openai')),
  openai_model TEXT NOT NULL DEFAULT 'gpt-4o',
  lovable_model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai_config"
ON public.ai_config FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert ai_config"
ON public.ai_config FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update ai_config"
ON public.ai_config FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ai_config_updated_at
BEFORE UPDATE ON public.ai_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ai_config (provider, openai_model, lovable_model)
VALUES ('lovable', 'gpt-4o', 'google/gemini-2.5-flash');
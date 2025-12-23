-- Add foreign key constraint from solicitacoes.solicitante_user_id to profiles.user_id
ALTER TABLE public.solicitacoes 
ADD CONSTRAINT fk_solicitante_profile 
FOREIGN KEY (solicitante_user_id) 
REFERENCES public.profiles(user_id);
-- Allow admins to delete pending settlements (solicitacoes) and related notifications
CREATE POLICY "Admins can delete solicitacoes"
ON public.solicitacoes
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete notificacoes"
ON public.notificacoes
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
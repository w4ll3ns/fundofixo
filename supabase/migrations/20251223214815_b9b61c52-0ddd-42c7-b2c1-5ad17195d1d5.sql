-- Add storage policy for consultivo users to view notas-fiscais
CREATE POLICY "Consultivo users can view notas of allowed empresas"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'notas-fiscais'
  AND EXISTS (
    SELECT 1 FROM public.solicitacoes s
    INNER JOIN public.usuario_empresa_acesso uea ON uea.empresa_id = s.empresa_id
    WHERE uea.user_id = auth.uid()
    AND s.upload_nota_fiscal_url = name
  )
);
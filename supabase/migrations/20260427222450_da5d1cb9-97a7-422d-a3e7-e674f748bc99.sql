REVOKE EXECUTE ON FUNCTION public.aprovar_solicitacao(uuid, numeric, text, text, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finalizar_baixa(uuid, numeric, text, date, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rejeitar_solicitacao(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.aprovar_solicitacao(uuid, numeric, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_baixa(uuid, numeric, text, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rejeitar_solicitacao(uuid, text) TO authenticated;
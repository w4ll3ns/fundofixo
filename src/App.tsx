import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Auth from "./pages/Auth";
import UserDashboard from "./pages/user/Dashboard";
import MinhasSolicitacoes from "./pages/user/MinhasSolicitacoes";
import DetalhesSolicitacao from "./pages/user/DetalhesSolicitacao";
import Baixa from "./pages/user/Baixa";
import RelatoriosConsultivo from "./pages/user/RelatoriosConsultivo";
import AdminDashboard from "./pages/admin/Dashboard";
import Empresas from "./pages/admin/Empresas";
import AdminSolicitacoes from "./pages/admin/Solicitacoes";
import GestaoSaldo from "./pages/admin/GestaoSaldo";
import BaixasPendentes from "./pages/admin/BaixasPendentes";
import Configuracoes from "./pages/admin/Configuracoes";
import Relatorios from "./pages/admin/Relatorios";
import Perfil from "./pages/Perfil";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  
  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  
  return <>{children}</>;
}

function AppRoutes() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to={isAdmin ? "/admin" : "/dashboard"} /> : <Auth />} />
      <Route path="/" element={<Navigate to={user ? (isAdmin ? "/admin" : "/dashboard") : "/auth"} />} />
      
      {/* User routes - admin is redirected to /admin */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          {isAdmin ? <Navigate to="/admin" replace /> : <UserDashboard />}
        </ProtectedRoute>
      } />
      {/* Redirect /nova-solicitacao to unified page */}
      <Route path="/nova-solicitacao" element={<Navigate to="/minhas-solicitacoes?tab=nova" replace />} />
      <Route path="/minhas-solicitacoes" element={<ProtectedRoute><MinhasSolicitacoes /></ProtectedRoute>} />
      <Route path="/solicitacao/:id" element={<ProtectedRoute><DetalhesSolicitacao /></ProtectedRoute>} />
      <Route path="/baixa/:id" element={<ProtectedRoute><Baixa /></ProtectedRoute>} />
      <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute><RelatoriosConsultivo /></ProtectedRoute>} />
      
      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/empresas" element={<ProtectedRoute adminOnly><Empresas /></ProtectedRoute>} />
      <Route path="/admin/solicitacoes" element={<ProtectedRoute adminOnly><AdminSolicitacoes /></ProtectedRoute>} />
      <Route path="/admin/gestao-saldo" element={<ProtectedRoute adminOnly><GestaoSaldo /></ProtectedRoute>} />
      <Route path="/admin/configuracoes" element={<ProtectedRoute adminOnly><Configuracoes /></ProtectedRoute>} />
      <Route path="/admin/baixas-pendentes" element={<ProtectedRoute adminOnly><BaixasPendentes /></ProtectedRoute>} />
      <Route path="/admin/relatorios" element={<ProtectedRoute adminOnly><Relatorios /></ProtectedRoute>} />
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Auth from "./pages/Auth";
import UserDashboard from "./pages/user/Dashboard";
import NovaSolicitacao from "./pages/user/NovaSolicitacao";
import MinhasSolicitacoes from "./pages/user/MinhasSolicitacoes";
import Baixa from "./pages/user/Baixa";
import AdminDashboard from "./pages/admin/Dashboard";
import Empresas from "./pages/admin/Empresas";
import AdminSolicitacoes from "./pages/admin/Solicitacoes";
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
      
      {/* User routes */}
      <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
      <Route path="/nova-solicitacao" element={<ProtectedRoute><NovaSolicitacao /></ProtectedRoute>} />
      <Route path="/minhas-solicitacoes" element={<ProtectedRoute><MinhasSolicitacoes /></ProtectedRoute>} />
      <Route path="/baixa/:id" element={<ProtectedRoute><Baixa /></ProtectedRoute>} />
      
      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/empresas" element={<ProtectedRoute adminOnly><Empresas /></ProtectedRoute>} />
      <Route path="/admin/solicitacoes" element={<ProtectedRoute adminOnly><AdminSolicitacoes /></ProtectedRoute>} />
      
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

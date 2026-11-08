import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import FreelancerPreviewPage from './components/pages/FreelancerPreviewPage';
import ClientPreviewPage from './components/pages/ClientPreviewPage';
import BrandPreviewPage from './components/pages/BrandPreviewPage';
import PublicBookingPreviewPage from './components/pages/PublicBookingPreviewPage';

const toasterStyle = {
  background: '#141414',
  border: '1px solid rgba(212,175,55,0.3)',
  color: 'white',
  borderRadius: '16px',
  padding: '16px 20px',
  gap: '12px',
  fontSize: '14px',
  lineHeight: '1.5',
  boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
};

// These previews deliberately have no Auth, tenant or Firebase imports.
export default function PreviewApp() {
  return <BrowserRouter>
    <Routes>
      <Route path="/freelancer-preview" element={<FreelancerPreviewPage />} />
      <Route path="/client-preview" element={<ClientPreviewPage />} />
      <Route path="/brand-preview" element={<BrandPreviewPage />} />
      <Route path="/book/amine-fade-studio" element={<PublicBookingPreviewPage />} />
      <Route path="*" element={<Navigate to="/freelancer-preview" replace />} />
    </Routes>
    <Toaster position="top-center" richColors toastOptions={{ style: toasterStyle }} />
  </BrowserRouter>;
}

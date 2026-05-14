import { Component, ReactNode } from 'react';
import { Scissors, RefreshCw, AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('🚨 ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
              <AlertTriangle className="w-10 h-10 text-red-400" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-4">
              <Scissors className="w-6 h-6 text-[#D4AF37]" />
              <span className="text-xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">Elite Cuts</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Une erreur est survenue</h1>
            <p className="text-white/50 text-sm mb-8 font-mono bg-white/5 p-3 rounded-lg border border-white/10">
              {this.state.error?.message || 'Erreur inconnue'}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-xl font-bold hover:shadow-lg hover:shadow-[#D4AF37]/40 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Retour à l'accueil
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

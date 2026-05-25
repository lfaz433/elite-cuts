import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { 
  Scissors, Rocket, Calendar, Users, DollarSign, BarChart3, 
  Bell, Settings, CreditCard, HelpCircle, ChevronRight, Menu, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type DocsLang = 'fr' | 'en';

const CONTENT = {
  fr: {
    title: "Documentation Barbeboard",
    backHome: "Retour à l'accueil",
    sections: [
      { id: 'demarrage', icon: <Rocket size={18} />, title: '🚀 Démarrage rapide' },
      { id: 'reservations', icon: <Calendar size={18} />, title: '📅 Réservations' },
      { id: 'equipe', icon: <Users size={18} />, title: "👥 Gestion d'équipe" },
      { id: 'caisse', icon: <DollarSign size={18} />, title: '💰 Caisse & Ventes' },
      { id: 'rapports', icon: <BarChart3 size={18} />, title: '📊 Rapports & Analytiques' },
      { id: 'notifications', icon: <Bell size={18} />, title: '🔔 Notifications' },
      { id: 'parametres', icon: <Settings size={18} />, title: '⚙️ Paramètres' },
      { id: 'abonnement', icon: <CreditCard size={18} />, title: '💳 Abonnement & Facturation' },
      { id: 'faq', icon: <HelpCircle size={18} />, title: '❓ FAQ' },
    ],
    content: {
      demarrage: {
        title: "Bienvenue sur Barbeboard",
        subtitle: "Configurez votre salon en moins de 5 minutes",
        steps: [
          { title: "Créez votre compte", desc: "Rendez-vous sur barberboard.pro et cliquez sur 'Essai gratuit 15 jours'. Entrez le nom de votre salon, choisissez votre sous-domaine et créez votre compte administrateur." },
          { title: "Configurez votre salon", desc: "Ajoutez vos coiffeurs, définissez vos services et horaires d'ouverture grâce à notre assistant d'onboarding." },
          { title: "Acceptez vos premiers clients", desc: "Partagez votre lien de réservation avec vos clients. Ils peuvent réserver en ligne sans créer de compte." }
        ],
        tip: "💡 Astuce: Votre lien de réservation est disponible sur votre tableau de bord sous la forme monSalon.barberboard.pro"
      },
      reservations: {
        title: "Gestion des réservations",
        sub1: "Comment les clients réservent",
        sub1desc: "Le flux de réservation se déroule en 4 étapes simples : sélection du service → choix du coiffeur → date et heure → informations de contact.",
        sub2: "Approuver ou rejeter une réservation",
        sub2desc: "Sur votre tableau de bord, vous verrez les nouvelles réservations avec le badge 'En attente'. Cliquez pour approuver ou rejeter.",
        sub3: "Statuts des réservations",
        statuses: [
          { name: "En attente", color: "text-yellow-500", border: "border-yellow-500/20" },
          { name: "Approuvé", color: "text-green-500", border: "border-green-500/20" },
          { name: "Complété", color: "text-blue-500", border: "border-blue-500/20" },
          { name: "Rejeté", color: "text-red-500", border: "border-red-500/20" }
        ],
        sub4: "Caisse & Encaissement",
        sub4desc: "Une fois le service terminé, marquez la réservation comme 'Complétée' pour enregistrer le paiement dans votre caisse."
      },
      equipe: {
        title: "Gérer vos coiffeurs",
        sub1: "Ajouter un coiffeur",
        sub1desc: "Allez dans 'Équipe' > 'Ajouter'. Renseignez le nom, la spécialité, la photo et les horaires de travail de votre collaborateur.",
        sub2: "Portail coiffeur",
        sub2desc: "Chaque coiffeur reçoit ses propres identifiants pour se connecter et voir uniquement son agenda.",
        sub3: "Horaires de travail",
        sub3desc: "Vous pouvez définir des horaires hebdomadaires spécifiques pour chaque membre de l'équipe (jours de repos, heures de pause).",
        sub4: "Performances individuelles",
        sub4desc: "Dans l'onglet 'Analytiques', suivez les performances de chaque coiffeur (CA généré, nombre de clients)."
      },
      caisse: {
        title: "Caisse enregistreuse & Suivi financier",
        sub1: "Encaisser un paiement",
        sub1desc: "Utilisez le terminal de point de vente (POS) pour enregistrer un service complété ou une vente de produit direct.",
        sub2: "Ajouter un pourboire",
        sub2desc: "Lors de l'encaissement, vous pouvez ajouter le montant du pourboire (carte ou espèces).",
        sub3: "Gestion des dépenses",
        sub3desc: "Enregistrez vos retraits d'espèces et vos dépenses diverses directement depuis l'interface caisse pour un suivi précis.",
        sub4: "Solde de caisse",
        sub4desc: "Le solde est calculé automatiquement à la fin de la journée : revenus totaux - dépenses enregistrées."
      },
      rapports: {
        title: "Rapports et analyses",
        sub1: "Vue d'ensemble financière",
        sub1desc: "Visualisez vos revenus totaux, pourboires, dépenses et le solde net sur une période donnée.",
        sub2: "Rapport par coiffeur",
        sub2desc: "Mesurez la rentabilité de chaque membre de votre équipe avec des indicateurs de performance clairs.",
        sub3: "Services les plus vendus",
        sub3desc: "Identifiez les coupes ou soins qui génèrent le plus de chiffre d'affaires (par montant et par volume).",
        sub4: "Exporter les données",
        comingSoon: "Bientôt disponible"
      },
      notifications: {
        title: "Système de notifications",
        sub1: "Notifications in-app",
        sub1desc: "Utilisez l'icône de cloche en haut à droite. Un badge rouge indique le nombre de notifications non lues. Cliquez pour voir le flux.",
        sub2: "Notifications push",
        sub2desc: "Lors de votre première connexion, autorisez les notifications navigateur pour être alerté en temps réel même si l'application est en arrière-plan.",
        sub3: "Types de notifications",
        table: [
          { type: "Nouvelle réservation", desc: "Lorsqu'un client réserve en ligne" },
          { type: "Réservation approuvée", desc: "Envoyée au client (SMS/Push)" },
          { type: "Réservation rejetée", desc: "Envoyée au client avec le motif" }
        ]
      },
      parametres: {
        title: "Paramètres du salon",
        sub1: "Personnalisation",
        sub1desc: "Changez le nom de votre salon, vos couleurs de marque (accent principal) et votre logo depuis 'Paramètres > Marque'.",
        sub2: "Horaires d'ouverture",
        sub2desc: "Mettez à jour vos horaires d'ouverture hebdomadaires globaux. Ces horaires limitent les plages de réservation en ligne.",
        sub3: "Réservations en ligne",
        sub3desc: "Activez ou désactivez la possibilité pour les clients de réserver de manière autonome."
      },
      abonnement: {
        title: "Gérer votre abonnement",
        plans: [
          { name: "Basic", price: "€29/mois", feat: "2 coiffeurs maximum" },
          { name: "Pro", price: "€59/mois", feat: "8 coiffeurs + analytiques avancés" },
          { name: "Enterprise", price: "€99/mois", feat: "Coiffeurs illimités + domaine personnalisé" }
        ],
        sub1: "Changer de plan",
        sub1desc: "Accédez à 'Facturation' pour passer au plan supérieur. Le prorata sera calculé automatiquement.",
        sub2: "Essai gratuit",
        sub2desc: "Vous bénéficiez de 15 jours d'essai gratuit sur le plan de votre choix, sans carte bancaire requise.",
        sub3: "Paiement manuel",
        sub3desc: "Vous pouvez payer par virement bancaire ou en espèces pour un abonnement annuel. Contactez-nous à contact@barberboard.pro."
      },
      faq: {
        title: "Foire aux questions (FAQ)",
        questions: [
          { q: "Comment mes clients réservent-ils ?", a: "Ils se rendent sur votre sous-domaine (ex: salon.barberboard.pro) et réservent en 4 étapes simples sans avoir besoin de créer un compte." },
          { q: "Puis-je avoir plusieurs coiffeurs ?", a: "Oui, selon votre plan d'abonnement (jusqu'à l'illimité)." },
          { q: "Mes données sont-elles sécurisées ?", a: "Absolument. Les données de chaque salon sont complètement isolées et sécurisées." },
          { q: "Comment installer l'app sur mon téléphone ?", a: "Barbeboard est une PWA. Sur iOS, ouvrez Safari, cliquez sur 'Partager' puis 'Sur l'écran d'accueil'. Sur Android, Chrome vous proposera de l'installer." },
          { q: "Puis-je annuler à tout moment ?", a: "Oui, nos abonnements sont sans engagement." },
          { q: "Comment changer mon sous-domaine ?", a: "Pour des raisons de sécurité, le changement de sous-domaine nécessite de contacter le support." },
          { q: "L'app fonctionne-t-elle hors ligne ?", a: "Les fonctionnalités de base (comme l'affichage du planning du jour) fonctionnent hors ligne grâce au cache PWA." },
          { q: "Comment contacter le support ?", a: "Envoyez-nous un email à contact@barberboard.pro." }
        ]
      }
    }
  },
  en: {
    title: "Barbeboard Documentation",
    backHome: "Back to Home",
    sections: [
      { id: 'demarrage', icon: <Rocket size={18} />, title: '🚀 Quick Start' },
      { id: 'reservations', icon: <Calendar size={18} />, title: '📅 Bookings' },
      { id: 'equipe', icon: <Users size={18} />, title: '👥 Team Management' },
      { id: 'caisse', icon: <DollarSign size={18} />, title: '💰 Point of Sale' },
      { id: 'rapports', icon: <BarChart3 size={18} />, title: '📊 Reports & Analytics' },
      { id: 'notifications', icon: <Bell size={18} />, title: '🔔 Notifications' },
      { id: 'parametres', icon: <Settings size={18} />, title: '⚙️ Settings' },
      { id: 'abonnement', icon: <CreditCard size={18} />, title: '💳 Billing & Subscription' },
      { id: 'faq', icon: <HelpCircle size={18} />, title: '❓ FAQ' },
    ],
    content: {
      demarrage: {
        title: "Welcome to Barbeboard",
        subtitle: "Set up your barbershop in under 5 minutes",
        steps: [
          { title: "Create your account", desc: "Go to barberboard.pro and click '15-day free trial'. Enter your shop name, choose your subdomain, and create your admin account." },
          { title: "Configure your shop", desc: "Add your barbers, define your services and opening hours using our onboarding wizard." },
          { title: "Accept your first clients", desc: "Share your booking link with your clients. They can book online without creating an account." }
        ],
        tip: "💡 Tip: Your booking link is available on your dashboard in the format myShop.barberboard.pro"
      },
      reservations: {
        title: "Booking Management",
        sub1: "How clients book",
        sub1desc: "The booking flow has 4 simple steps: select service → choose barber → date and time → contact info.",
        sub2: "Approve or reject a booking",
        sub2desc: "On your dashboard, you will see new bookings with a 'Pending' badge. Click to approve or reject.",
        sub3: "Booking Statuses",
        statuses: [
          { name: "Pending", color: "text-yellow-500", border: "border-yellow-500/20" },
          { name: "Approved", color: "text-green-500", border: "border-green-500/20" },
          { name: "Completed", color: "text-blue-500", border: "border-blue-500/20" },
          { name: "Rejected", color: "text-red-500", border: "border-red-500/20" }
        ],
        sub4: "Checkout & Payment",
        sub4desc: "Once the service is finished, mark the booking as 'Completed' to record the payment in your register."
      },
      equipe: {
        title: "Manage your Barbers",
        sub1: "Add a barber",
        sub1desc: "Go to 'Team' > 'Add'. Enter the name, specialty, photo, and working hours of your staff member.",
        sub2: "Barber Portal",
        sub2desc: "Each barber gets their own login credentials to access and view their personal schedule.",
        sub3: "Working Hours",
        sub3desc: "You can set specific weekly schedules for each team member (days off, break times).",
        sub4: "Individual Performance",
        sub4desc: "In the 'Analytics' tab, track the performance of each barber (revenue generated, number of clients)."
      },
      caisse: {
        title: "Cash Register & Financial Tracking",
        sub1: "Process a payment",
        sub1desc: "Use the Point of Sale (POS) terminal to record a completed service or direct product sale.",
        sub2: "Add a tip",
        sub2desc: "During checkout, you can add a tip amount (card or cash).",
        sub3: "Expense Management",
        sub3desc: "Record your cash withdrawals and various expenses directly from the POS interface for accurate tracking.",
        sub4: "Register Balance",
        sub4desc: "The balance is calculated automatically at the end of the day: total revenue - recorded expenses."
      },
      rapports: {
        title: "Reports and Analytics",
        sub1: "Financial Overview",
        sub1desc: "View your total revenue, tips, expenses, and net balance over a given period.",
        sub2: "Report by Barber",
        sub2desc: "Measure the profitability of each team member with clear performance indicators.",
        sub3: "Top Selling Services",
        sub3desc: "Identify the haircuts or treatments that generate the most revenue (by amount and by volume).",
        sub4: "Export Data",
        comingSoon: "Coming soon"
      },
      notifications: {
        title: "Notification System",
        sub1: "In-app notifications",
        sub1desc: "Use the bell icon at the top right. A red badge indicates the number of unread notifications. Click to view the feed.",
        sub2: "Push notifications",
        sub2desc: "On your first login, allow browser notifications to be alerted in real time even if the app is in the background.",
        sub3: "Notification Types",
        table: [
          { type: "New Booking", desc: "When a client books online" },
          { type: "Booking Approved", desc: "Sent to the client (SMS/Push)" },
          { type: "Booking Rejected", desc: "Sent to the client with the reason" }
        ]
      },
      parametres: {
        title: "Shop Settings",
        sub1: "Customization",
        sub1desc: "Change your shop name, brand colors (main accent), and logo from 'Settings > Branding'.",
        sub2: "Opening Hours",
        sub2desc: "Update your global weekly opening hours. These hours limit online booking slots.",
        sub3: "Online Bookings",
        sub3desc: "Enable or disable the ability for clients to book autonomously."
      },
      abonnement: {
        title: "Manage your Subscription",
        plans: [
          { name: "Basic", price: "€29/month", feat: "Max 2 barbers" },
          { name: "Pro", price: "€59/month", feat: "8 barbers + advanced analytics" },
          { name: "Enterprise", price: "€99/month", feat: "Unlimited barbers + custom domain" }
        ],
        sub1: "Change Plan",
        sub1desc: "Go to 'Billing' to upgrade your plan. The prorated amount will be calculated automatically.",
        sub2: "Free Trial",
        sub2desc: "You get a 15-day free trial on the plan of your choice, no credit card required.",
        sub3: "Manual Payment",
        sub3desc: "You can pay by bank transfer or cash for an annual subscription. Contact us at contact@barberboard.pro."
      },
      faq: {
        title: "Frequently Asked Questions (FAQ)",
        questions: [
          { q: "How do my clients book?", a: "They go to your subdomain (e.g. shop.barberboard.pro) and book in 4 simple steps without creating an account." },
          { q: "Can I have multiple barbers?", a: "Yes, depending on your subscription plan (up to unlimited)." },
          { q: "Is my data secure?", a: "Absolutely. Each shop's data is completely isolated and secure." },
          { q: "How do I install the app on my phone?", a: "Barbeboard is a PWA. On iOS, open Safari, click 'Share' then 'Add to Home Screen'. On Android, Chrome will prompt you to install it." },
          { q: "Can I cancel anytime?", a: "Yes, our subscriptions have no long-term commitment." },
          { q: "How do I change my subdomain?", a: "For security reasons, changing your subdomain requires contacting support." },
          { q: "Does the app work offline?", a: "Basic features (like viewing today's schedule) work offline thanks to the PWA cache." },
          { q: "How do I contact support?", a: "Email us at contact@barberboard.pro." }
        ]
      }
    }
  }
};

export default function DocsPage() {
  const [lang, setLang] = useState<DocsLang>('fr');
  const [activeSection, setActiveSection] = useState('demarrage');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  
  const content = CONTENT[lang];
  const c = content.content;

  useEffect(() => {
    const saved = localStorage.getItem('barbeboard_docs_lang') as DocsLang;
    if (saved === 'fr' || saved === 'en') {
      setLang(saved);
    }
  }, []);

  const handleLangChange = (newLang: DocsLang) => {
    setLang(newLang);
    localStorage.setItem('barbeboard_docs_lang', newLang);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -60% 0px' }
    );

    content.sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [content.sections]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({
        top: el.offsetTop - 40,
        behavior: 'smooth'
      });
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col md:flex-row font-['Inter',sans-serif]">
      
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-white/10 bg-[#1a1a1a]/95 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2" onClick={() => navigate('/')}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#D4AF37]">
            <Scissors className="w-4 h-4 text-black" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight leading-none">Barbe<span className="text-[#D4AF37]">board</span></span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-[#D4AF37] p-2">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#1a1a1a]/80 backdrop-blur-xl border-r border-[#D4AF37]/20 flex flex-col transition-transform duration-300 md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:sticky md:top-0 md:h-screen`}>
        
        <div className="p-6 hidden md:flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#D4AF37]">
            <Scissors className="w-4 h-4 text-black" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight leading-none">Barbe<span className="text-[#D4AF37]">board</span></span>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-4 scrollbar-hide">
          <nav className="space-y-1">
            {content.sections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeSection === section.id
                    ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className={activeSection === section.id ? 'text-[#D4AF37]' : 'text-white/40'}>{section.icon}</span>
                {section.title}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-white/10 space-y-4 bg-black/20">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            {content.backHome}
          </button>
          
          <div className="flex items-center gap-2 p-1 bg-white/5 rounded-lg border border-white/10">
            <button 
              onClick={() => handleLangChange('fr')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${lang === 'fr' ? 'bg-[#D4AF37] text-black shadow-lg' : 'text-white/50 hover:text-white'}`}
            >
              FR
            </button>
            <button 
              onClick={() => handleLangChange('en')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${lang === 'en' ? 'bg-[#D4AF37] text-black shadow-lg' : 'text-white/50 hover:text-white'}`}
            >
              EN
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 py-12 px-6 md:px-12 lg:px-24">
        <div className="max-w-[800px] mx-auto space-y-24">
          
          <div className="mb-16">
            <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{content.title}</h1>
            <p className="text-xl text-white/50">Le guide complet pour maîtriser votre outil de gestion Barbeboard.</p>
          </div>

          {/* Section 1 */}
          <section id="demarrage" className="scroll-mt-12">
            <h2 className="text-3xl font-bold mb-8 pl-4 border-l-4 border-[#D4AF37]">{c.demarrage.title}</h2>
            <p className="text-white/70 mb-8">{c.demarrage.subtitle}</p>
            
            <div className="space-y-6">
              {c.demarrage.steps.map((step, idx) => (
                <div key={idx} className="flex gap-4 p-6 bg-white/5 border border-white/10 rounded-2xl">
                  <div className="w-8 h-8 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37] flex items-center justify-center flex-shrink-0 text-[#D4AF37] font-bold">
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                    <p className="text-white/60 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-5 bg-[#D4AF37]/10 border-l-4 border-[#D4AF37] rounded-r-xl">
              <p className="text-[#D4AF37]">{c.demarrage.tip}</p>
            </div>
          </section>

          {/* Section 2 */}
          <section id="reservations" className="scroll-mt-12">
            <h2 className="text-3xl font-bold mb-8 pl-4 border-l-4 border-[#D4AF37]">{c.reservations.title}</h2>
            
            <div className="space-y-10">
              <div>
                <h3 className="text-xl font-bold mb-3">{c.reservations.sub1}</h3>
                <p className="text-white/60 leading-relaxed">{c.reservations.sub1desc}</p>
              </div>
              
              <div>
                <h3 className="text-xl font-bold mb-3">{c.reservations.sub2}</h3>
                <p className="text-white/60 leading-relaxed">{c.reservations.sub2desc}</p>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-4">{c.reservations.sub3}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {c.reservations.statuses.map((status, idx) => (
                    <div key={idx} className={`p-4 rounded-xl border ${status.border} bg-white/5 flex flex-col items-center justify-center text-center`}>
                      <span className={`text-sm font-bold ${status.color}`}>{status.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-3">{c.reservations.sub4}</h3>
                <p className="text-white/60 leading-relaxed">{c.reservations.sub4desc}</p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section id="equipe" className="scroll-mt-12">
            <h2 className="text-3xl font-bold mb-8 pl-4 border-l-4 border-[#D4AF37]">{c.equipe.title}</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                <h3 className="text-lg font-bold mb-2">{c.equipe.sub1}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{c.equipe.sub1desc}</p>
              </div>
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                <h3 className="text-lg font-bold mb-2">{c.equipe.sub2}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{c.equipe.sub2desc}</p>
              </div>
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                <h3 className="text-lg font-bold mb-2">{c.equipe.sub3}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{c.equipe.sub3desc}</p>
              </div>
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                <h3 className="text-lg font-bold mb-2">{c.equipe.sub4}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{c.equipe.sub4desc}</p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section id="caisse" className="scroll-mt-12">
            <h2 className="text-3xl font-bold mb-8 pl-4 border-l-4 border-[#D4AF37]">{c.caisse.title}</h2>
            
            <div className="space-y-6">
              <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                <h3 className="text-lg font-bold mb-2 text-[#D4AF37]">{c.caisse.sub1}</h3>
                <p className="text-white/60 leading-relaxed">{c.caisse.sub1desc}</p>
              </div>
              <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                <h3 className="text-lg font-bold mb-2">{c.caisse.sub2}</h3>
                <p className="text-white/60 leading-relaxed">{c.caisse.sub2desc}</p>
              </div>
              <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                <h3 className="text-lg font-bold mb-2">{c.caisse.sub3}</h3>
                <p className="text-white/60 leading-relaxed">{c.caisse.sub3desc}</p>
              </div>
              <div className="p-6 bg-[#D4AF37]/5 border-l-4 border-[#D4AF37] rounded-r-2xl">
                <h3 className="text-lg font-bold mb-2">{c.caisse.sub4}</h3>
                <p className="text-white/60 leading-relaxed">{c.caisse.sub4desc}</p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section id="rapports" className="scroll-mt-12">
            <h2 className="text-3xl font-bold mb-8 pl-4 border-l-4 border-[#D4AF37]">{c.rapports.title}</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xl font-bold mb-2">{c.rapports.sub1}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{c.rapports.sub1desc}</p>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">{c.rapports.sub2}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{c.rapports.sub2desc}</p>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">{c.rapports.sub3}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{c.rapports.sub3desc}</p>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2 flex items-center gap-3">
                  {c.rapports.sub4}
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/50">{c.rapports.comingSoon}</span>
                </h3>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section id="notifications" className="scroll-mt-12">
            <h2 className="text-3xl font-bold mb-8 pl-4 border-l-4 border-[#D4AF37]">{c.notifications.title}</h2>
            
            <div className="space-y-6 mb-8">
              <div>
                <h3 className="text-xl font-bold mb-2">{c.notifications.sub1}</h3>
                <p className="text-white/60 leading-relaxed">{c.notifications.sub1desc}</p>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">{c.notifications.sub2}</h3>
                <p className="text-white/60 leading-relaxed">{c.notifications.sub2desc}</p>
              </div>
            </div>

            <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
              <div className="grid grid-cols-2 bg-white/5 p-4 border-b border-white/10">
                <span className="font-bold text-sm text-[#D4AF37] uppercase tracking-wider">{c.notifications.sub3}</span>
              </div>
              <div className="divide-y divide-white/5">
                {c.notifications.table.map((row, idx) => (
                  <div key={idx} className="grid md:grid-cols-2 p-4 gap-2">
                    <span className="font-medium">{row.type}</span>
                    <span className="text-white/50 text-sm">{row.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section id="parametres" className="scroll-mt-12">
            <h2 className="text-3xl font-bold mb-8 pl-4 border-l-4 border-[#D4AF37]">{c.parametres.title}</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                <h3 className="text-lg font-bold mb-3">{c.parametres.sub1}</h3>
                <p className="text-white/50 text-sm">{c.parametres.sub1desc}</p>
              </div>
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                <h3 className="text-lg font-bold mb-3">{c.parametres.sub2}</h3>
                <p className="text-white/50 text-sm">{c.parametres.sub2desc}</p>
              </div>
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                <h3 className="text-lg font-bold mb-3">{c.parametres.sub3}</h3>
                <p className="text-white/50 text-sm">{c.parametres.sub3desc}</p>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section id="abonnement" className="scroll-mt-12">
            <h2 className="text-3xl font-bold mb-8 pl-4 border-l-4 border-[#D4AF37]">{c.abonnement.title}</h2>
            
            <div className="grid md:grid-cols-3 gap-4 mb-10">
              {c.abonnement.plans.map((plan, idx) => (
                <div key={idx} className="p-6 bg-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 flex flex-col items-center text-center">
                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  <div className="text-2xl font-black text-[#D4AF37] mb-4">{plan.price}</div>
                  <p className="text-sm text-white/60">{plan.feat}</p>
                </div>
              ))}
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold mb-2">{c.abonnement.sub1}</h3>
                <p className="text-white/60">{c.abonnement.sub1desc}</p>
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">{c.abonnement.sub2}</h3>
                <p className="text-white/60">{c.abonnement.sub2desc}</p>
              </div>
              <div className="p-5 bg-white/5 border-l-4 border-white/20 rounded-r-xl">
                <h3 className="text-lg font-bold mb-2">{c.abonnement.sub3}</h3>
                <p className="text-white/60">{c.abonnement.sub3desc}</p>
              </div>
            </div>
          </section>

          {/* Section 9 */}
          <section id="faq" className="scroll-mt-12">
            <h2 className="text-3xl font-bold mb-8 pl-4 border-l-4 border-[#D4AF37]">{c.faq.title}</h2>
            <div className="space-y-6">
              {c.faq.questions.map((q, idx) => (
                <div key={idx} className="p-6 bg-white/5 rounded-2xl border border-white/10">
                  <h3 className="text-lg font-bold mb-3 flex items-start gap-3">
                    <span className="text-[#D4AF37]">Q.</span> {q.q}
                  </h3>
                  <p className="text-white/60 pl-8">{q.a}</p>
                </div>
              ))}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}

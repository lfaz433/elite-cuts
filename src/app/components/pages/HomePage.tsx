import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import LoginModal from '../modals/LoginModal';
import { 
  Scissors, BarChart3, Calendar, Users, Bell, Shield, 
  Smartphone, Menu, X, ChevronRight, ChevronLeft, Check, ChevronDown, Star
} from 'lucide-react';

type Lang = 'fr' | 'en' | 'ar';

const CONTENT = {
  fr: {
    nav: { features: 'Fonctionnalités', pricing: 'Tarifs', testimonials: 'Témoignages', contact: 'Contact', login: 'Se connecter', trial: 'Essai gratuit 15 jours' },
    hero: {
      badge: '🚀 Nouveau — Gestion multi-coiffeurs disponible',
      title: 'Gérez votre barbershop. Développez votre business.',
      subtitle: 'La seule plateforme conçue pour les barbershops modernes. Réservations, équipe, caisse, analytiques — tout en un tableau de bord.',
      cta1: 'Commencer gratuitement →',
      cta2: 'Voir la démo',
      trust: '✓ 15 jours gratuits · ✓ Sans carte bancaire · ✓ Annulation à tout moment'
    },
    stats: {
      shops: '500+', shopsLabel: 'Barbershops',
      revenue: '€2M+', revenueLabel: 'Revenus gérés',
      satisfaction: '98%', satisfactionLabel: 'Satisfaction',
      support: '24/7', supportLabel: 'Support'
    },
    problems: {
      title: 'Vous reconnaissez-vous ?',
      p1: { title: 'Agenda papier perdu', desc: "Vous perdez des réservations à cause d'un système désorganisé." },
      p2: { title: 'Pas de visibilité revenus', desc: "Vous ne savez jamais combien vous gagnez vraiment." },
      p3: { title: "Gestion d'équipe chaotique", desc: "Coordonner les horaires vous prend des heures chaque semaine." },
      solution: 'La solution →'
    },
    features: {
      f1: { title: 'Réservations en ligne 24h/24', desc: "Vos clients réservent depuis leur téléphone à n'importe quelle heure. Confirmations automatiques. Réduisez les no-shows de 60%.", bullets: ['Page de réservation personnalisée', 'Rappels automatiques', 'Historique client complet'] },
      f2: { title: 'Analytiques & Rapports en temps réel', desc: "Suivez vos revenus, pourboires, services les plus vendus et performances par coiffeur.", bullets: ['Rapports journaliers/hebdo/mensuels', 'Performance par coiffeur', 'Services les plus rentables'] },
      f3: { title: "Gestion d'équipe complète", desc: "Ajoutez vos coiffeurs, définissez leurs horaires, suivez leurs performances. Chaque coiffeur a son propre portail.", bullets: ['Portail coiffeur dédié', 'Planning hebdomadaire', 'Pourboires et commissions'] },
      grid: [
        { icon: Bell, title: 'Notifications push', desc: 'Alertes temps réel pour chaque réservation.' },
        { icon: Shield, title: 'Données 100% sécurisées', desc: 'Chaque salon est isolé. Vos données restent privées.' },
        { icon: Smartphone, title: 'Application Mobile PWA', desc: "Installez Barberboard sur votre iPhone ou Android en un clic. Fonctionne comme une vraie app — sans passer par l'App Store.", bullets: ['Notifications push natives', 'Fonctionne hors ligne', 'Icône sur l\'écran d\'accueil'] }
      ]
    },
    howItWorks: {
      title: 'Comment ça marche',
      s1: { title: 'Créez votre compte', desc: 'Inscription en 2 minutes. Choisissez votre sous-domaine.' },
      s2: { title: 'Configurez votre salon', desc: 'Ajoutez coiffeurs, services, horaires.' },
      s3: { title: 'Développez votre business', desc: 'Acceptez des réservations et suivez votre croissance.' }
    },
    pricing: {
      title: 'Tarifs simples et transparents',
      monthly: 'Mensuel', annual: 'Annuel (-20%)',
      basic: { name: 'Basic', desc: 'Pour les indépendants', price: 29, features: ['Maximum 2 coiffeurs', 'Réservations en ligne illimitées', 'Notifications automatiques', 'Rapports basiques', 'Support email'] },
      pro: { name: 'Pro', desc: 'Pour les salons en croissance', badge: '⭐ Le plus populaire', price: 59, features: ['Maximum 8 coiffeurs', 'Tout Basic + analytiques avancées', 'Caisse complète intégrée', 'Notifications push temps réel', 'Support prioritaire'] },
      enterprise: { name: 'Enterprise', desc: 'Pour les multi-salons', price: 99, features: ['Coiffeurs illimités', 'Tout Pro + domaine personnalisé', 'Onboarding dédié', 'Support téléphonique', 'API personnalisée'] },
      ctaFree: 'Commencer gratuitement', ctaContact: 'Nous contacter'
    },
    testimonials: {
      title: 'Ce qu\'ils en pensent',
      items: [
        { name: 'Karim B.', salon: 'Gold Cuts Paris', text: 'Barberboard a transformé mon salon. En 3 mois, mes réservations ont augmenté de 40%.' },
        { name: 'Yassine M.', salon: 'Fade Studio Lyon', text: 'La gestion de mon équipe de 5 coiffeurs est devenue simple. Je vois tout en temps réel.' },
        { name: 'Sofiane A.', salon: 'Classic Barber Marseille', text: "L'onboarding prend 5 minutes. J'étais opérationnel le jour même." },
        { name: 'Mehdi R.', salon: 'The Barber Shop Toulouse', text: 'Le lien de réservation dans ma bio Instagram a tout changé.' }
      ]
    },
    faq: {
      title: 'Questions Fréquentes',
      items: [
        { q: 'Est-ce que je peux annuler à tout moment ?', a: 'Oui, sans engagement. Annulez en un clic.' },
        { q: 'Combien de temps prend l\'installation ?', a: 'Moins de 5 minutes. Notre assistant vous guide.' },
        { q: 'Mes données sont-elles sécurisées ?', a: 'Oui. Chaque salon a ses données isolées avec Firebase.' },
        { q: 'Puis-je changer de formule ?', a: 'Oui, à tout moment. Effet immédiat.' },
        { q: 'Y a-t-il une application mobile ?', a: 'Barberboard est une PWA — installez-la sur iOS et Android.' }
      ]
    },
    cta: { title: 'Rejoignez les barbershops qui utilisent Barberboard', trust: '✓ 15 jours gratuits · ✓ Sans carte bancaire · ✓ Support inclus' },
    footer: {
      desc: 'La plateforme des barbershops modernes',
      product: 'Produit', company: 'Entreprise', legal: 'Légal',
      copyright: '© 2026 Barberboard. Tous droits réservés. Made with ❤️ for barbershops'
    },
    mockup: {
      dashboard: 'Dashboard',
      monthlyRevenue: 'Revenus ce mois',
      vsLastMonth: '+23% vs mois dernier',
      nextBooking: 'Prochaine Réservation',
      hairAndBeard: 'Coupe + Barbe',
      monday: 'L', tuesday: 'M', wednesday: 'M', thursday: 'J', friday: 'V', saturday: 'S', sunday: 'D',
      september: 'Septembre',
      confirm: 'Confirmer',
      active: 'Actif',
      activeCount: '3 coiffeurs actifs aujourd\'hui',
      mon: 'L', tue: 'M', wed: 'M', thu: 'J', fri: 'V', sat: 'S', sun: 'D',
      thisWeek: 'Cette semaine'
    }
  },
  en: {
    nav: { features: 'Features', pricing: 'Pricing', testimonials: 'Testimonials', contact: 'Contact', login: 'Login', trial: 'Start 15-day free trial' },
    hero: {
      badge: '🚀 New — Multi-barber management available',
      title: 'Manage your barbershop. Grow your business.',
      subtitle: 'The only platform built for modern barbershops. Bookings, team, POS, analytics — all in one dashboard.',
      cta1: 'Start for free →',
      cta2: 'View Demo',
      trust: '✓ 15 days free · ✓ No credit card · ✓ Cancel anytime'
    },
    stats: {
      shops: '500+', shopsLabel: 'Barbershops',
      revenue: '€2M+', revenueLabel: 'Revenue Managed',
      satisfaction: '98%', satisfactionLabel: 'Satisfaction',
      support: '24/7', supportLabel: 'Support'
    },
    problems: {
      title: 'Does this sound familiar?',
      p1: { title: 'Lost Paper Agenda', desc: 'You lose bookings due to a disorganized system.' },
      p2: { title: 'No Revenue Visibility', desc: 'You never know exactly how much you are really making.' },
      p3: { title: 'Chaotic Team Management', desc: 'Coordinating schedules takes hours every week.' },
      solution: 'The Solution →'
    },
    features: {
      f1: { title: '24/7 Online Booking', desc: 'Clients book from their phones anytime. Automated confirmations. Reduce no-shows by 60%.', bullets: ['Custom booking page', 'Automated reminders', 'Full client history'] },
      f2: { title: 'Real-time Analytics & Reports', desc: 'Track your revenue, tips, top-selling services, and barber performance.', bullets: ['Daily/weekly/monthly reports', 'Barber performance', 'Most profitable services'] },
      f3: { title: 'Complete Team Management', desc: 'Add barbers, set schedules, track performance. Every barber has their own portal.', bullets: ['Dedicated barber portal', 'Weekly scheduling', 'Tips and commissions'] },
      grid: [
        { icon: Bell, title: 'Push Notifications', desc: 'Real-time alerts for every booking.' },
        { icon: Shield, title: '100% Secure Data', desc: 'Every shop is isolated. Your data stays private.' },
        { icon: Smartphone, title: 'Mobile PWA App', desc: "Install Barberboard on your iPhone or Android in one click. Works like a real app — without the App Store.", bullets: ['Native push notifications', 'Works offline', 'Home screen icon'] }
      ]
    },
    howItWorks: {
      title: 'How it works',
      s1: { title: 'Create an account', desc: 'Setup takes 2 minutes. Pick your subdomain.' },
      s2: { title: 'Configure your shop', desc: 'Add barbers, services, and hours.' },
      s3: { title: 'Grow your business', desc: 'Accept bookings and track your growth.' }
    },
    pricing: {
      title: 'Simple, transparent pricing',
      monthly: 'Monthly', annual: 'Annual (-20%)',
      basic: { name: 'Basic', desc: 'For independent barbers', price: 29, features: ['Maximum 2 barbers', 'Unlimited online bookings', 'Automated notifications', 'Basic reports', 'Email support'] },
      pro: { name: 'Pro', desc: 'For growing shops', badge: '⭐ Most Popular', price: 59, features: ['Maximum 8 barbers', 'Everything in Basic + advanced analytics', 'Full integrated POS', 'Real-time push notifications', 'Priority support'] },
      enterprise: { name: 'Enterprise', desc: 'For multi-shop brands', price: 99, features: ['Unlimited barbers', 'Everything in Pro + custom domain', 'Dedicated onboarding', 'Phone support', 'Custom API'] },
      ctaFree: 'Start for free', ctaContact: 'Contact Us'
    },
    testimonials: {
      title: 'What they say',
      items: [
        { name: 'Karim B.', salon: 'Gold Cuts Paris', text: 'Barberboard transformed my shop. In 3 months, my bookings increased by 40%.' },
        { name: 'Yassine M.', salon: 'Fade Studio Lyon', text: 'Managing my team of 5 is finally simple. I see everything in real-time.' },
        { name: 'Sofiane A.', salon: 'Classic Barber Marseille', text: 'Onboarding took 5 minutes. I was up and running the same day.' },
        { name: 'Mehdi R.', salon: 'The Barber Shop Toulouse', text: 'The booking link in my Instagram bio changed everything.' }
      ]
    },
    faq: {
      title: 'Frequently Asked Questions',
      items: [
        { q: 'Can I cancel anytime?', a: 'Yes, no commitment. Cancel with one click.' },
        { q: 'How long does setup take?', a: 'Under 5 minutes. Our wizard guides you.' },
        { q: 'Is my data secure?', a: 'Yes. Every shop has isolated data powered by Firebase.' },
        { q: 'Can I change plans?', a: 'Yes, anytime. Changes take effect immediately.' },
        { q: 'Is there a mobile app?', a: 'Barberboard is a PWA — install it on iOS and Android.' }
      ]
    },
    cta: { title: 'Join the barbershops using Barberboard', trust: '✓ 15 days free · ✓ No credit card · ✓ Support included' },
    footer: {
      desc: 'The platform for modern barbershops',
      product: 'Product', company: 'Company', legal: 'Legal',
      copyright: '© 2026 Barberboard. All rights reserved. Made with ❤️ for barbershops'
    },
    mockup: {
      dashboard: 'Dashboard',
      monthlyRevenue: 'Revenue this month',
      vsLastMonth: '+23% vs last month',
      nextBooking: 'Next Booking',
      hairAndBeard: 'Haircut + Beard',
      monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'T', friday: 'F', saturday: 'S', sunday: 'S',
      september: 'September',
      confirm: 'Confirm',
      active: 'Active',
      activeCount: '3 active barbers today',
      mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S',
      thisWeek: 'This week'
    }
  },
  ar: {
    nav: {
      features: 'المميزات',
      pricing: 'الأسعار',
      testimonials: 'آراء العملاء',
      contact: 'تواصل معنا',
      login: 'تسجيل الدخول',
      trial: 'تجربة مجانية 15 يوماً'
    },
    hero: {
      badge: '🚀 جديد — إدارة حلاقين متعددين متاحة الآن',
      title: 'أدر صالون الحلاقة. طوّر أعمالك.',
      subtitle: 'المنصة الوحيدة المصممة لصالونات الحلاقة الحديثة. الحجوزات، الفريق، الصندوق، التحليلات — كل شيء في لوحة تحكم واحدة.',
      cta1: 'ابدأ مجاناً ←',
      cta2: 'شاهد العرض',
      trust: '✓ 15 يوماً مجاناً · ✓ بدون بطاقة بنكية · ✓ إلغاء في أي وقت'
    },
    stats: {
      shops: '500+', shopsLabel: 'صالون',
      revenue: '€2M+', revenueLabel: 'إيرادات مُدارة',
      satisfaction: '98%', satisfactionLabel: 'رضا العملاء',
      support: '24/7', supportLabel: 'دعم'
    },
    problems: {
      title: 'هل تتعرف على نفسك؟',
      p1: { title: 'دفتر مواعيد ضائع', desc: 'تفقد حجوزاتك بسبب نظام غير منظم.' },
      p2: { title: 'لا رؤية للإيرادات', desc: 'لا تعرف أبداً مقدار ما تكسبه بالفعل.' },
      p3: { title: 'فوضى في إدارة الفريق', desc: 'تنسيق الجداول يستغرق ساعات كل أسبوع.' },
      solution: 'الحل ←'
    },
    features: {
      f1: {
        title: 'حجز عبر الإنترنت 24/7',
        desc: 'يحجز عملاؤك من هواتفهم في أي وقت. تأكيدات تلقائية. قلل عدم الحضور بنسبة 60%.',
        bullets: ['صفحة حجز مخصصة', 'تذكيرات تلقائية', 'سجل عميل كامل']
      },
      f2: {
        title: 'تحليلات وتقارير فورية',
        desc: 'تتبع إيراداتك، الإكراميات، الخدمات الأكثر مبيعاً وأداء الحلاقين.',
        bullets: ['تقارير يومية/أسبوعية/شهرية', 'أداء كل حلاق', 'الخدمات الأكثر ربحية']
      },
      f3: {
        title: 'إدارة فريق كاملة',
        desc: 'أضف حلاقيك، حدد جداولهم وتتبع أدائهم. لكل حلاق بوابته الخاصة.',
        bullets: ['بوابة مخصصة لكل حلاق', 'جدولة أسبوعية', 'الإكراميات والعمولات']
      },
      grid: [
        { icon: Bell, title: 'إشعارات فورية', desc: 'تنبيهات فورية لكل حجز جديد.' },
        { icon: Shield, title: 'بيانات آمنة 100%', desc: 'كل صالون معزول تماماً. بياناتك تظل خاصة.' },
        { icon: Smartphone, title: 'تطبيق ويب PWA للموبايل', desc: 'ثبت Barberboard على هاتف آيفون أو أندرويد بنقرة واحدة. يعمل كتطبيق حقيقي دون الحاجة لمتجر التطبيقات.', bullets: ['إشعارات دفع أصلية', 'يعمل بدون اتصال بالإنترنت', 'أيقونة على الشاشة الرئيسية'] }
      ]
    },
    howItWorks: {
      title: 'كيف يعمل؟',
      s1: { title: 'أنشئ حسابك', desc: 'التسجيل يستغرق دقيقتين. اختر اسم النطاق الفرعي الخاص بك.' },
      s2: { title: 'قم بإعداد صالونك', desc: 'أضف الحلاقين، الخدمات وأوقات العمل.' },
      s3: { title: 'طور أعمالك', desc: 'ابدأ في استقبال الحجوزات وتتبع نموك.' }
    },
    pricing: {
      title: 'أسعار بسيطة وشفافة',
      monthly: 'شهري', annual: 'سنوي (توفير 20%)',
      basic: { name: 'أساسي', desc: 'للحلاقين المستقلين', price: 29, features: ['حلاقين كحد أقصى 2', 'حجوزات غير محدودة عبر الإنترنت', 'إشعارات تلقائية', 'تقارير أساسية', 'دعم عبر البريد الإلكتروني'] },
      pro: { name: 'برو', desc: 'للصالونات النامية', badge: '⭐ الأكثر شعبية', price: 59, features: ['حلاقين كحد أقصى 8', 'كل ما في الأساسي + تحليلات متقدمة', 'نظام كاشير متكامل', 'إشعارات فورية', 'دعم ذو أولوية'] },
      enterprise: { name: 'شراكة', desc: 'للعلامات التجارية والصالونات المتعددة', price: 99, features: ['حلاقين غير محدودين', 'كل ما في برو + نطاق مخصص', 'إعداد ومرافقة مخصصة', 'دعم عبر الهاتف', 'واجهة برمجة تطبيقات API مخصصة'] },
      ctaFree: 'ابدأ مجاناً', ctaContact: 'تواصل معنا'
    },
    testimonials: {
      title: 'ماذا يقول عملاؤنا',
      items: [
        { name: 'كريم ب.', salon: 'جولد كاتس باريس', text: 'Barberboard غيّر صالوني تماماً. زادت حجوزاتي بنسبة 40% خلال 3 أشهر.' },
        { name: 'ياسين م.', salon: 'فيد ستوديو ليون', text: 'إدارة فريقي المكون من 5 حلاقين أصبحت بسيطة جداً. أرى كل شيء بشكل فوري.' },
        { name: 'سفيان أ.', salon: 'كلاسيك باربر مارسيليا', text: 'التسجيل لم يستغرق سوى 5 دقائق. بدأت العمل في نفس اليوم.' },
        { name: 'مهدي ر.', salon: 'ذا باربر شوب تولوز', text: 'رابط الحجز في حسابي على إنستغرام غيّر كل شيء.' }
      ]
    },
    faq: {
      title: 'الأسئلة الشائعة',
      items: [
        { q: 'هل يمكنني الإلغاء في أي وقت؟', a: 'نعم، بدون أي التزامات. يمكنك الإلغاء بنقرة واحدة.' },
        { q: 'كم يستغرق الإعداد؟', a: 'أقل من 5 دقائق. سيقوم مساعدنا بإرشادك خطوة بخطوة.' },
        { q: 'هل بياناتي آمنة؟', a: 'نعم، كل صالون معزول تماماً ومدعوم بتقنيات Firebase الآمنة.' },
        { q: 'هل يمكنني تغيير خطتي؟', a: 'نعم، في أي وقت. يتم تطبيق التغييرات فوراً.' },
        { q: 'هل يوجد تطبيق للموبايل؟', a: 'Barberboard هو تطبيق PWA — يمكنك تثبيته على آيفون وأندرويد.' }
      ]
    },
    cta: { title: 'انضم إلى صالونات الحلاقة التي تثق في Barberboard', trust: '✓ 15 يوماً مجاناً · ✓ بدون بطاقة بنكية · ✓ الدعم مشمول' },
    footer: {
      desc: 'المنصة المتكاملة لصالونات الحلاقة الحديثة',
      product: 'المنتج', company: 'الشركة', legal: 'قانوني',
      copyright: '© 2025 Barberboard. جميع الحقوق محفوظة.'
    },
    mockup: {
      dashboard: 'لوحة التحكم',
      monthlyRevenue: 'إيرادات هذا الشهر',
      vsLastMonth: '+23% مقارنة بالشهر الماضي',
      nextBooking: 'الحجز التالي',
      hairAndBeard: 'قصة شعر + لحية',
      monday: 'ن', tuesday: 'ث', wednesday: 'ر', thursday: 'خ', friday: 'ج', saturday: 'س', sunday: 'ح',
      september: 'سبتمبر',
      confirm: 'تأكيد',
      active: 'نشط',
      activeCount: '3 حلاقين نشطين اليوم',
      mon: 'ن', tue: 'ث', wed: 'ر', thu: 'خ', fri: 'ج', sat: 'س', sun: 'ح',
      thisWeek: 'هذا الأسبوع'
    }
  }
};

export default function HomePage() {
  const [lang, setLang] = useState<Lang>('fr');
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [annualBilling, setAnnualBilling] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const navigate = useNavigate();

  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const desktopDropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  ];

  const currentLanguage = languages.find(l => l.code === lang) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        (!desktopDropdownRef.current || !desktopDropdownRef.current.contains(target)) &&
        (!mobileDropdownRef.current || !mobileDropdownRef.current.contains(target))
      ) {
        setLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Noto+Sans+Arabic:wght@300;400;500;600;700;800;900&display=swap';
    document.head.appendChild(link);

    const savedLang = localStorage.getItem('elite_lang') as Lang;
    if (savedLang && (savedLang === 'fr' || savedLang === 'en' || savedLang === 'ar')) setLang(savedLang);

    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'true') {
      setLoginOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }

    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (lang === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const selectLang = (newLang: Lang) => {
    setLang(newLang);
    localStorage.setItem('elite_lang', newLang);
  };

  const t = CONTENT[lang];

  return (
    <div 
      className={`min-h-screen bg-[#0a0a0a] text-white selection:bg-[#D4AF37]/30 ${lang === 'ar' ? 'text-right' : 'text-left'}`}
      style={{ 
        fontFamily: lang === 'ar' ? "'Noto Sans Arabic', sans-serif" : "'Inter', sans-serif",
        '--primary-color': '#D4AF37'
      } as React.CSSProperties}
    >
      
      {/* Animated Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#D4AF37]/10 blur-[150px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#D4AF37]/5 blur-[150px] animate-pulse" style={{ animationDuration: '12s' }} />
      </div>

      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-[#0a0a0a]/80 backdrop-blur-md border-b border-[#D4AF37]/20 py-4' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div style={{ fontFamily: "'Inter', sans-serif" }} className="flex items-center gap-2 cursor-pointer select-none py-1 flex-shrink-0" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-color)' }}>
              <Scissors className="w-4 h-4 text-black" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight leading-none">Barber<span style={{ color: 'var(--primary-color)' }}>board</span></span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#fonctionnalites" className="text-white/70 hover:text-white transition-colors font-medium text-sm">{t.nav.features}</a>
            <a href="#tarifs" className="text-white/70 hover:text-white transition-colors font-medium text-sm">{t.nav.pricing}</a>
            <a href="#temoignages" className="text-white/70 hover:text-white transition-colors font-medium text-sm">{t.nav.testimonials}</a>
            <a href="#contact" className="text-white/70 hover:text-white transition-colors font-medium text-sm">{t.nav.contact}</a>
            <a href="/docs" className="text-white/70 hover:text-[#D4AF37] transition-colors font-medium text-sm">Documentation</a>
          </div>

          <div className="hidden md:flex items-center gap-5">
            <div className="relative" ref={desktopDropdownRef}>
              <button
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-semibold text-white/90 select-none cursor-pointer"
              >
                <span>{currentLanguage.flag}</span>
                <span className="uppercase text-xs font-bold">{currentLanguage.code}</span>
                <ChevronDown className={`w-3 h-3 text-[#D4AF37] transition-transform duration-200 ${langDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {langDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.15 }}
                    className={`absolute ${lang === 'ar' ? 'left-0' : 'right-0'} top-full mt-2 w-48 bg-[#1a1a1a]/95 backdrop-blur-md border border-[#D4AF37]/30 rounded-xl overflow-hidden shadow-2xl z-50 py-1`}
                  >
                    {languages.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => {
                          selectLang(l.code as Lang);
                          setLangDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 text-sm text-white/80 hover:text-white transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-base">{l.flag}</span>
                          <span className="font-medium">{l.label}</span>
                        </div>
                        {lang === l.code && <Check className="w-4 h-4 text-[#D4AF37]" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => setLoginOpen(true)} className="text-sm font-medium hover:text-[#D4AF37] transition-colors">{t.nav.login}</button>
            <button onClick={() => navigate('/register')} className="px-5 py-2.5 bg-[#D4AF37] text-black rounded-lg font-bold text-sm hover:bg-[#FFD700] transition-all hover:shadow-lg hover:shadow-[#D4AF37]/20 active:scale-95">
              {t.nav.trial}
            </button>
          </div>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-[#D4AF37] p-2">
            {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed inset-0 z-40 bg-[#0a0a0a] pt-24 px-6 flex flex-col md:hidden">
            <div className="flex flex-col gap-6 text-xl font-bold">
              <a href="#fonctionnalites" onClick={() => setMobileMenuOpen(false)}>{t.nav.features}</a>
              <a href="#tarifs" onClick={() => setMobileMenuOpen(false)}>{t.nav.pricing}</a>
              <a href="#temoignages" onClick={() => setMobileMenuOpen(false)}>{t.nav.testimonials}</a>
              <a href="/docs" onClick={() => setMobileMenuOpen(false)}>Documentation</a>
              <button onClick={() => { setMobileMenuOpen(false); setLoginOpen(true); }} className={`text-[#D4AF37] mt-4 ${lang === 'ar' ? 'text-right' : 'text-left'}`}>{t.nav.login}</button>
              <button onClick={() => { setMobileMenuOpen(false); navigate('/register'); }} className="mt-4 px-6 py-4 bg-[#D4AF37] text-black rounded-xl text-center shadow-lg shadow-[#D4AF37]/20">{t.nav.trial}</button>
            </div>
            <div className="mt-auto mb-10 flex justify-center w-full">
              <div className="relative w-48" ref={mobileDropdownRef}>
                <button
                  onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-2.5 border border-white/10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-semibold text-white/90 select-none cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span>{currentLanguage.flag}</span>
                    <span className="font-medium">{currentLanguage.label}</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-[#D4AF37] transition-transform duration-200 ${langDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {langDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full left-0 right-0 mb-2 bg-[#1a1a1a]/95 backdrop-blur-md border border-[#D4AF37]/30 rounded-xl overflow-hidden shadow-2xl z-50 py-1"
                    >
                      {languages.map((l) => (
                        <button
                          key={l.code}
                          onClick={() => {
                            selectLang(l.code as Lang);
                            setLangDropdownOpen(false);
                            setMobileMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 text-sm text-white/80 hover:text-white transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-base">{l.flag}</span>
                            <span className="font-medium">{l.label}</span>
                          </div>
                          {lang === l.code && <Check className="w-4 h-4 text-[#D4AF37]" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}

      <div className="relative z-10 pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden min-h-[90vh] flex items-center">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-[#D4AF37] mb-6">
              {t.hero.badge}
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
              <span className="bg-gradient-to-br from-white to-white/70 bg-clip-text text-transparent">{t.hero.title.split('.')[0]}.</span>
              <br/>
              <span className="bg-gradient-to-r from-[#D4AF37] via-[#FFD700] to-[#D4AF37] bg-clip-text text-transparent">{t.hero.title.split('.')[1]}.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/60 mb-10 max-w-lg leading-relaxed">
              {t.hero.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <button onClick={() => navigate('/register')} className="px-8 py-4 bg-[#D4AF37] text-black font-bold rounded-xl transition-all hover:bg-[#FFD700] hover:scale-105 active:scale-95 shadow-xl shadow-[#D4AF37]/20 text-center flex items-center justify-center gap-2">
                {t.hero.cta1}
              </button>
              <button onClick={() => window.location.href = 'https://demo.barberboard.pro'} className="px-8 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-xl transition-all hover:bg-white/10 text-center">
                {t.hero.cta2}
              </button>
            </div>
            <p className="text-xs text-white/40 font-medium">
              {t.hero.trust}
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#D4AF37]/20 to-transparent blur-3xl rounded-full" />
            <motion.div 
              animate={{ y: [-10, 10, -10] }} 
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              className="relative rounded-2xl border border-white/10 bg-[#111]/80 backdrop-blur-xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                <div className="text-sm font-bold text-white/50">{t.mockup.dashboard}</div>
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                  <div className="text-xs text-white/40 mb-1">{t.mockup.monthlyRevenue}</div>
                  <div className="text-2xl font-black text-[#D4AF37]">€4,280</div>
                  <div className="text-[10px] text-green-400 mt-1 flex items-center gap-1">{t.mockup.vsLastMonth}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col justify-end">
                  <div className="flex items-end justify-between h-12 gap-1 opacity-70">
                    {[40, 70, 45, 90, 65, 85, 100].map((h, i) => (
                      <div key={i} className="w-full bg-gradient-to-t from-[#D4AF37]/50 to-[#D4AF37] rounded-sm" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-xs font-bold text-white/40 uppercase tracking-widest mt-6 mb-2">{t.mockup.nextBooking}</div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#FFD700] text-black flex items-center justify-center font-bold">JD</div>
                  <div className="flex-1">
                    <div className="text-sm font-bold">John Doe</div>
                    <div className="text-xs text-white/50">{t.mockup.hairAndBeard}</div>
                  </div>
                  <div className="text-sm font-mono text-[#D4AF37]">14:30</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div className="border-y border-white/5 bg-[#111]/50 backdrop-blur-sm py-10">
        <div className={`max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 divide-white/5 ${lang === 'ar' ? 'divide-x-reverse' : 'divide-x'}`}>
          {[
            { v: t.stats.shops, l: t.stats.shopsLabel },
            { v: t.stats.revenue, l: t.stats.revenueLabel },
            { v: t.stats.satisfaction, l: t.stats.satisfactionLabel },
            { v: t.stats.support, l: t.stats.supportLabel }
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center px-4">
              <div className="text-3xl md:text-4xl font-black text-white mb-1">{s.v}</div>
              <div className="text-xs md:text-sm text-[#D4AF37] font-medium tracking-wide uppercase">{s.l}</div>
            </motion.div>
          ))}
        </div>
      </div>

      <section className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold">{t.problems.title}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[t.problems.p1, t.problems.p2, t.problems.p3].map((p, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="p-8 rounded-2xl bg-[#111] border border-red-500/10">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
                  <X className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-xl font-bold mb-3">{p.title}</h3>
                <p className="text-white/50 leading-relaxed text-sm">{p.desc}</p>
              </motion.div>
            ))}
          </div>
          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-2 text-[#D4AF37] font-bold text-lg animate-bounce">
              {t.problems.solution}
            </div>
          </div>
        </div>
      </section>

      <section id="fonctionnalites" className="py-20">
        <div className="max-w-7xl mx-auto px-6 space-y-32">
          
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mb-6 border border-[#D4AF37]/20">
                <Calendar className="w-7 h-7 text-[#D4AF37]" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.features.f1.title}</h2>
              <p className="text-lg text-white/60 mb-8 leading-relaxed">{t.features.f1.desc}</p>
              <ul className="space-y-4">
                {t.features.f1.bullets.map((b, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80"><Check className="w-5 h-5 text-[#D4AF37]" /> {b}</li>
                ))}
              </ul>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative aspect-square md:aspect-video lg:aspect-square bg-[#111] rounded-3xl border border-white/10 overflow-hidden flex items-center justify-center p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 to-transparent" />
              <div className="w-full max-w-sm bg-black rounded-2xl border border-white/10 shadow-2xl p-6 relative z-10">
                <div className="flex justify-between items-center mb-6">
                  <div className="text-white font-bold">{t.mockup.september}</div>
                  <div className="flex gap-2">
                    <ChevronLeft className="w-4 h-4 text-white/50" />
                    <ChevronRight className="w-4 h-4 text-white/50" />
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-2 text-center text-xs text-white/50 mb-4">
                  <div>{t.mockup.mon}</div><div>{t.mockup.tue}</div><div>{t.mockup.wed}</div><div>{t.mockup.thu}</div><div>{t.mockup.fri}</div><div>{t.mockup.sat}</div><div>{t.mockup.sun}</div>
                </div>
                <div className="grid grid-cols-7 gap-2 text-center text-sm font-medium mb-6">
                  {[...Array(30)].map((_, i) => (
                    <div key={i} className={`w-8 h-8 flex items-center justify-center rounded-full mx-auto ${i === 13 ? 'bg-[#D4AF37] text-black font-bold shadow-lg shadow-[#D4AF37]/20' : 'text-white'}`}>
                      {i + 1}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mb-6">
                  <div className="flex-1 py-2 text-center rounded-lg border border-white/10 text-xs">10:00</div>
                  <div className="flex-1 py-2 text-center rounded-lg bg-[#D4AF37] text-black font-bold text-xs shadow-lg shadow-[#D4AF37]/20">11:30</div>
                  <div className="flex-1 py-2 text-center rounded-lg border border-white/10 text-xs">14:00</div>
                </div>
                <button className="w-full py-3 bg-white/10 rounded-xl text-sm font-bold text-white">{t.mockup.confirm}</button>
              </div>
            </motion.div>
          </div>

          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative aspect-square md:aspect-video lg:aspect-square bg-[#111] rounded-3xl border border-white/10 overflow-hidden flex flex-col items-center justify-center p-8 order-2 lg:order-1">
              <div className="absolute inset-0 bg-gradient-to-bl from-[#D4AF37]/5 to-transparent" />
              <div className="w-full max-w-sm relative z-10 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black border border-white/10 p-4 rounded-xl">
                    <div className="text-xs text-white/50 mb-1">{t.mockup.monday}</div>
                    <div className="text-xl font-bold text-white">€1,240</div>
                  </div>
                  <div className="bg-black border border-white/10 p-4 rounded-xl">
                    <div className="text-xs text-white/50 mb-1">{t.mockup.tuesday}</div>
                    <div className="text-xl font-bold text-white">€980</div>
                  </div>
                </div>
                <div className="bg-black border border-white/10 p-6 rounded-xl">
                  <div className="flex items-end justify-between h-32 gap-2 mb-4">
                    {[40, 70, 45, 90, 65, 85, 100].map((h, i) => (
                      <div key={i} className="flex-1 bg-gradient-to-t from-[#D4AF37]/20 to-[#D4AF37] rounded-t-sm" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-white/40 font-medium font-mono">
                    <span>{t.mockup.mon}</span><span>{t.mockup.tue}</span><span>{t.mockup.wed}</span><span>{t.mockup.thu}</span><span>{t.mockup.fri}</span><span>{t.mockup.sat}</span><span>{t.mockup.sun}</span>
                  </div>
                </div>
                <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/20 p-4 rounded-xl text-center">
                  <div className="text-xs text-[#D4AF37] mb-1">{t.mockup.thisWeek}</div>
                  <div className="text-2xl font-black text-[#D4AF37]">€4,280</div>
                </div>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="order-1 lg:order-2">
              <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mb-6 border border-[#D4AF37]/20">
                <BarChart3 className="w-7 h-7 text-[#D4AF37]" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.features.f2.title}</h2>
              <p className="text-lg text-white/60 mb-8 leading-relaxed">{t.features.f2.desc}</p>
              <ul className="space-y-4">
                {t.features.f2.bullets.map((b, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80"><Check className="w-5 h-5 text-[#D4AF37]" /> {b}</li>
                ))}
              </ul>
            </motion.div>
          </div>

          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mb-6 border border-[#D4AF37]/20">
                <Users className="w-7 h-7 text-[#D4AF37]" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.features.f3.title}</h2>
              <p className="text-lg text-white/60 mb-8 leading-relaxed">{t.features.f3.desc}</p>
              <ul className="space-y-4">
                {t.features.f3.bullets.map((b, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80"><Check className="w-5 h-5 text-[#D4AF37]" /> {b}</li>
                ))}
              </ul>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative aspect-square md:aspect-video lg:aspect-square bg-[#111] rounded-3xl border border-white/10 overflow-hidden flex items-center justify-center p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 to-transparent" />
              <div className="w-full max-w-sm bg-black rounded-2xl border border-white/10 shadow-2xl p-6 relative z-10 space-y-4">
                {[
                  { initials: 'KB', color: 'from-[#D4AF37] to-[#FFD700]', name: 'Karim B.', spec: 'Fade Master' },
                  { initials: 'YM', color: 'from-blue-500 to-blue-400', name: 'Yassine M.', spec: 'Coloriste' },
                  { initials: 'SA', color: 'from-emerald-500 to-emerald-400', name: 'Sofiane A.', spec: 'Barbier' }
                ].map((member, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${member.color} flex items-center justify-center text-black font-bold text-sm shadow-inner`}>
                      {member.initials}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm text-white">{member.name}</div>
                      <div className="text-xs text-white/50">{member.spec}</div>
                    </div>
                    <div className="px-2 py-1 rounded-md bg-green-500/20 text-green-400 border border-green-500/20 text-[10px] font-bold uppercase tracking-wider">
                      {t.mockup.active}
                    </div>
                  </div>
                ))}
                <div className="pt-4 mt-2 border-t border-white/10 text-center text-xs text-white/50">
                  {t.mockup.activeCount}
                </div>
              </div>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 pt-16 border-t border-white/5">
            {t.features.grid.map((g: any, i: number) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="p-8 rounded-2xl bg-[#111]/50 border border-white/5 flex flex-col">
                <g.icon className="w-8 h-8 text-[#D4AF37] mb-4" />
                <h3 className="text-xl font-bold mb-2">{g.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed flex-1">{g.desc}</p>
                {g.bullets && (
                  <ul className="mt-6 space-y-2">
                    {g.bullets.map((b: string, j: number) => (
                      <li key={j} className="flex items-center gap-2 text-xs text-white/70">
                        <Check className="w-3 h-3 text-[#D4AF37]" /> {b}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      <section className="py-32 bg-[#111] relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold">{t.howItWorks.title}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-12 relative">
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent" />
            {[t.howItWorks.s1, t.howItWorks.s2, t.howItWorks.s3].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.2 }} className="relative text-center">
                <div className="w-24 h-24 mx-auto bg-[#0a0a0a] rounded-full border border-[#D4AF37]/30 flex items-center justify-center text-4xl font-black text-[#D4AF37] mb-8 relative z-10 shadow-xl shadow-[#D4AF37]/5">
                  {i + 1}
                </div>
                <h3 className="text-2xl font-bold mb-4">{s.title}</h3>
                <p className="text-white/50">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="tarifs" className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-8">{t.pricing.title}</h2>
            <div className="inline-flex bg-[#111] p-1 rounded-full border border-white/10">
              <button onClick={() => setAnnualBilling(false)} className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${!annualBilling ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>
                {t.pricing.monthly}
              </button>
              <button onClick={() => setAnnualBilling(true)} className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${annualBilling ? 'bg-[#D4AF37] text-black' : 'text-white/50 hover:text-white'}`}>
                {t.pricing.annual}
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
            {[t.pricing.basic, t.pricing.pro, t.pricing.enterprise].map((plan, i) => {
              const isPro = i === 1;
              const price = annualBilling ? Math.floor(plan.price * 0.8) : plan.price;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className={`relative p-8 rounded-3xl flex flex-col transition-transform hover:-translate-y-2 ${isPro ? 'bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] border border-[#D4AF37] shadow-2xl shadow-[#D4AF37]/10' : 'bg-[#111] border border-white/5'}`}>
                  {plan.badge && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#D4AF37] text-black text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full whitespace-nowrap shadow-lg">
                      {plan.badge}
                    </div>
                  )}
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-white/50 text-sm mb-6 h-10">{plan.desc}</p>
                  <div className="mb-8">
                    <span className="text-5xl font-black text-white">€{price}</span>
                    <span className="text-white/40">/mo</span>
                  </div>
                  <ul className="space-y-4 mb-10 flex-1">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-white/80">
                        <Check className="w-5 h-5 text-[#D4AF37] shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => navigate(i === 2 ? '#contact' : `/register?plan=${plan.name.toLowerCase()}`)} className={`w-full py-4 rounded-xl font-bold uppercase tracking-wider text-sm transition-all ${isPro ? 'bg-[#D4AF37] text-black hover:bg-[#FFD700]' : 'bg-white/5 text-white hover:bg-white/10'}`}>
                    {i === 2 ? t.pricing.ctaContact : t.pricing.ctaFree}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="temoignages" className="py-32 bg-gradient-to-b from-black to-[#111]">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{t.testimonials.title}</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {t.testimonials.items.map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="p-8 rounded-2xl bg-white/5 border border-white/5 relative">
                <div className="text-6xl font-serif text-[#D4AF37]/20 absolute top-4 right-8">"</div>
                <div className="flex gap-1 mb-4">
                  {[1,2,3,4,5].map(s => <Star key={s} className="w-4 h-4 fill-[#D4AF37] text-[#D4AF37]" />)}
                </div>
                <p className="text-lg leading-relaxed text-white/90 mb-6 italic">"{item.text}"</p>
                <div>
                  <div className="font-bold text-white">{item.name}</div>
                  <div className="text-xs text-[#D4AF37] uppercase tracking-widest">{item.salon}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-32 max-w-3xl mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">{t.faq.title}</h2>
        <div className="space-y-4">
          {t.faq.items.map((item, i) => (
            <div key={i} className="border border-white/10 rounded-2xl bg-[#111] overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className={`w-full p-6 flex items-center justify-between font-bold text-lg hover:text-[#D4AF37] transition-colors ${lang === 'ar' ? 'text-right' : 'text-left'}`}>
                {item.q}
                <ChevronDown className={`w-5 h-5 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {openFaq === i && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="p-6 pt-0 text-white/60 leading-relaxed">
                      {item.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      <section className="py-32 border-y border-white/5 bg-gradient-to-br from-[#111] to-[#1a1400]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-6xl font-black mb-8 bg-gradient-to-r from-white via-[#D4AF37] to-white bg-clip-text text-transparent">{t.cta.title}</h2>
          <button onClick={() => navigate('/register')} className="px-10 py-5 bg-[#D4AF37] text-black font-black uppercase tracking-widest text-lg rounded-xl hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-[#D4AF37]/30 mb-6">
            {t.hero.cta1}
          </button>
          <p className="text-sm font-medium text-white/50">{t.cta.trust}</p>
        </div>
      </section>

      <footer className="py-16 bg-black">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-1">
              <div style={{ fontFamily: "'Inter', sans-serif" }} className="flex items-center gap-2 mb-4 select-none flex-shrink-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-color)' }}>
                  <Scissors className="w-4 h-4 text-black" />
                </div>
                <span className="text-xl font-bold text-white tracking-tight leading-none">Barber<span style={{ color: 'var(--primary-color)' }}>board</span></span>
              </div>
              <p className="text-white/40 text-sm leading-relaxed">{t.footer.desc}</p>
            </div>
            <div>
              <h4 className="font-bold mb-6">{t.footer.product}</h4>
              <ul className="space-y-3 text-sm text-white/50">
                <li><a href="#fonctionnalites" className="hover:text-white transition-colors">{t.nav.features}</a></li>
                <li><a href="#tarifs" className="hover:text-white transition-colors">{t.nav.pricing}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Démo</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6">{t.footer.company}</h4>
              <ul className="space-y-3 text-sm text-white/50">
                <li><a href="#" className="hover:text-white transition-colors">À propos</a></li>
                <li><a href="#contact" className="hover:text-white transition-colors">{t.nav.contact}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6">{t.footer.legal}</h4>
              <ul className="space-y-3 text-sm text-white/50">
                <li><a href="#" className="hover:text-white transition-colors">CGU</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Confidentialité</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/10 text-center text-sm text-white/30">
            {t.footer.copyright}
          </div>
        </div>
      </footer>
    </div>
  );
}

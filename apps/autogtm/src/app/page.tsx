'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, Brain, Mail, BarChart3, Zap, Clock, Target, X, Github, Menu, Users, Megaphone, Handshake, Building2, Podcast, DollarSign } from 'lucide-react';

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

export default function LandingPage() {
  const [showContact, setShowContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const hero = useInView(0.1);
  const pipeline = useInView();
  const howItWorks = useInView();
  const features = useInView();
  const useCases = useInView();
  const poweredBy = useInView();
  const why = useInView();

  const handleContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      if (!res.ok) throw new Error('Failed');
      setSent(true);
      setContactForm({ name: '', email: '', message: '' });
    } catch {
      // silent fail
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full backdrop-blur-md z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 border-b border-gray-200/60 shadow-sm' : 'bg-white/80 border-b border-gray-100'}`}>
        <div className="max-w-6xl mx-auto flex h-14 sm:h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenu(!mobileMenu)}
              className="sm:hidden inline-flex items-center justify-center text-gray-600 hover:text-gray-900 -ml-1 p-1 rounded-lg transition-colors"
            >
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-0">
              <span className="font-black text-xl tracking-tight text-gray-900">auto</span>
              <span className="font-black text-xl tracking-tight text-white bg-indigo-600 px-1.5 py-0.5 rounded-md ml-0.5">gtm</span>
            </div>
            {/* Desktop section links */}
            <div className="hidden sm:flex items-center gap-1 ml-4">
              <a href="#how-it-works" className="text-sm text-gray-500 hover:text-gray-900 transition-colors px-3 py-2">
                How it works
              </a>
              <a href="#features" className="text-sm text-gray-500 hover:text-gray-900 transition-colors px-3 py-2">
                Features
              </a>
              <a href="#use-cases" className="text-sm text-gray-500 hover:text-gray-900 transition-colors px-3 py-2">
                Use cases
              </a>
            </div>
          </div>
          {/* Desktop right side */}
          <div className="hidden sm:flex items-center gap-3">
            <a
              href="https://github.com/bholagabbar/autogtm"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Github className="h-4 w-4" />
              Star
            </a>
            <Link
              href="/login"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors px-3 py-2"
            >
              Sign in
            </Link>
            <button
              onClick={() => { setShowContact(true); setSent(false); }}
              className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors px-4 py-2 rounded-lg"
            >
              Request cloud access
            </button>
          </div>
          {/* Mobile right side */}
          <a
            href="https://github.com/bholagabbar/autogtm"
            target="_blank"
            rel="noopener noreferrer"
            className="sm:hidden inline-flex items-center justify-center bg-gray-900 hover:bg-gray-800 text-white p-2 rounded-lg transition-colors"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>
        {/* Mobile menu dropdown */}
        <div className={`sm:hidden overflow-hidden transition-all duration-200 ease-in-out ${mobileMenu ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="bg-white border-t border-gray-100 px-4 py-3 space-y-1">
            <a href="#how-it-works" onClick={() => setMobileMenu(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors py-2">
              How it works
            </a>
            <a href="#features" onClick={() => setMobileMenu(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors py-2">
              Features
            </a>
            <a href="#use-cases" onClick={() => setMobileMenu(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors py-2">
              Use cases
            </a>
            <div className="border-t border-gray-100 my-2" />
            <Link
              href="/login"
              className="block text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors py-2"
              onClick={() => setMobileMenu(false)}
            >
              Sign in
            </Link>
            <button
              onClick={() => { setShowContact(true); setSent(false); setMobileMenu(false); }}
              className="w-full text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors px-4 py-2.5 rounded-lg text-center"
            >
              Request cloud access
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 sm:pt-40 pb-16 sm:pb-24 px-4 sm:px-6">
        <div
          ref={hero.ref}
          className={`max-w-4xl mx-auto text-center transition-all duration-700 ease-out ${hero.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-sm font-medium px-4 py-1.5 rounded-full mb-8">
            <Zap className="h-3.5 w-3.5" />
            Open-source AI GTM engine
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-gray-950 leading-[1.08]">
            Cold outbound
            <br />
            <span className="bg-gradient-to-r from-indigo-600 to-indigo-500 bg-clip-text text-transparent">on autopilot</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Describe who you want to reach. autogtm finds leads, writes personalized campaigns, and reaches out to them on Autopilot.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => { setShowContact(true); setSent(false); }}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-3 rounded-xl shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-200 transition-all duration-200 text-base"
            >
              Request cloud access
              <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="https://github.com/bholagabbar/autogtm"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-medium px-6 py-3 rounded-xl shadow-md shadow-gray-200 hover:shadow-lg hover:shadow-gray-300 transition-all duration-200 text-base"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Pipeline Visual */}
      <section className="pb-16 sm:pb-24 px-4 sm:px-6">
        <div
          ref={pipeline.ref}
          className={`max-w-5xl mx-auto transition-all duration-700 ease-out delay-100 ${pipeline.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <div className="bg-gray-950 rounded-2xl p-5 sm:p-12 overflow-hidden shadow-xl shadow-gray-950/5">
            <div className="font-mono text-xs sm:text-sm text-gray-400 mb-4">$ autogtm pipeline</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-center">
              <div className="bg-gray-900 rounded-xl p-3 sm:p-5">
                <div className="text-indigo-400 font-mono text-[10px] sm:text-xs mb-2 sm:mb-3 uppercase tracking-wider">Input</div>
                <p className="text-white text-xs sm:text-sm font-medium leading-snug">&quot;Find acting coaches with 5-20k followers&quot;</p>
              </div>
              <div className="bg-gray-900 rounded-xl p-3 sm:p-5">
                <div className="text-emerald-400 font-mono text-[10px] sm:text-xs mb-2 sm:mb-3 uppercase tracking-wider">Discover</div>
                <p className="text-white text-xs sm:text-sm font-medium">47 leads found via Exa.ai websets</p>
              </div>
              <div className="bg-gray-900 rounded-xl p-3 sm:p-5">
                <div className="text-amber-400 font-mono text-[10px] sm:text-xs mb-2 sm:mb-3 uppercase tracking-wider">Enrich</div>
                <p className="text-white text-xs sm:text-sm font-medium">AI scores, bios, social data added</p>
              </div>
              <div className="bg-gray-900 rounded-xl p-3 sm:p-5">
                <div className="text-rose-400 font-mono text-[10px] sm:text-xs mb-2 sm:mb-3 uppercase tracking-wider">Send</div>
                <p className="text-white text-xs sm:text-sm font-medium">Autopilot sends via Instantly, or you review first</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 sm:py-24 px-4 sm:px-6 bg-gray-50">
        <div
          ref={howItWorks.ref}
          className={`max-w-3xl mx-auto transition-all duration-700 ease-out ${howItWorks.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-950">
              How it works
            </h2>
            <p className="mt-4 text-gray-500 text-lg max-w-xl mx-auto">
              Four steps. Fully automated. Runs every single day.
            </p>
          </div>
          <div className="space-y-0">
            {[
              {
                num: '1',
                title: 'You set context, add optional briefs',
                desc: 'Fill in your Company Profile once and the AI searches broadly off that. Drop in optional Lead Briefs to pinpoint specific hunts: "acting coaches with 10-50k followers" or "B2B SaaS founders who recently raised seed rounds."',
              },
              {
                num: '2',
                title: 'AI researches and discovers leads',
                desc: 'Every morning, AI generates multiple search strategies with different angles, methodologies, and keywords. Runs them through Exa.ai to surface real people with real contact info.',
              },
              {
                num: '3',
                title: 'Each lead is enriched and scored',
                desc: 'Bio, social links, audience size, and expertise pulled automatically. AI scores each lead 1-10 for fit and writes personalized email copy.',
              },
              {
                num: '4',
                title: 'Autopilot sends, or you review first',
                desc: 'With Autopilot on, each morning at 10am ET the top N qualifying leads are auto-added to their Instantly campaigns, and a digest email lands in your inbox summarizing exactly what went out. Or review every draft manually. Your call.',
              },
            ].map((item, i) => (
              <div key={item.num} className="flex gap-5 sm:gap-6">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
                    {item.num}
                  </div>
                  {i < 3 && <div className="w-px flex-1 bg-indigo-200 my-1" />}
                </div>
                <div className="pb-10">
                  <h3 className="text-base font-semibold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 sm:py-24 px-4 sm:px-6 bg-white">
        <div
          ref={features.ref}
          className={`max-w-5xl mx-auto transition-all duration-700 ease-out ${features.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-950">
              Growth that doesn&apos;t stop when you do
            </h2>
            <p className="mt-4 text-gray-500 text-lg max-w-xl mx-auto">
              New leads, new strategies, new emails. Every single day. Whether you&apos;re heads-down building or taking a break.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[
              {
                icon: Search,
                title: 'Multiple search strategies',
                desc: 'AI doesn\u2019t run the same search twice. It generates varied queries across different angles, keywords, and platforms to find leads you\u2019d never surface manually.',
              },
              {
                icon: Brain,
                title: 'AI-written, not templated',
                desc: 'Every email sequence is written from scratch for the specific campaign and persona. Founder-led tone, real personalization, zero generic copy.',
              },
              {
                icon: Clock,
                title: 'Runs on a daily schedule',
                desc: 'Morning: fresh searches and lead discovery. 10am ET: Autopilot sweeps the backlog and auto-sends top picks with a digest email. Hourly: analytics sync back from Instantly.',
              },
              {
                icon: Zap,
                title: 'Autopilot with guardrails',
                desc: 'Daily sweep auto-adds the top N Ready-to-Add leads above your fit-score threshold. Set the daily limit, optionally regenerate draft copy before sending, and receive a digest summary. Full control, zero babysitting.',
              },
              {
                icon: BarChart3,
                title: 'Analytics that feed back in',
                desc: 'Opens, replies, and bounces sync back from Instantly every hour. You see what\u2019s working and the system adapts its targeting.',
              },
              {
                icon: Target,
                title: 'Multi-company support',
                desc: 'Run outbound for multiple companies or personas from one dashboard. Each with its own targeting, campaigns, and send accounts.',
              },
            ].map((feat, i) => (
              <div key={i} className="rounded-xl p-5 sm:p-6 bg-gray-50 hover:bg-gray-100/70 transition-all duration-200">
                <feat.icon className="h-5 w-5 text-indigo-600 mb-3" />
                <h3 className="font-semibold text-gray-900 text-sm mb-1.5">{feat.title}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-16 sm:py-24 px-4 sm:px-6">
        <div
          ref={useCases.ref}
          className={`max-w-5xl mx-auto transition-all duration-700 ease-out ${useCases.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-950">
              Built for founders and growing teams
            </h2>
            <p className="mt-4 text-gray-500 text-lg max-w-xl mx-auto">
              Whether you&apos;re bootstrapped, raising, or scaling. If your company needs to reach the right people, autogtm does it daily.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[
              {
                icon: Megaphone,
                title: 'Find influencers to promote your product',
                desc: 'Discover creators, podcasters, and niche voices in your space. Reach out with personalized pitches at scale.',
              },
              {
                icon: DollarSign,
                title: 'Find investors for your next round',
                desc: 'Surface VCs and angels who invest in your stage and sector. Warm up the conversation before you ever hop on a call.',
              },
              {
                icon: Handshake,
                title: 'Find partners and collaborators',
                desc: 'Reach complementary businesses for co-marketing, integrations, or distribution partnerships.',
              },
              {
                icon: Users,
                title: 'Find early customers and design partners',
                desc: 'Target specific company profiles or personas who match your ICP. Get them into your sales pipeline automatically.',
              },
              {
                icon: Podcast,
                title: 'Get booked on podcasts and media',
                desc: 'Find podcast hosts, newsletter writers, and journalists who cover your industry. Pitch yourself as a guest or source.',
              },
              {
                icon: Building2,
                title: 'Recruit talent for your team',
                desc: 'Discover people with the right skills and background. Send them a compelling reason to chat about your company.',
              },
            ].map((uc, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-5 sm:p-6 hover:border-indigo-200 hover:shadow-sm transition-all duration-200">
                <uc.icon className="h-5 w-5 text-indigo-600 mb-3" />
                <h3 className="font-semibold text-gray-900 text-sm mb-1.5">{uc.title}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Powered By */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 border-t border-gray-100">
        <div
          ref={poweredBy.ref}
          className={`max-w-5xl mx-auto transition-all duration-700 ease-out ${poweredBy.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <p className="text-center text-sm font-medium text-gray-400 uppercase tracking-wider mb-6 sm:mb-8">
            Powered by
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 sm:gap-x-12 gap-y-4 sm:gap-y-6">
            {[
              { name: 'Exa.ai', href: 'https://exa.ai', color: '#3B82F6' },
              { name: 'OpenAI', href: 'https://openai.com', color: '#10A37F' },
              { name: 'Instantly.ai', href: 'https://instantly.ai', color: '#6366F1' },
              { name: 'Supabase', href: 'https://supabase.com', color: '#3ECF8E' },
              { name: 'Inngest', href: 'https://inngest.com', color: '#8B5CF6' },
              { name: 'Resend', href: 'https://resend.com', color: '#000000' },
            ].map((brand) => (
              <a
                key={brand.name}
                href={brand.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-semibold text-gray-300 transition-colors duration-200"
                style={{ ['--brand-color' as string]: brand.color }}
                onMouseEnter={(e) => (e.currentTarget.style.color = brand.color)}
                onMouseLeave={(e) => (e.currentTarget.style.color = '')}
              >
                {brand.name}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-gray-50">
        <div
          ref={why.ref}
          className={`max-w-2xl mx-auto text-center transition-all duration-700 ease-out ${why.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-950">
            Why we built this
          </h2>
          <p className="mt-5 text-gray-500 leading-relaxed">
            Solo founders and small teams are busy running the business, building, shipping, juggling a million things. Growth and outbound get pushed to the side, or they have to force themselves to block time for it. For lean, technical founders focused on the product, marketing and fundraising easily become an afterthought. We built autogtm to fix that: one pipeline (Exa, OpenAI, Instantly) that runs every day on its own, so they wake up to new leads ready to go, without the guilt or the context-switching.
          </p>
          <div className="mt-8">
            <button
              onClick={() => { setShowContact(true); setSent(false); }}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-3 rounded-xl shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-200 transition-all duration-200 text-sm"
            >
              Request cloud access
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Contact Modal */}
      {showContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-[fadeIn_150ms_ease-out]" onClick={() => setShowContact(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-6 sm:p-8 relative shadow-2xl shadow-black/10 animate-[scaleIn_200ms_ease-out]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowContact(false)} className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors">
              <X className="h-5 w-5" />
            </button>
            {sent ? (
              <div className="text-center py-6">
                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Zap className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="text-sm font-medium text-gray-900">You&apos;re on the list!</p>
                <p className="text-xs text-gray-500 mt-1">We&apos;ll be in touch soon.</p>
              </div>
            ) : (
              <form onSubmit={handleContact} className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Request cloud access</h3>
                  <p className="text-sm text-gray-500 mt-1">Don&apos;t want to self-host? We&apos;ll set up and run autogtm for you.</p>
                </div>
                <input
                  type="text"
                  required
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  placeholder="Name"
                />
                <input
                  type="email"
                  required
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  placeholder="Email"
                />
                <textarea
                  rows={2}
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-shadow"
                  placeholder="What are you working on? (optional)"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200 text-sm disabled:opacity-50 shadow-sm hover:shadow-md"
                >
                  {sending ? 'Sending...' : 'Request access'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 sm:py-10 px-4 sm:px-6 border-t border-gray-100">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-0">
            <span className="font-black text-lg tracking-tight text-gray-900">auto</span>
            <span className="font-black text-lg tracking-tight text-white bg-indigo-600 px-1.5 py-0.5 rounded-md ml-0.5">gtm</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/bholagabbar/autogtm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              GitHub
            </a>
            <span className="text-gray-200">|</span>
            <button
              onClick={() => { setShowContact(true); setSent(false); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cloud access
            </button>
            <span className="text-gray-200">|</span>
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} autogtm
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

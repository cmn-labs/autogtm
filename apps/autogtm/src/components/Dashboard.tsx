'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Header, useSelectedCompany } from '@/components/Header';
import { useToast } from '@/components/ui/use-toast';
import {
  Search,
  Mail,
  Users,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  X,
  RefreshCw,
  Trash2,
  FileText,
  Edit2,
  Check,
  Send,
  ChevronDown,
  ChevronRight,
  FileQuestion,
  Sparkles,
  HelpCircle,
  Zap,
  Power,
} from 'lucide-react';

interface DashboardProps {
  userEmail: string;
}

interface Query {
  id: string;
  query: string;
  criteria: string[];
  status: string;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  source_instruction_id: string | null;
  generation_rationale: string | null;
  company_updates?: { content: string } | null;
  webset_runs?: Array<{ webset_id: string; status: string }>;
}

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  url: string;
  platform: string | null;
  follower_count: number | null;
  enrichment_data: any;
  created_at: string;
  query_id: string;
  exa_queries?: { id: string; query: string; source_instruction_id: string | null; instruction_content: string | null };
  // Enriched fields
  category: string | null;
  full_name: string | null;
  title: string | null;
  bio: string | null;
  expertise: string[] | null;
  social_links: Record<string, string> | null;
  total_audience: number | null;
  content_types: string[] | null;
  promotion_fit_score: number | null;
  promotion_fit_reason: string | null;
  enrichment_status: 'pending' | 'enriching' | 'enriched' | 'failed';
  enriched_at: string | null;
  suggested_campaign_id: string | null;
  suggested_campaign_reason: string | null;
  campaign_id: string | null;
  campaign_status: 'pending' | 'routed' | 'skipped' | null;
  skip_reason: string | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  instantly_campaign_id: string;
  leads_count: number;
  emails_sent: number;
  opens: number;
  replies: number;
  persona: string | null;
  created_at: string;
}

interface CampaignEmail {
  id: string;
  step: number;
  subject: string;
  body: string;
  delay_days: number;
}

interface Stats {
  queries: number;
  leads: number;
  campaigns: number;
}

interface Instruction {
  id: string;
  content: string;
  created_at: string;
}

interface Company {
  id: string;
  name: string;
  website: string;
  description: string;
  target_audience: string;
  sending_emails: string[];
  default_sequence_length: number;
  email_prompt: string | null;
  auto_add_enabled: boolean;
  auto_add_min_fit_score: number;
  system_enabled: boolean;
}

interface InstantlyAccount {
  email: string;
  status: number; // 1=Active, 2=Paused, -1=Connection Error
  warmup_status: number; // 0=Paused, 1=Active, -1=Banned
}

type Tab = 'context' | 'searches' | 'leads' | 'campaigns';

export function Dashboard({ userEmail }: DashboardProps) {
  const { toast } = useToast();
  const companyId = useSelectedCompany();
  const [activeTab, setActiveTab] = useState<Tab>('leads');
  const [queries, setQueries] = useState<Query[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Stats>({ queries: 0, leads: 0, campaigns: 0 });
  const [loading, setLoading] = useState(true);
  const [runningQueries, setRunningQueries] = useState<Record<string, { progress: number; found: number }>>({});
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedQueryFilter, setSelectedQueryFilter] = useState<string>('all');
  const [enrichingLeads, setEnrichingLeads] = useState<Set<string>>(new Set());
  const [routingLeads, setRoutingLeads] = useState<Set<string>>(new Set());
  const [suggestingLeads, setSuggestingLeads] = useState<Set<string>>(new Set());
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [newInstruction, setNewInstruction] = useState('');
  const [addingInstruction, setAddingInstruction] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: '', website: '', description: '', target_audience: '' });
  const [instantlyAccounts, setInstantlyAccounts] = useState<InstantlyAccount[]>([]);
  const [savingSendingEmails, setSavingSendingEmails] = useState(false);
  const [sendingAccountsOpen, setSendingAccountsOpen] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [leadFilter, setLeadFilter] = useState<'all' | 'suggested' | 'routed' | 'pending' | 'skipped'>('all');
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'ready' | 'active' | 'error' | 'completed'>('active');
  const [previewCampaign, setPreviewCampaign] = useState<{ campaign: Campaign; emails: CampaignEmail[]; leadContext?: Lead | null } | null>(null);
  const [loadingCampaignPreview, setLoadingCampaignPreview] = useState(false);
  const [editingEmails, setEditingEmails] = useState<Array<{ step: number; subject: string; body: string }> | null>(null);
  const [savingEmails, setSavingEmails] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [rewritingEmails, setRewritingEmails] = useState(false);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [companyProfileOpen, setCompanyProfileOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [generatingQueries, setGeneratingQueries] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  // Poll for leads in transitional states (enriching, routing)
  useEffect(() => {
    const hasTransitional = leads.some(
      l => l.enrichment_status === 'enriching' || l.campaign_status === 'pending'
    );
    if (!hasTransitional || !companyId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/leads?company_id=${companyId}`);
        if (res.ok) {
          const data = await res.json();
          const freshLeads: Lead[] = data.leads || [];
          setLeads(freshLeads);
          if (selectedLead) {
            const updated = freshLeads.find((l: Lead) => l.id === selectedLead.id);
            if (updated) setSelectedLead(updated);
          }
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [leads.some(l => l.enrichment_status === 'enriching' || l.campaign_status === 'pending'), companyId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [queriesRes, leadsRes, campaignsRes, statsRes, instructionsRes, companyRes, accountsRes] = await Promise.all([
        fetch(`/api/queries?company_id=${companyId}`),
        fetch(`/api/leads?company_id=${companyId}`),
        fetch(`/api/campaigns?company_id=${companyId}`),
        fetch(`/api/stats?company_id=${companyId}`),
        fetch(`/api/companies/${companyId}/updates`),
        fetch(`/api/companies/${companyId}`),
        fetch('/api/instantly/accounts'),
      ]);

      if (queriesRes.ok) {
        const data = await queriesRes.json();
        setQueries(data.queries || []);
      }
      if (leadsRes.ok) {
        const data = await leadsRes.json();
        const loadedLeads = data.leads || [];
        setLeads(loadedLeads);
        if (leadFilter !== 'all' && leadFilter === 'suggested' && !loadedLeads.some((l: Lead) => l.suggested_campaign_id && l.campaign_status !== 'routed')) {
          setLeadFilter('all');
        }
      }
      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      if (instructionsRes.ok) {
        const data = await instructionsRes.json();
        setInstructions(data.updates || []);
      }
      if (companyRes.ok) {
        const data = await companyRes.json();
        setCompany(data.company);
        setCompanyForm({
          name: data.company?.name || '',
          website: data.company?.website || '',
          description: data.company?.description || '',
          target_audience: data.company?.target_audience || '',
        });
      }
      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setInstantlyAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runQuery = async (queryId: string) => {
    // Start the query
    setRunningQueries(prev => ({ ...prev, [queryId]: { progress: 0, found: 0 } }));
    setQueries(queries.map(q => q.id === queryId ? { ...q, status: 'running' } : q));

    try {
      const response = await fetch(`/api/queries/${queryId}/run`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to start query');
      }

      // Poll for progress
      const pollStatus = async () => {
        try {
          const statusRes = await fetch(`/api/queries/${queryId}/status`);
          const status = await statusRes.json();

          if (status.status === 'completed') {
            // Done! Update UI
            setRunningQueries(prev => {
              const { [queryId]: _, ...rest } = prev;
              return rest;
            });
            toast({
              title: 'Search complete',
              description: `Found ${status.resultsCount || 0} items, created ${status.leadsCreated || 0} new leads.`,
            });
            fetchData();
            return;
          }

          if (status.status === 'error' || status.status === 'failed') {
            setRunningQueries(prev => {
              const { [queryId]: _, ...rest } = prev;
              return rest;
            });
            toast({
              variant: 'destructive',
              title: 'Search failed',
              description: 'Something went wrong. Please try again.',
            });
            fetchData();
            return;
          }

          // Still running - update progress and continue polling
          if (status.progress) {
            setRunningQueries(prev => ({
              ...prev,
              [queryId]: {
                progress: status.progress.completion || 0,
                found: status.progress.found || 0,
              },
            }));
          }

          // Poll again in 2 seconds
          setTimeout(pollStatus, 2000);
        } catch (error) {
          console.error('Error polling status:', error);
          setTimeout(pollStatus, 3000);
        }
      };

      // Start polling after a short delay
      setTimeout(pollStatus, 1000);
    } catch (error) {
      setRunningQueries(prev => {
        const { [queryId]: _, ...rest } = prev;
        return rest;
      });
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to run query. Please try again.',
      });
    }
  };

  const deleteQuery = async (id: string) => {
    if (!confirm('Delete this query?')) return;
    try {
      const response = await fetch(`/api/queries/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setQueries(queries.filter((q) => q.id !== id));
        toast({ title: 'Query deleted' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete query' });
    }
  };

  const enrichLead = async (leadId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEnrichingLeads(prev => new Set(prev).add(leadId));
    try {
      const response = await fetch(`/api/leads/${leadId}/enrich`, { method: 'POST' });
      if (response.ok) {
        toast({ title: 'Enrichment started', description: 'Lead will be enriched shortly' });
        // Update local state
        setLeads(leads.map(l => l.id === leadId ? { ...l, enrichment_status: 'enriching' } : l));
        if (selectedLead?.id === leadId) {
          setSelectedLead({ ...selectedLead, enrichment_status: 'enriching' });
        }
      } else {
        throw new Error('Failed to enrich');
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to start enrichment' });
    } finally {
      setEnrichingLeads(prev => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    }
  };

  const routeLeadToCampaign = async (leadId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRoutingLeads(prev => new Set(prev).add(leadId));
    try {
      const response = await fetch(`/api/leads/${leadId}/route-to-campaign`, { method: 'POST' });
      if (response.ok) {
        toast({ title: 'Campaign routing started', description: 'Lead will be routed to a campaign shortly' });
        setLeads(leads.map(l => l.id === leadId ? { ...l, campaign_status: 'pending' as const } : l));
        if (selectedLead?.id === leadId) {
          setSelectedLead({ ...selectedLead, campaign_status: 'pending' });
        }
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to route');
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to start campaign routing' });
    } finally {
      setRoutingLeads(prev => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    }
  };

  const suggestCampaign = async (leadId: string) => {
    setSuggestingLeads(prev => new Set(prev).add(leadId));
    try {
      const response = await fetch(`/api/leads/${leadId}/suggest-campaign`, { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        if (data.action === 'suggested') {
          toast({ title: 'Campaign suggested', description: 'Lead matched to a campaign. Click Add to confirm.' });
          // Refresh to get updated data
          fetchData();
        } else if (data.action === 'skipped') {
          toast({ title: 'Lead skipped', description: data.reason });
          setLeads(leads.map(l => l.id === leadId ? { ...l, campaign_status: 'skipped' as const, skip_reason: data.reason } : l));
        }
      } else {
        throw new Error(data.error || 'Failed');
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to suggest campaign' });
    } finally {
      setSuggestingLeads(prev => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    }
  };

  const openCampaignPreview = async (campaignId: string, leadCtx?: Lead | null) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    setLoadingCampaignPreview(true);
    setEditingEmails(null);
    setAiInstruction('');
    setPreviewCampaign({ campaign, emails: [], leadContext: leadCtx || null });
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/emails`);
      if (res.ok) {
        const data = await res.json();
        setPreviewCampaign({ campaign, emails: data.emails || [], leadContext: leadCtx || null });
      }
    } catch {} finally {
      setLoadingCampaignPreview(false);
    }
  };

  // Filter leads by selected query
  const filteredLeads = selectedQueryFilter === 'all'
    ? leads
    : leads.filter(l => l.query_id === selectedQueryFilter);

  const addInstruction = async () => {
    if (!newInstruction.trim() || !companyId) return;
    setAddingInstruction(true);
    try {
      const response = await fetch(`/api/companies/${companyId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newInstruction.trim() }),
      });
      if (response.ok) {
        const data = await response.json();
        setInstructions([data.update, ...instructions]);
        toast({ title: 'Instruction added' });
        setNewInstruction('');
      } else {
        throw new Error('Failed to add instruction');
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to add instruction' });
    } finally {
      setAddingInstruction(false);
    }
  };

  const deleteInstruction = async (id: string) => {
    try {
      const response = await fetch(`/api/companies/${companyId}/updates?update_id=${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setInstructions(instructions.filter(e => e.id !== id));
        toast({ title: 'Instruction removed' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to remove instruction' });
    }
  };

  const saveCompany = async () => {
    if (!companyId) return;
    try {
      const response = await fetch(`/api/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyForm),
      });
      if (response.ok) {
        const data = await response.json();
        setCompany(data.company);
        setEditingCompany(false);
        toast({ title: 'Company updated' });
      } else {
        throw new Error('Failed to update');
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update company' });
    }
  };

  const isCompanyComplete = company?.name && company?.website && company?.description && company?.target_audience;

  const formatLastRun = (date: string | null) => {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHrs < 1) return 'Just now';
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  };

  const formatFollowers = (count: number | null) => {
    if (!count) return '-';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getPlatformIcon = (platform: string | null) => {
    switch (platform?.toLowerCase()) {
      case 'tiktok': return '🎵';
      case 'instagram': return '📷';
      case 'youtube': return '▶️';
      case 'twitter': return '🐦';
      case 'linkedin': return '💼';
      default: return '🌐';
    }
  };

  const tabs = [
    { id: 'context' as Tab, label: 'Context', count: instructions.length, icon: FileText },
    { id: 'searches' as Tab, label: 'Searches', count: stats.queries, icon: Search },
    { id: 'leads' as Tab, label: 'Leads', count: stats.leads, icon: Users },
    { id: 'campaigns' as Tab, label: 'Campaigns', count: stats.campaigns, icon: Send },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header userEmail={userEmail} />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="bg-white rounded-xl border">
          <div className="flex border-b items-center">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {loading ? ' ' : tab.count}
                </span>
              </button>
            ))}
            <div className="ml-auto pr-4 flex items-center gap-3">
              <button
                onClick={async () => {
                  if (!company || !companyId) return;
                  const newVal = !company.system_enabled;
                  const msg = newVal
                    ? 'Turn the system ON? This will enable daily searches, lead enrichment, and campaign creation.'
                    : 'Turn the system OFF? All automated processes (searches, enrichment, campaign routing) will stop.';
                  if (!confirm(msg)) return;
                  try {
                    const res = await fetch(`/api/companies/${companyId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ system_enabled: newVal }),
                    });
                    if (res.ok) {
                      setCompany({ ...company, system_enabled: newVal });
                      toast({ title: newVal ? 'System turned ON' : 'System turned OFF', description: newVal ? 'Automated searches, enrichment, and campaigns are now active.' : 'All automated processes have been paused.' });
                    }
                  } catch {}
                }}
                disabled={!company}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  !company
                    ? 'bg-gray-100 text-gray-400'
                    : company.system_enabled
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600'
                }`}
                title={!company ? 'Loading...' : company.system_enabled ? 'System is active. Click to pause all automation.' : 'System is paused. Click to activate.'}
              >
                {!company ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Loading</>
                ) : company.system_enabled ? (
                  <><Power className="h-3 w-3 text-green-600" /> System ON</>
                ) : (
                  <><Power className="h-3 w-3" /> System OFF</>
                )}
              </button>
              <button
                onClick={() => setGuideOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                How it works
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {loading ? (
              <div className="py-12 text-center">
                <Loader2 className="h-6 w-6 mx-auto animate-spin text-gray-400" />
              </div>
            ) : !companyId ? (
              <div className="py-12 text-center">
                <p className="text-gray-500 mb-4">No company selected</p>
                <Link href="/app/setup">
                  <Button>Set up your first company</Button>
                </Link>
              </div>
            ) : (
              <>
                {/* Instructions Tab */}
                {activeTab === 'context' && (
                  <div className="space-y-6">
                    {/* Company Profile - Collapsible */}
                    <div className="rounded-lg border border-gray-200">
                      <button
                        onClick={() => { if (!editingCompany) setCompanyProfileOpen(!companyProfileOpen); }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {companyProfileOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                          <span className="text-sm font-medium text-gray-900">Company Profile</span>
                          <span className="text-xs text-gray-500">{company?.name || 'Not set'}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${isCompanyComplete ? 'bg-green-500' : 'bg-amber-500'}`} />
                        </div>
                        {companyProfileOpen && !editingCompany && (
                          <span onClick={(e) => { e.stopPropagation(); setEditingCompany(true); }} className="text-gray-400 hover:text-gray-600">
                            <Edit2 className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </button>
                      {companyProfileOpen && (
                        <div className="px-4 pb-4 border-t">
                          {editingCompany ? (
                            <div className="space-y-3 mt-3">
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">Company Name</label>
                                <input type="text" value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">Website</label>
                                <input type="text" value={companyForm.website} onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">Description</label>
                                <textarea value={companyForm.description} onChange={(e) => setCompanyForm({ ...companyForm, description: e.target.value })} rows={2} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 block mb-1">Target Audience</label>
                                <textarea value={companyForm.target_audience} onChange={(e) => setCompanyForm({ ...companyForm, target_audience: e.target.value })} rows={2} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={saveCompany}>Save</Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingCompany(false)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3 mt-3 text-sm">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-gray-400 text-xs block mb-0.5">Name</span>
                                  <span className="text-gray-900">{company?.name || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 text-xs block mb-0.5">Website</span>
                                  <span className="text-gray-900">{company?.website || '-'}</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-gray-400 text-xs block mb-0.5">Description</span>
                                <p className="text-gray-900">{company?.description || '-'}</p>
                              </div>
                              <div>
                                <span className="text-gray-400 text-xs block mb-0.5">Target Audience</span>
                                <p className="text-gray-900">{company?.target_audience || '-'}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Instructions Section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-gray-900">Instructions</span>
                        <span className="text-xs text-gray-400">Tell the AI what kind of leads to find</span>
                      </div>
                      <div className="flex gap-2 mb-4">
                        <input
                          type="text"
                          value={newInstruction}
                          onChange={(e) => setNewInstruction(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addInstruction()}
                          placeholder="e.g., 'Focus on acting coaches with 5-20k followers'"
                          className="flex-1 text-sm px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <Button onClick={addInstruction} disabled={addingInstruction || !newInstruction.trim()}>
                          {addingInstruction ? 'Adding...' : 'Add'}
                        </Button>
                      </div>
                      {instructions.length === 0 ? (
                        <div className="py-8 text-center border-2 border-dashed border-gray-200 rounded-lg">
                          <FileText className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                          <p className="text-gray-500 text-sm">No instructions yet</p>
                          <p className="text-xs text-gray-400 mt-1">Add instructions to guide the AI's query generation</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {instructions.map((entry) => (
                            <div key={entry.id} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg group">
                              <div className="flex-1">
                                <p className="text-sm text-gray-900">{entry.content}</p>
                                <p className="text-xs text-gray-400 mt-1">{new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                              </div>
                              <button
                                onClick={() => deleteInstruction(entry.id)}
                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Queries Tab */}
                {activeTab === 'searches' && (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-500">AI-generated searches based on your instructions, runs automatically daily at 9AM to discover new leads</p>
                      <Button
                        size="sm"
                        disabled={generatingQueries}
                        onClick={async () => {
                          if (!companyId) return;
                          setGeneratingQueries(true);
                          try {
                            const res = await fetch('/api/queries/generate', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ companyId }),
                            });
                            if (res.ok) {
                              toast({ title: 'Generating search', description: 'New search will appear shortly' });
                              setTimeout(() => fetchData(), 5000);
                            } else {
                              throw new Error();
                            }
                          } catch {
                            toast({ variant: 'destructive', title: 'Failed to generate search' });
                          } finally {
                            setGeneratingQueries(false);
                          }
                        }}
                      >
                        {generatingQueries ? (
                          <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Generating...</>
                        ) : (
                          <><Sparkles className="h-3 w-3 mr-1.5" /> Generate Search</>
                        )}
                      </Button>
                    </div>
                    {queries.length === 0 ? (
                      <div className="py-12 text-center">
                        <Search className="h-10 w-10 mx-auto mb-4 text-gray-300" />
                        <p className="text-gray-500">No searches yet. Add instructions and generate your first search.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left py-3 px-4 font-medium text-gray-500 text-sm">Status</th>
                              <th className="text-left py-3 px-4 font-medium text-gray-500 text-sm">Query</th>
                              <th className="text-left py-3 px-4 font-medium text-gray-500 text-sm">Last Run</th>
                              <th className="text-right py-3 px-4 font-medium text-gray-500 text-sm">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {queries.map((query) => (
                              <tr key={query.id} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4">
                                  {getStatusIcon(query.status)}
                                </td>
                                <td className="py-3 px-4">
                                  <p className="font-medium text-gray-900">{query.query}</p>
                                  <div className="flex flex-wrap items-center gap-1 mt-1">
                                    {query.company_updates?.content ? (
                                      <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                                        From: {query.company_updates.content.length > 40 
                                          ? query.company_updates.content.substring(0, 40) + '...' 
                                          : query.company_updates.content}
                                      </span>
                                    ) : (
                                      <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">
                                        Exploration
                                      </span>
                                    )}
                                    {query.criteria?.slice(0, 2).map((c, i) => (
                                      <span key={i} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{c}</span>
                                    ))}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-500">
                                  {formatLastRun(query.last_run_at)}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex justify-end items-center gap-2">
                                    {runningQueries[query.id] ? (
                                      <div className="flex items-center gap-2 text-sm text-gray-600 min-w-[100px]">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>
                                          {runningQueries[query.id].found > 0 
                                            ? `Found ${runningQueries[query.id].found}...`
                                            : 'Searching...'}
                                        </span>
                                      </div>
                                    ) : !query.webset_runs?.[0]?.webset_id ? (
                                      <Button
                                        size="sm"
                                        onClick={() => runQuery(query.id)}
                                        disabled={query.status === 'running'}
                                      >
                                        <RefreshCw className="h-4 w-4 mr-1" />
                                        Run
                                      </Button>
                                    ) : null}
                                    {query.webset_runs?.[0]?.webset_id && (
                                      <a
                                        href={`https://websets.exa.ai/websets/${query.webset_runs[0].webset_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <Button size="sm" variant="outline">
                                          <ExternalLink className="h-4 w-4 mr-1" />
                                          Exa
                                        </Button>
                                      </a>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => deleteQuery(query.id)}
                                      className="text-red-500 hover:text-red-600"
                                      disabled={!!runningQueries[query.id]}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Leads Tab */}
                {activeTab === 'leads' && (() => {
                  const suggestedLeads = filteredLeads.filter(l => l.suggested_campaign_id && l.campaign_status !== 'routed');
                  const routedLeads = filteredLeads.filter(l => l.campaign_status === 'routed');
                  const pendingLeads = filteredLeads.filter(l => !l.suggested_campaign_id && l.campaign_status !== 'routed' && l.campaign_status !== 'skipped');
                  const skippedLeads = filteredLeads.filter(l => l.campaign_status === 'skipped');

                  const filterCounts = {
                    all: filteredLeads.length,
                    suggested: suggestedLeads.length,
                    routed: routedLeads.length,
                    pending: pendingLeads.length,
                    skipped: skippedLeads.length,
                  };

                  const sortedAll = [...filteredLeads].sort((a, b) => {
                    const order = (l: typeof a) =>
                      l.suggested_campaign_id && l.campaign_status !== 'routed' ? 0 :
                      l.campaign_status === 'routed' ? 1 :
                      l.enrichment_status === 'enriching' ? 3 :
                      l.campaign_status === 'skipped' ? 4 : 2;
                    return order(a) - order(b);
                  });
                  const displayLeads = leadFilter === 'all' ? sortedAll :
                    leadFilter === 'suggested' ? suggestedLeads :
                    leadFilter === 'routed' ? routedLeads :
                    leadFilter === 'skipped' ? skippedLeads : pendingLeads;

                  return (
                    <div>
                      {/* Filter bar */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                          {([
                            { key: 'all' as const, label: 'All' },
                            { key: 'suggested' as const, label: 'Ready to Add' },
                            { key: 'routed' as const, label: 'In Campaign' },
                            { key: 'pending' as const, label: 'Pending' },
                            { key: 'skipped' as const, label: 'Skipped' },
                          ]).map(({ key, label }) => (
                            <button
                              key={key}
                              onClick={() => setLeadFilter(key)}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                leadFilter === key
                                  ? 'bg-gray-900 text-white'
                                  : key === 'suggested' && filterCounts[key] > 0
                                    ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                              }`}
                            >
                              {label} ({filterCounts[key]})
                            </button>
                          ))}
                          </div>

                          {/* AUTO toggle */}
                          <button
                            onClick={async () => {
                              if (!company || !companyId) return;
                              const newVal = !company.auto_add_enabled;
                              const msg = newVal
                                ? `Turn Autopilot ON? Leads with fit score ${company.auto_add_min_fit_score || 7}+ will be automatically added to campaigns.`
                                : 'Turn Autopilot OFF? You will need to manually review and add leads to campaigns.';
                              if (!confirm(msg)) return;
                              try {
                                const res = await fetch(`/api/companies/${companyId}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ auto_add_enabled: newVal }),
                                });
                                if (res.ok) {
                                  setCompany({ ...company, auto_add_enabled: newVal });
                                  toast({ title: newVal ? 'Autopilot ON' : 'Autopilot OFF', description: newVal ? `Leads with fit score ${company.auto_add_min_fit_score || 7}+ will be auto-added to campaigns.` : 'Manual review mode enabled.' });
                                }
                              } catch {}
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                              company?.auto_add_enabled
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                            }`}
                            title={company?.auto_add_enabled
                              ? `Auto-adding leads with fit score ${company?.auto_add_min_fit_score || 7}+ to campaigns`
                              : 'Click to auto-add high-fit leads to campaigns'}
                          >
                            <Zap className={`h-3 w-3 ${company?.auto_add_enabled ? 'text-amber-600' : ''}`} />
                            AUTO {company?.auto_add_enabled ? 'ON' : 'OFF'}
                          </button>
                        </div>
                        {queries.length > 0 && (
                          <select
                            value={selectedQueryFilter}
                            onChange={(e) => setSelectedQueryFilter(e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700"
                          >
                            <option value="all">All Searches ({leads.length})</option>
                            {queries.map((q) => {
                              const count = leads.filter(l => l.query_id === q.id).length;
                              return (
                                <option key={q.id} value={q.id}>
                                  {q.query.slice(0, 30)}{q.query.length > 30 ? '...' : ''} ({count})
                                </option>
                              );
                            })}
                          </select>
                        )}
                      </div>

                      {displayLeads.length === 0 ? (
                        <div className="py-12 text-center">
                          <Users className="h-10 w-10 mx-auto mb-4 text-gray-300" />
                          <p className="text-gray-500">
                            {leadFilter === 'suggested' ? 'No leads ready to add to campaigns yet.' :
                             leadFilter === 'routed' ? 'No leads in campaigns yet.' :
                             leadFilter === 'skipped' ? 'No skipped leads.' :
                             leadFilter === 'pending' ? 'No pending leads.' :
                             'No leads yet. Run a search to find leads.'}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {displayLeads.map((lead) => {
                            const suggestedCampaign = lead.suggested_campaign_id
                              ? campaigns.find(c => c.id === lead.suggested_campaign_id)
                              : null;
                            const isEnriched = lead.enrichment_status === 'enriched';
                            const isUnenriched = lead.enrichment_status === 'pending' || lead.enrichment_status === 'failed';

                            return (
                              <div
                                key={lead.id}
                                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                  suggestedCampaign && !lead.campaign_status
                                    ? 'border-indigo-200 bg-indigo-50/30 hover:border-indigo-300'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                                onClick={() => setSelectedLead(lead)}
                              >
                                <div className="flex items-center gap-3">
                                  {/* Left: Fit score */}
                                  <div className="shrink-0 flex flex-col items-center justify-center w-[40px]">
                                    {lead.promotion_fit_score ? (
                                      <span className={`text-sm font-bold ${
                                        lead.promotion_fit_score >= 7 ? 'text-green-600' :
                                        lead.promotion_fit_score >= 4 ? 'text-yellow-600' : 'text-red-500'
                                      }`}>
                                        {lead.promotion_fit_score}/10
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-300">--</span>
                                    )}
                                  </div>

                                  {/* Center: Name, Title, Email, Search */}
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-sm text-gray-900 truncate">
                                      {lead.full_name || lead.name || 'Unknown'}
                                    </p>
                                    {lead.title && (
                                      <p className="text-xs text-gray-500 truncate">{lead.title}</p>
                                    )}
                                    {lead.exa_queries?.query && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <Search className="h-3 w-3 text-gray-300 shrink-0" />
                                        <p className="text-xs text-gray-400 truncate" title={lead.exa_queries.query}>
                                          {lead.exa_queries.query}
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Right: Campaign suggestion / status */}
                                  <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    {lead.campaign_status === 'routed' ? (() => {
                                      const routedCampaign = lead.campaign_id ? campaigns.find(c => c.id === lead.campaign_id) : null;
                                      return (
                                        <div className="flex items-center gap-2">
                                          {routedCampaign && (
                                            <button
                                              onClick={() => openCampaignPreview(routedCampaign.id, lead)}
                                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap transition-colors"
                                            >
                                              <Send className="h-3 w-3 shrink-0" />
                                              View Campaign
                                            </button>
                                          )}
                                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Added
                                          </span>
                                        </div>
                                      );
                                    })() : suggestedCampaign ? (
                                      <div className="flex items-center gap-3">
                                        <button
                                          onClick={() => openCampaignPreview(suggestedCampaign.id, lead)}
                                          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap transition-colors"
                                        >
                                          <Send className="h-3 w-3 shrink-0" />
                                          View Campaign
                                        </button>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            onClick={async () => {
                                              try {
                                                const res = await fetch(`/api/leads/${lead.id}/skip`, { method: 'POST' });
                                                if (res.ok) {
                                                  setLeads(leads.map(l => l.id === lead.id ? { ...l, campaign_status: 'skipped' as const, suggested_campaign_id: null, skip_reason: 'Manually skipped' } : l));
                                                }
                                              } catch {}
                                            }}
                                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 font-medium whitespace-nowrap transition-colors"
                                          >
                                            <X className="h-3 w-3" />
                                            Skip
                                          </button>
                                          <button
                                            onClick={() => routeLeadToCampaign(lead.id)}
                                            disabled={routingLeads.has(lead.id)}
                                            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium whitespace-nowrap transition-colors"
                                          >
                                            <Check className="h-3 w-3" />
                                            {routingLeads.has(lead.id) ? 'Adding...' : 'Add to Campaign'}
                                          </button>
                                        </div>
                                      </div>
                                    ) : lead.campaign_status === 'skipped' ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-gray-400">Skipped{lead.skip_reason ? `: ${lead.skip_reason}` : ''}</span>
                                        <button
                                          onClick={async () => {
                                            try {
                                              const supabase = await fetch(`/api/leads/${lead.id}/unskip`, { method: 'POST' });
                                              if (supabase.ok) {
                                                setLeads(leads.map(l => l.id === lead.id ? { ...l, campaign_status: 'pending' as const, skip_reason: null } : l));
                                              }
                                            } catch {}
                                          }}
                                          className="text-xs px-2 py-1 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 font-medium transition-colors"
                                        >
                                          Undo
                                        </button>
                                      </div>
                                    ) : lead.enrichment_status === 'enriching' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-600">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Enriching
                                      </span>
                                    ) : isEnriched && lead.email ? (
                                      <button
                                        onClick={() => suggestCampaign(lead.id)}
                                        disabled={suggestingLeads.has(lead.id)}
                                        className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 font-medium"
                                      >
                                        {suggestingLeads.has(lead.id) ? (
                                          <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Finding...</span>
                                        ) : 'Find Campaign'}
                                      </button>
                                    ) : isUnenriched ? (
                                      <button
                                        onClick={() => enrichLead(lead.id)}
                                        disabled={enrichingLeads.has(lead.id)}
                                        className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 font-medium"
                                      >
                                        {enrichingLeads.has(lead.id) ? '...' : 'Enrich'}
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Campaigns Tab */}
                {activeTab === 'campaigns' && (
                  <div>
                    {/* Campaign Settings - Single collapsible */}
                    <div className="mb-6 rounded-lg border border-gray-200">
                      <button
                        onClick={() => setSendingAccountsOpen(!sendingAccountsOpen)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {sendingAccountsOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                          <span className="text-sm font-medium text-gray-900">Campaign Settings</span>
                          <span className="text-xs text-gray-500">
                            {company?.sending_emails?.length || 0} accounts, {company?.default_sequence_length ?? 2} emails, {company?.email_prompt ? 'custom prompt' : 'default prompt'}
                          </span>
                        </div>
                      </button>
                      {sendingAccountsOpen && (
                        <div className="border-t divide-y">
                          {/* Sending Accounts */}
                          <div className="px-4 py-3">
                            <p className="text-xs font-medium text-gray-700 mb-2">Sending Accounts</p>
                            {instantlyAccounts.length === 0 ? (
                              <p className="text-xs text-gray-400">No Instantly accounts found. Check your API key.</p>
                            ) : (
                              <div className="grid grid-cols-2 gap-1.5">
                                {instantlyAccounts.map((account) => (
                                  <label key={account.email} className="flex items-center gap-2 cursor-pointer py-1">
                                    <input
                                      type="checkbox"
                                      checked={company?.sending_emails?.includes(account.email) || false}
                                      onChange={async (e) => {
                                        if (!company || !companyId) return;
                                        const current = company.sending_emails || [];
                                        const updated = e.target.checked
                                          ? [...current, account.email]
                                          : current.filter((em: string) => em !== account.email);
                                        setSavingSendingEmails(true);
                                        try {
                                          const res = await fetch(`/api/companies/${companyId}`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ sending_emails: updated }),
                                          });
                                          if (res.ok) setCompany({ ...company, sending_emails: updated });
                                        } catch {} finally {
                                          setSavingSendingEmails(false);
                                        }
                                      }}
                                      className="rounded border-gray-300"
                                    />
                                    <span className="text-sm text-gray-700 truncate">{account.email}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Sequence Length */}
                          <div className="px-4 py-3 flex items-center gap-3">
                            <span className="text-xs font-medium text-gray-700">Sequence Length</span>
                            <select
                              value={company?.default_sequence_length ?? 2}
                              onChange={async (e) => {
                                if (!company || !companyId) return;
                                const val = Number(e.target.value);
                                try {
                                  const res = await fetch(`/api/companies/${companyId}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ default_sequence_length: val }),
                                  });
                                  if (res.ok) setCompany({ ...company, default_sequence_length: val });
                                } catch {}
                              }}
                              className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700"
                            >
                              <option value={1}>1 email (initial only)</option>
                              <option value={2}>2 emails (initial + 1 follow-up)</option>
                              <option value={3}>3 emails (initial + 2 follow-ups)</option>
                            </select>
                          </div>

                          {/* Email Prompt */}
                          <div className="px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-gray-700">Email Prompt</span>
                              <span className="text-xs text-gray-400">{company?.email_prompt ? 'Custom' : 'Default'}</span>
                            </div>
                            <textarea
                              value={promptOpen ? promptDraft : (company?.email_prompt || '')}
                              onFocus={() => {
                                if (!promptOpen) {
                                  setPromptDraft(company?.email_prompt || '');
                                  setPromptOpen(true);
                                }
                              }}
                              onChange={(e) => { setPromptDraft(e.target.value); setPromptOpen(true); }}
                              placeholder="Using default system prompt. Click to edit or load the default to customize..."
                              rows={8}
                              className="w-full text-xs font-mono border border-gray-200 rounded-lg p-3 bg-white text-gray-700 resize-y focus:outline-none focus:ring-1 focus:ring-gray-300"
                            />
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                size="sm"
                                disabled={savingPrompt}
                                onClick={async () => {
                                  if (!company || !companyId) return;
                                  setSavingPrompt(true);
                                  try {
                                    const promptToSave = promptDraft.trim() || null;
                                    const res = await fetch(`/api/companies/${companyId}`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ email_prompt: promptToSave }),
                                    });
                                    if (res.ok) {
                                      setCompany({ ...company, email_prompt: promptToSave });
                                      toast({ title: 'Prompt saved' });
                                    }
                                  } catch {} finally {
                                    setSavingPrompt(false);
                                  }
                                }}
                              >
                                {savingPrompt ? 'Saving...' : 'Save'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    const res = await fetch('/api/email-prompt/default');
                                    if (res.ok) {
                                      const data = await res.json();
                                      setPromptDraft(data.prompt);
                                      setPromptOpen(true);
                                    }
                                  } catch {}
                                }}
                              >
                                Load Default
                              </Button>
                              {company?.email_prompt && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    if (!company || !companyId) return;
                                    setSavingPrompt(true);
                                    try {
                                      const res = await fetch(`/api/companies/${companyId}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ email_prompt: null }),
                                      });
                                      if (res.ok) {
                                        setCompany({ ...company, email_prompt: null });
                                        setPromptDraft('');
                                        setPromptOpen(false);
                                        toast({ title: 'Reset to default' });
                                      }
                                    } catch {} finally {
                                      setSavingPrompt(false);
                                    }
                                  }}
                                >
                                  Reset
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const getEffectiveStatus = (c: Campaign): 'active' | 'ready' | 'error' | 'completed' => {
                        if (c.status === 'error') return 'error';
                        if (c.status === 'completed' || c.status === 'paused') return 'completed';
                        if (c.leads_count > 0 && c.status === 'active') return 'active';
                        return 'ready';
                      };
                      const readyCampaigns = campaigns.filter(c => getEffectiveStatus(c) === 'ready');
                      const activeCampaigns = campaigns.filter(c => getEffectiveStatus(c) === 'active');
                      const errorCampaigns = campaigns.filter(c => getEffectiveStatus(c) === 'error');
                      const completedCampaigns = campaigns.filter(c => getEffectiveStatus(c) === 'completed');
                      const displayCampaigns = campaignFilter === 'all' ? campaigns
                        : campaignFilter === 'ready' ? readyCampaigns
                        : campaignFilter === 'active' ? activeCampaigns
                        : campaignFilter === 'error' ? errorCampaigns
                        : completedCampaigns;

                      return campaigns.length === 0 ? (
                      <div className="py-12 text-center">
                        <Send className="h-10 w-10 mx-auto mb-4 text-gray-300" />
                        <p className="text-gray-500">No campaigns yet. Campaigns are created from leads.</p>
                      </div>
                    ) : (
                      <>
                      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
                        {([
                          { key: 'ready' as const, label: 'Ready', count: readyCampaigns.length },
                          { key: 'active' as const, label: 'Active', count: activeCampaigns.length },
                          ...(errorCampaigns.length > 0 ? [{ key: 'error' as const, label: 'Errors', count: errorCampaigns.length }] : []),
                          { key: 'completed' as const, label: 'Completed', count: completedCampaigns.length },
                          { key: 'all' as const, label: 'All', count: campaigns.length },
                        ]).map(({ key, label, count }) => (
                          <button
                            key={key}
                            onClick={() => setCampaignFilter(key)}
                            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                              campaignFilter === key
                                ? key === 'error' ? 'border-red-500 text-red-600' : 'border-indigo-600 text-indigo-600'
                                : key === 'error' ? 'border-transparent text-red-400 hover:text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            {label} <span className={`ml-1 text-xs ${key === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{count}</span>
                          </button>
                        ))}
                      </div>
                      {displayCampaigns.length === 0 ? (
                        <div className="py-12 text-center">
                          <p className="text-gray-500">
                            {campaignFilter === 'active' ? 'No active campaigns yet. Add leads to a campaign to activate it.' :
                             campaignFilter === 'ready' ? 'No campaigns waiting for leads.' :
                             campaignFilter === 'error' ? 'No errored campaigns.' :
                             campaignFilter === 'completed' ? 'No completed campaigns.' :
                             'No campaigns.'}
                          </p>
                        </div>
                      ) : (
                      <div className="space-y-3">
                        {displayCampaigns.map((campaign) => {
                          const isExpanded = expandedCampaign === campaign.id;
                          const matchedLeads = leads.filter((l: any) => l.campaign_id === campaign.id);
                          const effectiveStatus = getEffectiveStatus(campaign);

                          return (
                            <div key={campaign.id} className="rounded-lg border border-gray-200">
                              <div className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        effectiveStatus === 'active' ? 'bg-green-100 text-green-700' :
                                        effectiveStatus === 'error' ? 'bg-red-100 text-red-700' :
                                        effectiveStatus === 'ready' ? 'bg-blue-100 text-blue-700' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                          effectiveStatus === 'active' ? 'bg-green-500' :
                                          effectiveStatus === 'error' ? 'bg-red-500' :
                                          effectiveStatus === 'ready' ? 'bg-blue-500' :
                                          'bg-gray-400'
                                        }`} />
                                        {effectiveStatus === 'active' ? 'Active' : effectiveStatus === 'error' ? 'Error' : effectiveStatus === 'ready' ? 'Ready' : 'Completed'}
                                      </span>
                                      {campaign.persona && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                                          {campaign.persona}
                                        </span>
                                      )}
                                    </div>
                                    <p className="font-medium text-gray-900 truncate cursor-pointer hover:text-purple-700 transition-colors" onClick={() => openCampaignPreview(campaign.id)}>{campaign.name}</p>
                                    <p className="text-xs text-gray-500">{new Date(campaign.created_at).toLocaleDateString()}</p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {campaign.status === 'draft' && (
                                      <Button
                                        size="sm"
                                        onClick={async () => {
                                          try {
                                            const res = await fetch(`/api/campaigns/${campaign.id}/activate`, { method: 'POST' });
                                            if (res.ok) {
                                              toast({ title: 'Campaign activated' });
                                              setCampaigns(campaigns.map(c => c.id === campaign.id ? { ...c, status: 'active' } : c));
                                            } else {
                                              throw new Error();
                                            }
                                          } catch {
                                            toast({ variant: 'destructive', title: 'Failed to activate campaign' });
                                          }
                                        }}
                                      >
                                        Activate
                                      </Button>
                                    )}
                                    <a
                                      href={`https://app.instantly.ai/app/campaign/${campaign.instantly_campaign_id}/sequences`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <Button size="sm" variant="outline">
                                        <ExternalLink className="h-4 w-4 mr-1" />
                                        Instantly
                                      </Button>
                                    </a>
                                  </div>
                                </div>

                                {/* Stats row */}
                                <div className="grid grid-cols-4 gap-3 mt-3">
                                  <div className="text-center py-2 rounded bg-gray-50">
                                    <p className="text-lg font-semibold text-gray-900">{campaign.leads_count}</p>
                                    <p className="text-xs text-gray-500">Leads</p>
                                  </div>
                                  <div className="text-center py-2 rounded bg-gray-50">
                                    <p className="text-lg font-semibold text-gray-900">{campaign.emails_sent}</p>
                                    <p className="text-xs text-gray-500">Sent</p>
                                  </div>
                                  <div className="text-center py-2 rounded bg-gray-50">
                                    <p className="text-lg font-semibold text-gray-900">{campaign.opens}</p>
                                    <p className="text-xs text-gray-500">Opens {campaign.emails_sent > 0 && `(${((campaign.opens / campaign.emails_sent) * 100).toFixed(0)}%)`}</p>
                                  </div>
                                  <div className="text-center py-2 rounded bg-gray-50">
                                    <p className="text-lg font-semibold text-gray-900">{campaign.replies}</p>
                                    <p className="text-xs text-gray-500">Replies {campaign.emails_sent > 0 && `(${((campaign.replies / campaign.emails_sent) * 100).toFixed(1)}%)`}</p>
                                  </div>
                                </div>
                              </div>

                              {/* Leads in campaign - expandable */}
                              {matchedLeads.length > 0 && (
                                <>
                                  <button
                                    onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 border-t text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                                  >
                                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    {matchedLeads.length} lead{matchedLeads.length !== 1 ? 's' : ''} in this campaign
                                  </button>
                                  {isExpanded && (
                                    <div className="border-t divide-y">
                                      {matchedLeads.map((lead) => (
                                        <div
                                          key={lead.id}
                                          className="px-4 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                                          onClick={() => setSelectedLead(lead)}
                                        >
                                          <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{lead.full_name || lead.name || 'Unknown'}</p>
                                            <p className="text-xs text-gray-500 truncate">{lead.email}</p>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500">
                                            {lead.platform && <span>{lead.platform}</span>}
                                            {lead.promotion_fit_score && (
                                              <span className={`font-medium ${
                                                lead.promotion_fit_score >= 7 ? 'text-green-600' :
                                                lead.promotion_fit_score >= 4 ? 'text-yellow-600' : 'text-red-500'
                                              }`}>
                                                {lead.promotion_fit_score}/10
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      )}
                      </>
                    );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Lead Detail Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedLead(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-lg">{selectedLead.full_name || selectedLead.name || 'Lead Details'}</h3>
                {selectedLead.category && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                    {selectedLead.category}
                  </span>
                )}
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  selectedLead.enrichment_status === 'enriched' ? 'bg-green-100 text-green-700' :
                  selectedLead.enrichment_status === 'enriching' ? 'bg-blue-100 text-blue-700' :
                  selectedLead.enrichment_status === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {selectedLead.enrichment_status}
                </span>
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Fit Score Banner */}
            {selectedLead.promotion_fit_score && (
              <div className={`px-4 py-3 ${
                selectedLead.promotion_fit_score >= 7 ? 'bg-green-50 border-b border-green-100' :
                selectedLead.promotion_fit_score >= 4 ? 'bg-yellow-50 border-b border-yellow-100' :
                'bg-red-50 border-b border-red-100'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Promotion Fit Score</p>
                    <p className="text-xs text-gray-500 mt-0.5">{selectedLead.promotion_fit_reason}</p>
                  </div>
                  <span className={`text-2xl font-bold ${
                    selectedLead.promotion_fit_score >= 7 ? 'text-green-600' :
                    selectedLead.promotion_fit_score >= 4 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {selectedLead.promotion_fit_score}/10
                  </span>
                </div>
              </div>
            )}

            <div className="p-4 space-y-4">
              {/* Title and Bio */}
              {selectedLead.title && (
                <div>
                  <p className="text-sm text-gray-500">Title</p>
                  <p className="font-medium text-gray-900">{selectedLead.title}</p>
                </div>
              )}
              {selectedLead.bio && (
                <div>
                  <p className="text-sm text-gray-500">Bio</p>
                  <p className="text-gray-700">{selectedLead.bio}</p>
                </div>
              )}

              {/* Expertise Tags */}
              {selectedLead.expertise && selectedLead.expertise.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Expertise</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedLead.expertise.map((exp, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {exp}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Content Types */}
              {selectedLead.content_types && selectedLead.content_types.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Content Types</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedLead.content_types.map((type, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 capitalize">
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                {/* Email */}
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  {selectedLead.email ? (
                    <a href={`mailto:${selectedLead.email}`} className="font-medium text-gray-900 hover:underline">
                      {selectedLead.email}
                    </a>
                  ) : (
                    <p className="text-gray-400">-</p>
                  )}
                </div>

                {/* Total Audience */}
                <div>
                  <p className="text-sm text-gray-500">Total Audience</p>
                  <p className="font-medium text-gray-900">
                    {selectedLead.total_audience ? formatFollowers(selectedLead.total_audience) : formatFollowers(selectedLead.follower_count)}
                  </p>
                </div>

                {/* Platform */}
                <div>
                  <p className="text-sm text-gray-500">Platform</p>
                  <p className="font-medium text-gray-900 flex items-center gap-2">
                    {getPlatformIcon(selectedLead.platform)} {selectedLead.platform || '-'}
                  </p>
                </div>

                {/* Discovered */}
                <div>
                  <p className="text-sm text-gray-500">Discovered</p>
                  <p className="font-medium text-gray-900">{new Date(selectedLead.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Social Links */}
              {selectedLead.social_links && Object.keys(selectedLead.social_links).length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-gray-500 mb-2">Social Links</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(selectedLead.social_links).map(([platform, url]) => (
                      url && (
                        <a
                          key={platform}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                        >
                          {getPlatformIcon(platform)}
                          {platform}
                        </a>
                      )
                    ))}
                  </div>
                </div>
              )}

              {/* Source Search + Instruction */}
              {selectedLead.exa_queries?.query && (
                <div className="pt-2 border-t space-y-2">
                  {selectedLead.exa_queries.instruction_content && (
                    <div>
                      <p className="text-sm text-gray-500">From Instruction</p>
                      <p className="text-sm text-gray-700">{selectedLead.exa_queries.instruction_content}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Search Used</p>
                    <p className="text-sm text-gray-700">{selectedLead.exa_queries.query}</p>
                  </div>
                </div>
              )}

              {/* Source URL */}
              <div className="pt-2 border-t">
                <p className="text-sm text-gray-500">Source URL</p>
                <a
                  href={selectedLead.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline break-all text-sm"
                >
                  {selectedLead.url}
                </a>
              </div>

              {/* Campaign Preview */}
              {(() => {
                const drawerCampaignId = selectedLead.suggested_campaign_id || (selectedLead.campaign_status === 'routed' ? selectedLead.campaign_id : null);
                const drawerCampaign = drawerCampaignId ? campaigns.find(c => c.id === drawerCampaignId) : null;
                if (!drawerCampaign) return null;
                return (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-gray-500 mb-2">Campaign</p>
                    <button
                      onClick={() => openCampaignPreview(drawerCampaign.id, selectedLead)}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Send className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">{drawerCampaign.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          drawerCampaign.status === 'active' ? 'bg-green-100 text-green-700' :
                          drawerCampaign.status === 'error' ? 'bg-red-100 text-red-700' :
                          drawerCampaign.status === 'draft' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {drawerCampaign.status === 'error' ? 'Error' : drawerCampaign.status === 'draft' ? 'Ready' : drawerCampaign.status}
                        </span>
                        <span className="text-xs text-indigo-600 font-medium">View &amp; Edit</span>
                      </div>
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 border-t flex gap-2">
              {(selectedLead.enrichment_status === 'pending' || selectedLead.enrichment_status === 'failed') && (
                <Button
                  onClick={() => enrichLead(selectedLead.id)}
                  disabled={enrichingLeads.has(selectedLead.id)}
                  variant="outline"
                  className="flex-1"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${enrichingLeads.has(selectedLead.id) ? 'animate-spin' : ''}`} />
                  {enrichingLeads.has(selectedLead.id) ? 'Starting...' : 'Enrich Lead'}
                </Button>
              )}
              {selectedLead.suggested_campaign_id && selectedLead.campaign_status !== 'routed' && (
                <Button
                  onClick={() => routeLeadToCampaign(selectedLead.id)}
                  disabled={routingLeads.has(selectedLead.id)}
                  className="flex-1"
                >
                  <Send className={`h-4 w-4 mr-2 ${routingLeads.has(selectedLead.id) ? 'animate-spin' : ''}`} />
                  {routingLeads.has(selectedLead.id) ? 'Adding...' : 'Add to Campaign'}
                </Button>
              )}
              {selectedLead.enrichment_status === 'enriched' && selectedLead.email && !selectedLead.suggested_campaign_id && selectedLead.campaign_status !== 'routed' && selectedLead.campaign_status !== 'skipped' && (
                <Button
                  onClick={() => suggestCampaign(selectedLead.id)}
                  disabled={suggestingLeads.has(selectedLead.id)}
                  className="flex-1"
                >
                  {suggestingLeads.has(selectedLead.id) ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Finding Campaign...</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" /> Find Campaign</>
                  )}
                </Button>
              )}
              {selectedLead.campaign_status === 'routed' && (
                <div className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-green-50 text-green-700 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  In Campaign
                </div>
              )}
              {selectedLead.email && selectedLead.campaign_status !== 'routed' && (
                <a href={`mailto:${selectedLead.email}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </Button>
                </a>
              )}
              <a href={selectedLead.url} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" className="w-full">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Profile
                </Button>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Preview Modal */}
      {previewCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => { setPreviewCampaign(null); setEditingEmails(null); setAiInstruction(''); }}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b shrink-0">
              <div>
                <h3 className="font-semibold text-lg">{previewCampaign.campaign.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    previewCampaign.campaign.status === 'active' ? 'bg-green-100 text-green-700' :
                    previewCampaign.campaign.status === 'error' ? 'bg-red-100 text-red-700' :
                    previewCampaign.campaign.status === 'draft' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {previewCampaign.campaign.status === 'draft' ? 'Ready' : previewCampaign.campaign.status === 'error' ? 'Error' : previewCampaign.campaign.status}
                  </span>
                  {previewCampaign.campaign.persona && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                      {previewCampaign.campaign.persona}
                    </span>
                  )}
                  {editingEmails && (
                    <button
                      onClick={() => setEditingEmails(null)}
                      className="ml-2 text-xs text-gray-500 hover:text-gray-700 font-medium"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </div>
              <button onClick={() => { setPreviewCampaign(null); setEditingEmails(null); setAiInstruction(''); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {previewCampaign.leadContext && (
              <div className="px-4 py-2 bg-indigo-50/50 border-b text-xs text-indigo-700 shrink-0">
                Viewing for: <span className="font-medium">{previewCampaign.leadContext.full_name || previewCampaign.leadContext.name}</span>
                {previewCampaign.leadContext.title && <span className="text-indigo-500"> · {previewCampaign.leadContext.title}</span>}
              </div>
            )}

            <div ref={previewScrollRef} className="p-4 space-y-4 overflow-y-auto flex-1">
              {loadingCampaignPreview ? (
                <div className="py-8 text-center">
                  <Loader2 className="h-6 w-6 mx-auto animate-spin text-gray-400" />
                </div>
              ) : previewCampaign.emails.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No email sequences found for this campaign.</p>
              ) : (
                (editingEmails || previewCampaign.emails).map((email, i) => (
                  <div key={i} className={`rounded-lg border ${editingEmails ? 'border-indigo-200' : 'border-gray-200'}`}>
                    <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        {i === 0 ? 'Initial Email' : `Follow-up ${i}`}
                      </span>
                      {'delay_days' in email && (email as any).delay_days > 0 && (
                        <span className="text-xs text-gray-400">+{(email as any).delay_days} days</span>
                      )}
                    </div>
                    <div className="p-4">
                      {editingEmails ? (
                        <>
                          <div className="mb-3">
                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Subject</label>
                            <input
                              value={editingEmails[i]?.subject || ''}
                              onChange={(e) => {
                                const updated = [...editingEmails];
                                updated[i] = { ...updated[i], subject: e.target.value };
                                setEditingEmails(updated);
                              }}
                              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              placeholder={i === 0 ? 'Subject line...' : '(empty = threads)'}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Body</label>
                            <textarea
                              value={editingEmails[i]?.body || ''}
                              onChange={(e) => {
                                const updated = [...editingEmails];
                                updated[i] = { ...updated[i], body: e.target.value };
                                setEditingEmails(updated);
                              }}
                              rows={8}
                              className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y leading-relaxed"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          {email.subject && (
                            <p className="text-sm font-medium text-gray-900 mb-2">Subject: {email.subject}</p>
                          )}
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{email.body}</p>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* AI Rewrite section — disabled for now
              {editingEmails && (
                <div className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/30 p-3">
                  <label className="text-xs font-medium text-indigo-700 mb-2 block">AI Rewrite — tell the AI what to change</label>
                  {previewCampaign.leadContext && (
                    <p className="text-[10px] text-indigo-500 mb-2">Lead context ({previewCampaign.leadContext.full_name || previewCampaign.leadContext.name}) will be included automatically</p>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={aiInstruction}
                      onChange={(e) => setAiInstruction(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && !e.shiftKey && aiInstruction.trim() && !rewritingEmails) {
                          e.preventDefault();
                          setRewritingEmails(true);
                          try {
                            const lc = previewCampaign.leadContext;
                            const res = await fetch(`/api/campaigns/${previewCampaign.campaign.id}/rewrite`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                instructions: aiInstruction,
                                leadContext: lc ? { name: lc.full_name || lc.name, bio: lc.bio, title: lc.title, url: lc.url, expertise: lc.expertise, platform: lc.platform } : null,
                              }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              if (data.emails?.length) {
                                setEditingEmails(data.emails);
                                setAiInstruction('');
                                toast({ title: 'Emails rewritten' });
                                previewScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                              } else {
                                toast({ variant: 'destructive', title: 'Rewrite failed', description: 'AI returned empty result' });
                              }
                            } else {
                              const err = await res.json();
                              toast({ variant: 'destructive', title: 'Rewrite failed', description: err.error });
                            }
                          } catch (err: any) {
                            toast({ variant: 'destructive', title: 'Error', description: err.message });
                          } finally {
                            setRewritingEmails(false);
                          }
                        }
                      }}
                      placeholder='e.g. "Start with mentioning their podcast" or "Make it shorter and punchier"'
                      className="flex-1 px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      disabled={rewritingEmails}
                    />
                    <Button
                      size="sm"
                      disabled={!aiInstruction.trim() || rewritingEmails}
                      onClick={async () => {
                        if (!aiInstruction.trim()) return;
                        setRewritingEmails(true);
                        try {
                          const lc = previewCampaign.leadContext;
                          const res = await fetch(`/api/campaigns/${previewCampaign.campaign.id}/rewrite`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              instructions: aiInstruction,
                              leadContext: lc ? { name: lc.full_name || lc.name, bio: lc.bio, title: lc.title, url: lc.url, expertise: lc.expertise, platform: lc.platform } : null,
                            }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            if (data.emails?.length) {
                              setEditingEmails(data.emails);
                              setAiInstruction('');
                              toast({ title: 'Emails rewritten' });
                              previewScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                            } else {
                              toast({ variant: 'destructive', title: 'Rewrite failed', description: 'AI returned empty result' });
                            }
                          } else {
                            const err = await res.json();
                            toast({ variant: 'destructive', title: 'Rewrite failed', description: err.error });
                          }
                        } catch (err: any) {
                          toast({ variant: 'destructive', title: 'Error', description: err.message });
                        } finally {
                          setRewritingEmails(false);
                        }
                      }}
                      className="shrink-0"
                    >
                      {rewritingEmails ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Rewrite'}
                    </Button>
                  </div>
                </div>
              )}
              */}
            </div>

            <div className="p-4 border-t flex flex-col gap-2 shrink-0">
              {editingEmails ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setEditingEmails(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={savingEmails}
                    onClick={async () => {
                      setSavingEmails(true);
                      try {
                        const res = await fetch(`/api/campaigns/${previewCampaign.campaign.id}/emails`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ emails: editingEmails }),
                        });
                        if (res.ok) {
                          // Refetch from DB to get the saved state
                          const freshRes = await fetch(`/api/campaigns/${previewCampaign.campaign.id}/emails`);
                          if (freshRes.ok) {
                            const freshData = await freshRes.json();
                            setPreviewCampaign({ ...previewCampaign, emails: freshData.emails || [] });
                          }
                          setEditingEmails(null);
                          toast({ title: 'Saved', description: 'Campaign emails updated in Instantly' });
                        } else {
                          const err = await res.json();
                          toast({ variant: 'destructive', title: 'Save failed', description: err.error });
                        }
                      } catch (err: any) {
                        toast({ variant: 'destructive', title: 'Error', description: err.message });
                      } finally {
                        setSavingEmails(false);
                      }
                    }}
                  >
                    {savingEmails ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save to Instantly'}
                  </Button>
                </div>
              ) : (
                <>
                  {!loadingCampaignPreview && previewCampaign.emails.length > 0 && (
                    <Button
                      className="w-full"
                      onClick={() => setEditingEmails(previewCampaign.emails.map(e => ({ step: e.step, subject: e.subject, body: e.body })))}
                    >
                      Edit Emails
                    </Button>
                  )}
                  <a
                    href={`https://app.instantly.ai/app/campaign/${previewCampaign.campaign.instantly_campaign_id}/sequences`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" className="w-full">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in Instantly
                    </Button>
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* How it works Guide */}
      {guideOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setGuideOpen(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold text-lg text-gray-900">How autogtm works</h3>
              <button onClick={() => setGuideOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-2">
              {/* Step 1 - Manual */}
              <div className="flex gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                <div className="shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold">1</div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">You add context</p>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">You</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Tell the AI what kind of leads you want. For example: "Find acting coaches on TikTok with 10k+ followers" or "Look for casting directors in NYC".</p>
                </div>
              </div>

              {/* Steps 2-4 - Automated */}
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-1 space-y-1">
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-500">Automated by AI</span>
                </div>
                <div className="flex gap-3 p-3 rounded-md bg-white/70">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">2</div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Generate searches</p>
                    <p className="text-xs text-gray-500 mt-0.5">AI turns your instructions into targeted web searches using Exa. These run daily at 9 AM, or you can trigger them manually.</p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 rounded-md bg-white/70">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">3</div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Find and enrich leads</p>
                    <p className="text-xs text-gray-500 mt-0.5">Discovered leads are enriched with AI: bio, social links, audience size, and a fit score (1-10) for your target persona.</p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 rounded-md bg-white/70">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">4</div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Auto-create campaigns</p>
                    <p className="text-xs text-gray-500 mt-0.5">An AI agent picks the best Instantly campaign for each lead, or creates a new one with a tailored email sequence.</p>
                  </div>
                </div>
              </div>

              {/* Step 5 - Manual */}
              <div className="flex gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                <div className="shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold">5</div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">You approve and send</p>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">You</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Preview email sequences, then click "Add to Campaign" to confirm. Leads go into Instantly and emails send on your schedule. You stay in control.</p>
                </div>
              </div>

              {/* Controls section */}
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Controls</p>

                <div className="flex gap-3 p-3 rounded-lg border border-green-200 bg-green-50/30">
                  <Power className="shrink-0 h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">System ON / OFF</p>
                    <p className="text-xs text-gray-500 mt-0.5">Master switch. When OFF, nothing runs: no searches, no enrichment, no campaign creation. Turn ON to activate all automated steps.</p>
                  </div>
                </div>

                <div className="flex gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/30">
                  <Zap className="shrink-0 h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Autopilot ON / OFF</p>
                    <p className="text-xs text-gray-500 mt-0.5">When ON, high-fit leads (score 7+) are automatically added to campaigns. When OFF, you review and click "Add to Campaign" manually.</p>
                  </div>
                </div>
              </div>

              {/* Schedule section */}
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Daily schedule</p>
                <div className="text-xs text-gray-500 space-y-1.5">
                  <div className="flex gap-2"><span className="font-mono text-gray-400 w-16 shrink-0">8:30 AM</span><span>Generate new search queries from your instructions</span></div>
                  <div className="flex gap-2"><span className="font-mono text-gray-400 w-16 shrink-0">9:00 AM</span><span>Run searches, discover leads, enrich and score them</span></div>
                  <div className="flex gap-2"><span className="font-mono text-gray-400 w-16 shrink-0">Hourly</span><span>Sync campaign analytics from Instantly</span></div>
                  <div className="flex gap-2"><span className="font-mono text-gray-400 w-16 shrink-0">6:00 PM</span><span>Send daily digest email with summary</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

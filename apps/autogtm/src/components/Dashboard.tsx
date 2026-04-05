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
  RotateCcw,
  Save,
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
  instantly_campaign_id: string | null;
  source_lead_id?: string | null;
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
  outreach_prompt_id?: string | null;
  outreach_prompt_snapshot?: string | null;
  outreach_prompts?: { name: string } | null;
  created_at: string;
}

interface OutreachPrompt {
  id: string;
  name: string;
  content: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
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
  const [outreachPrompts, setOutreachPrompts] = useState<OutreachPrompt[]>([]);
  const [newInstruction, setNewInstruction] = useState('');
  const [instructionPromptId, setInstructionPromptId] = useState<string>('');
  const [instructionPromptDraft, setInstructionPromptDraft] = useState('');
  const [instructionOverrideOpen, setInstructionOverrideOpen] = useState(false);
  const [defaultInstructionPrompt, setDefaultInstructionPrompt] = useState('');
  const [instructionComposerOpen, setInstructionComposerOpen] = useState(false);
  const [savingOutreachPrompt, setSavingOutreachPrompt] = useState(false);
  const [newOutreachPromptName, setNewOutreachPromptName] = useState('');
  const [newOutreachPromptContent, setNewOutreachPromptContent] = useState('');
  const [outreachPromptEdits, setOutreachPromptEdits] = useState<Record<string, { name: string; content: string }>>({});
  const [savingLibraryPromptId, setSavingLibraryPromptId] = useState<string | null>(null);
  const [creatingLibraryPrompt, setCreatingLibraryPrompt] = useState(false);
  const [addingInstruction, setAddingInstruction] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: '', website: '', description: '', target_audience: '' });
  const [instantlyAccounts, setInstantlyAccounts] = useState<InstantlyAccount[]>([]);
  const [savingSendingEmails, setSavingSendingEmails] = useState(false);
  const [sendingAccountsOpen, setSendingAccountsOpen] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [leadFilter, setLeadFilter] = useState<'all' | 'suggested' | 'routed' | 'pending' | 'skipped'>('all');
  const [previewCampaign, setPreviewCampaign] = useState<{ campaign: Campaign; emails: CampaignEmail[]; leadId?: string } | null>(null);
  const [loadingCampaignPreview, setLoadingCampaignPreview] = useState(false);
  const [savingCampaignPreview, setSavingCampaignPreview] = useState(false);
  const [startingCampaignLeadId, setStartingCampaignLeadId] = useState<string | null>(null);
  const [regeneratingCampaignPreview, setRegeneratingCampaignPreview] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoingCampaignPreview, setUndoingCampaignPreview] = useState(false);
  const [showLeadBio, setShowLeadBio] = useState(false);
  const [showLeadSocial, setShowLeadSocial] = useState(false);
  const [showLeadSource, setShowLeadSource] = useState(false);
  const regenerateFeedbackRef = useRef<HTMLTextAreaElement | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [companyProfileOpen, setCompanyProfileOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [generatingQueries, setGeneratingQueries] = useState(false);
  const [runningInstructionNow, setRunningInstructionNow] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!selectedLead) return;

    setShowLeadBio(false);
    setShowLeadSocial(false);
    setShowLeadSource(false);

    const campaignId = selectedLead.campaign_status === 'routed'
      ? selectedLead.campaign_id
      : selectedLead.suggested_campaign_id;
    if (!campaignId) return;

    const alreadyOpen = previewCampaign
      && previewCampaign.campaign.id === campaignId
      && previewCampaign.leadId === selectedLead.id;
    if (!alreadyOpen) {
      void openCampaignPreview(campaignId, selectedLead.id);
    }
  }, [selectedLead?.id, selectedLead?.suggested_campaign_id, selectedLead?.campaign_id, selectedLead?.campaign_status]);

  useEffect(() => {
    const loadDefaultPrompt = async () => {
      if (!instructionComposerOpen || defaultInstructionPrompt) return;
      try {
        const res = await fetch('/api/email-prompt/default');
        if (!res.ok) return;
        const data = await res.json();
        setDefaultInstructionPrompt(data.prompt || '');
      } catch {}
    };
    void loadDefaultPrompt();
  }, [instructionComposerOpen, defaultInstructionPrompt]);

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
      const [queriesRes, leadsRes, campaignsRes, statsRes, instructionsRes, companyRes, accountsRes, outreachPromptsRes] = await Promise.all([
        fetch(`/api/queries?company_id=${companyId}`),
        fetch(`/api/leads?company_id=${companyId}`),
        fetch(`/api/campaigns?company_id=${companyId}`),
        fetch(`/api/stats?company_id=${companyId}`),
        fetch(`/api/companies/${companyId}/updates`),
        fetch(`/api/companies/${companyId}`),
        fetch('/api/instantly/accounts'),
        fetch(`/api/companies/${companyId}/outreach-prompts`),
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
      if (outreachPromptsRes.ok) {
        const data = await outreachPromptsRes.json();
        setOutreachPrompts(data.prompts || []);
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
        toast({ title: 'Campaign send started', description: 'Draft will be sent and the lead will be added shortly' });
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
          toast({ title: 'Campaign generated', description: 'Draft campaign is ready. Open it, edit if needed, then Create and Start Campaign.' });
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

  const openCampaignPreview = async (campaignId: string, leadId?: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    const resolvedLeadId = leadId || campaign.source_lead_id || undefined;
    if (
      previewCampaign
      && previewCampaign.campaign.id === campaignId
      && previewCampaign.leadId === resolvedLeadId
      && !loadingCampaignPreview
    ) {
      return;
    }
    setLoadingCampaignPreview(true);
    if (regenerateFeedbackRef.current) {
      regenerateFeedbackRef.current.value = '';
    }
    setUndoAvailable(false);
    setPreviewCampaign({ campaign, emails: [], leadId: resolvedLeadId });
    try {
      const [emailsRes, versionsRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/emails`),
        fetch(`/api/campaigns/${campaignId}/emails/versions`),
      ]);
      if (emailsRes.ok) {
        const data = await emailsRes.json();
        setPreviewCampaign({ campaign, emails: data.emails || [], leadId: resolvedLeadId });
      }
      if (versionsRes.ok) {
        const versionsData = await versionsRes.json();
        setUndoAvailable(!!versionsData.undo_available);
      }
    } catch {} finally {
      setLoadingCampaignPreview(false);
    }
  };

  const updatePreviewEmail = (index: number, field: keyof CampaignEmail, value: string | number) => {
    if (!previewCampaign) return;
    const nextEmails = previewCampaign.emails.map((email, i) => (
      i === index ? { ...email, [field]: value } : email
    ));
    setPreviewCampaign({ ...previewCampaign, emails: nextEmails });
  };

  const savePreviewEmails = async (): Promise<boolean> => {
    if (!previewCampaign) return false;
    setSavingCampaignPreview(true);
    try {
      const res = await fetch(`/api/campaigns/${previewCampaign.campaign.id}/emails`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: previewCampaign.emails.map((email) => ({
            step: email.step,
            subject: email.subject,
            body: email.body,
            delay_days: email.delay_days,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save draft');
      }
      setPreviewCampaign({ campaign: previewCampaign.campaign, emails: data.emails || [], leadId: previewCampaign.leadId });
      setUndoAvailable(!!data.undo_available);
      toast({ title: 'Draft saved' });
      return true;
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save draft' });
      return false;
    } finally {
      setSavingCampaignPreview(false);
    }
  };

  const createAndStartCampaignFromPreview = async () => {
    if (!previewCampaign?.leadId) return;
    setStartingCampaignLeadId(previewCampaign.leadId);
    try {
      const saved = await savePreviewEmails();
      if (!saved) return;
      await routeLeadToCampaign(previewCampaign.leadId);
      setPreviewCampaign(null);
    } finally {
      setStartingCampaignLeadId(null);
    }
  };

  const regeneratePreviewEmails = async () => {
    if (!previewCampaign?.leadId || !previewCampaign.campaign?.id) return;
    const feedback = regenerateFeedbackRef.current?.value?.trim() || '';
    if (!feedback) {
      toast({ variant: 'destructive', title: 'Feedback required', description: 'Tell AI what to improve before regenerating.' });
      return;
    }

    setRegeneratingCampaignPreview(true);
    try {
      const res = await fetch(`/api/campaigns/${previewCampaign.campaign.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: previewCampaign.leadId,
          feedback,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate');
      }

      const currentByStep = new Map(previewCampaign.emails.map((email) => [email.step, email]));
      const regeneratedEmails = (data.emails || []).map((email: any) => {
        const existing = currentByStep.get(email.step);
        return {
          id: existing?.id || `regen-${email.step}`,
          step: email.step,
          subject: email.subject,
          body: email.body,
          delay_days: email.delay_days,
        };
      });

      setPreviewCampaign({
        ...previewCampaign,
        emails: regeneratedEmails,
      });
      toast({ title: 'Draft regenerated', description: 'Review the proposed copy and click Save Draft to persist.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to regenerate draft' });
    } finally {
      setRegeneratingCampaignPreview(false);
    }
  };

  const undoPreviewEmails = async () => {
    if (!previewCampaign?.campaign?.id) return;

    setUndoingCampaignPreview(true);
    try {
      const res = await fetch(`/api/campaigns/${previewCampaign.campaign.id}/emails/versions`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to undo');
      }

      setPreviewCampaign({
        ...previewCampaign,
        emails: data.emails || [],
      });
      setUndoAvailable(!!data.undo_available);
      toast({ title: 'Draft reverted', description: 'Restored the previous saved version.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to undo draft changes' });
    } finally {
      setUndoingCampaignPreview(false);
    }
  };

  // Filter leads by selected query
  const filteredLeads = selectedQueryFilter === 'all'
    ? leads
    : leads.filter(l => l.query_id === selectedQueryFilter);
  const selectedInstructionPreset = instructionPromptId
    ? outreachPrompts.find((prompt) => prompt.id === instructionPromptId) || null
    : null;

  const saveOutreachPrompt = async (): Promise<string | null> => {
    if (!companyId || !instructionPromptDraft.trim()) return null;
    setSavingOutreachPrompt(true);
    try {
      const normalizedInstruction = newInstruction.trim().replace(/\s+/g, ' ');
      const inferredName = normalizedInstruction
        ? `Prompt for: ${normalizedInstruction.slice(0, 64)}`
        : `Prompt ${new Date().toLocaleDateString()}`;
      const response = await fetch(`/api/companies/${companyId}/outreach-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inferredName,
          content: instructionPromptDraft.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save outreach prompt');
      }
      const createdPrompt = data.prompt as OutreachPrompt;
      if (createdPrompt) {
        setOutreachPrompts((prev) => [createdPrompt, ...prev]);
        setInstructionPromptId(createdPrompt.id);
        return createdPrompt.id;
      }
      return null;
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save outreach prompt' });
      return null;
    } finally {
      setSavingOutreachPrompt(false);
    }
  };

  const createOutreachPromptPreset = async () => {
    if (!companyId || !newOutreachPromptName.trim() || !newOutreachPromptContent.trim()) return;
    setCreatingLibraryPrompt(true);
    try {
      const response = await fetch(`/api/companies/${companyId}/outreach-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newOutreachPromptName.trim(),
          content: newOutreachPromptContent.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create prompt preset');
      }
      setOutreachPrompts((prev) => [data.prompt, ...prev]);
      setNewOutreachPromptName('');
      setNewOutreachPromptContent('');
      toast({ title: 'Prompt preset created' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to create prompt preset' });
    } finally {
      setCreatingLibraryPrompt(false);
    }
  };

  const saveOutreachPromptPreset = async (promptId: string) => {
    if (!companyId) return;
    const draft = outreachPromptEdits[promptId];
    if (!draft) return;
    setSavingLibraryPromptId(promptId);
    try {
      const response = await fetch(`/api/companies/${companyId}/outreach-prompts/${promptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          content: draft.content,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save prompt preset');
      }
      setOutreachPrompts((prev) => prev.map((p) => (p.id === promptId ? data.prompt : p)));
      setOutreachPromptEdits((prev) => {
        const next = { ...prev };
        delete next[promptId];
        return next;
      });
      toast({ title: 'Prompt preset saved' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save prompt preset' });
    } finally {
      setSavingLibraryPromptId(null);
    }
  };

  const deleteOutreachPromptPreset = async (promptId: string) => {
    if (!companyId) return;
    try {
      const response = await fetch(`/api/companies/${companyId}/outreach-prompts/${promptId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete prompt preset');
      }
      setOutreachPrompts((prev) => prev.filter((p) => p.id !== promptId));
      setOutreachPromptEdits((prev) => {
        const next = { ...prev };
        delete next[promptId];
        return next;
      });
      if (instructionPromptId === promptId) {
        setInstructionPromptId('');
      }
      toast({ title: 'Prompt preset deleted' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete prompt preset' });
    }
  };

  const addInstruction = async (mode: 'queue' | 'run_now' = 'queue') => {
    if (!newInstruction.trim() || !companyId) return;
    setAddingInstruction(true);
    if (mode === 'run_now') setRunningInstructionNow(true);
    try {
      let outreachPromptId: string | null = instructionPromptId || null;
      if (!outreachPromptId && instructionPromptDraft.trim()) {
        outreachPromptId = await saveOutreachPrompt();
      }

      const response = await fetch(`/api/companies/${companyId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newInstruction.trim(), mode, outreach_prompt_id: outreachPromptId }),
      });
      const data = await response.json();

      if (!response.ok && response.status !== 202) {
        throw new Error(data.error || 'Failed to add instruction');
      }

      if (data.update) {
        setInstructions((prev) => [data.update, ...prev]);
        setNewInstruction('');
        setInstructionPromptId('');
        setInstructionPromptDraft('');
        setInstructionOverrideOpen(false);
        setInstructionComposerOpen(false);
      }

      if (mode === 'queue') {
        toast({
          title: 'Instruction queued',
          description: 'Saved. It will be picked up in the scheduled 8:30 AM generation and 9:00 AM run.',
        });
        return;
      }

      setActiveTab('searches');
      await fetchData();

      if (data.run_now?.started) {
        toast({
          title: 'Run started',
          description: 'Query is running now. Lead extraction and enrichment are in progress.',
        });
      } else if (response.status === 202 || data.run_now?.reason === 'query_not_ready') {
        toast({
          variant: 'destructive',
          title: 'Run launching, but query is not ready yet',
          description: 'Generation was triggered. Check Searches in a few seconds.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Run-now launch incomplete',
          description: 'Instruction was saved, but search did not start automatically.',
        });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to add instruction' });
    } finally {
      setAddingInstruction(false);
      setRunningInstructionNow(false);
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
  const liveCampaigns = campaigns.filter((campaign) => campaign.instantly_campaign_id && campaign.status !== 'draft');

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
    { id: 'campaigns' as Tab, label: 'Campaigns', count: liveCampaigns.length, icon: Send },
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
              <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-gray-200 bg-white">
                <span className="text-xs font-semibold text-gray-600">AUTO</span>
                <button
                  role="switch"
                  aria-checked={company?.auto_add_enabled ? 'true' : 'false'}
                  onClick={async () => {
                    if (!company || !companyId) return;
                    const newVal = !company.auto_add_enabled;
                    if (newVal) {
                      const msg = `Turn Autopilot ON? Leads with fit score ${company.auto_add_min_fit_score || 7}+ will be automatically added to campaigns.`;
                      if (!confirm(msg)) return;
                    }
                    try {
                      const res = await fetch(`/api/companies/${companyId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ auto_add_enabled: newVal }),
                      });
                      if (res.ok) {
                        setCompany({ ...company, auto_add_enabled: newVal });
                        toast({
                          title: newVal ? 'Autopilot ON' : 'Autopilot OFF',
                          description: newVal
                            ? `Leads with fit score ${company.auto_add_min_fit_score || 7}+ will be auto-added to campaigns.`
                            : 'Manual review mode enabled.',
                        });
                      }
                    } catch {}
                  }}
                  disabled={!company}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    !company
                      ? 'bg-gray-200 cursor-not-allowed'
                      : company.auto_add_enabled
                        ? 'bg-amber-500'
                        : 'bg-gray-300'
                  }`}
                  title={company?.auto_add_enabled
                    ? `Autopilot is ON (fit ${company?.auto_add_min_fit_score || 7}+)`
                    : 'Autopilot is OFF'}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      company?.auto_add_enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className={`text-xs font-medium ${company?.auto_add_enabled ? 'text-amber-700' : 'text-gray-500'}`}>
                  {company?.auto_add_enabled ? 'On' : 'Off'}
                </span>
              </div>
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
                      {!instructionComposerOpen ? (
                        <div className="mb-4">
                          <Button
                            variant="outline"
                            onClick={() => setInstructionComposerOpen(true)}
                          >
                            Add Instruction
                          </Button>
                        </div>
                      ) : (
                        <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-white space-y-3">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Instruction</label>
                            <input
                              type="text"
                              value={newInstruction}
                              onChange={(e) => setNewInstruction(e.target.value)}
                              placeholder="e.g., Focus on artists in Canada with 10k-100k followers"
                              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Outreach Prompt Preset</label>
                            <select
                              value={instructionPromptId}
                              onChange={(e) => {
                                setInstructionPromptId(e.target.value);
                              }}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
                            >
                              <option value="">No preset (use global/default)</option>
                              {outreachPrompts.map((prompt) => (
                                <option key={prompt.id} value={prompt.id}>{prompt.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs text-gray-500 block">
                                {selectedInstructionPreset ? `Selected Preset: ${selectedInstructionPreset.name}` : 'Default Prompt (read-only)'}
                              </label>
                              <span className="text-[10px] uppercase tracking-wide text-gray-400">Reference</span>
                            </div>
                            <textarea
                              value={selectedInstructionPreset?.content || defaultInstructionPrompt}
                              readOnly
                              rows={7}
                              placeholder="Loading default prompt..."
                              className="w-full text-xs font-mono border border-gray-200 rounded-lg p-3 bg-gray-100 text-gray-500 resize-y focus:outline-none"
                            />
                          </div>
                          {!instructionOverrideOpen ? (
                            <div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setInstructionOverrideOpen(true);
                                  setInstructionPromptDraft(selectedInstructionPreset?.content || defaultInstructionPrompt);
                                }}
                              >
                                Add Custom Override
                              </Button>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="text-xs text-indigo-700 block">Custom Override (saved as new preset)</label>
                                <span className="text-[10px] uppercase tracking-wide text-indigo-500">Active</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setInstructionOverrideOpen(false);
                                    setInstructionPromptDraft('');
                                  }}
                                >
                                  Close
                                </Button>
                              </div>
                              <textarea
                                value={instructionPromptDraft}
                                onChange={(e) => setInstructionPromptDraft(e.target.value)}
                                rows={8}
                                placeholder="Edit your override prompt here..."
                                className="w-full text-xs font-mono border border-indigo-200 rounded-lg p-3 bg-white text-gray-700 resize-y focus:outline-none focus:ring-1 focus:ring-indigo-300"
                              />
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => addInstruction('queue')}
                              disabled={addingInstruction || runningInstructionNow || savingOutreachPrompt || !newInstruction.trim()}
                            >
                              {(addingInstruction || savingOutreachPrompt) ? 'Adding...' : 'Queue'}
                            </Button>
                            <Button
                              onClick={() => addInstruction('run_now')}
                              disabled={addingInstruction || runningInstructionNow || savingOutreachPrompt || !newInstruction.trim()}
                            >
                              {runningInstructionNow ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running...</>
                              ) : (
                                <>Run now</>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setInstructionComposerOpen(false);
                                setNewInstruction('');
                                setInstructionPromptId('');
                                setInstructionPromptDraft('');
                                setInstructionOverrideOpen(false);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
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
                                {entry.outreach_prompts?.name && (
                                  <p className="text-xs text-blue-600 mt-1">Prompt: {entry.outreach_prompts.name}</p>
                                )}
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
                            const hasSuggestedCampaign = !!lead.suggested_campaign_id;
                            const isEnriched = lead.enrichment_status === 'enriched';
                            const isUnenriched = lead.enrichment_status === 'pending' || lead.enrichment_status === 'failed';

                            return (
                              <div
                                key={lead.id}
                                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                  hasSuggestedCampaign && lead.campaign_status !== 'routed'
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
                                    {lead.campaign_status === 'routed' ? (
                                      <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700">
                                          <CheckCircle2 className="h-3 w-3" />
                                          Added
                                        </span>
                                      </div>
                                    ) : routingLeads.has(lead.id) ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-600">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Starting...
                                      </span>
                                    ) : hasSuggestedCampaign ? (
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => setSelectedLead(lead)}
                                          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium whitespace-nowrap transition-colors"
                                        >
                                          <Check className="h-3 w-3" />
                                          Ready to Review
                                        </button>
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
                                          <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Generating...</span>
                                        ) : 'Generate Campaign'}
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
                              <span className="text-xs font-medium text-gray-700">Global Fallback Prompt</span>
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

                          {/* Outreach Prompt Library */}
                          <div className="px-4 py-3">
                            <p className="text-xs font-medium text-gray-700 mb-2">Outreach Prompt Library</p>
                            <div className="space-y-2 mb-3">
                              <input
                                type="text"
                                value={newOutreachPromptName}
                                onChange={(e) => setNewOutreachPromptName(e.target.value)}
                                placeholder="Preset name"
                                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300"
                              />
                              <textarea
                                value={newOutreachPromptContent}
                                onChange={(e) => setNewOutreachPromptContent(e.target.value)}
                                rows={4}
                                placeholder="Prompt preset content..."
                                className="w-full text-xs font-mono px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300"
                              />
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  onClick={createOutreachPromptPreset}
                                  disabled={creatingLibraryPrompt || !newOutreachPromptName.trim() || !newOutreachPromptContent.trim()}
                                >
                                  {creatingLibraryPrompt ? 'Creating...' : 'Create Preset'}
                                </Button>
                              </div>
                            </div>
                            {outreachPrompts.length === 0 ? (
                              <p className="text-xs text-gray-400">No outreach presets yet.</p>
                            ) : (
                              <div className="space-y-2">
                                {outreachPrompts.map((prompt) => {
                                  const draft = outreachPromptEdits[prompt.id] || { name: prompt.name, content: prompt.content };
                                  return (
                                    <div key={prompt.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                                      <input
                                        type="text"
                                        value={draft.name}
                                        onChange={(e) => setOutreachPromptEdits((prev) => ({
                                          ...prev,
                                          [prompt.id]: { ...draft, name: e.target.value },
                                        }))}
                                        className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded mb-2 bg-white"
                                      />
                                      <textarea
                                        value={draft.content}
                                        onChange={(e) => setOutreachPromptEdits((prev) => ({
                                          ...prev,
                                          [prompt.id]: { ...draft, content: e.target.value },
                                        }))}
                                        rows={4}
                                        className="w-full text-xs font-mono px-2 py-1.5 border border-gray-200 rounded bg-white"
                                      />
                                      <div className="flex items-center justify-between mt-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            setInstructionComposerOpen(true);
                                            setInstructionPromptId(prompt.id);
                                            setInstructionOverrideOpen(false);
                                            setInstructionPromptDraft('');
                                          }}
                                        >
                                          Use in Instruction
                                        </Button>
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            onClick={() => saveOutreachPromptPreset(prompt.id)}
                                            disabled={savingLibraryPromptId === prompt.id}
                                          >
                                            {savingLibraryPromptId === prompt.id ? 'Saving...' : 'Save'}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => deleteOutreachPromptPreset(prompt.id)}
                                          >
                                            Delete
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {liveCampaigns.length === 0 ? (
                      <div className="py-12 text-center">
                        <Send className="h-10 w-10 mx-auto mb-4 text-gray-300" />
                        <p className="text-gray-500">No sent campaigns yet. Sent campaigns appear here after they are created in Instantly.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {liveCampaigns.map((campaign) => {
                          const isExpanded = expandedCampaign === campaign.id;
                          const matchedLeads = leads.filter((l: any) => l.campaign_id === campaign.id);

                          return (
                            <div key={campaign.id} className="rounded-lg border border-gray-200">
                              <div className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        campaign.status === 'active' ? 'bg-green-100 text-green-700' :
                                        campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                          campaign.status === 'active' ? 'bg-green-500' :
                                          campaign.status === 'paused' ? 'bg-yellow-500' :
                                          'bg-gray-400'
                                        }`} />
                                        {campaign.status}
                                      </span>
                                      {campaign.persona && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                                          {campaign.persona}
                                        </span>
                                      )}
                                    </div>
                                    <p className="font-medium text-gray-900 truncate">{campaign.name}</p>
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
                                    {campaign.instantly_campaign_id ? (
                                      <a
                                        href={`https://app.instantly.ai/app/campaign/${campaign.instantly_campaign_id}/analytics`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <Button size="sm" variant="outline">
                                          <ExternalLink className="h-4 w-4 mr-1" />
                                          Instantly
                                        </Button>
                                      </a>
                                    ) : (
                                      <Button size="sm" variant="outline" disabled>
                                        <ExternalLink className="h-4 w-4 mr-1" />
                                        Draft only
                                      </Button>
                                    )}
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
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
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
              <div className="flex items-center gap-2">
                {previewCampaign?.leadId === selectedLead.id && previewCampaign.campaign.instantly_campaign_id && (
                  <a
                    href={`https://app.instantly.ai/app/campaign/${previewCampaign.campaign.instantly_campaign_id}/analytics`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Instantly
                    </Button>
                  </a>
                )}
                <button onClick={() => setSelectedLead(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden md:grid md:grid-cols-12">
              <div className="md:col-span-5 overflow-y-auto">
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
              </div>
              </div>
              <div className="hidden md:flex md:col-span-7 border-l border-gray-100 flex-col overflow-hidden">
                <div className="p-4 border-b">
                  <p className="text-sm font-semibold text-gray-900">Campaign Workspace</p>
                  <p className="text-xs text-gray-500 mt-1">Review, edit, regenerate, and start from one place.</p>
                </div>
                {!previewCampaign || previewCampaign.leadId !== selectedLead.id ? (
                  <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center max-w-sm">
                      <Send className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm text-gray-500 mb-3">Open this lead's suggested campaign draft.</p>
                      {selectedLead.suggested_campaign_id ? (
                        <Button onClick={() => openCampaignPreview(selectedLead.suggested_campaign_id!, selectedLead.id)}>
                          <Send className="h-4 w-4 mr-2" />
                          Open Suggested Draft
                        </Button>
                      ) : (
                        <p className="text-xs text-gray-400">No suggested campaign yet.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {previewCampaign.emails.map((email, i) => (
                        <div key={email.id} className="rounded-lg border border-gray-200">
                          <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                              {i === 0 ? 'Initial Email' : `Follow-up ${i}`}
                            </span>
                            {email.delay_days > 0 && (
                              <span className="text-xs text-gray-400">+{email.delay_days} days</span>
                            )}
                          </div>
                          <div className="p-4 space-y-3">
                            {selectedLead.campaign_status === 'routed' ? (
                              <>
                                {email.subject && (
                                  <p className="text-sm font-medium text-gray-900">Subject: {email.subject}</p>
                                )}
                                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{email.body}</p>
                              </>
                            ) : (
                              <>
                                <input
                                  value={email.subject}
                                  onChange={(e) => updatePreviewEmail(i, 'subject', e.target.value)}
                                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                                  placeholder="Subject"
                                />
                                <textarea
                                  value={email.body}
                                  onChange={(e) => updatePreviewEmail(i, 'body', e.target.value)}
                                  className="w-full min-h-[120px] rounded-md border border-gray-200 px-3 py-2 text-sm"
                                />
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      {selectedLead.campaign_status !== 'routed' && (
                        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Regenerate With Feedback</label>
                          <textarea
                            ref={regenerateFeedbackRef}
                            placeholder="Example: make it shorter, stronger hook from their bio, less generic CTA."
                            className="w-full min-h-[84px] rounded-md border border-gray-200 px-3 py-2 text-sm"
                          />
                          <Button variant="outline" onClick={regeneratePreviewEmails} disabled={regeneratingCampaignPreview} className="w-full">
                            {regeneratingCampaignPreview ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Regenerating...</>
                            ) : (
                              <><Sparkles className="h-4 w-4 mr-2" /> Regenerate Draft</>
                            )}
                          </Button>
                          <p className="text-xs text-gray-500">Regenerate updates this draft first. Click Save Draft to keep changes.</p>
                        </div>
                      )}
                    </div>
                    {selectedLead.campaign_status !== 'routed' && (
                      <div className="p-4 border-t bg-white shrink-0">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                          <Button onClick={savePreviewEmails} disabled={savingCampaignPreview} variant="outline">
                            <Save className="h-4 w-4 mr-2" />
                            Save Draft
                          </Button>
                          <Button variant="outline" onClick={undoPreviewEmails} disabled={!undoAvailable || undoingCampaignPreview}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Undo Last Save
                          </Button>
                          <Button onClick={createAndStartCampaignFromPreview} disabled={savingCampaignPreview || routingLeads.has(selectedLead.id)}>
                            <Send className="h-4 w-4 mr-2" />
                            Create and Start
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="p-4 border-t flex gap-2 shrink-0 bg-white md:hidden">
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
                  onClick={() => openCampaignPreview(selectedLead.suggested_campaign_id!, selectedLead.id)}
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Review Suggested Campaign
                </Button>
              )}
              {selectedLead.enrichment_status === 'enriched' && selectedLead.email && !selectedLead.suggested_campaign_id && selectedLead.campaign_status !== 'routed' && selectedLead.campaign_status !== 'skipped' && (
                <Button
                  onClick={() => suggestCampaign(selectedLead.id)}
                  disabled={suggestingLeads.has(selectedLead.id)}
                  className="flex-1"
                >
                  {suggestingLeads.has(selectedLead.id) ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating Campaign...</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" /> Generate Campaign</>
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
                    <p className="text-xs text-gray-500 mt-0.5">When you add an instruction, choose Queue (scheduled for 8:30 AM generation + 9:00 AM run) or Run now (immediate generation and run).</p>
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
                    <p className="font-medium text-gray-900 text-sm">Auto-generate draft campaigns</p>
                    <p className="text-xs text-gray-500 mt-0.5">An AI agent generates a unique draft sequence for each qualified lead. Nothing is created in Instantly until send.</p>
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
                  <p className="text-xs text-gray-500 mt-0.5">Preview and edit draft sequences, then click "Create and Start Campaign". Only then do we create it in Instantly and add the lead.</p>
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
                    <p className="text-xs text-gray-500 mt-0.5">When ON, high-fit leads (score 7+) are auto-sent: draft is created in Instantly and the lead is added. When OFF, you review and click "Create and Start Campaign" manually.</p>
                  </div>
                </div>
              </div>

              {/* Schedule section */}
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Daily schedule</p>
                <div className="text-xs text-gray-500 space-y-1.5">
                  <div className="flex gap-2"><span className="font-mono text-gray-400 w-16 shrink-0">8:30 AM</span><span>Generate new search queries from your instructions</span></div>
                  <div className="flex gap-2"><span className="font-mono text-gray-400 w-16 shrink-0">9:00 AM</span><span>Run searches, discover leads, enrich and score them</span></div>
                  <div className="flex gap-2"><span className="font-mono text-gray-400 w-16 shrink-0">Hourly</span><span>Sync campaign status and analytics from Instantly</span></div>
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

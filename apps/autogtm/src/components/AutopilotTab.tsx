'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Zap, Play, Sparkles, CheckCircle2, AlertTriangle, Clock, Info } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export interface AutopilotCompany {
	id: string;
	name: string;
	auto_add_enabled: boolean;
	auto_add_min_fit_score: number;
	auto_add_daily_limit?: number;
	auto_add_run_hour_utc?: number;
	auto_add_digest_email?: string | null;
	auto_add_regenerate_drafts?: boolean;
}

interface AutoAddRun {
	id: string;
	run_started_at: string;
	run_completed_at: string | null;
	leads_considered: number;
	leads_added: number;
	leads_skipped: number;
	min_fit_score: number;
	daily_limit: number;
	breakdown: Array<{ campaignId: string; campaignName: string; count: number; avgFitScore: number }>;
	skip_reasons: Record<string, number>;
	digest_sent: boolean;
	digest_error: string | null;
	error: string | null;
	trigger: 'cron' | 'manual';
}

interface AutopilotTabProps {
	company: AutopilotCompany;
	onCompanyUpdated: (updates: Partial<AutopilotCompany>) => void;
}

// Formats a UTC hour in America/New_York local time, correctly respecting DST
// so we display "10:00 AM EDT" in summer and "9:00 AM EST" in winter (the cron
// runs at fixed 14:00 UTC, which maps to different ET wall-clock times by season).
const HOUR_LABEL_ET = (hourUtc: number) => {
	const d = new Date();
	d.setUTCHours(hourUtc, 0, 0, 0);
	return new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		timeZoneName: 'short',
	}).format(d);
};

/**
 * Small inline "Saved" indicator that fades out 2s after a save completes.
 * Reused across every preference control for consistent feedback.
 */
function SavedPing({ active }: { active: boolean }) {
	if (!active) return null;
	return (
		<span className="inline-flex items-center gap-1 text-xs text-green-600 animate-in fade-in duration-200">
			<CheckCircle2 className="h-3 w-3" />
			Saved
		</span>
	);
}

export function AutopilotTab({ company, onCompanyUpdated }: AutopilotTabProps) {
	const { toast } = useToast();

	const [minFitScore, setMinFitScore] = useState(company.auto_add_min_fit_score || 7);
	const [dailyLimit, setDailyLimit] = useState(company.auto_add_daily_limit ?? 5);
	const [digestEmail, setDigestEmail] = useState(company.auto_add_digest_email || '');

	const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
	const savedTimers = useRef<Record<string, NodeJS.Timeout>>({});

	const [runs, setRuns] = useState<AutoAddRun[]>([]);
	const [runsLoading, setRunsLoading] = useState(false);
	const [running, setRunning] = useState(false);

	const runHourUtc = company.auto_add_run_hour_utc ?? 14;
	const enabled = company.auto_add_enabled;

	// Keep local form values aligned with upstream company prop changes.
	useEffect(() => {
		setMinFitScore(company.auto_add_min_fit_score || 7);
		setDailyLimit(company.auto_add_daily_limit ?? 5);
		setDigestEmail(company.auto_add_digest_email || '');
	}, [company.id, company.auto_add_min_fit_score, company.auto_add_daily_limit, company.auto_add_digest_email]);

	const pingSaved = (key: string) => {
		setSavedFields((s) => ({ ...s, [key]: true }));
		if (savedTimers.current[key]) clearTimeout(savedTimers.current[key]);
		savedTimers.current[key] = setTimeout(() => {
			setSavedFields((s) => ({ ...s, [key]: false }));
		}, 2000);
	};

	const patchCompany = useCallback(
		async (patch: Partial<AutopilotCompany>, fieldKey: string, silent = false) => {
			try {
				const res = await fetch(`/api/companies/${company.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(patch),
				});
				if (!res.ok) throw new Error('Save failed');
				onCompanyUpdated(patch);
				pingSaved(fieldKey);
				return true;
			} catch (e) {
				if (!silent) {
					toast({ title: 'Save failed', description: e instanceof Error ? e.message : 'Unknown error' });
				}
				return false;
			}
		},
		[company.id, onCompanyUpdated, toast]
	);

	const loadRuns = useCallback(async () => {
		setRunsLoading(true);
		try {
			const res = await fetch(`/api/companies/${company.id}/auto-add/runs?limit=10`);
			if (res.ok) {
				const { runs: data } = await res.json();
				setRuns(data || []);
			}
		} finally {
			setRunsLoading(false);
		}
	}, [company.id]);

	useEffect(() => { loadRuns(); }, [loadRuns]);

	const handleToggleEnabled = async () => {
		const next = !enabled;
		if (next) {
			const msg = `Turn Autopilot ON? Every day at ${HOUR_LABEL_ET(runHourUtc)}, up to ${dailyLimit} Ready-to-Add leads with fit ≥ ${minFitScore} will be auto-added to campaigns.`;
			if (!confirm(msg)) return;
		}
		await patchCompany({ auto_add_enabled: next }, 'enabled');
		toast({
			title: next ? 'Autopilot ON' : 'Autopilot OFF',
			description: next
				? `Daily sweep at ${HOUR_LABEL_ET(runHourUtc)} · up to ${dailyLimit}/day · fit ${minFitScore}+`
				: 'Manual review mode enabled.',
		});
	};

	const handleToggleRegenerate = async () => {
		const next = !company.auto_add_regenerate_drafts;
		await patchCompany({ auto_add_regenerate_drafts: next }, 'regenerate');
	};

	const handleDailyLimitBlur = async () => {
		const clamped = Math.max(0, Math.min(500, Math.floor(dailyLimit) || 0));
		if (clamped !== dailyLimit) setDailyLimit(clamped);
		if (clamped === (company.auto_add_daily_limit ?? 5)) return;
		await patchCompany({ auto_add_daily_limit: clamped }, 'dailyLimit');
	};

	const handleFitScoreCommit = async () => {
		if (minFitScore === (company.auto_add_min_fit_score || 7)) return;
		await patchCompany({ auto_add_min_fit_score: minFitScore }, 'minFitScore');
	};

	const handleDigestEmailBlur = async () => {
		const trimmed = digestEmail.trim();
		const current = company.auto_add_digest_email || '';
		if (trimmed === current) return;
		await patchCompany({ auto_add_digest_email: trimmed || null }, 'digestEmail');
	};

	const handleRunNow = async () => {
		if (!confirm(`Run Autopilot now? Up to ${dailyLimit} leads with fit ≥ ${minFitScore} will be added to their suggested campaigns.`)) return;
		setRunning(true);
		try {
			const res = await fetch(`/api/companies/${company.id}/auto-add/run-now`, { method: 'POST' });
			if (!res.ok) throw new Error('Failed to trigger');
			toast({ title: 'Autopilot running', description: `Processing up to ${dailyLimit} leads. Digest lands in a minute.` });
			setTimeout(() => loadRuns(), 3000);
			setTimeout(() => loadRuns(), 10000);
			setTimeout(() => loadRuns(), 30000);
		} catch (e) {
			toast({ title: 'Run failed', description: e instanceof Error ? e.message : 'Unknown error' });
		} finally {
			setRunning(false);
		}
	};

	const lastRun = runs[0];

	return (
		<div className="space-y-6">
			{/* Hero */}
			<div className="rounded-lg border border-gray-200 bg-white p-6">
				<div className="flex items-start gap-4">
					<div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
						<Zap className="h-5 w-5" />
					</div>
					<div className="flex-1">
						<div className="flex items-center gap-3">
							<h2 className="text-xl font-semibold text-gray-900">Autopilot</h2>
							<button
								role="switch"
								aria-checked={enabled}
								onClick={handleToggleEnabled}
								className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}
							>
								<span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
							</button>
							<span className={`text-xs font-semibold ${enabled ? 'text-green-700' : 'text-gray-500'}`}>{enabled ? 'On' : 'Off'}</span>
							<SavedPing active={!!savedFields.enabled} />
						</div>
						<p className="mt-2 text-sm text-gray-600 leading-relaxed">
							autogtm will auto-add the top <strong className="text-gray-900">{dailyLimit}</strong> Ready-to-Add leads scoring <strong className="text-gray-900">{minFitScore}+</strong> every day at <strong className="text-gray-900">{HOUR_LABEL_ET(runHourUtc)}</strong>, then send a digest email summarizing what went out.
						</p>
					</div>
				</div>
			</div>

			{/* Empty state when off */}
			{!enabled && (
				<div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/40 p-8 text-center">
					<Info className="h-5 w-5 text-gray-400 mx-auto mb-2" />
					<p className="text-sm text-gray-600">
						Autopilot is off. Turn it on above to configure preferences and start the daily sweep.
					</p>
				</div>
			)}

			{/* Preferences */}
			{enabled && (
				<div className="rounded-lg border border-gray-200 bg-white p-6">
					<div className="mb-4">
						<h3 className="text-base font-semibold text-gray-900">Preferences</h3>
						<p className="text-sm text-gray-500 mt-0.5">Controls which leads qualify and how many get auto-added each day.</p>
					</div>

					<div className="space-y-5">
						<div className="flex items-start justify-between gap-6">
							<div className="flex-1">
								<label className="text-sm font-medium text-gray-900">Daily limit</label>
								<p className="text-xs text-gray-500 mt-0.5">Maximum leads auto-added per day. Conservative default: 5. Raise slowly while monitoring reply/bounce rates.</p>
							</div>
							<div className="flex items-center gap-3">
								<input
									type="number"
									min={0}
									max={500}
									value={dailyLimit}
									onChange={(e) => setDailyLimit(parseInt(e.target.value || '0', 10) || 0)}
									onBlur={handleDailyLimitBlur}
									className="w-20 px-3 py-1.5 text-sm text-right border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-400"
								/>
								<SavedPing active={!!savedFields.dailyLimit} />
							</div>
						</div>

						<div className="flex items-start justify-between gap-6">
							<div className="flex-1">
								<label className="text-sm font-medium text-gray-900">Minimum fit score</label>
								<p className="text-xs text-gray-500 mt-0.5">Only leads scoring this or higher will be auto-added.</p>
							</div>
							<div className="flex items-center gap-3 w-72">
								<input
									type="range"
									min={1}
									max={10}
									value={minFitScore}
									onChange={(e) => setMinFitScore(parseInt(e.target.value, 10))}
									onMouseUp={handleFitScoreCommit}
									onTouchEnd={handleFitScoreCommit}
									onKeyUp={handleFitScoreCommit}
									className="flex-1 accent-green-500"
								/>
								<span className="text-sm font-semibold text-gray-900 tabular-nums w-10 text-right">{minFitScore}/10</span>
								<SavedPing active={!!savedFields.minFitScore} />
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Draft refresh */}
			{enabled && (
				<div className="rounded-lg border border-gray-200 bg-white p-6">
					<div className="flex items-start justify-between gap-6">
						<div className="flex-1">
							<div className="flex items-center gap-2">
								<Sparkles className="h-4 w-4 text-indigo-500" />
								<h3 className="text-base font-semibold text-gray-900">Always regenerate draft before adding</h3>
							</div>
							<p className="text-sm text-gray-500 mt-1">
								Rewrites each draft's copy fresh for the specific lead right before sending. Catches stale or templated copy — only applies to draft campaigns.
							</p>
						</div>
						<div className="flex items-center gap-3 shrink-0">
							<SavedPing active={!!savedFields.regenerate} />
							<button
								role="switch"
								aria-checked={!!company.auto_add_regenerate_drafts}
								onClick={handleToggleRegenerate}
								className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${company.auto_add_regenerate_drafts ? 'bg-indigo-500' : 'bg-gray-300'}`}
							>
								<span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${company.auto_add_regenerate_drafts ? 'translate-x-5' : 'translate-x-0.5'}`} />
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Digest */}
			{enabled && (
				<div className="rounded-lg border border-gray-200 bg-white p-6">
					<div className="mb-4">
						<h3 className="text-base font-semibold text-gray-900">Daily digest email</h3>
						<p className="text-sm text-gray-500 mt-0.5">Where to send the daily summary of what Autopilot did. Leave empty to use the system default recipients.</p>
					</div>
					<div className="flex items-center gap-3 max-w-md">
						<input
							type="email"
							value={digestEmail}
							onChange={(e) => setDigestEmail(e.target.value)}
							onBlur={handleDigestEmailBlur}
							placeholder="you@company.com"
							className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-400"
						/>
						<SavedPing active={!!savedFields.digestEmail} />
					</div>
				</div>
			)}

			{/* Recent runs */}
			<div className="rounded-lg border border-gray-200 bg-white p-6">
				<div className="mb-4 flex items-start justify-between gap-4">
					<div>
						<h3 className="text-base font-semibold text-gray-900">Recent runs</h3>
						<p className="text-sm text-gray-500 mt-0.5">The last few Autopilot sweeps — manual and scheduled.</p>
					</div>
					<button
						onClick={handleRunNow}
						disabled={running || dailyLimit <= 0}
						className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
						Run now
					</button>
				</div>

				{runsLoading && runs.length === 0 ? (
					<div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
						<Loader2 className="h-4 w-4 animate-spin" /> Loading…
					</div>
				) : runs.length === 0 ? (
					<div className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-200 rounded-md">
						No runs yet. Hit <strong className="text-gray-700">Run now</strong> to do your first sweep.
					</div>
				) : (
					<div className="divide-y divide-gray-100">
						{runs.map((run) => (
							<div key={run.id} className="py-3 first:pt-0 last:pb-0">
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2 text-sm">
										{run.error ? (
											<AlertTriangle className="h-4 w-4 text-red-500" />
										) : run.leads_added > 0 ? (
											<CheckCircle2 className="h-4 w-4 text-green-600" />
										) : (
											<Clock className="h-4 w-4 text-gray-400" />
										)}
										<span className="font-medium text-gray-900">{run.leads_added} added</span>
										<span className="text-gray-400">·</span>
										<span className="text-gray-600">
											{new Date(run.run_started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
										</span>
										<span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
											{run.trigger}
										</span>
									</div>
									<div className="text-xs text-gray-500">
										fit ≥ {run.min_fit_score} · limit {run.daily_limit}
									</div>
								</div>
								{run.breakdown.length > 0 && (
									<div className="mt-2 ml-6 space-y-1">
										{run.breakdown.map((b) => (
											<div key={b.campaignId} className="flex items-center justify-between text-xs">
												<span className="text-gray-600 truncate pr-2">{b.campaignName}</span>
												<span className="text-gray-900 font-medium tabular-nums shrink-0">{b.count} · avg fit {b.avgFitScore.toFixed(1)}</span>
											</div>
										))}
									</div>
								)}
								{run.leads_skipped > 0 && (
									<div className="mt-1.5 ml-6 text-xs text-amber-700">
										Skipped {run.leads_skipped}
										{Object.keys(run.skip_reasons).length > 0 && (
											<>: {Object.entries(run.skip_reasons).map(([r, n]) => `${n} × ${r.replace(/_/g, ' ')}`).join(', ')}</>
										)}
									</div>
								)}
								{run.error && (
									<div className="mt-1.5 ml-6 text-xs text-red-600">Error: {run.error}</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

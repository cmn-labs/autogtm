import { getExaClient } from '@autogtm/core/clients/exa';
import { inngest } from '@/inngest/client';

export async function startQueryRun(supabase: any, queryId: string): Promise<{ websetId: string; status: 'running'; message: string }> {
  const { data: query, error: queryError } = await supabase
    .from('exa_queries')
    .select('*')
    .eq('id', queryId)
    .single();

  if (queryError || !query) {
    throw new Error('Query not found');
  }

  await supabase
    .from('exa_queries')
    .update({ status: 'running' })
    .eq('id', queryId);

  const exa = getExaClient();

  const websetParams: any = {
    search: {
      query: query.query,
      count: 25,
    },
    enrichments: [
      {
        description: 'Find the email address for this person or creator',
        format: 'email',
      },
      {
        description: 'Extract the follower or subscriber count if visible',
        format: 'number',
      },
    ],
  };

  if (query.criteria && query.criteria.length > 0) {
    websetParams.search.criteria = query.criteria.map((c: string) => ({ description: c }));
  }

  const webset = await exa.websets.create(websetParams);

  const { data: websetRun, error: runError } = await supabase
    .from('webset_runs')
    .insert({
      query_id: queryId,
      webset_id: webset.id,
      status: 'running',
      items_found: 0,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError) {
    console.error('Error creating webset run:', runError);
  }

  await inngest.send({
    name: 'autogtm/webset.created',
    data: {
      queryId,
      websetId: webset.id,
      websetRunId: websetRun?.id,
    },
  });

  return {
    websetId: webset.id,
    status: 'running',
    message: 'Search started. Lead extraction will happen in background.',
  };
}

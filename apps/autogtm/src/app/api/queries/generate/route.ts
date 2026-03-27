import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';

export async function POST(request: NextRequest) {
  try {
    const { companyId, instructionId } = await request.json();

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    if (instructionId) {
      await inngest.send({
        name: 'autogtm/queries.generate-for-instruction',
        data: { companyId, instructionId },
      });
      return NextResponse.json({ success: true, message: 'Instruction-specific query generation started' });
    }

    await inngest.send({
      name: 'autogtm/queries.generate',
      data: { companyId },
    });

    return NextResponse.json({ success: true, message: 'Query generation started' });
  } catch (error) {
    console.error('Error triggering query generation:', error);
    return NextResponse.json({ error: 'Failed to trigger query generation' }, { status: 500 });
  }
}

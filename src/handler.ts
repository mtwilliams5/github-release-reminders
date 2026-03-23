import { loadConfig } from './config';
import { processReleaseReminders } from './release-reminder';

/**
 * Lambda handler for the release reminder.
 * Triggered by EventBridge schedule or manual invocation.
 */
export async function handler(): Promise<{ statusCode: number; body: string }> {
  console.log('Handler invoked');
  try {
    console.log('Loading config...');
    const config = await loadConfig();
    console.log('Config loaded:', {
      repositories: config.repositories,
      ticketPattern: config.ticketPattern,
      readyStatuses: config.readyStatuses,
      qaStatuses: config.qaStatuses,
    });
    await processReleaseReminders(config);
    const result = {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Release reminders processed successfully',
      }),
    };
    console.log('Handler complete:', result);
    return result;
  } catch (err) {
    console.error('Release reminder failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Release reminder processing failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}

// Auto-invoke when run directly (e.g. `node dist/src/handler.js`)
if (require.main === module) {
  console.log('Running handler locally...');
  handler()
    .then((result) => {
      console.log('Result:', JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('Unhandled error:', err);
      process.exitCode = 1;
    });
}

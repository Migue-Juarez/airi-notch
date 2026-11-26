import { CopilotClient, RuntimeConnection } from '@microsoft/copilot-sdk';

const runtimePath = process.env.COPILOT_CLI_PATH;
const runtime = RuntimeConnection.forSpawnedStdio(
    runtimePath ? { path: runtimePath } : {},
);
const client = new CopilotClient({
    mode: 'coding-agent',
    runtime,
});
let started = false;

try {
    await client.start();
    started = true;

    const { quotaSnapshots = {} } = await client.rpc.account.getQuota({});
    const snapshots = Object.fromEntries(
        Object.entries(quotaSnapshots).map(([name, snapshot]) => [
            name,
            {
                usedRequests: snapshot.usedRequests ?? null,
                entitlementRequests: snapshot.entitlementRequests ?? null,
                remainingPercentage: snapshot.remainingPercentage ?? null,
                resetDate: snapshot.resetDate ?? null,
            },
        ]),
    );
    process.stdout.write(`${JSON.stringify({
        fetchedAt: new Date().toISOString(),
        quotaSnapshots: snapshots,
    })}\n`);
} finally {
    if (started)
        await client.stop();
}

import crypto from 'node:crypto';
// An explicit dev launcher marker lets mutation tests reject the wrong server.
// Never expose the connection string or credentials in a health response.
export function devTestMetadata(env = process.env) {
    if (env.EDUNET_DEV_MODE !== 'true' || !env.DATABASE_URL)
        return {};
    const url = new URL(env.DATABASE_URL);
    return {
        devTesting: true,
        notificationsDisabled: env.NOTIFICATIONS_ENABLED === 'false',
        databaseKey: crypto.createHash('sha256')
            .update(url.hostname + url.pathname + url.username).digest('hex').slice(0, 16),
    };
}

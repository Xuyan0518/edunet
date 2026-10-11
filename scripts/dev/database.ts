import fs from 'node:fs';
import { devTestMetadata } from '../../server/utils/devTesting';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
dotenv.config({ override: true });
if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required in .env');
export const databaseKey = devTestMetadata({ ...process.env, EDUNET_DEV_MODE: 'true' }).databaseKey;
export const sql = neon(process.env.DATABASE_URL);
export const stateFile = '.dev/accounts.json';
export function readState() {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state.databaseKey !== databaseKey)
        throw new Error('The test account manifest belongs to a different database; do not reuse it.');
    return state;
}
export function safeFailure(error: unknown) {
    const value = error as {
        code?: string;
        message?: string;
    };
    console.error('Dev database operation failed:', value.code || 'ERROR', String(value.message || 'Unknown failure').replaceAll(process.env.DATABASE_URL!, '[redacted]'));
    process.exitCode = 1;
}

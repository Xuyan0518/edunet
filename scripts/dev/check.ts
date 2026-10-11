import { sql, safeFailure } from './database';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { is, Table } from 'drizzle-orm';
import * as schema from '../../server/schema';
try {
    const rows = await sql `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`;
    const actual = new Set(rows.map(row => `${row.table_name}.${row.column_name}`));
    const missing: string[] = [];
    for (const value of Object.values(schema))
        if (is(value, Table)) {
            const table = getTableConfig(value as Parameters<typeof getTableConfig>[0]);
            for (const column of table.columns)
                if (!actual.has(`${table.name}.${column.name}`))
                    missing.push(`${table.name}.${column.name}`);
        }
    if (missing.length) {
        console.log('Missing database columns:', missing);
        process.exitCode = 1;
    }
    else
        console.log('Dev database connected; all tables/columns required by server/schema.ts are present.');
    console.log('This check does not migrate or change records.');
}
catch (error) {
    safeFailure(error);
}

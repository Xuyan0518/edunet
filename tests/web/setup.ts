import { beforeEach, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
vi.mock('../../server/db', () => ({ db: new Proxy({}, { get() { throw new Error('Database access is forbidden in web tests'); } }) }));
// Fail closed. Pure suites cannot access a database. The reviewer handler suite
// explicitly replaces this DB mock and mocks dotenv/notifications before importing the API.
// Every suite blocks real HTTP and socket access.
function blockNetwork() {
  const blocked = () => { throw new Error('Real network access is forbidden in web tests'); };
  vi.stubGlobal('fetch', vi.fn(blocked));
  vi.spyOn(http, 'request').mockImplementation(blocked);
  vi.spyOn(https, 'request').mockImplementation(blocked);
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(blocked);
}
blockNetwork();
beforeEach(blockNetwork);

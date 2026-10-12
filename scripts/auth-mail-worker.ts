import 'dotenv/config';
import { drainAuthMail, startAuthMailWorker, authMailReady } from '../server/services/authMail';
import { validateProductionSecurity } from '../server/utils/securityConfig';
validateProductionSecurity();
if (!authMailReady()) throw new Error('Configure authentication email delivery before starting its worker.');
await drainAuthMail();
const timer = startAuthMailWorker();
timer.ref();

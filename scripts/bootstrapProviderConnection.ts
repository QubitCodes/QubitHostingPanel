import { bootstrapEnvironmentProviderConnection } from '@services/hosting/providerConnectionService';

const id = await bootstrapEnvironmentProviderConnection();
console.log(JSON.stringify({ connectionId: id, status: 'ready' }));
process.exit(0);

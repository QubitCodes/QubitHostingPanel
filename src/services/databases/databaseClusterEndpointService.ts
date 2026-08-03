import { getEnvironment } from '@config/env';
import type { DatabaseCluster } from '@db/schema';

export interface DatabaseClusterEndpoint {
	host: string;
	port: number;
	tlsMode: 'disabled' | 'require' | 'verify-full';
}

/** Selects the private Docker endpoint or an explicitly configured staging management endpoint. */
export function databaseClusterEndpoint(cluster: DatabaseCluster): DatabaseClusterEndpoint {
	if (getEnvironment().DATABASE_CLUSTER_CONNECTION_MODE === 'management') {
		if (!cluster.managementHost || !cluster.managementPort) throw new Error(`Management endpoint is not configured for cluster ${cluster.code}.`);
		return { host: cluster.managementHost, port: cluster.managementPort, tlsMode: cluster.managementTlsMode };
	}

	return { host: cluster.internalHost, port: cluster.port, tlsMode: 'disabled' };
}

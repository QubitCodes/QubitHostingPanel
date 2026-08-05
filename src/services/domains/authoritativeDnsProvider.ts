import { createCloudflareRecord, createCloudflareZone, deleteCloudflareRecord, updateCloudflareRecord } from '@services/domains/cloudflareDnsProvider';
import { createPowerDnsRecord, createPowerDnsZone, deletePowerDnsRecord, updatePowerDnsRecord } from '@services/domains/powerDnsProvider';

export type AuthoritativeDnsProvider = 'cloudflare' | 'powerdns';
export interface AuthoritativeRecordInput { content: string; name: string; priority?: number | null; proxied: boolean; ttl: number; type: string }

export function createAuthoritativeZone(provider: AuthoritativeDnsProvider, hostname: string) { return provider === 'powerdns' ? createPowerDnsZone(hostname) : createCloudflareZone(hostname); }
export function createAuthoritativeRecord(provider: AuthoritativeDnsProvider, zoneId: string, record: AuthoritativeRecordInput) { return provider === 'powerdns' ? createPowerDnsRecord(zoneId, record) : createCloudflareRecord(zoneId, record); }
export async function updateAuthoritativeRecord(provider: AuthoritativeDnsProvider, zoneId: string, recordId: string, record: AuthoritativeRecordInput): Promise<string> { if (provider === 'powerdns') return updatePowerDnsRecord(zoneId, recordId, record); await updateCloudflareRecord(zoneId, recordId, record); return recordId; }
export function deleteAuthoritativeRecord(provider: AuthoritativeDnsProvider, zoneId: string, recordId: string) { return provider === 'powerdns' ? deletePowerDnsRecord(zoneId, recordId) : deleteCloudflareRecord(zoneId, recordId); }

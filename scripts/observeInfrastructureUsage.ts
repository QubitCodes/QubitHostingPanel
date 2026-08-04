import { observeInfrastructureUsage } from '@services/usage/infrastructureUsageObserver';

const result = await observeInfrastructureUsage();
console.log(JSON.stringify(result));
if (result.failures > 0) process.exitCode = 1;

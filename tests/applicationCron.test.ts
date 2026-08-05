import { describe, expect, it } from 'vitest';
import { cronMinimumIntervalMinutes, resolveApplicationCronCommand } from '@services/applications/applicationCronService';

describe('application cron rules', () => {
	it('calculates common five-field intervals', () => {
		expect(cronMinimumIntervalMinutes('*/15 * * * *')).toBe(15);
		expect(cronMinimumIntervalMinutes('0 */4 * * *')).toBe(240);
		expect(cronMinimumIntervalMinutes('0 0 * * *')).toBe(1440);
	});

	it('rejects invalid cron syntax', () => {
		expect(() => cronMinimumIntervalMinutes('* * *')).toThrow('five-field');
		expect(() => cronMinimumIntervalMinutes('61 * * * *')).toThrow('outside');
	});

	it('uses fixed framework scheduler commands', () => {
		expect(resolveApplicationCronCommand('laravel').command).toBe('php artisan schedule:run');
		expect(resolveApplicationCronCommand('wordpress').command).toBe('php wp-cron.php');
		expect(resolveApplicationCronCommand('django', 'clearsessions').command).toBe('python manage.py clearsessions');
		expect(resolveApplicationCronCommand('rails', 'my:task').command).toBe('bundle exec rails my:task');
	});

	it('blocks static frameworks and multiline commands', () => {
		expect(() => resolveApplicationCronCommand('react')).toThrow('Static');
		expect(() => resolveApplicationCronCommand('nextjs', 'one\ntwo')).toThrow('single line');
	});
});

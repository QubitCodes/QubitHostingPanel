import { frameworkDefinition } from '@config/frameworkCatalog';

const FIELD_RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]] as const;

/** Expands one standard five-field cron token into the matching integer set. */
function expandField(token: string, minimum: number, maximum: number): Set<number> {
	const values = new Set<number>();
	for (const item of token.split(',')) {
		const [rangePart, stepPart] = item.split('/');
		const step = stepPart ? Number(stepPart) : 1;
		if (!Number.isInteger(step) || step < 1) throw new Error('Cron steps must be positive integers.');
		const [start, end] = rangePart === '*' ? [minimum, maximum] : rangePart!.includes('-') ? rangePart!.split('-').map(Number) : [Number(rangePart), Number(rangePart)];
		if (!Number.isInteger(start) || !Number.isInteger(end) || start! < minimum || end! > maximum || start! > end!) throw new Error('Cron field is outside its allowed range.');
		for (let value = start!; value <= end!; value += step) values.add(value === 7 && maximum === 7 ? 0 : value);
	}
	return values;
}

/** Validates standard five-field syntax and calculates the shortest interval over two calendar years. */
export function cronMinimumIntervalMinutes(expression: string): number {
	const tokens = expression.trim().split(/\s+/);
	if (tokens.length !== 5) throw new Error('Use a standard five-field cron expression.');
	const fields = tokens.map((token, index) => { const [minimum, maximum] = FIELD_RANGES[index]!; return expandField(token!, minimum, maximum); });
	let previous: number | undefined;
	let minimum = Number.POSITIVE_INFINITY;
	const start = Date.UTC(2024, 0, 1);
	const end = Date.UTC(2026, 0, 1);
	for (let time = start; time < end; time += 60_000) {
		const date = new Date(time);
		const dayMatches = fields[2]!.has(date.getUTCDate());
		const weekdayMatches = fields[4]!.has(date.getUTCDay());
		const dayRestricted = tokens[2] !== '*';
		const weekdayRestricted = tokens[4] !== '*';
		const calendarMatches = dayRestricted && weekdayRestricted ? dayMatches || weekdayMatches : dayMatches && weekdayMatches;
		if (fields[0]!.has(date.getUTCMinutes()) && fields[1]!.has(date.getUTCHours()) && fields[3]!.has(date.getUTCMonth() + 1) && calendarMatches) {
			if (previous !== undefined) minimum = Math.min(minimum, (time - previous) / 60_000);
			previous = time;
		}
	}
	if (previous === undefined) throw new Error('Cron expression never runs in the supported calendar window.');
	return Number.isFinite(minimum) ? minimum : 525_600;
}

/** Resolves safe framework presets while leaving commands configurable for generic runtimes. */
export function resolveApplicationCronCommand(framework: string | null, command?: string): { command: string; editable: boolean; preset: string } {
	const preset = frameworkDefinition(framework)?.schedulerPreset;
	if (!preset) throw new Error('Static applications do not support scheduled tasks.');
	if (preset === 'laravel') return { command: 'php artisan schedule:run', editable: false, preset };
	if (preset === 'wordpress') return { command: 'php wp-cron.php', editable: false, preset };
	const cleaned = command?.trim();
	if (!cleaned) throw new Error('A command is required for this framework.');
	if (cleaned.includes('\n') || cleaned.includes('\r') || cleaned.includes('\0')) throw new Error('Commands must be a single line.');
	if (preset === 'django-command') return { command: `python manage.py ${cleaned}`, editable: true, preset };
	if (preset === 'rails-command') return { command: `bundle exec rails ${cleaned}`, editable: true, preset };
	return { command: cleaned, editable: true, preset };
}

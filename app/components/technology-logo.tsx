import {
	siHtml5,
	siMysql,
	siNodedotjs,
	siPhp,
	siPostgresql,
	siPython,
	siRuby,
} from 'simple-icons/icons';

const TECHNOLOGY_ICONS = {
	html: siHtml5,
	mysql: siMysql,
	node: siNodedotjs,
	php: siPhp,
	postgresql: siPostgresql,
	python: siPython,
	ruby: siRuby,
} as const;

export type TechnologyLogoName = keyof typeof TECHNOLOGY_ICONS;

/** Renders a local brand mark without loading remote assets. */
export function TechnologyLogo({ className = 'size-7', name }: { className?: string; name: TechnologyLogoName }) {
	const icon = TECHNOLOGY_ICONS[name];
	return (
		<svg aria-label={icon.title} className={className} fill="currentColor" role="img" viewBox="0 0 24 24">
			<path d={icon.path} />
		</svg>
	);
}

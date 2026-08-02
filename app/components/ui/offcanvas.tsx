import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export type OffcanvasWidth = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const WIDTH_CLASSES: Record<OffcanvasWidth, string> = {
	sm: 'max-w-md',
	md: 'max-w-xl',
	lg: 'max-w-2xl',
	xl: 'max-w-4xl',
	full: 'max-w-none'
};

interface OffcanvasProps {
	children: ReactNode;
	onClose: () => void;
	title: ReactNode;
	width?: OffcanvasWidth;
}

/** Content-area drawer whose geometry follows the application topbar and sidebar. */
export function Offcanvas({ children, onClose, title, width = 'lg' }: OffcanvasProps) {
	return <div className="fixed bottom-0 left-0 right-0 top-20 z-40 bg-slate-950/50 transition-[left] lg:left-[var(--app-sidebar-width,16rem)]" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><aside aria-label={typeof title === 'string' ? title : 'Details'} className={`ml-auto h-full w-full overflow-y-auto bg-white p-5 shadow-2xl dark:bg-[#1b211e] sm:p-7 ${WIDTH_CLASSES[width]}`}><div className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold">{title}</h2><button aria-label="Close" className="rounded-lg p-2 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={onClose}><X className="size-5" /></button></div>{children}</aside></div>;
}

import { createContext, type ReactNode, useContext } from 'react';

export interface FullScreenMenuState {
	onClose: () => void;
	title: ReactNode;
}

interface FullScreenMenuContextValue {
	menu?: FullScreenMenuState;
	setMenu: (menu?: FullScreenMenuState) => void;
}

export const FullScreenMenuContext = createContext<FullScreenMenuContextValue>({
	setMenu: () => undefined,
});

/** Provides access to the active full-screen menu's navbar presentation. */
export function useFullScreenMenu(): FullScreenMenuContextValue {
	return useContext(FullScreenMenuContext);
}

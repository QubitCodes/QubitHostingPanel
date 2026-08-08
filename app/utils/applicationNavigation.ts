interface ApplicationNavigationOptions {
	id: string;
	navigate: (path: string, options: { replace: boolean }) => void;
	reload: () => Promise<void>;
}

/** Opens a newly created application and refreshes the collection backing its detail drawer. */
export async function openCreatedApplication({ id, navigate, reload }: ApplicationNavigationOptions): Promise<void> {
	navigate(`/dashboard/applications/${id}`, { replace: true });
	await reload();
}

export const metadata = {
	description: 'Ghost Deploy Next.js acceptance fixture',
	title: 'Next.js acceptance fixture',
};

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}

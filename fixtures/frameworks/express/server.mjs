import express from 'express';

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

app.get('/', (_request, response) => {
	response.json({ framework: 'express', status: 'healthy' });
});

app.listen(port, '0.0.0.0', () => {
	console.log(`Express acceptance fixture listening on ${port}.`);
});

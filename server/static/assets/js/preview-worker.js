import init, { hash, markdown_to_html } from '../../pkg/wasm.js';

const wasmReady = init();

self.addEventListener('message', async ({ data }) => {
	try {
		await wasmReady;
		const html = markdown_to_html(data.markdown);
		self.postMessage({ id: data.id, html, hash: hash(html) });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		self.postMessage({ id: data.id, error: message });
	}
});

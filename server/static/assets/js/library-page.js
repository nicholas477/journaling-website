import { formatDate, main, request } from './view-utils.js';

const libraryViewTemplate =
	globalThis.document.querySelector('#library-view-template');

export async function showLibrary() {
	if (!libraryViewTemplate) {
		main.innerHTML =
			'<div class="notice notice-error"><p>Library template is missing from index.html</p><a class="text-link" href="/">Return to library</a></div>';
		return;
	}
	main.replaceChildren(libraryViewTemplate.content.cloneNode(true));

	const list = main.querySelector('#document-list');
	try {
		const documents = await (await request('/documents')).json();
		if (!documents.length) {
			list.replaceChildren(
				main.querySelector('#library-empty-state').content.cloneNode(true));
			return;
		}
		const rowTemplate = main.querySelector('#document-row-template');
		const rows = globalThis.document.createDocumentFragment();
		for (const document of documents) {
			const row = rowTemplate.content.cloneNode(true);
			const title = row.querySelector('[data-document-title]');
			const subtitle = row.querySelector('[data-document-subtitle]');
			const excerpt = row.querySelector('[data-document-excerpt]');
			const updatedAt = row.querySelector('[data-document-date]');
			title.href = `/documents/${encodeURIComponent(document.slug)}`;
			title.textContent = document.title;
			if (document.subtitle?.trim()) {
				subtitle.textContent = document.subtitle;
				subtitle.hidden = false;
			} else {
				excerpt.textContent =
					(document.content ?? '').trim().split(/\s+/).slice(0, 24).join(' ');
				excerpt.hidden = false;
			}
			updatedAt.dateTime = document.updated_at;
			updatedAt.textContent = formatDate(document.updated_at);
			rows.append(row);
		}
		list.replaceChildren(rows);
	} catch (error) {
		const errorView =
			main.querySelector('#library-error-template').content.cloneNode(true);
		errorView.querySelector('[data-error-message]').textContent = error.message;
		errorView.querySelector('[data-retry]')
			.addEventListener('click', showLibrary);
		list.replaceChildren(errorView);
	}
}
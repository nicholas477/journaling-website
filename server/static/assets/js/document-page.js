import { addHeadingAnchors, formatDate, loadViewTemplate, main, renderError, request, } from './view-utils.js';

export async function showDocument(slug) {
    try {
        const document =
            await (await request(`/documents/${encodeURIComponent(slug)}/data`))
                .json();
        main.replaceChildren(await loadViewTemplate('document.html'));
        main.querySelector('[data-document-title]').textContent = document.title;
        const subtitle = main.querySelector('[data-document-subtitle]');
        if (document.subtitle?.trim()) {
            subtitle.textContent = document.subtitle;
            subtitle.hidden = false;
        }
        main.querySelector('[data-updated-at]').textContent =
            formatDate(document.updated_at);
        main.querySelector('[data-edit-link]').href =
            `/documents/${encodeURIComponent(document.slug)}/update`;
        const deleteButton = main.querySelector('[data-delete-button]');
        deleteButton.addEventListener('click', async () => {
            if (!window.confirm(`Delete "${document.title}"? This cannot be undone.`))
                return;
            deleteButton.disabled = true;
            deleteButton.textContent = 'Deleting…';
            try {
                await request(
                    `/documents/${encodeURIComponent(document.slug)}`,
                    { method: 'DELETE' });
                window.location.assign('/');
            } catch (error) {
                deleteButton.disabled = false;
                deleteButton.textContent = 'Delete note';
                window.alert(error.message);
            }
        });
        const rendered =
            await request(`/documents/${encodeURIComponent(slug)}/inner`);
        const article = main.querySelector('#document-content');
        article.innerHTML = await rendered.text();
        addHeadingAnchors(article);
        if (window.location.hash) {
            let targetId = window.location.hash.slice(1);
            try {
                targetId = decodeURIComponent(targetId);
            } catch {
            }
            if (targetId)
                article.querySelector(`#${CSS.escape(targetId)}`)?.scrollIntoView();
        }
    } catch (error) {
        renderError(error.message);
    }
}
export const main = globalThis.document.querySelector('#app-main');

const previewWorker = new Worker(
    new URL('./preview-worker.js', import.meta.url), { type: 'module' });
const previewTemplate =
    fetch(new URL('../templates/preview.html', import.meta.url))
        .then(async (response) => {
            if (!response.ok)
                throw new Error(
                    `Preview template request failed (${response.status})`);
            const template = await response.text();
            if (!template.includes('<!-- markdown-content -->'))
                throw new Error('Preview template is missing its content marker');
            if (!template.includes('<!-- preview-nonce -->'))
                throw new Error('Preview template is missing its nonce marker');
            return template;
        });
let renderRequestId = 0;
const renderTargets = new Map();

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;',
    })[character]);
}

export function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ?
        'Date unavailable' :
        new Intl
            .DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            .format(date);
}

function makePreviewDocument(markdownHtml) {
    return previewTemplate.then((template) => {
        const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
        const nonce = btoa(String.fromCharCode(...nonceBytes));
        return template.replaceAll('<!-- preview-nonce -->', nonce)
            .replace('<!-- markdown-content -->', markdownHtml);
    });
}

export async function loadViewTemplate(filename) {
    const response =
        await request(new URL(`../templates/${filename}`, import.meta.url));
    const template = globalThis.document.createElement('template');
    template.innerHTML = await response.text();
    return template.content;
}

export async function request(url, options) {
    const response = await fetch(url, options);
    if (!response.ok)
        throw new Error(
            (await response.text()) || `Request failed (${response.status})`);
    return response;
}

export function renderPreview(markdown, frame, status, onRendered) {
    const id = ++renderRequestId;
    renderTargets.set(id, { markdown, frame, status, onRendered });
    if (status) {
        status.textContent = 'Rendering…';
        status.dataset.state = 'rendering';
    }
    previewWorker.postMessage({ id, markdown });
}

previewWorker.addEventListener('message', async ({ data }) => {
    const target = renderTargets.get(data.id);
    renderTargets.delete(data.id);
    if (!target) return;
    if (data.error) {
        if (target.status) {
            target.status.textContent = 'Could not render';
            target.status.dataset.state = 'error';
        }
        return;
    }
    try {
        target.frame.srcdoc = await makePreviewDocument(data.html);
    } catch (error) {
        if (target.status) {
            target.status.textContent = 'Preview template unavailable';
            target.status.dataset.state = 'error';
        } else {
            renderError(error.message);
        }
        return;
    }
    if (target.status) {
        target.status.textContent = 'Up to date';
        target.status.dataset.state = 'ready';
    }
    target.onRendered?.(data.hash);
});

export function renderError(message) {
    main.innerHTML = `<div class="notice notice-error"><p>${escapeHtml(
        message)}</p><a class="text-link" href="/">Return to library</a></div>`;
}

export function addHeadingAnchors(article) {
    const usedIds = new Set(
        Array.from(article.querySelectorAll('[id]'), (element) => element.id));
    for (const heading of article.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
        if (heading.id) continue;
        const baseId = heading.textContent.normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') ||
            'section';
        let id = baseId;
        let suffix = 1;
        while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
        heading.id = id;
        usedIds.add(id);
    }
}

export function slugify(value) {
    return value.toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}
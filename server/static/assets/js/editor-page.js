import { loadViewTemplate, main, renderError, renderPreview, request, slugify, } from './view-utils.js';
import { loadAppearancePreferences } from './appearance-store.js';

export async function showEditor(slug) {
	const editing = Boolean(slug);

	let renderedDocument = null;
	if (editing) {
		try {
			renderedDocument =
				await (await request(`/documents/${encodeURIComponent(slug)}/data`))
					.json();
		} catch (error) {
			renderError(error.message);
			return;
		}
	}
	try {
		main.replaceChildren(await loadViewTemplate('editor.html'));
	} catch (error) {
		renderError(error.message);
		return;
	}
	const backLink = main.querySelector('[data-editor-back-link]');
	backLink.href = editing ? `/documents/${encodeURIComponent(slug)}` : '/';
	backLink.textContent = editing ? '← Back to note' : '← Library';
	main.querySelector('[data-editor-eyebrow]').textContent =
		editing ? 'Revise your writing' : 'A new page';
	main.querySelector('[data-editor-heading]').textContent =
		editing ? 'Edit note' : 'Write';

	const form = main.querySelector('#document-form');
	const title = main.querySelector('#document-title');
	const subtitleInput = main.querySelector('#document-subtitle');
	const slugInput = main.querySelector('#document-slug');
	slugInput.removeAttribute('pattern');
	const editor = main.querySelector('#markdown-input');
	const preview = main.querySelector('#html-preview');
	const workspace = main.querySelector('.workspace');
	const status = main.querySelector('[data-render-status]');
	const count = main.querySelector('#character-count');
	const saveButton = main.querySelector('#save-button');
	const publishButton = main.querySelector('#publish-button');
	const saveMessage = main.querySelector('#save-message');
	preview.addEventListener('load', async () => {
		const preferences = await loadAppearancePreferences() || {};
		preview.contentWindow.postMessage(
			{
				type: 'set-preview-appearance',
				preferences: {
					theme: globalThis.document.documentElement.dataset.theme,
					backgroundOpacity: 20,
					backgroundRepeat: 'no-repeat',
					backgroundSize: 'cover',
					accentColor: '#e8672c',
					...preferences,
				},
			},
			'*');
	});

	const viewButtons = main.querySelectorAll('[data-workspace-view]');
	for (const button of viewButtons) {
		button.addEventListener('click', () => {
			const showOutput = button.dataset.workspaceView === 'output';
			workspace.querySelector('.editor-pane').hidden = showOutput;
			workspace.querySelector('.preview-pane').hidden = !showOutput;
			for (const viewButton of viewButtons) {
				viewButton.setAttribute('aria-pressed', String(viewButton === button));
			}
		});
	}
	const mobileEditorTabs = main.querySelectorAll('[data-mobile-editor-view]');
	const mobileEditorQuery = window.matchMedia('(max-width: 720px)');
	function setMobileEditorView(view) {
		const showingDetails = view === 'details';
		form.querySelector('.document-fields').hidden = mobileEditorQuery.matches && !showingDetails;
		main.querySelector('.workspace-controls').hidden = mobileEditorQuery.matches && showingDetails;
		workspace.hidden = mobileEditorQuery.matches && showingDetails;
		for (const tab of mobileEditorTabs) {
			tab.setAttribute('aria-pressed', String(tab.dataset.mobileEditorView === view));
		}
	}
	for (const tab of mobileEditorTabs) {
		tab.addEventListener('click', () => {
			setMobileEditorView(tab.dataset.mobileEditorView);
		});
	}
	setMobileEditorView('text');
	mobileEditorQuery.addEventListener('change', () => {
		setMobileEditorView('text');
	});
	form.addEventListener('invalid', (event) => {
		if (mobileEditorQuery.matches &&
			(event.target === title || event.target === slugInput)) {
			setMobileEditorView('details');
		}
	}, true);

	let slugWasEdited = editing;
	let renderedContent = null;
	let renderedHash = null;
	let renderTimer;
	let draft = null;
	try {
		const savedDraft = localStorage.getItem(
			editing ? `document-draft-${slug}` : 'document-draft');
		const storedDraft = savedDraft ? JSON.parse(savedDraft) : null;
		if (storedDraft !== null &&
			(typeof storedDraft !== 'object' || Array.isArray(storedDraft))) {
			throw new Error('Draft data must be an object.');
		}
		const draftUpdatedAt = typeof storedDraft?.updated_at === 'string' ?
			Date.parse(storedDraft.updated_at) :
			Number.NaN;
		const publishedUpdatedAt = Date.parse(renderedDocument?.updated_at);
		if (storedDraft &&
			(!renderedDocument ||
				(Number.isFinite(draftUpdatedAt) &&
					Number.isFinite(publishedUpdatedAt) &&
					draftUpdatedAt > publishedUpdatedAt))) {
			draft = storedDraft;
		} else if (storedDraft && renderedDocument) {
			saveMessage.textContent =
				'The local draft was not restored because it is not newer than the published note.';
		}
	} catch (error) {
		saveMessage.textContent = `Could not restore draft: ${error.message}`;
	}
	title.value = draft?.title ?? renderedDocument?.title ?? '';
	subtitleInput.value = draft?.subtitle ?? renderedDocument?.subtitle ?? '';
	slugInput.value = editing ? renderedDocument.slug : (draft?.slug ?? '');
	slugInput.readOnly = editing;

	function getDraftKey() {
		return editing ? `document-draft-${slug}` : 'document-draft';
	}

	editor.addEventListener('keydown', function (e) {
		if (e.key === 'Tab') {
			e.preventDefault();
			const start = this.selectionStart;
			const end = this.selectionEnd;
			this.value =
				this.value.substring(0, start) + '\t' + this.value.substring(end);
			this.selectionStart = this.selectionEnd = start + 1;
		}
	});

	editor.value = draft?.content ?? renderedDocument?.content ??
		'# A little space to think\n\nStart with what is on your mind.\n';

	function scheduleRender() {
		count.textContent = `${editor.value.length.toLocaleString()} ${editor.value.length === 1 ? 'character' : 'characters'}`;
		renderedHash = null;
		status.textContent = 'Waiting…';
		window.clearTimeout(renderTimer);
		renderTimer = window.setTimeout(() => {
			const source = editor.value;
			renderPreview(source, preview, status, (hash) => {
				if (editor.value === source) {
					renderedContent = source;
					renderedHash = hash;
					saveButton.disabled = false;
				}
			});
		}, 90);
	}

	function saveInput() {
		const draft = {
			title: title.value,
			subtitle: subtitleInput.value,
			slug: slugInput.value,
			content: editor.value,
			updated_at: new Date().toISOString(),
		};
		localStorage.setItem(getDraftKey(), JSON.stringify(draft));
	}

	title.addEventListener('input', () => {
		if (!slugWasEdited) slugInput.value = slugify(title.value);
	});
	slugInput.addEventListener('input', () => {
		slugWasEdited = true;
	});
	editor.addEventListener('input', scheduleRender);
	form.addEventListener('input', saveInput);

	saveButton.addEventListener('click', async () => {
		await saveDocument();
	});

	async function saveDocument(callback) {
		if (!/^[A-Za-z0-9_-]+$/.test(slugInput.value)) {
			saveMessage.textContent =
				'Use only letters, numbers, hyphens, or underscores in the address.';
			return;
		}
		if (renderedContent !== editor.value || !renderedHash) {
			saveMessage.textContent = 'Wait for the preview to finish rendering.';
			return;
		}
		publishButton.disabled = true;
		saveButton.disabled = true;
		saveMessage.textContent = 'Saving…';
		try {
			const response = await request('/documents/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title.value,
					subtitle: subtitleInput.value,
					slug: slugInput.value,
					content: editor.value,
					hash: renderedHash
				})
			});
			await response.json();
			localStorage.removeItem(getDraftKey());
			if (callback) callback();
		} catch (error) {
			saveMessage.textContent = error.message;
			publishButton.disabled = false;
			saveButton.disabled = false;
			return;
		}

		saveMessage.textContent = 'Saved successfully';
		publishButton.disabled = false;
		saveButton.disabled = false;
	}

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		await saveDocument(() => {
			window.location.assign(
				`/documents/${encodeURIComponent(slugInput.value)}`);
		});
	});
	scheduleRender();
}
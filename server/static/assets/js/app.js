import { showDocument } from './document-page.js';
import { showEditor } from './editor-page.js';
import { showLibrary } from './library-page.js';
import {
	backgroundImageCssValue,
	loadAppearancePreferences,
	saveAppearancePreferences,
} from './appearance-store.js';
import { main } from './view-utils.js';

const themeSelect = globalThis.document.querySelector('#theme-select');
const backgroundImageInput = globalThis.document.querySelector('#background-image');
const backgroundImageUrlInput = globalThis.document.querySelector('#background-image-url');
const backgroundColorInput = globalThis.document.querySelector('#background-color');
const backgroundOpacityInput = globalThis.document.querySelector('#background-opacity');
const backgroundOpacityValue = globalThis.document.querySelector('#background-opacity-value');
const backgroundRepeatInput = globalThis.document.querySelector('#background-repeat');
const backgroundSizeInput = globalThis.document.querySelector('#background-size');
const accentColorInput = globalThis.document.querySelector('#accent-color');
const resetAccentColorButton = globalThis.document.querySelector('#reset-accent-color');
const defaultAccentColor = '#e8672c';
const defaultPreferences = {
	theme: 'light',
	backgroundImage: '',
	backgroundColor: '',
	backgroundOpacity: 20,
	backgroundRepeat: 'no-repeat',
	backgroundSize: 'cover',
	accentColor: defaultAccentColor,
};

function getAccentButtonTextColor(color) {
	const hex = color.match(/^#([\da-f]{6})$/i)?.[1];
	if (!hex) return '#ffffff';
	const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
	const luminance = channels
		.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
		.reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
	return luminance > 0.45 ? '#242424' : '#ffffff';
}

function applyPreferences(preferences, persist = true) {
	const root = globalThis.document.documentElement;
	const accentColor = preferences.accentColor || defaultAccentColor;
	const accentShade = preferences.theme === 'dark' ? 'white' : 'black';
	const accentLinkColor = `color-mix(in srgb, ${accentColor} 82%, ${accentShade})`;
	root.dataset.theme = preferences.theme;
	root.style.setProperty('--background-color', preferences.backgroundColor || '');
	root.style.setProperty('--background-image', backgroundImageCssValue(preferences.backgroundImage));
	root.style.setProperty('--background-image-opacity',
		String(preferences.backgroundOpacity / 100));
	root.style.setProperty('--background-image-repeat', preferences.backgroundRepeat);
	root.style.setProperty('--background-image-size', preferences.backgroundSize);
	root.style.setProperty('--accent', accentColor);
	root.style.setProperty('--accent-strong', accentLinkColor);
	root.style.setProperty('--accent-soft', `color-mix(in srgb, ${accentColor} 16%, var(--paper))`);
	root.style.setProperty('--accent-button-ink', getAccentButtonTextColor(accentColor));
	root.style.setProperty('--accent-link', accentLinkColor);
	root.style.setProperty('--focus-accent', accentColor);
	themeSelect.value = preferences.theme;
	backgroundOpacityInput.value = String(preferences.backgroundOpacity);
	backgroundOpacityValue.value = `${preferences.backgroundOpacity}%`;
	backgroundRepeatInput.value = preferences.backgroundRepeat;
	backgroundSizeInput.value = preferences.backgroundSize;
	accentColorInput.value = accentColor;
	backgroundImageUrlInput.value = /^https?:\/\//i.test(preferences.backgroundImage) ?
		preferences.backgroundImage : '';
	backgroundColorInput.value = preferences.backgroundColor ||
		(preferences.theme === 'dark' ? '#181a1c' : '#ffffff');
	for (const frame of globalThis.document.querySelectorAll('.preview')) {
		frame.contentWindow?.postMessage({ type: 'set-preview-appearance', preferences }, '*');
	}
	if (persist) {
		void saveAppearancePreferences(preferences).catch(error =>
			console.warn('Could not save appearance preferences:', error));
	}
}

let initialPreferences = defaultPreferences;
let preferencesUpdated = false;
applyPreferences(initialPreferences, false);

loadAppearancePreferences().then(savedPreferences => {
	if (preferencesUpdated) {
		void saveAppearancePreferences(initialPreferences).catch(error =>
			console.warn('Could not save appearance preferences:', error));
		return;
	}
	if (!savedPreferences) return;
	if (savedPreferences && typeof savedPreferences === 'object') {
		const savedAccentColor = savedPreferences.accentColor || savedPreferences.highlightColor;
		initialPreferences = {
			...defaultPreferences,
			...savedPreferences,
			accentColor: /^#[\da-f]{6}$/i.test(savedAccentColor || '') ?
				savedAccentColor : defaultAccentColor,
		};
		delete initialPreferences.highlightColor;
	}
	applyPreferences(initialPreferences, false);
});

function updatePreference(key, value) {
	preferencesUpdated = true;
	initialPreferences = { ...initialPreferences, [key]: value };
	applyPreferences(initialPreferences);
}

themeSelect.addEventListener('change', () => updatePreference('theme', themeSelect.value));

backgroundColorInput.addEventListener('input', () =>
	updatePreference('backgroundColor', backgroundColorInput.value));

backgroundOpacityInput.addEventListener('input', () =>
	updatePreference('backgroundOpacity', Number(backgroundOpacityInput.value)));

backgroundRepeatInput.addEventListener('change', () =>
	updatePreference('backgroundRepeat', backgroundRepeatInput.value));

backgroundSizeInput.addEventListener('change', () =>
	updatePreference('backgroundSize', backgroundSizeInput.value));

accentColorInput.addEventListener('input', () =>
	updatePreference('accentColor', accentColorInput.value));

resetAccentColorButton.addEventListener('click', () =>
	updatePreference('accentColor', defaultAccentColor));

backgroundImageUrlInput.addEventListener('input', () =>
	backgroundImageUrlInput.setCustomValidity(''));

backgroundImageUrlInput.addEventListener('change', () => {
	const value = backgroundImageUrlInput.value.trim();
	if (!value) return;
	let url;
	try {
		url = new URL(value);
	} catch {
		backgroundImageUrlInput.setCustomValidity('Enter a valid HTTP or HTTPS image URL.');
		backgroundImageUrlInput.reportValidity();
		return;
	}
	if (!['http:', 'https:'].includes(url.protocol)) {
		backgroundImageUrlInput.setCustomValidity('Enter a valid HTTP or HTTPS image URL.');
		backgroundImageUrlInput.reportValidity();
		return;
	}
	backgroundImageInput.value = '';
	updatePreference('backgroundImage', url.href);
});

backgroundImageInput.addEventListener('change', () => {
	const [file] = backgroundImageInput.files;
	if (!file) return;
	updatePreference('backgroundImage', file);
});

globalThis.document.querySelector('#clear-background-image').addEventListener('click', () => {
	backgroundImageInput.value = '';
	backgroundImageUrlInput.value = '';
	updatePreference('backgroundImage', '');
});

const path = window.location.pathname.replace(/\/$/, '') || '/';
const updateMatch = path.match(/^\/documents\/([^/]+)\/update$/);
const documentMatch = path.match(/^\/documents\/([^/]+)$/);
if (path === '/' || path === '/index.html')
	showLibrary();
else if (path === '/documents/create')
	showEditor();
else if (updateMatch)
	showEditor(decodeURIComponent(updateMatch[1]));
else if (documentMatch && documentMatch[1] !== 'create')
	showDocument(decodeURIComponent(documentMatch[1]));
else
	main.innerHTML =
		`<div class="notice"><h1>Page not found</h1><a class="text-link" href="/">Return to library</a></div>`;

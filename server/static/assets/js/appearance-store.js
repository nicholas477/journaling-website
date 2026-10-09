const databaseName = 'journaling-website-appearance';
const storeName = 'settings';
const appearanceKey = 'appearance';

let databasePromise;
let activeImage;
let activeImageUrl;

function openDatabase() {
	if (!databasePromise) {
		databasePromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(databaseName, 1);
			request.addEventListener('upgradeneeded', () => {
				request.result.createObjectStore(storeName);
			});
			request.addEventListener('success', () => resolve(request.result));
			request.addEventListener('error', () => reject(request.error));
		});
	}
	return databasePromise;
}

function readLegacyPreferences() {
	try {
		const saved = localStorage.getItem(appearanceKey);
		if (saved) {
			const preferences = JSON.parse(saved);
			if (preferences && typeof preferences === 'object') return preferences;
		}
		if (localStorage.getItem('theme') === 'dark') return { theme: 'dark' };
	} catch (error) {
		console.warn('Could not load legacy appearance preferences:', error);
	}
	return null;
}

function removeLegacyPreferences() {
	try {
		localStorage.removeItem(appearanceKey);
		localStorage.removeItem('theme');
	} catch (error) {
		console.warn('Could not remove legacy appearance preferences:', error);
	}
}

function readPreferences(database) {
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readonly');
		const request = transaction.objectStore(storeName).get(appearanceKey);
		request.addEventListener('success', () => resolve(request.result));
		request.addEventListener('error', () => reject(request.error));
	});
}

function writePreferences(database, preferences) {
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, 'readwrite');
		transaction.objectStore(storeName).put(preferences, appearanceKey);
		transaction.addEventListener('complete', resolve);
		transaction.addEventListener('error', () => reject(transaction.error));
		transaction.addEventListener('abort', () => reject(transaction.error));
	});
}

async function convertDataUrlImage(preferences) {
	const image = preferences?.backgroundImage;
	if (typeof image !== 'string' || !/^data:image\//i.test(image)) return preferences;
	try {
		const response = await fetch(image);
		return { ...preferences, backgroundImage: await response.blob() };
	} catch (error) {
		console.warn('Could not convert saved background image:', error);
		return preferences;
	}
}

export function backgroundImageCssValue(image) {
	if (image instanceof Blob) {
		if (image !== activeImage) {
			if (activeImageUrl) URL.revokeObjectURL(activeImageUrl);
			activeImage = image;
			activeImageUrl = URL.createObjectURL(image);
		}
		return `url("${activeImageUrl}")`;
	}
	if (activeImageUrl) URL.revokeObjectURL(activeImageUrl);
	activeImage = undefined;
	activeImageUrl = undefined;
	return image ? `url(${JSON.stringify(image)})` : 'none';
}

export async function loadAppearancePreferences() {
	const legacyPreferences = readLegacyPreferences();
	try {
		const database = await openDatabase();
		const savedPreferences = await readPreferences(database);
		if (savedPreferences !== undefined) {
			const preferences = await convertDataUrlImage(savedPreferences);
			if (preferences !== savedPreferences) await writePreferences(database, preferences);
			removeLegacyPreferences();
			return preferences;
		}
		if (legacyPreferences) {
			const preferences = await convertDataUrlImage(legacyPreferences);
			await writePreferences(database, preferences);
			removeLegacyPreferences();
			return preferences;
		}
	} catch (error) {
		console.warn('Could not access IndexedDB appearance preferences:', error);
	}
	return legacyPreferences;
}

export async function saveAppearancePreferences(preferences) {
	const database = await openDatabase();
	await writePreferences(database, preferences);
}
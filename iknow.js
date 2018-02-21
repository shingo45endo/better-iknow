((BiK) => {
	'use strict';

	let _quizzes = [];
	const _courses = {};
	const _settings = {
		apps: {
			content_volume: 1.0,
			effect_volume:  1.0,
		},
		better_iknow: {
			play_rate: 1.0,
		},
	};

	// RegExps for URLs to be captured
	const RE_QUIZZES  = /\/api\/v2\/.*?\/study\?/;
	const RE_COURSES  = /\/api\/v2\/goals\/\d+\?/;
	const RE_SETTINGS = /\/api\/v2\/settings\?/;

	// Prepares for capturing XHR.
	((messageHandler) => {
		console.assert(messageHandler);

		// Appends an iframe for messaging.
		const iframe = document.createElement('iframe');
		iframe.id = `__better_iknow_messaging_${Date.now()}__`;
		iframe.style.width   = '1px';
		iframe.style.height  = '1px';
		iframe.style.display = 'none';
		iframe.addEventListener('load', () => {
			// Sets a message event handler.
			console.assert(iframe.contentWindow);
			iframe.contentWindow.addEventListener('message', (event) => {
				if (event.origin !== 'https://iknow.jp') {
					return;
				}

				const data = JSON.parse(event.data);
				messageHandler(data.url, data.text);
			});
		});
		document.querySelector('body').appendChild(iframe);

		// Appends the script.
		const script = document.createElement('script');
		script.src = chrome.extension.getURL('/xhr_captor.js');
		script.dataset.iframeId  = iframe.id;
		script.dataset.matchUrls = JSON.stringify([RE_COURSES, RE_QUIZZES, RE_SETTINGS].map((re) => re.source));
		document.getElementsByTagName('head')[0].appendChild(script);

	})((url, text) => {
		if (RE_QUIZZES.test(url)) {
			// Stores quiz data.
			_quizzes = JSON.parse(text);

		} else if (RE_COURSES.test(url)) {
			// Stores course data.
			const key = url.replace(/\?.*$/, '');
			_courses[key] = JSON.parse(text);

		} else if (RE_SETTINGS.test(url)) {
			// Updates the settings data.
			const newSettings = JSON.parse(text);
			if (newSettings.apps) {
				_settings.apps = Object.assign(_settings.apps || {}, newSettings.apps);
			}

			window.dispatchEvent(new Event('__better_iknow_settings__'));
		} else {
			console.log('WARNING: Unexpected XHR (%s)', url);
		}
	});

	BiK.iKnow = {
		get quizzes()  {return _quizzes;},
		get courses()  {return _courses;},
		get settings() {return _settings;},
	};
})(BiK);

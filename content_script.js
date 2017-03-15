'use strict';

// RegExps for URLs to be captured
const RE_COURSES  = /\/api\/v2\/goals\/\d+\?/;
const RE_CONTENTS = /\/api\/v2\/.*?\/study\?/;
const RE_SETTINGS = /\/api\/v2\/settings\?/;

let xhrResponses = {};

// Initialization
{
	// Custom data attributes to communicate with the embedded script.
	const iframeParent = 'body';
	const iframeId     = `__better_iknow_messaging_${Date.now()}__`;
	const matchUrls    = JSON.stringify([RE_COURSES, RE_CONTENTS, RE_SETTINGS].map((re) => re.source));

	// Waits for iframe injection by the embedded script.
	const iframeObserver = new MutationObserver((records) => {
		records.filter((record) => (record.type === 'childList')).forEach((record) => {
			Array.prototype.slice.call(record.addedNodes).filter((addedNode) => (addedNode.id === iframeId)).forEach((addedNode) => {
				// Stops the observation.
				iframeObserver.disconnect();

				// Sets a message event handler.
				addedNode.contentWindow.addEventListener('message', (event) => {
					if (event.origin !== 'http://iknow.jp') {
						return;
					}

					// Stores the XHR response data.
					const data = JSON.parse(event.data);
					const key = data.url.replace(/\?.*$/, '?');
					xhrResponses[key] = data.text;
				});
			});
		});
	});
	iframeObserver.observe(document.querySelector(iframeParent), {childList: true});

	// Appends the script.
	const script = document.createElement('script');
	script.src = chrome.extension.getURL('/embedded_script.js');
	script.dataset.iframeParent = iframeParent;
	script.dataset.iframeId     = iframeId;
	script.dataset.matchUrls    = matchUrls;
	document.getElementsByTagName('head')[0].appendChild(script);
}

// Dictation
{
	let sentences = null;
	let settings = {apps: {effect_volume: 1.0}};

	// Waits for displaying the dictation quiz screen.
	// TODO: Optimize the timing of the prepation for dictation.
	const divObserver = new MutationObserver((records) => {
		records.filter((record) => (record.type === 'attributes' && record.attributeName === 'class')).forEach((record) => {
			if (record.target.classList.contains('current_screen')) {
				prepareForDictation();
			}
		});
	});
	divObserver.observe(document.getElementById('dictation_quiz_screen'), {attributes: true});

	/**
	 *	Prepares the internal states for dictation.
	 *	Makes the sentence data from XHR data for key input check, gets the settings data for effect volume control.
	 */
	function prepareForDictation() {
		// Clears the sentence data.
		sentences = null;

		// Gets contents and courses data from the stored XHR data.
		const urls = Object.keys(xhrResponses);
		const contentIndex = urls.findIndex((url) => RE_CONTENTS.test(url));
		const contents = (contentIndex !== -1) ? JSON.parse(xhrResponses[urls[contentIndex]]) : null;
		const courses = urls.filter((url) => RE_COURSES.test(url)).map((url) => JSON.parse(xhrResponses[url]));

		// Makes sentence data from contents and courses data.
		if (contents && courses) {
			sentences = makeSentences(contents, courses);
		}
		if (!sentences) {
			console.log('ERROR: Cannot make sentence data')
		}

		// Gets settings data from the stored XHR data.
		const settingsIndex = urls.findIndex((url) => RE_SETTINGS.test(url));
		if (settingsIndex !== -1) {
			settings = JSON.parse(xhrResponses[urls[settingsIndex]]);
		}
	}

	/**
	 *	Makes sentences from XHR data.
	 */
	function makeSentences(contents, courses) {
		if (!contents || !courses) {
			return null;
		}

		return contents.map((content) => {
			const course = courses.find((course) => (content.goal_id === course.id));
			if (!course || !course.goal_items) {
				console.log(`ERROR: goal_id (${content.goal_id}) is not found in courses (%o)`, courses);
				return null;
			}

			const item = course.goal_items.find((goalItem) => (content.item_id === goalItem.item.id));
			if (!item || !item.sentences || item.sentences.length < 1) {
				console.log(`ERROR: item_id (${content.item_id}) is not found in goal_items (%o)`, course.goal_items);
				return null;
			}

			const sentence = item.sentences.find((sentence) => (sentence.cue && (content.content_id === sentence.cue.id)));
			if (!sentence) {
				console.log(`ERROR: content_id (${content.content_id}) is not found in sentences (%o)`, item.sentences);
				return null;
			}

			return sentence.cue.text.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '');
		});
	}

	/**
	 *	Plays the sound effect.
	 */
	const playIncorrect = (() => {
		const audio = new Audio('//iknow.jp/_assets/apps/common/spell_incorrect.mp3');
		audio.load();

		return () => {
			audio.pause();
			if (settings.apps && settings.apps.effect_volume) {
				audio.volume = settings.apps.effect_volume;
			}
			audio.play();
		};
	})();

	/**
	 *	Displays an incorrect input letter.
	 */
	const displayIncorrect = (() => {
		// Makes a span element to display an incorrect input letter.
		const span = document.createElement('span');
		document.body.appendChild(span);

		return (letter) => {
			// Gets the element of the cursor.
			const cursor = document.querySelector('#dictation_quiz_screen .letter.cursor');
			if (!cursor) {
				return;
			}

			// Stops current trasition effect.
			span.style.transition = 'none';

			// Hides the incorrect input letter.
			if (!letter) {
				span.style.display = 'hidden';
				return;
			}

			// Copies all CSS properties as text from the cursor.
			span.style = getComputedStyle(cursor).cssText;

			// Sets the CSS properties about color.
			['color', 'textFillColor', 'webkitTextFillColor'].forEach((prop) => {span.style[prop] = '#f33'});

			// Sets the position of the incorrect letter same to the cursor.
			const rect = cursor.getBoundingClientRect();
			span.style.position = 'fixed';
			span.style.left = `${rect.left}px`;
			span.style.top  = `${rect.top}px`;

			// Sets the text.
			span.textContent = letter.charAt(0);

			// Begins fade out from the next frame.
			setTimeout(() => {
				span.style.transition = 'opacity 1s ease-out';
				span.style.opacity = 0;
			}, 17);	// For some reason, requestAnimationFrame only works after clicking the client area of browser.
		};
	})();

	/**
	 *	Handles key events and stops its propagation to the Dictation app if necessary.
	 */
	window.addEventListener('keydown', (event) => {
		if (!isTypingMode()) {
			return;
		}

		if (['Enter', 'Backspace', 'ArrowLeft', 'ArrowRight'].indexOf(event.key) !== -1) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (!/^[a-zA-Z]$/.test(event.key)) {
			return;
		}

		if (!sentences || sentences.length === 0) {
			console.log('ERROR: Cannot get sentences');
			return;
		}

		const index = getCurrentSetenceIndex();
		if (index < 0) {
			console.log('ERROR: Cannot get index');
			return;
		}

		const cursorPos = getCurrentCursorPos();
		if (cursorPos < 0) {
			console.log('ERROR: Cannot get cursorPos');
			return;
		}

		const sentence = sentences[index];
		if (event.key.toLowerCase() !== sentence.charAt(cursorPos).toLowerCase()) {
			playIncorrect();
			displayIncorrect(event.key);

			event.preventDefault();
			event.stopPropagation();
			return;

		} else {
			displayIncorrect('');
		}

		setTimeout(() => {
			if (isSentenceCompleted()) {
				clickEnter();
			}
		}, 100);
	}, true);

	/**
	 *	Clicks the "Enter" button in the Dictation app.
	 */
	function clickEnter() {
		document.getElementById('nav_enter').click();
	}

	/**
	 *	Returns whether the Dictation app is in typing mode or not.
	 */
	function isTypingMode() {
		return (document.getElementById('dictation_quiz_screen').offsetHeight > 0 && !document.querySelector('.paused'));
	}

	/**
	 *	Gets the position of the cursor in the Dictation app.
	 */
	function getCurrentCursorPos() {
		const spans = document.querySelectorAll('#dictation_quiz_screen .word, #dictation_quiz_screen .letter, #dictation_quiz_screen .space, #dictation_quiz_screen .excluded, #dictation_quiz_screen .punctuation');
		let pos = 0;
		for (let i = 0; i < spans.length; i++) {
			if (spans[i].classList.contains('cursor')) {
				return pos;
			}
			pos += spans[i].textContent.length;
		}
		return -1;
	}

	/**
	 *	Gets the current index of the sentences in the Dictation app.
	 */
	function getCurrentSetenceIndex() {
		return document.querySelectorAll('#top-panel ul.steps li.step-filled').length - 1;
	}

	/**
	 *	Gets the current sentence in the Dictation app.
	 */
	function getCurrentSentence() {
		return Array.prototype.slice.call(document.querySelectorAll('#dictation_quiz_screen .letter, #dictation_quiz_screen .space')).map(function(e) {return (e.textContent) ? e.textContent : ' ';}).join('');
	}

	/**
	 *	Returns whether the sentence in the Dictation app has been input or not.
	 */
	function isSentenceCompleted() {
		return !Array.prototype.slice.call(document.querySelectorAll('#dictation_quiz_screen .typeable')).some((span) => !span.textContent);
	}
}

(() => {
	'use strict';

	let jsons = {};
	let sentences = [];

	((open) => {
		XMLHttpRequest.prototype.open = function(method, url, async) {
			// For contents data
			const m = url.match(/\/api\/v2\/goals\/(\d+)\?/);
			if (m) {
				this._key = m[1];
			}

			// For quiz data
			if (/\/api\/v2\/.*?\/study\?/.test(url)) {
				this._key = 'study';
			}

			// For settings data
			if (url.indexOf('/api/v2/settings') === 0) {
				this._key = 'settings';
			}

			// Calls the original function.
			open.apply(this, arguments);
		};
	})(XMLHttpRequest.prototype.open);

	((send) => {
		XMLHttpRequest.prototype.send = function(data) {
			// If the xhr object has '_key' property, its resonse is needed to be stored.
			if (this._key) {
				this.addEventListener('load', (event) => {
					jsons[this._key] = JSON.parse(this.responseText);	// All of xhr requests to be stored are JSON.

					// Updates the internal quiz data.
					const contents = jsons.study;
					const courses = Object.keys(jsons).filter(key => /^\d+$/.test(key)).map(key => jsons[key]);
					if (contents && courses) {
						sentences = makeSentences(contents, courses);
					}
				});
			}

			// Calls the original function.
			send.apply(this, arguments);
		};
	})(XMLHttpRequest.prototype.send);

	function makeSentences(contents, courses) {
		if (!contents || !courses) {
			return null;
		}

		return contents.map((content) => {
			const course = courses.find(course => (content.goal_id === course.id));
			if (!course || !course.goal_items) {
				console.log('ERROR: goal_id (%d) is not found in courses (%o)', content.goal_id, courses);
				return null;
			}

			const item = course.goal_items.find(goalItem => (content.item_id === goalItem.item.id));
			if (!item || !item.sentences || item.sentences.length < 1) {
				console.log('ERROR: item_id (%d) is not found in goal_items (%o)', content.item_id, course.goal_items);
				return null;
			}

			const sentence = item.sentences.find(sentence => (sentence.cue && (content.content_id === sentence.cue.id)));
			if (!sentence) {
				console.log('ERROR: content_id (%d) is not found in sentences (%o)', content.content_id, item.sentences);
				return null;
			}

			return sentence.cue.text.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '');
		});
	}

	const playIncorrect = (() => {
		const audio = new Audio('//iknow.jp/_assets/apps/common/spell_incorrect.mp3');
		audio.load();

		return () => {
			audio.pause();
			if (jsons.settings && jsons.settings.apps && jsons.settings.apps.effect_volume) {
				audio.volume = jsons.settings.apps.effect_volume;
			}
			audio.play();
		};
	})();


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
			span.style.left = rect.left + 'px';
			span.style.top = rect.top + 'px';

			// Sets the text.
			span.textContent = letter.charAt(0);

			// Begins fade out from the next frame.
			setTimeout(() => {
				span.style.transition = 'opacity 1s ease-out';
				span.style.opacity = 0;
			}, 17);	// requestAnimationFrame only works after clicking the client area of browser.
		};
	})();


	function isTypingMode() {
		return (document.getElementById('dictation_quiz_screen').offsetHeight > 0 && !document.querySelector('.paused'));
	}

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

	function getCurrentSetenceIndex() {
		return document.querySelectorAll('#top-panel ul.steps li.step-filled').length - 1;
	}

	function getCurrentSentence() {
		return Array.prototype.slice.call(document.querySelectorAll('#dictation_quiz_screen .letter, #dictation_quiz_screen .space')).map(function(e) {return (e.textContent) ? e.textContent : ' ';}).join('');
	}

	function isSentenceCompleted() {
		return !Array.prototype.slice.call(document.querySelectorAll('#dictation_quiz_screen .typeable')).some((span) => !span.textContent);
	}

	function clickEnter() {
		document.getElementById('nav_enter').click();
	}

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
})();

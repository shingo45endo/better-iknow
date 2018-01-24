'use strict';

let contents = null;
let quizzes = [];
let courses = {};
let settings = {
	apps: {
		content_volume: 1.0,
		effect_volume:  1.0,
	},
	better_iknow: {
		play_rate: 1.0,
	}
};

// RegExps for URLs to be captured
const RE_COURSES  = /\/api\/v2\/goals\/\d+\?/;
const RE_QUIZZES  = /\/api\/v2\/.*?\/study\?/;
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
	document.querySelector('body').appendChild(iframe);

	// Sets a message event handler.
	iframe.contentWindow.addEventListener('message', (event) => {
		if (event.origin !== 'https://iknow.jp') {
			return;
		}

		const data = JSON.parse(event.data);
		messageHandler(data.url, data.text);
	});

	// Appends the script.
	const script = document.createElement('script');
	script.src = chrome.extension.getURL('/xhr_captor.js');
	script.dataset.iframeId  = iframe.id;
	script.dataset.matchUrls = JSON.stringify([RE_COURSES, RE_QUIZZES, RE_SETTINGS].map((re) => re.source));
	document.getElementsByTagName('head')[0].appendChild(script);

})((url, text) => {
	if (RE_QUIZZES.test(url)) {
		// Stores quiz data.
		quizzes = JSON.parse(text);

	} else if (RE_COURSES.test(url)) {
		// Stores course data.
		const key = url.replace(/\?.*$/, '');
		courses[key] = JSON.parse(text);

	} else if (RE_SETTINGS.test(url)) {
		// Updates the settings data.
		const newSettings = JSON.parse(text);
		if (newSettings.apps) {
			settings.apps = Object.assign(settings.apps || {}, newSettings.apps);
		}

		// Sets the volume of sentences.
		VoicePlayer.setVolume((settings.apps) ? (settings.apps.content_volume || 0.0) : 1.0);

		// Gets the playback rate of sentences from chrome.storage and sets it.
		chrome.storage.local.get(settings.better_iknow, (items) => {
			settings.better_iknow = Object.assign(settings.better_iknow || {}, items);
			VoicePlayer.setPlaybackRate(settings.better_iknow.play_rate);
		});

	} else {
		console.log('WARNING: Unexpected XHR (%s)', url);
	}
});

// Waits for displaying the dictation recall screen.
const divObserver = new MutationObserver((records) => {
	records.filter((record) => (record.type === 'attributes' && record.attributeName === 'class')).forEach((record) => {
		if (record.target.classList.contains('current_screen')) {
			prepareForDictation();
		}
	});
});
divObserver.observe(document.getElementById('dictation_recall_screen'), {attributes: true});

// Waits for adding the modal dialog boxes.
const dialogObserver = new MutationObserver((records) => {
	records.filter((record) => (record.type === 'childList')).forEach((record) => {
		Array.prototype.forEach.call(record.addedNodes, (node) => {
			if (node.querySelector('.settings-modal')) {
				const id = `__better_iknow_range_playrate_${Date.now()}__`;
				const playRate = settings.better_iknow.play_rate;

				// Inserts settings item to the settings dialog. (TODO: i18n)
				node.querySelector('.audio-settings').insertAdjacentHTML('beforeend', `
					<div class="setting">
						<h4>Play Speed</h4><!--
						--><div class="input">
							<input id="${id}" type="range" value="${playRate}" step="0.1" min="0.5" max="2.0" data-label="${playRate.toFixed(1)} x" style="margin-left: 33px;">
						</div>
					</div>
				`);

				// Handles change event of the range input to display the current playback rate.
				const range = document.getElementById(id);
				['change', 'input'].forEach((eventName) => {
					range.addEventListener(eventName, () => {
						range.setAttribute('data-label', `${parseFloat(range.value).toFixed(1)} x`);
					});
				});

				// Handles click event of Save button to store the change of playback rate into chrome.storage.
				document.querySelector('.settings-modal .btn.save').addEventListener('click', () => {
					settings.better_iknow.play_rate = parseFloat(range.value);
					chrome.storage.local.set(settings.better_iknow, () => {});
				});
			}
		});
	});
});
dialogObserver.observe(document.querySelector('body'), {childList: true});

// Adds style for <input type="range">
const style = document.createElement('style');
style.type = 'text/css';
style.textContent = `
	.settings-modal input[type="range"] {
		-webkit-appearance: none;
		-moz-appearance: none;
		position: relative;
		width: 200px;
		height: 7px;
		padding: 0;
		border-radius: 10px;
		background-color: #eaeaea;
	}
	.settings-modal input[type="range"]:focus {
		outline: none;
	}
	.settings-modal input[type="range"]::before {
		position: absolute;
		width: 4em;
		left: -33px;
		top: calc((7px - 1em) / 2);
		content: attr(data-label);
	}
	.settings-modal input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		position: relative;
		cursor: pointer;
		background-color: #ff8b00;
		border-radius: 10px;
		width: 15px;
		height: 15px;
	}
	.settings-modal input[type="range"]::-moz-range-thumb {
		-moz-appearance: none;
		position: relative;
		background-color: #ff8b00;
		border-style: none;
		border-radius: 10px;
		width: 15px;
		height: 15px;
	}
	.settings-modal input[type="range"]::-moz-range-track {
		height: 0;
	}
`;
document.getElementsByTagName('head')[0].appendChild(style);

// Controls the own voice player.
const VoicePlayer = (() => {
	const id = `__better_iknow_audio_${Date.now()}__`;

	// Adds a script to replace the behavior of the original sound player.
	const script = document.createElement('script');
	script.innerHTML = `
		document.querySelector('#dictation_quiz_screen').insertAdjacentHTML('beforeend', '<div style="position: absolute; overflow: hidden; width: 620px; left: 0; right: 0; bottom: 16px; margin: 0 auto; opacity: 0.667; border-radius: 5px; line-height: 0;"><audio controls id="${id}" style="width: 100%; height: 32px; border-radius: 5px;"></audio></div>');

		((playSound) => {
			$.playSound = function(t, a, n) {
				const audio = document.getElementById('${id}');
				if (audio && audio.src === t) {
					audio.play();
				} else {
					playSound.apply(this, arguments);
				}
			};
		})($.playSound);

		((stopSounds) => {
			$.stopSounds = function() {
				const audio = document.getElementById('${id}');
				audio.pause();
				audio.currentTime = 0;

				stopSounds.apply(this, arguments);
			};
		})($.stopSounds);
	`;
	document.querySelector('body').appendChild(script);

	const audio = document.getElementById(id);

	return {
		setSource: (url) => {
			audio.src = url;
			audio.load();
		},
		setVolume: (volume) => {
			audio.volume = volume;
		},
		setPlaybackRate: (rate) => {
			audio.playbackRate = rate;
		},
		play: (sec) => {
			audio.currentTime = sec || 0.0;
			audio.play();
		},
		rewind: (sec) => {
			audio.currentTime -= sec;
			audio.play();
		},
		forward: (sec) => {
			audio.currentTime += sec;
			audio.play();
		},
		getDuration: () => {
			return audio.duration;
		},
		getPlaybackRate: () => {
			return audio.playbackRate;
		},
		on: function() {
			audio.addEventListener(...arguments);
		}
	};
})();

// Adds playback rate change buttons.
document.querySelector('#dictation_quiz_screen').insertAdjacentHTML('beforeend', `
	<div style="position: absolute; width: 620px; left: 0; right: 0; bottom: 60px; margin: 0 auto; line-height: 0;">
		<ul id="__better_iknow_playrate__" class="choice-set choice-set-expanded" style="width: 155px; float: right;">
			<li class="choice" data-delta="-0.1"><i type="glyph-triangle-left" class="glyph glyph-triangle-left"></i></li>
			<li class="choice selected" style="opacity: 0.667; cursor: default;">${settings.better_iknow.play_rate} x</li>
			<li class="choice" data-delta="+0.1"><i type="glyph-triangle-right" class="glyph glyph-triangle-right"></i></li>
		</ul>
	</div>
`);

// Handles click events of playback rate change buttons.
[...document.querySelectorAll('#__better_iknow_playrate__ li[data-delta]')].forEach((elem) => {
	elem.addEventListener('click', () => {
		let newRate = Math.round((VoicePlayer.getPlaybackRate() + parseFloat(elem.dataset.delta)) * 100.0) / 100.0;
		if (newRate < 0.5) {
			newRate = 0.5;
		} else if (newRate > 2.0) {
			newRate = 2.0;
		}
		VoicePlayer.setPlaybackRate(newRate);
	});
});

// Updates the indicator of the current playback rate.
['ratechange', 'loadeddata'].forEach((eventName) => {
	VoicePlayer.on(eventName, () => {
		document.querySelector('#__better_iknow_playrate__ li.selected').textContent = `${VoicePlayer.getPlaybackRate().toFixed(1)} x`;
	});
});

/**
 *	Prepares the internal states for dictation.
 *	Makes the contents data from XHR data for key input check, sets the voice data of the current sentence.
 */
function prepareForDictation() {
	// Makes contents data from quizzes and courses data.
	contents = makeContents(quizzes, Object.keys(courses).map((key) => courses[key]));
	if (!contents) {
		console.log('ERROR: Cannot make contents data');
	}

	// Sets voice properties.
	const index = getCurrentSetenceIndex();
	if (index >= 0) {
		VoicePlayer.setSource(contents[index].soundUrl);
	}
	VoicePlayer.setPlaybackRate(settings.better_iknow.play_rate);
}

/**
 *	Makes contents from XHR data.
 */
function makeContents(quizzes, courses) {
	if (!quizzes || !courses) {
		return null;
	}

	return quizzes.map((content) => {
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

		return {
			sentence: sentence.cue.text.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, ''),
			soundUrl: sentence.sound,
		};
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
		if (settings.apps) {
			audio.volume = settings.apps.effect_volume || 0.0;
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
		const styles = getComputedStyle(cursor);
		const cssText = styles.cssText || [...styles].reduce((txt, key) => {return txt + `${key}: ${styles.getPropertyValue(key)}; `;}, '');
		span.style = cssText;

		// Sets the CSS properties about color.
		['color', 'textFillColor', 'webkitTextFillColor'].forEach((prop) => {span.style[prop] = '#f33';});

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
window.addEventListener('keydown', (() => {
	let currentSentence;
	let currentPos;
	let sentenceWeights = {};

	const keyHandlers = {
		' ': () => {
			VoicePlayer.play();
		},
		'ArrowLeft': () => {
			VoicePlayer.rewind(1.0);
		},
		'ArrowRight': () => {
			VoicePlayer.forward(1.0);
		},
		'Backspace': () => {
			const duration = VoicePlayer.getDuration();
			if (duration <= 0.0) {
				return;
			}
			const weights = sentenceWeights[currentSentence];
			if (!weights) {
				return;
			}
			const sec = Math.max(-1.0 + duration * weights[currentPos] / weights[weights.length - 1], 0);
			VoicePlayer.play(sec);
		},
		'Enter': () => {},
	};

	const weightsTable = [
		{pattern: /\s/,	weight: 2.5},
		{pattern: /,/,	weight: 1.5},
		{pattern: /[aiueo]/i,	weight: 2.0},
		{pattern: /.*/,	weight: 1.0},
	];

	function updateCurrentState() {
		if (!contents || contents.length === 0) {
			console.log('ERROR: Cannot get contents');
			return;
		}

		const index = getCurrentSetenceIndex();
		if (index < 0) {
			console.log('ERROR: Cannot get index');
			return;
		}

		currentSentence = contents[index].sentence;
		currentPos = getCurrentCursorPos();

		if (!sentenceWeights[currentSentence]) {
			const weights = currentSentence.split('').map((ch) => {
				const elem = weightsTable.find((elem) => {return elem.pattern.test(ch);});
				return (elem) ? elem.weight : 0.0;
			});

			sentenceWeights[currentSentence] = weights.map((weight, index, weights) => {
				let sum = 0.0;
				for (let i = 0; i < index; i++) {
					sum += weights[i];
				}
				return sum;
			});
		}
	}

	function handleSpecialKeys(event) {
		if (keyHandlers[event.key]) {
			keyHandlers[event.key]();
			return true;
		} else {
			return false;
		}
	}

	return (event) => {
		if (!isTypingMode()) {
			return;
		}

		updateCurrentState();

		if (handleSpecialKeys(event)) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (!/^[a-zA-Z]$/.test(event.key)) {
			return;
		}

		if (event.key.toLowerCase() !== currentSentence.charAt(currentPos).toLowerCase()) {
			playIncorrect();
			displayIncorrect(event.key);

			event.preventDefault();
			event.stopPropagation();

		} else {
			displayIncorrect('');

			setTimeout(() => {
				if (isSentenceCompleted()) {
					clickEnter();
				}
			}, 100);
		}
	};
})(), true);

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
	return [...document.querySelectorAll('#dictation_quiz_screen .letter, #dictation_quiz_screen .space')].map(function(e) {return (e.textContent) ? e.textContent : ' ';}).join('');
}

/**
 *	Returns whether the sentence in the Dictation app has been input or not.
 */
function isSentenceCompleted() {
	return ![...document.querySelectorAll('#dictation_quiz_screen .typeable')].some((span) => !span.textContent);
}

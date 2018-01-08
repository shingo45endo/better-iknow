'use strict';

// RegExps for URLs to be captured
const RE_COURSES  = /\/api\/v2\/goals\/\d+\?/;
const RE_QUIZZES  = /\/api\/v2\/.*?\/study\?/;
const RE_SETTINGS = /\/api\/v2\/settings\?/;

// Initialization
((callback, param) => {
	if (!param || !param.iframeParent || !param.iframeId || !param.origin || !callback) {
		throw new Error('Invalid argument');
	}

	// Waits for iframe injection by the embedded script.
	let iframeObserver = new MutationObserver((records) => {
		records.filter((record) => (record.type === 'childList')).forEach((record) => {
			[...record.addedNodes].filter((addedNode) => (addedNode.id === param.iframeId)).forEach((addedNode) => {
				// Stops the observation.
				iframeObserver.disconnect();
				iframeObserver = null;

				// Sets a message event handler.
				addedNode.contentWindow.addEventListener('message', (event) => {
					if (event.origin !== param.origin) {
						return;
					}

					const data = JSON.parse(event.data);
					callback(data.url, data.text);
				});
			});
		});
	});
	iframeObserver.observe(document.querySelector(param.iframeParent), {childList: true});

	// Appends the script.
	const script = document.createElement('script');
	script.src = chrome.extension.getURL('/xhr_captor.js');
	script.dataset.iframeParent = param.iframeParent;
	script.dataset.iframeId     = param.iframeId;
	script.dataset.matchUrls    = param.matchUrls;
	document.getElementsByTagName('head')[0].appendChild(script);

})(XhrHandler, {
	iframeParent: 'body',
	iframeId:     `__better_iknow_messaging_${Date.now()}__`,
	matchUrls:    JSON.stringify([RE_COURSES, RE_QUIZZES, RE_SETTINGS].map((re) => re.source)),
	origin:       'https://iknow.jp',
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

let contents = null;
let quizzes = [];
let courses = {};
let settings = {
	apps: {
		content_volume: 1.0,
		effect_volume:  1.0,
	},
};

/**
 *	Handles XHR and stores them.
 */
function XhrHandler(url, text) {
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

	} else {
		console.log('WARNING: Unexpected XHR (%s)', url);
	}
}

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
			<li class="choice selected" style="opacity: 0.667; cursor: default;">1.0 x</li>
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
	VoicePlayer.setPlaybackRate(1.0);
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

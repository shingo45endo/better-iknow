((BiK) => {
	'use strict';

	const id = `__better_iknow_audio_${Date.now()}__`;

	// Adds a script to replace the behavior of the original sound player.
	const script = document.createElement('script');
	script.innerHTML = `
		(() => {
			'use strict';

			document.querySelector('#dictation_quiz_screen').insertAdjacentHTML('beforeend', '<div style="position: absolute; overflow: hidden; width: 620px; left: 0; right: 0; bottom: 16px; margin: 0 auto; opacity: 0.667; border-radius: 5px; line-height: 0;"><audio controls id="${id}" style="width: 100%; height: 32px; border-radius: 5px;"></audio></div>');

			let canPause = false;

			((playSound) => {
				$.playSound = function(t, a, n) {
					const audio = document.getElementById('${id}');
					if (audio && audio.src === t) {
						canPause = false;
						audio.play().then(() => {
							canPause = true;
						}).catch((error) => {
							console.log('ERROR: %o', error);
						});
					} else {
						playSound.apply(this, arguments);
					}
				};
			})($.playSound);

			((stopSounds) => {
				$.stopSounds = function() {
					const audio = document.getElementById('${id}');
					if (canPause) {
						audio.pause();
					}
					audio.currentTime = 0;

					stopSounds.apply(this, arguments);
				};
			})($.stopSounds);
		})();
	`;
	document.querySelector('body').appendChild(script);

	const audio = document.getElementById(id);

	BiK.VoicePlayer = {
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
		on: (...args) => {
			audio.addEventListener(...args);
		},
	};
})(BiK);

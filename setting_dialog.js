((BiK) => {
	'use strict';

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

	// Waits for adding the modal dialog boxes.
	((dialogHandler) => {
		const dialogObserver = new MutationObserver((records) => {
			console.assert(records.length > 0);
			if (records[0].target.style.display !== 'none') {
				dialogHandler.open();
			} else {
				dialogHandler.close();
			}
		});

		const bodyObserver = new MutationObserver((records) => {
			records.filter((record) => (record.type === 'childList')).forEach((record) => {
				[...record.addedNodes].forEach((node) => {
					if (node.querySelector('.settings-modal')) {
						dialogHandler.init();
						dialogObserver.observe(node, {attributes: true, attributeFilter: ['style']});
					}
				});
			});
		});
		bodyObserver.observe(document.querySelector('body'), {childList: true});

	})((() => {
		const id = `__better_iknow_range_playrate_${Date.now()}__`;

		function updatePlayrateRange() {
			const range = document.getElementById(id);
			range.setAttribute('data-label', `${parseFloat(range.value).toFixed(1)} x`);

			const percent = (range.value - range.min) * 100 / (range.max - range.min);
			range.style.background = `linear-gradient(to right, #ffbc00, #ffbc00 ${percent}%, #eaeaea ${percent}%, #eaeaea)`;
		}

		return {
			init: function() {
				// Inserts settings item to the settings dialog. (TODO: i18n)
				document.querySelector('.audio-settings').insertAdjacentHTML('beforeend', `
					<div class="setting">
						<h4>Play Speed</h4><!--
						--><div class="input">
							<input id="${id}" type="range" step="${BiK.PLAYRATE_STEP}" min="${BiK.PLAYRATE_MIN}" max="${BiK.PLAYRATE_MAX}" style="margin-left: 33px;">
						</div>
					</div>
				`);

				// Handles change event of the range input to display the current playback rate.
				const range = document.getElementById(id);
				['change', 'input'].forEach((eventName) => {
					range.addEventListener(eventName, updatePlayrateRange);
				});

				// Handles click event of Save button to store the change of playback rate into chrome.storage.
				document.querySelector('.settings-modal .btn.save').addEventListener('click', () => {
					BiK.Settings.playbackRate = parseFloat(range.value);
				});
			},
			open: function() {
				document.getElementById(id).value = BiK.Settings.playbackRate;
				updatePlayrateRange();
			},
			close: function() {
			},
		};
	})());
})(BiK);

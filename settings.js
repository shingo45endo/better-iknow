((BiK) => {
	'use strict';

	//
	let _settings = {
		playbackRate: 1.0,
	};
	chrome.storage.local.get(_settings.better_iknow, (items) => {
		_settings = Object.assign(_settings || {}, items);
	});

	//
	const ret = {
		get settings() {return _settings;},
	};
	Object.keys(_settings).forEach((key) => {
		Object.defineProperty(ret, key, {
			get: function() {return _settings[key];},
			set: function(val) {
				_settings[key] = val;
				chrome.storage.local.set(_settings, () => {});
			},
		});
	});

	BiK.Settings = _settings;
})(BiK);
